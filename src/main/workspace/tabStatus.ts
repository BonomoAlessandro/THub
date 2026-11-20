// Status am Tab (Ticket 13): die Status-Zeilen des Zustandsautomaten aus der Spezifikation („Claude-Status:
// Zustandsautomat pro Tab“) und der angezeigte Status mit seinem Vorrang, als reine Regeln. Zeitgeber (Esc),
// Sichtbarkeit, das Merkmal „fertig, noch nicht angeschaut“ und die Prozess-Sonde führt der Workspace-Kern.

import type { TabStatus } from '../../shared/types';
import type { HookFacts } from './claude';

/** Was Claude in einem Claude-Tab gerade tut: ruht, arbeitet, wartet auf dich. */
export type ClaudeActivity = 'idle' | 'working' | 'waiting';

export interface ClaudeStatus {
  activity: ClaudeActivity;
  /**
   * Seit dem letzten `PreToolUse` kam weder `PermissionRequest` noch `PostToolUse`/`PostToolUseFailure`.
   * Nur dann darf die verspätete `Notification` einer Rückfrage den Tab noch auf „wartet“ setzen.
   */
  toolUnanswered: boolean;
  /**
   * Zeitpunkt des letzten `UserPromptSubmit` (Uhr des Kerns), für die Prozess-Regeln: In Claude-Tabs zählen nur
   * Prozesse, die danach gestartet sind. Fehlt vor dem ersten Prompt. Bleibt bei einer neuen Session (`/clear`)
   * stehen, weil der Claude-Prozess und seine Kinder dieselben bleiben.
   */
  promptAt?: number;
}

export const IDLE_CLAUDE: ClaudeStatus = { activity: 'idle', toolUnanswered: false };

/** Ergebnis eines Hook-Ereignisses für den Status. */
export interface ClaudeStatusStep {
  status: ClaudeStatus;
  /** `Stop` oder `StopFailure`: Claude ist mit der Antwort fertig. */
  stopped: boolean;
}

/** `Notification`-Arten, die eine offene Rückfrage melden (nur als Rückfallebene, siehe `statusAfterHook`). */
const QUESTION_NOTIFICATIONS = new Set(['permission_prompt', 'elicitation_dialog']);

/**
 * Status nach einem Hook-Ereignis, in der Reihenfolge des Eintreffens angewendet.
 * @param sessionStarted das Ereignis beginnt eine Session (`SessionStart` oder Ersatz, siehe `startsSession`):
 *   zuerst „ruht“, danach wird das Ereignis selbst angewendet
 * @param now Zeitpunkt des Eintreffens (Uhr des Kerns)
 */
export function statusAfterHook(
  current: ClaudeStatus,
  hook: HookFacts,
  sessionStarted: boolean,
  now: number,
): ClaudeStatusStep {
  const status: ClaudeStatus = sessionStarted ? { ...current, activity: 'idle', toolUnanswered: false } : current;
  const next = (activity: ClaudeActivity, toolUnanswered: boolean): ClaudeStatus => ({
    ...status,
    activity,
    toolUnanswered,
  });

  switch (hook.event) {
    case 'UserPromptSubmit':
      // Auch ohne Tippen, wenn eine Hintergrund-Aufgabe endet (Prompt beginnt mit <task-notification>).
      return { status: { ...next('working', false), promptAt: now }, stopped: false };
    case 'PreToolUse':
      return { status: next('working', true), stopped: false };
    case 'PostToolUse':
    case 'PostToolUseFailure':
      // Beendet auch „wartet“: Die Rückfrage ist beantwortet, das Werkzeug ist gelaufen.
      return { status: next('working', false), stopped: false };
    case 'PermissionRequest':
      // Kommt sofort, sobald die Rückfrage erscheint, auch bei AskUserQuestion.
      return { status: next('waiting', false), stopped: false };
    case 'Notification':
      // Rückfallebene: kommt etwa 6 Sekunden nach der Rückfrage und darf einen inzwischen weiterarbeitenden oder
      // ruhenden Tab nicht zurücksetzen. `idle_prompt` (etwa 60 Sekunden nach Stop) ändert nichts.
      if (
        hook.notificationType !== undefined &&
        QUESTION_NOTIFICATIONS.has(hook.notificationType) &&
        status.activity === 'working' &&
        status.toolUnanswered
      ) {
        return { status: next('waiting', true), stopped: false };
      }
      return { status, stopped: false };
    case 'Stop':
    case 'StopFailure':
      return { status: next('idle', false), stopped: true };
    default:
      // SessionStart (schon oben: ruht), SessionEnd und unbekannte Ereignisse ändern den Status nicht.
      return { status, stopped: false };
  }
}

