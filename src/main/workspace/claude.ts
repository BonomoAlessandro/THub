// Claude-Zuordnung (Ticket 10): welche Claude-Session in einem Tab läuft.
// Hier stehen der Vertrag der Eingänge (Meldungen des Starters, Hook-Ereignisse von Claude Code) und die
// reinen Regeln nach der Tabelle „Claude-Status: Zustandsautomat pro Tab“ der Spezifikation, vorerst ohne
// die Status-Zeilen (arbeitet, wartet, ruht: Ticket 13). Der Workspace-Kern wendet sie an.

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
}

/** `SessionEnd` mit diesen Gründen beendet Claude nicht: Es folgt ein `SessionStart` mit neuer Kennung. */
const SESSION_END_CONTINUES = new Set(['clear', 'resume']);

export function readHook(event: string, payload: unknown): HookFacts {
  const p = typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>) : {};
  return { event, sessionId: nonEmpty(p.session_id), cwd: nonEmpty(p.cwd), reason: nonEmpty(p.reason) };
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
  if (hook.event === 'SessionEnd') {
    // Ticket 12 ergänzt die Ausnahme nach einem von THub gestarteten Fortsetzen ohne SessionStart.
    return hook.reason !== undefined && SESSION_END_CONTINUES.has(hook.reason) ? link : undefined;
  }

  let next = link;
  // SessionStart übernimmt Kennung und Ordner. Ein anderes Ereignis mit einer neuen Kennung zählt genauso,
  // falls SessionStart nicht ankam (etwa ohne curl.exe).
  if (hook.sessionId && (hook.event === 'SessionStart' || hook.sessionId !== link?.sessionId)) {
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
