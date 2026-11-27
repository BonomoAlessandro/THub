// Status am Tab (Ticket 13): die Status-Zeilen des Zustandsautomaten aus der Spezifikation („Claude-Status:
// Zustandsautomat pro Tab“) und der angezeigte Status mit seinem Vorrang, als reine Regeln. Dazu die Agenten, die in
// einem Claude-Tab laufen (Ticket 37). Zeitgeber (Esc, Frist nach dem Ende der Agenten), Sichtbarkeit, das Merkmal
// „fertig, noch nicht angeschaut“ und die Prozess-Sonde führt der Workspace-Kern.

import type { TabStatus } from '../../shared/types';
import type { HookFacts } from './claude';

/** Was Claude in einem Claude-Tab gerade tut: ruht, arbeitet, wartet auf dich. */
export type ClaudeActivity = 'idle' | 'working' | 'waiting';

export interface ClaudeStatus {
  /** Was Claude selbst tut, ohne seine Agenten. Angezeigt wird `shownActivity`. */
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
  /**
   * Die laufenden Agenten (`agent_id`), im Vorder- und im Hintergrund (Ticket 37): `SubagentStart` fügt einen hinzu,
   * `SubagentStop` nimmt ihn weg, `Stop` gleicht mit `background_tasks` ab. Nicht gespeichert.
   */
  agents: readonly string[];
  /**
   * Hintergrund-Agenten, die geendet haben und über die Claude noch eine Meldung bekommen kann (`<task-notification>` mit
   * ihrer Kennung), etwa wenn sie eigene Hintergrund-Arbeit hinterlassen. Damit arbeitet Claude von selbst weiter; so
   * kommt „fertig“ nur einmal, nach dieser letzten Runde. Bleibt die Meldung aus, leert die Frist des Kerns die Liste
   * (`statusAfterAgentReportsDue`).
   */
  reportsDue: readonly string[];
  /** Ein Agent wartet mit einer Rückfrage auf dich (`PermissionRequest` aus dem Agenten): seine Kennung. */
  askingAgent?: string;
  /** `Stop` kam, während noch Agenten liefen: Grün und der Hinweis „fertig“ stehen noch aus. */
  finishPending: boolean;
}

export const IDLE_CLAUDE: ClaudeStatus = {
  activity: 'idle',
  toolUnanswered: false,
  agents: [],
  reportsDue: [],
  finishPending: false,
};

/** Ergebnis eines Hook-Ereignisses für den Status. */
export interface ClaudeStatusStep {
  status: ClaudeStatus;
  /** Claude ist mit der Antwort fertig (`Stop`, `StopFailure`), und kein Agent läuft mehr: Jetzt kommt „fertig“. */
  stopped: boolean;
}

/** `Notification`-Arten, die eine offene Rückfrage melden (nur als Rückfallebene, siehe `statusAfterHook`). */
const QUESTION_NOTIFICATIONS = new Set(['permission_prompt', 'elicitation_dialog']);

/** Was der Tab zeigt: wartet, wenn Claude oder ein Agent fragt; arbeitet, wenn Claude oder ein Agent rechnet. */
export function shownActivity(status: ClaudeStatus): ClaudeActivity {
  if (status.activity === 'waiting' || status.askingAgent !== undefined) return 'waiting';
  if (status.activity === 'working' || status.agents.length > 0 || status.reportsDue.length > 0) return 'working';
  return 'idle';
}

/**
 * Alle Agenten haben geendet, und Claude ruht, aber die Meldung über einen Hintergrund-Agenten steht noch aus: Der Kern
 * wartet eine Frist lang darauf, dass Claude weiterarbeitet; bis dahin zeigt der Tab „arbeitet“.
 */
export function awaitsAgentReports(status: ClaudeStatus): boolean {
  return (
    status.activity === 'idle' &&
    status.askingAgent === undefined &&
    status.agents.length === 0 &&
    status.reportsDue.length > 0
  );
}

/**
 * Die Frist nach dem Ende der Agenten ist um, ohne dass Claude weitergearbeitet hat: Der Tab ruht. Kam vorher `Stop`,
 * ist jetzt alles fertig.
 */
export function statusAfterAgentReportsDue(status: ClaudeStatus): ClaudeStatusStep {
  if (!awaitsAgentReports(status)) return { status, stopped: false };
  return { status: { ...status, reportsDue: [], finishPending: false }, stopped: status.finishPending };
}

/**
 * Der Status zu Beginn einer Session: Claude ruht. Die Agenten gehören zum Claude-Prozess, nicht zur Session: Nach
 * `/clear` rechnen sie weiter und melden sich mit der Kennung der neuen Session (gemessen, Ticket 37). Nur ein neuer
 * Start von Claude (`startup`) beginnt ohne Agenten; die Antwort der alten Session meldet kein „fertig“ mehr.
 */
function newSession(current: ClaudeStatus, hook: HookFacts): ClaudeStatus {
  const started = hook.event === 'SessionStart' && hook.source === 'startup';
  const agents: Partial<ClaudeStatus> = started ? { agents: [], reportsDue: [], askingAgent: undefined } : {};
  return { ...current, ...agents, activity: 'idle', toolUnanswered: false, finishPending: false };
}

