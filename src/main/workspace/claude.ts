// Claude-Zuordnung (Ticket 10): welche Claude-Session in einem Tab läuft.
// Hier stehen der Vertrag der Eingänge (Meldungen des Starters, Hook-Ereignisse von Claude Code) und die
// reinen Regeln nach der Tabelle „Claude-Status: Zustandsautomat pro Tab“ der Spezifikation. Die Status-Zeilen
// (arbeitet, wartet, ruht) stehen in `tabStatus.ts`. Der Workspace-Kern wendet beides an.

import * as path from 'node:path';
import type { PersistedClaudeLink } from './schema';

/**
 * Die drei Fälle eines interaktiven Aufrufs, wie sie der Starter einordnet:
 * - `new`: ohne `--resume`, `--continue`, `--session-id`; THub vergibt die Kennung;
 * - `withId`: `--resume <Kennung>` bzw. `-r <Kennung>` oder `--session-id <Kennung>`;
 * - `withoutId`: `--continue`/`-c` oder `--resume` ohne Wert; erst Claude meldet die Kennung.
 */
export type LaunchCase = 'new' | 'withId' | 'withoutId';
export const LAUNCH_CASES: readonly LaunchCase[] = ['new', 'withId', 'withoutId'];

/** Meldung des Starters vor dem Start von Claude (`POST /claude/launch`). */
export interface ClaudeLaunchRequest {
  tabId: string;
  case: LaunchCase;
  /** Angegebene Kennung; zählt nur im Fall „mit Kennung“. */
  sessionId?: string;
  /** Aktueller Ordner der Shell; fehlt er, gilt der Ordner des Tabs. */
  cwd?: string;
}

/** Startparameter für den Starter. */
export interface ClaudeLaunchResponse {
  /** Aktueller Tab-Name, für `-n`. */
  tabName: string;
  /** Neue Session-Kennung, nur im Fall „neu“, für `--session-id`. */
  sessionId?: string;
  /** Pfad zur Hook-Datei, für `--settings`. */
  hookFile: string;
}

/**
 * Eingänge von Starter und Claude Code, wie sie die lokale Schnittstelle an den Kern weitergibt.
 * Meldungen zu unbekannten Tabs ignoriert der Kern, ebenso alle Meldungen, sobald die Zuordnungen
 * eingefroren sind.
 */
export interface ClaudeReceiver {
  /** Der Starter will Claude starten. Liefert die Startparameter; `null` heisst: unbekannter Tab. */
  claudeLaunch(request: ClaudeLaunchRequest): ClaudeLaunchResponse | null;
  /** Claude läuft, mit dieser Prozess-ID. */
  claudeStarted(tabId: string, pid: number): void;
  /** Claude hat sich beendet; Session-Kennung, soweit der Starter sie kennt. */
  claudeExit(tabId: string, sessionId: string | undefined, exitCode: number): void;
  /** Hook-Ereignis von Claude Code (`event` wie `hook_event_name`), mit den rohen Nutzdaten. */
  claudeHook(tabId: string, event: string, payload: unknown): void;
  /**
   * Was der Empfänger Claude auf ein Hook-Ereignis antwortet, bevor es verarbeitet wird; `undefined` heisst leer. Einzige
   * Ausnahme von der leeren Antwort: `SessionStart` bei eingeschalteter Einstellung „Offene Punkte“ (Ticket 22) liefert
   * die Anweisung als zusätzlichen Kontext. Nie Entscheidungsfelder.
   */
  claudeHookReply(tabId: string, event: string): object | undefined;
}

/** Die laufende lokale Schnittstelle, wie der Kern sie an Terminals und Starter weitergibt. */
export interface LocalApiInfo {
  /** Adresse, z.B. "http://127.0.0.1:51234"; kommt als THUB_API in jedes Terminal. */
  url: string;
  /** Pro App-Start zufällig; kommt als THUB_TOKEN in jedes Terminal. */
  token: string;
  /** Die bei diesem Start geschriebene Hook-Datei. */
  hookFile: string;
}