/**
 * Was eine Eingabe aus dem Terminal für den Status bedeutet:
 * - `escape`: die Taste Esc allein (Unterbrechung oder abgelehnte Rückfrage);
 * - `answer`: Enter oder eine Zifferntaste, also die eigentliche Antwort auf eine Rückfrage („1“, „2“, „3“);
 * - `report`: nur Antworten des Terminals, die xterm.js von selbst schickt (Fokus, Maus, Cursor-Position,
 *   Geräteattribute, OSC- und DCS-Antworten); keine Eingabe des Nutzers;
 * - `other`: alles andere: Pfeil- und andere Navigationstasten (Home, End, Bild auf/ab, Tab), Text, Einfügen.
 */
export type InputKind = 'escape' | 'answer' | 'report' | 'other';

/** Antworten des Terminals; sie kommen über denselben Weg wie Tasten, sind aber keine Eingabe des Nutzers. */
const TERMINAL_REPORTS = new RegExp(
  [
    '\\x1b\\[[IO]', // Fokus gewonnen/verloren (Modus 1004)
    '\\x1b\\[<\\d+;\\d+;\\d+[Mm]', // Maus, SGR-Format
    '\\x1b\\[M[\\s\\S]{3}', // Maus, X10-Format
    '\\x1b\\[\\??\\d+;\\d+(?:;\\d+)?R', // Cursor-Position (DSR 6)
    '\\x1b\\[\\d*n', // Gerätestatus (DSR 5)
    '\\x1b\\[[?>=][\\d;]*c', // Geräteattribute (DA1, DA2)
    '\\x1b\\[\\??[\\d;]+\\$y', // Modus-Abfrage (DECRQM)
    '\\x1b\\[\\?\\d*u', // Abfrage des Tastaturprotokolls
    '\\x1b\\[\\d+(?:;\\d+)*t', // Fenster-Angaben (XTWINOPS)
    '\\x1b\\][^\\x07\\x1b]*(?:\\x07|\\x1b\\\\)', // OSC-Antworten, z.B. Farben
    '\\x1bP[\\s\\S]*?\\x1b\\\\', // DCS-Antworten, z.B. XTVERSION, DECRQSS
  ].join('|'),
  'g',
);

export function classifyInput(data: string): InputKind {
  if (/^\x1b+$/.test(data)) return 'escape';
  if (/^(?:\r\n?|\n|[0-9])$/.test(data)) return 'answer';
  return data.replace(TERMINAL_REPORTS, '') === '' ? 'report' : 'other';
}

/** Die Merkmale eines Tabs, aus denen der angezeigte Status folgt. */
export interface StatusFacts {
  /** Claude-Session nach einem Neustart noch nicht fortgesetzt (Ticket 12). */
  paused: boolean;
  /** Was Claude tut; bei normalen Tabs immer „ruht“. */
  activity: ClaudeActivity;
  /** „Fertig, noch nicht angeschaut“. */
  finished: boolean;
  /** Im Terminal laufen Prozesse (nach den Prozess-Regeln). */
  processes: boolean;
}

/** Angezeigter Status mit Vorrang: pausiert → wartet → arbeitet → fertig → Prozesse laufen → nichts. */
export function displayedStatus(facts: StatusFacts): TabStatus {
  if (facts.paused) return 'paused';
  if (facts.activity === 'waiting') return 'waiting';
  if (facts.activity === 'working') return 'working';
  if (facts.finished) return 'finished';
  if (facts.processes) return 'processes';
  return 'idle';
}