/**
 * Status nach einem Hook-Ereignis, in der Reihenfolge des Eintreffens angewendet.
 * @param sessionStarted das Ereignis beginnt eine Session (`SessionStart` oder Ersatz, siehe `startsSession`):
 *   zuerst „ruht“ (siehe `newSession`), danach wird das Ereignis selbst angewendet
 * @param now Zeitpunkt des Eintreffens (Uhr des Kerns)
 */
export function statusAfterHook(
  current: ClaudeStatus,
  hook: HookFacts,
  sessionStarted: boolean,
  now: number,
): ClaudeStatusStep {
  const status: ClaudeStatus = sessionStarted ? newSession(current, hook) : current;
  if (hook.agentId !== undefined) return settle(statusAfterAgentHook(status, hook, hook.agentId));
  const next = (activity: ClaudeActivity, toolUnanswered: boolean): ClaudeStatus => ({
    ...status,
    activity,
    toolUnanswered,
  });

  switch (hook.event) {
    case 'UserPromptSubmit': {
      // Auch ohne Tippen, wenn eine Hintergrund-Aufgabe endet (Prompt beginnt mit <task-notification>). Eine neue Runde
      // beginnt: Ihr Stop entscheidet über „fertig“. Die Meldung über einen Agenten zeigt, dass er fertig ist.
      const done = hook.taskNotificationId;
      const working: ClaudeStatus = { ...next('working', false), promptAt: now, finishPending: false };
      if (done === undefined) return { status: working, stopped: false };
      return {
        status: { ...working, agents: without(status.agents, done), reportsDue: without(status.reportsDue, done) },
        stopped: false,
      };
    }
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
    case 'StopFailure': {
      // Claude ruht. `background_tasks` sagt, welche Agenten im Hintergrund noch laufen; ein Agent, den es dort nicht
      // gibt, ist vorbei (etwa gestoppt, was ohne `SubagentStop` geschieht). Läuft noch einer, steht eine Meldung über
      // einen aus oder fragt einer, kommt „fertig“ erst später.
      const idle: ClaudeStatus = { ...next('idle', false), agents: hook.runningAgents ?? status.agents };
      const done = shownActivity(idle) === 'idle';
      return { status: { ...idle, finishPending: !done }, stopped: done };
    }
    default:
      // SessionStart (schon oben: ruht), SessionEnd und unbekannte Ereignisse ändern den Status nicht. Bei `clear` und
      // `resume` folgt eine neue Session, in der die Agenten weiterlaufen; bei jedem anderen Grund endet Claude, und mit
      // der Claude-Zuordnung entfällt der ganze Status samt Agenten (Kern).
      return { status, stopped: false };
  }
}

/**
 * Ereignisse aus einem Agenten ändern nicht, was Claude selbst tut; sonst bliebe der Tab nach dem Ende des letzten
 * Agenten auf „arbeitet“ hängen. Sie führen die Liste der Agenten und ihre Rückfragen.
 */
function statusAfterAgentHook(status: ClaudeStatus, hook: HookFacts, agentId: string): ClaudeStatus {
  // Jedes andere Ereignis des fragenden Agenten zeigt, dass seine Rückfrage beantwortet ist.
  const askingAgent = status.askingAgent === agentId ? undefined : status.askingAgent;
  switch (hook.event) {
    case 'SubagentStart':
      // Auch ein Agent, der wieder aufgenommen wird (etwa wenn seine eigene Hintergrund-Arbeit endet).
      return {
        ...status,
        askingAgent,
        agents: status.agents.includes(agentId) ? status.agents : [...status.agents, agentId],
        reportsDue: without(status.reportsDue, agentId),
      };
    case 'SubagentStop': {
      // Claude Code meldet auch eigene Helfer ohne SubagentStart (etwa die Vorschläge für den nächsten Prompt); sie zählen
      // nicht. Ein Agent im Hintergrund steht dabei noch in `background_tasks`. Nach ihm kann Claude noch eine Meldung
      // (`<task-notification>`) bekommen und damit weiterarbeiten; darauf wartet der Kern eine Frist lang.
      if (!status.agents.includes(agentId)) return { ...status, askingAgent };
      const background = hook.runningAgents?.includes(agentId) ?? false;
      const due = background && !status.reportsDue.includes(agentId);
      return {
        ...status,
        askingAgent,
        agents: without(status.agents, agentId),
        reportsDue: due ? [...status.reportsDue, agentId] : status.reportsDue,
      };
    }
    case 'PermissionRequest':
      // Die Rückfrage eines Agenten: Der Tab wartet auf dich. Die verspätete Notification dazu darf nicht mehr greifen.
      return { ...status, askingAgent: agentId, toolUnanswered: false };
    case 'Notification':
      return status;
    default:
      return { ...status, askingAgent };
  }
}

/** Ruht nach dem Ende eines Agenten alles, und kam vorher `Stop`, ist Claude jetzt fertig. */
function settle(status: ClaudeStatus): ClaudeStatusStep {
  if (!status.finishPending || shownActivity(status) !== 'idle') return { status, stopped: false };
  return { status: { ...status, finishPending: false }, stopped: true };
}

function without(ids: readonly string[], id: string): readonly string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : ids;
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