/** Was an einem Hook-Ereignis für die Zuordnung zählt. */
export interface HookFacts {
  event: string;
  sessionId?: string;
  /** Ordner, so wie Claude ihn meldet; kann ein 8.3-Kurzpfad sein. */
  cwd?: string;
  /** Grund bei `SessionEnd`. */
  reason?: string;
  /** Quelle bei `SessionStart`: `startup`, `resume`, `clear`, `compact`. */
  source?: string;
  /** Art bei `Notification`, z.B. `permission_prompt` oder `idle_prompt`. */
  notificationType?: string;
  /** Text der fertigen Antwort bei `Stop`, für die offenen Punkte (Ticket 22). */
  lastAssistantMessage?: string;
  /**
   * Kennung des Agenten, aus dem das Ereignis kommt (`agent_id`, Ticket 37): bei `SubagentStart` und `SubagentStop` und
   * bei allen Ereignissen, die ein Agent auslöst (Werkzeuge, Rückfragen). Fehlt bei Ereignissen von Claude selbst.
   */
  agentId?: string;
  /**
   * Die laufenden Agenten im Hintergrund laut `background_tasks` (Einträge `type: "subagent"`, `status: "running"`), bei
   * `Stop` und `SubagentStop`. Fehlt, wenn das Ereignis keine Liste mitbringt.
   */
  runningAgents?: string[];
  /**
   * Bei `UserPromptSubmit` mit einer Meldung über eine Hintergrund-Aufgabe (`<task-notification>`): deren Kennung
   * (`<task-id>`). Bei einem Agenten ist das seine `agent_id`.
   */
  taskNotificationId?: string;
}

/** `SessionEnd` mit diesen Gründen beendet Claude nicht: Es folgt ein `SessionStart` mit neuer Kennung. */
const SESSION_END_CONTINUES = new Set(['clear', 'resume']);

export function readHook(event: string, payload: unknown): HookFacts {
  const p = typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>) : {};
  const facts: HookFacts = {
    event,
    sessionId: nonEmpty(p.session_id),
    cwd: nonEmpty(p.cwd),
    reason: nonEmpty(p.reason),
    source: nonEmpty(p.source),
    notificationType: nonEmpty(p.notification_type),
    lastAssistantMessage: nonEmpty(p.last_assistant_message),
  };
  const agentId = nonEmpty(p.agent_id);
  if (agentId !== undefined) facts.agentId = agentId;
  if (Array.isArray(p.background_tasks)) facts.runningAgents = runningAgents(p.background_tasks);
  const taskId = event === 'UserPromptSubmit' ? taskNotificationId(p.prompt) : undefined;
  if (taskId !== undefined) facts.taskNotificationId = taskId;
  return facts;
}

/** Die laufenden Agenten aus `background_tasks`; Befehle im Hintergrund (`type: "shell"`) zählen nicht. */
function runningAgents(tasks: unknown[]): string[] {
  const ids: string[] = [];
  for (const task of tasks) {
    if (typeof task !== 'object' || task === null) continue;
    const { id, type, status } = task as Record<string, unknown>;
    if (type === 'subagent' && status === 'running' && typeof id === 'string' && id !== '') ids.push(id);
  }
  return ids;
}

/** Die Kennung aus einer Meldung `<task-notification>…<task-id>…</task-id>`, die Claude als Prompt bekommt. */
function taskNotificationId(prompt: unknown): string | undefined {
  if (typeof prompt !== 'string' || !prompt.startsWith('<task-notification>')) return undefined;
  return nonEmpty(/<task-id>([^<]*)<\/task-id>/.exec(prompt)?.[1]?.trim());
}

/**
 * Ob das Ereignis eine Session beginnt: `SessionStart`, oder ein anderes Ereignis (ausser `SessionEnd`) mit einer
 * anderen Kennung als der gespeicherten. Das zweite gilt als Ersatz, falls `SessionStart` nicht ankam (etwa ohne
 * curl.exe), und wird danach normal verarbeitet. Ereignisse aus einem Agenten beginnen nie eine Session (Ticket 37).
 */
export function startsSession(link: PersistedClaudeLink | undefined, hook: HookFacts): boolean {
  if (hook.event === 'SessionEnd' || !hook.sessionId || hook.agentId !== undefined) return false;
  return hook.event === 'SessionStart' || hook.sessionId !== link?.sessionId;
}

/** Zuordnung nach dem Start durch den Starter: Claude-Tab, unbestätigt. */
export function linkAfterLaunch(
  previous: PersistedClaudeLink | undefined,
  sessionId: string | undefined,
  cwd: string,
): PersistedClaudeLink {
  return withSession(previous, sessionId, cwd, false);
}

/**
 * Zuordnung nach einem Hook-Ereignis; `undefined` heisst normales Terminal.
 * @param normalizeCwd macht aus dem gemeldeten Ordner den gespeicherten
 */
export function linkAfterHook(
  link: PersistedClaudeLink | undefined,
  hook: HookFacts,
  normalizeCwd: (raw: string) => string,
): PersistedClaudeLink | undefined {
  // Ereignisse aus einem Agenten ändern die Zuordnung nie (Ticket 37).
  if (hook.agentId !== undefined) return link;
  if (hook.event === 'SessionEnd') {
    // Die Ausnahme nach einem von THub gestarteten Fortsetzen ohne SessionStart wendet der Kern an (Ticket 12):
    // Bis Claude sich meldet, gibt er SessionEnd gar nicht hierher weiter.
    return hook.reason !== undefined && SESSION_END_CONTINUES.has(hook.reason) ? link : undefined;
  }

  let next = link;
  // SessionStart übernimmt Kennung und Ordner. Ein anderes Ereignis mit einer neuen Kennung zählt genauso,
  // falls SessionStart nicht ankam (etwa ohne curl.exe).
  if (startsSession(link, hook)) {
    const cwd = hook.cwd ? normalizeCwd(hook.cwd) : (link?.cwd ?? '');
    next = withSession(link, hook.sessionId, cwd, true);
  }
  if (hook.event === 'UserPromptSubmit' && next && !next.hadPrompt) next = { ...next, hadPrompt: true };
  return next;
}

export function sameLink(a: PersistedClaudeLink | undefined, b: PersistedClaudeLink | undefined): boolean {
  if (!a || !b) return a === b;
  return a.sessionId === b.sessionId && a.cwd === b.cwd && a.confirmed === b.confirmed && a.hadPrompt === b.hadPrompt;
}

/**
 * Ordner, wie ihn Starter oder Claude melden, in gespeicherter Form: Windows-Schreibweise ohne
 * abschliessenden Trenner, 8.3-Kurznamen aufgelöst.
 * @param longPath löst Kurznamen auf (Port „System“)
 */
export function normalizeDirectory(raw: string, longPath: (dir: string) => string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  let dir = path.win32.normalize(trimmed);
  if (!/^[a-z]:\\$/i.test(dir)) dir = dir.replace(/\\+$/, '');
  return longPath(dir);
}

function withSession(
  previous: PersistedClaudeLink | undefined,
  sessionId: string | undefined,
  cwd: string,
  confirmed: boolean,
): PersistedClaudeLink {
  const link: PersistedClaudeLink = {
    cwd,
    confirmed,
    // „Hatte Prompt“ gehört zur Session: Bei einer neuen Kennung beginnt es von vorn.
    hadPrompt: sessionId !== undefined && previous?.sessionId === sessionId && previous.hadPrompt,
  };
  if (sessionId) link.sessionId = sessionId;
  return link;
}

function nonEmpty(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}
