// Workspace-Kern: besitzt die gesamte Tab-Logik und hängt nur über die Ports von der Aussenwelt ab.
// Der Renderer holt einen Schnappschuss, bekommt danach Änderungsereignisse und schickt Befehle.
// Startaufträge erteilt nur der Kern, und zwar erst, wenn die Ansicht des Tabs bereit ist.

import { randomUUID } from 'node:crypto';
import { barEntries, entryTabs, type BarEntry } from '../../shared/barEntries';
import type {
  BusyReason,
  BusyTab,
  ClosedTabInfo,
  GroupSnapshot,
  RecentDir,
  Settings,
  TabProcessState,
  TabSnapshot,
  TabStatus,
  ToastKind,
  WorkspaceEvent,
  WorkspaceSnapshot,
} from '../../shared/types';
import {
  linkAfterHook,
  linkAfterLaunch,
  normalizeDirectory,
  readHook,
  sameLink,
  startsSession,
  type ClaudeLaunchRequest,
  type ClaudeLaunchResponse,
  type ClaudeReceiver,
  type LocalApiInfo,
} from './claude';
import { CwdReportScanner } from './cwdReport';
import { folderName, rememberDir, uniqueName, type NamingContext } from './folders';
import { entryBoundary, groupStatus } from './groups';
import { findOpenPoints, openPointsContext } from './openPoints';
import {
  KeepAwakeError,
  type CancelTimer,
  type KeepAwakeLevel,
  type ProcessInfo,
  type ShellInfo,
  type StartOrder,
  type WorkspacePorts,
} from './ports';
import { ProcessTracker, shellProcesses, type ProcessTab, type ShellRoot, type ShellTree } from './processRules';
import { resumeCommand, sessionToResume } from './resume';
import { shellLabel, wslDistribution } from './shellIds';
import {
  MAX_CLOSED_TABS,
  normalizeSettings,
  normalizeWindow,
  readPersistedState,
  type ClosedTab,
  type PersistedClaudeLink,
  type PersistedGroup,
  type PersistedState,
  type PersistedTab,
  type WindowState,
} from './schema';
import {
  awaitsAgentReports,
  classifyInput,
  displayedStatus,
  IDLE_CLAUDE,
  shownActivity,
  statusAfterAgentReportsDue,
  statusAfterHook,
  type ClaudeStatus,
} from './tabStatus';
import { STATUS_TOASTS, ToastBoard } from './toasts';
import { placeWindow } from './windowPlacement';

/** So lange wartet das Beenden höchstens auf die Shells. */
const SHUTDOWN_TIMEOUT_MS = 3000;
/** Fensterangaben werden gespeichert, sobald das Fenster so lange nicht mehr verändert wurde. */
const WINDOW_SAVE_DELAY_MS = 500;
/** In diesem Abstand wird der Verlauf von Tabs gesichert, deren Inhalt sich geändert hat. */
const HISTORY_SAVE_INTERVAL_MS = 30_000;
/** So lange wartet das Beenden höchstens auf den Verlauf aus dem Renderer. */
const HISTORY_QUIT_TIMEOUT_MS = 2000;
/** In diesem Abstand fragt der Kern die Prozess-Sonde ab, für alle Tabs zusammen. */
const PROBE_INTERVAL_MS = 1500;
/**
 * So lange wartet das Beenden einer Shell höchstens auf die Prozess-Sonde. Antwortet sie nicht, endet die Shell trotzdem,
 * nur ohne ihre Nachfahren mit eigener Konsole.
 */
const KILL_PROBE_TIMEOUT_MS = 1000;
/**
 * Kommt nach Esc in einem arbeitenden oder wartenden Claude-Tab so lange kein Hook-Ereignis, ruht Claude: Nach
 * einer Unterbrechung oder einer abgelehnten Rückfrage meldet Claude nichts.
 */
const ESC_QUIET_MS = 1500;
/**
 * Nach einer Antwort (Enter oder Ziffer) in einem wartenden Claude-Tab: Kommt so lange weder ein Hook-Ereignis noch
 * ein neuer Nachfahre des Claude-Prozesses, ruht Claude. So endet eine Ablehnung mit „No“ und Enter, nach der Claude
 * nichts meldet; ein bestätigter langer Befehl hält „arbeitet“, weil sein Prozess läuft.
 */
const ANSWER_QUIET_MS = 3000;
/**
 * Frist nach dem Ende der Agenten (Ticket 37): Ruht Claude und steht noch eine Meldung über einen beendeten Agenten im
 * Hintergrund aus (`<task-notification>`), zeigt der Tab so lange noch „arbeitet“. Kommt die Meldung, arbeitet Claude
 * weiter, und das nächste `Stop` entscheidet; sonst ruht der Tab danach bzw. wird grün. Gemessen kamen wartende
 * Meldungen 0,3 bis 0,6 Sekunden nach `Stop` (docs/spikes/claude-hooks.md, „Agenten (Ticket 37)“).
 */
const AGENT_REPORT_QUIET_MS = 3000;
/**
 * So lange wartet der Kern nach einem von THub abgesetzten Fortsetzen auf die Start-Meldung des Starters (Ticket 23).
 * Kommt keine, läuft Claude ohne Erfassung: THUB_STARTER fehlt (Gruppenrichtlinie), `starter.ps1` fehlt oder die lokale
 * Schnittstelle ist nicht erreichbar. Grosszügig bemessen, weil ein langsames Profil den Startbefehl verzögert.
 */
const RESUME_LAUNCH_GRACE_MS = 30_000;

export interface WorkspaceOptions {
  /** Die erkannten Shells (Shell-Erkennung), in der Reihenfolge des Pfeil-Menüs; mindestens eine. */
  shells: ShellInfo[];
  /**
   * Die laufende lokale Schnittstelle (Ticket 10). Fehlt sie, weil sie sich nicht starten liess, bekommen die
   * Terminals nur THUB_TAB_ID; der Starter erreicht THub nicht und startet claude unverändert.
   */
  localApi?: LocalApiInfo;
  /** Frist für die Start-Meldung nach einem Fortsetzen, in Millisekunden; Standard 30 s. Nur Tests verkürzen sie. */
  resumeLaunchGraceMs?: number;
}

/** Wie ein neuer Tab angelegt wird. */
export interface NewTabOptions {
  /** Startordner; fehlt er oder gibt es ihn nicht, gilt der Standardordner, sonst der Benutzerordner. */
  cwd?: string;
  /** Kennung der Shell; fehlt sie oder ist sie nicht erkannt, gilt die Standard-Shell. */
  shellId?: string;
}

/**
 * Der Kern. Die Eingänge von Starter und Claude Code (`claudeLaunch`, `claudeStarted`, `claudeExit`,
 * `claudeHook`) beschreibt `ClaudeReceiver`.
 */
export interface Workspace extends ClaudeReceiver {
  /** Vollständiger Zustand für den Renderer. */
  snapshot(): WorkspaceSnapshot;
  /** Änderungsereignisse abonnieren; liefert die Abmeldung. */
  subscribe(listener: (event: WorkspaceEvent) => void): () => void;

  /**
   * Legt einen einzelnen Tab am Ende der Leiste an, nie in einer Gruppe, macht ihn aktiv und liefert seine Kennung
   * (leer, wenn der Kern beendet wird). Der Tab heisst wie sein Startordner, bei Gleichstand mit „ 2“,
   * „ 3“ usw.; der Name ändert sich danach nicht mehr von selbst. Der Startordner kommt an die Spitze
   * der zuletzt benutzten Ordner. Der Tab behält seine Shell, auch über einen Neustart.
   */
  createTab(options?: NewTabOptions): string;
  /**
   * Dupliziert einen Tab (Rechtsklick-Menü): ein neuer Tab rechts neben ihm, auch wenn er nicht aktiv ist, im aktuellen
   * Ordner des Tabs (gibt es ihn nicht mehr, wie beim Start der Shell: Startordner → Standardordner → Benutzerordner),
   * mit derselben Shell und einem automatischen Namen nach dem Ordner. Der neue Tab wird aktiv und startet eine eigene
   * Shell, ohne Verlauf; bei einem Claude-Tab nur das Terminal, ohne Claude-Session. Das Duplikat eines Tabs in einer
   * Gruppe bleibt in der Gruppe, direkt nach dem Original. Liefert seine Kennung, leer für unbekannte Tabs.
   */
  duplicateTab(tabId: string): string;
  /** Leere Namen werden ignoriert. Ein so vergebener Name wird nie automatisch überschrieben. */
  renameTab(tabId: string, name: string): void;
  /**
   * Verschiebt den einzelnen Tab an Position `index` der Leiste (ab 0); gezählt werden die Einträge der Leiste,
   * einzelne Tabs und Gruppen. Die anderen behalten ihre Reihenfolge, der aktive Tab bleibt aktiv. Eine Position
   * ausserhalb der Leiste gilt als das nächste Ende. Die Reihenfolge übersteht einen Neustart, und Ctrl+1 … Ctrl+9
   * (`activateTabAt`) folgen ihr. Ein Tab in einer Gruppe wandert nur mit ihr (`moveGroup`).
   */
  moveTab(tabId: string, index: number): void;
  /**
   * Der aktuelle Ordner des Tabs, wie ihn der Tooltip zeigt: der zuletzt gemeldete, sonst der Startordner. Ihn öffnet
   * „Ordner im Explorer öffnen“; `undefined` für unbekannte Tabs.
   */
  tabFolder(tabId: string): string | undefined;
  /**
   * Zeigt den Tab an; ein pausierter Claude-Tab setzt dabei seine Session fort. Ein Tab in einer Gruppe wird dabei ihr
   * gewählter Tab, wie auf jedem anderen Weg, auf dem er angezeigt wird.
   */
  activateTab(tabId: string): void;
  /**
   * Aktiviert den Eintrag der Leiste `offset` Plätze weiter, über die Enden hinweg im Kreis. Eine Gruppe zählt als ihr
   * gewählter Tab; die anderen Tabs einer Gruppe erreicht man über ihre Liste und die Befehlspalette.
   */
  activateRelativeTab(offset: number): void;
  /**
   * Aktiviert den Eintrag an Position `index` der Leiste (ab 0), eine Gruppe als ihren gewählten Tab; gibt es dort
   * keinen, bleibt alles, wie es ist.
   */
  activateTabAt(index: number): void;

  /**
   * „Neue Gruppe“ (Ticket 36): Eine Gruppe mit diesem einzelnen Tab entsteht an seiner Stelle. Sie heisst wie der
   * aktuelle Ordner des Tabs, nach den Regeln der Tab-Namen, bei Gleichstand mit einer anderen Gruppe mit „ 2“ usw.
   * Danach meldet der Kern `groupCreated`, damit der Gruppen-Tab ins Umbenennen geht. Liefert die Kennung der Gruppe,
   * leer für unbekannte Tabs und für Tabs, die schon in einer Gruppe stehen (Gruppen in Gruppen gibt es nicht).
   */
  createGroup(tabId: string): string;
  /**
   * Der Tab kommt ans Ende der Gruppe („In Gruppe „…““, Ziehen auf den Gruppen-Tab), auch aus einer anderen Gruppe.
   * Wird er gerade angezeigt, ist er danach der gewählte Tab seiner neuen Gruppe.
   */
  moveTabToGroup(tabId: string, groupId: string): void;
  /**
   * „Aus Gruppe nehmen“: Der Tab steht danach als einzelner Tab rechts neben der Gruppe. War er ihr letzter Tab,
   * verschwindet die Gruppe, und er bleibt an ihrer Stelle.
   */
  removeTabFromGroup(tabId: string): void;
  /** Leere Namen werden ignoriert. */
  renameGroup(groupId: string, name: string): void;
  /** Verschiebt die Gruppe als Ganzes an Position `index` der Leiste (ab 0), gezählt wie bei `moveTab`. */
  moveGroup(groupId: string, index: number): void;
  /** „Gruppe auflösen“: Die Tabs bleiben offen und stehen in ihrer Reihenfolge einzeln an der Stelle der Gruppe. */
  dissolveGroup(groupId: string): void;
  /** „Gruppe schliessen“: wie `requestClose` für alle Tabs der Gruppe, mit höchstens einer gemeinsamen Rückfrage. */
  closeGroup(groupId: string): void;
  /**
   * „Neues Terminal“ in der Gruppe: ein Tab am Ende der Gruppe, im aktuellen Ordner ihres gewählten Tabs (wie beim
   * Duplizieren: gibt es ihn nicht mehr, Startordner → Standardordner → Benutzerordner), mit der Standard-Shell und einem
   * Namen nach dem Ordner. Er wird angezeigt und damit der gewählte Tab. Liefert seine Kennung, leer für unbekannte
   * Gruppen.
   */
  newTabInGroup(groupId: string): string;
  /**
   * Der Nutzer will diese Tabs schliessen (×, Ctrl+Shift+W, „Andere Tabs schliessen“). Ruhen alle, schliessen sie
   * sofort (`closeTabs`), auch ruhende Claude-Tabs. Wartet Claude in einem davon, arbeitet Claude oder laufen darin
   * Prozesse, schliesst nichts: Der Kern meldet eine einzige Rückfrage (`askClose`) mit den betroffenen Tabs. Massgeblich
   * sind diese Merkmale, nicht das angezeigte Symbol: Ein grüner Tab mit laufendem Dev-Server fragt nach.
   */
  requestClose(tabIds: string[]): void;
  /**
   * „Andere Tabs schliessen“, wie `requestClose`: bei einem einzelnen Tab alle anderen Einträge der Leiste samt Gruppen,
   * bei einem Tab in einer Gruppe die anderen Tabs dieser Gruppe.
   */
  closeOtherTabs(tabId: string): void;
  /**
   * Schliesst die Tabs ohne Rückfrage, in dieser Reihenfolge. Jeder wird eingefroren und kommt mit Name, Shell, Ordnern,
   * Claude-Zuordnung und seiner Gruppe (Kennung, Name, Stelle in der Gruppe) an die Spitze der zuletzt geschlossenen
   * Tabs (höchstens zehn, sie überstehen einen Neustart); ein normaler Tab bekommt dazu seinen aktuellen Verlauf
   * (`requestHistory`). Fällt ein Tab aus der Liste, wird sein Verlauf gelöscht. Die Shell endet samt allen Nachfahren,
   * auch denen mit eigener Konsole. Der zuletzt aktive Ordner jedes Tabs kommt an die Spitze der zuletzt benutzten
   * Ordner.
   *
   * Schliesst sich der gewählte Tab einer Gruppe, wird der nächste Tab der Gruppe gewählt (sonst der vorherige); war die
   * Gruppe aktiv, wird dieser Tab angezeigt. Schliesst sich der letzte Tab einer Gruppe, verschwindet die Gruppe. War
   * ein geschlossener Tab aktiv und bleibt in seiner Gruppe keiner, wird der Nachbar in der Leiste aktiv (eine Gruppe
   * mit ihrem gewählten Tab).
   */
  closeTabs(tabIds: string[]): void;
  /** Wie `closeTabs` für einen Tab. */
  closeTab(tabId: string): void;
  /**
   * Öffnet den zuletzt geschlossenen Tab wieder, mit `tabId` genau diesen. Er kommt an seiner alten Position zurück und
   * wird aktiv, wie nach einem Neustart: ein normaler Tab mit seinem Verlauf im zuletzt aktiven Ordner, ein
   * fortzusetzender Claude-Tab setzt seine Session sofort fort. Liefert seine Kennung, leer, wenn es keinen gibt.
   *
   * Stand er in einer Gruppe, kommt er in sie zurück, an seine alte Stelle in der Gruppe, und wird ihr gewählter Tab.
   * Gibt es die Gruppe nicht mehr, entsteht sie neu mit Namen und Stelle; weitere wieder geöffnete Tabs derselben
   * Gruppe kommen dazu. So holt Ctrl+Shift+Z nach „Gruppe schliessen“ die Gruppe Tab für Tab zurück.
   */
  reopenClosedTab(tabId?: string): string;
  /** Die zuletzt geschlossenen Tabs, neueste zuerst, höchstens zehn. */
  closedTabs(): ClosedTabInfo[];

  /**
   * Die zuletzt benutzten Ordner, neueste zuerst, höchstens acht; nur die, die es noch gibt. Gespeichert
   * bleiben auch die anderen, etwa ein gerade nicht verbundenes Netzlaufwerk.
   */
  recentDirs(): RecentDir[];

  /**
   * Die Ansicht des Tabs ist bereit; erst jetzt startet seine Shell, in dieser Grösse. Ein Tab aus dem
   * gespeicherten Zustand bekommt vorher einmal seinen Verlauf (`restoreHistory`). Fehlt seine Shell auf
   * diesem Rechner, startet er mit der Standard-Shell und zeigt davor einen Hinweis im Terminal; seine
   * Shell-Kennung behält er, damit er wieder mit ihr startet, sobald es sie wieder gibt.
   *
   * Ein fortzusetzender Claude-Tab bekommt keinen Verlauf: Seine Shell startet im Ordner der Session mit dem
   * Startbefehl „Starter mit `--resume <Kennung>`“. Ist er pausiert (`TabSnapshot.paused`), startet er erst, wenn er
   * angezeigt wird; die Grösse merkt sich der Kern bis dahin. Meldet der Starter danach innerhalb von 30 Sekunden
   * keinen Start, läuft Claude ohne Erfassung: Die Claude-Zuordnung fällt weg, die Session läuft in der Shell weiter.
   */
  viewReady(tabId: string, cols: number, rows: number): void;
  resizeTab(tabId: string, cols: number, rows: number): void;
  writeToTab(tabId: string, data: string): void;
  /** Startet eine beendete Shell neu. */
  restartTab(tabId: string): void;

  /**
   * Der Renderer liefert den Verlauf eines Tabs, meist als Antwort auf `requestHistory`. Der Kern
   * sichert ihn sofort. Für geschlossene Tabs wird nichts mehr gesichert.
   */
  saveHistory(tabId: string, content: string): void;

  updateSettings(patch: Partial<Settings>): void;
  /**
   * Schriftgrösse um `step` Schritte (ganze Zahl) grösser oder kleiner, vom aktuellen Stand aus;
   * sie bleibt zwischen 8 und 32.
   */
  stepFontSize(step: number): void;

  /**
   * Wie das Fenster öffnen soll: gespeicherte Grösse, Position und Maximiert-Zustand, geprüft gegen die
   * angeschlossenen Bildschirme. Ohne gespeicherte Angaben maximiert auf dem Hauptbildschirm.
   */
  windowState(): WindowState;
  /**
   * Das Fenster wurde verschoben, in der Grösse geändert, maximiert oder wiederhergestellt.
   * `bounds` ist die normale Grösse und Position, auch im maximierten Zustand.
   * Gespeichert wird entprellt und spätestens beim Beenden.
   */
  windowChanged(state: WindowState): void;
  /**
   * Das Fenster ist im Vordergrund bzw. nicht mehr (der Renderer meldet es beim Laden und bei jedem Wechsel).
   * Bis zur ersten Meldung gilt es als im Hintergrund. Nur im Vordergrund gilt der aktive Tab als angeschaut:
   * Kommt das Fenster mit einem fertigen Claude-Tab nach vorne, verschwinden dessen „fertig“ und sein Hinweis.
   * Auf die Countdowns der Hinweise wirkt der Vordergrund nicht (Ticket 33, siehe `windowVisible`).
   */
  windowForeground(foreground: boolean): void;
  /**
   * Das Fenster ist sichtbar bzw. nicht mehr (der Renderer meldet es beim Laden und bei jedem Wechsel). Nicht sichtbar
   * heisst minimiert, versteckt, von anderen Fenstern ganz verdeckt oder hinter dem Sperrbildschirm. Bis zur ersten
   * Meldung gilt es als nicht sichtbar. Davon hängt nur der Countdown der „fertig“-Hinweise ab (Ticket 33): Er läuft,
   * solange das Fenster sichtbar ist, auch ohne Fokus. Was als angeschaut gilt, entscheidet weiter der Vordergrund.
   */
  windowVisible(visible: boolean): void;

  /**
   * Klick auf einen Hinweis: zeigt seinen Tab an wie `activateTab`. Ein Hinweis mit offenen Punkten verschwindet dabei,
   * auch aus dem gespeicherten Zustand; „wartet“ und „fertig“ verschwinden wie bei jedem Anzeigen des Tabs. Ein Hinweis,
   * der nicht mehr steht, ändert nichts.
   */
  openToast(toastId: string): void;
  /**
   * Nimmt einen Hinweis weg (× am Hinweis), ohne den Tab anzuzeigen; offene Punkte sind damit auch im gespeicherten
   * Zustand weg.
   */
  dismissToast(toastId: string): void;
  /** Die Maus steht auf dem Hinweis bzw. nicht mehr: Solange hält sein Countdown an. */
  holdToast(toastId: string, hold: boolean): void;

  /**
   * THub beendet sich selbst (etwa bei einer Windows-Abmeldung): Die Claude-Zuordnungen werden eingefroren
   * und der Zustand sofort geschrieben. Danach ändern weder Meldungen von Starter und Claude noch das Ende
   * einer Shell die Zuordnungen; sonst käme nach dem Beenden jeder Claude-Tab als normales Terminal zurück.
   */
  freeze(): void;
  /**
   * Friert die Claude-Zuordnungen ein, fordert den Verlauf geänderter Tabs an und wartet darauf höchstens
   * 2 Sekunden, sichert den Zustand und beendet alle Shells samt ihren Nachfahren. Fragt nie nach, auch nicht, wenn
   * Claude gerade arbeitet: Alles kommt beim nächsten Start zurück. Danach nimmt der Kern keine Befehle mehr an.
   */
  shutdown(): Promise<void>;

  /**
   * Windows meldet sich ab oder startet neu: Der Zustand wird sofort und synchron geschrieben. Als
   * Verlauf gilt der zuletzt gesicherte; der Renderer wird nicht gefragt, weil er womöglich nicht mehr
   * antwortet. Wirft, wenn das Schreiben scheitert.
   */
  sessionEnding(): void;
}

export function createWorkspace(ports: WorkspacePorts, options: WorkspaceOptions): Workspace {
  return new WorkspaceCore(
    ports,
    options.shells,
    options.localApi,
    options.resumeLaunchGraceMs ?? RESUME_LAUNCH_GRACE_MS,
  );
}

/** Laufzeit-Angaben eines Tabs; werden nicht gespeichert. */
interface TabRuntime {
  process: TabProcessState;
  /** Grösse der Ansicht; fehlt, solange die Ansicht nicht bereit ist. */
  view?: { cols: number; rows: number };
  /** Kennzeichen des laufenden Prozesses, damit Meldungen früherer Prozesse ins Leere gehen. */
  run?: object;
  pid?: number;
  /** Wann der laufende Prozess gestartet wurde (Uhr des Kerns); für die Prozess-Regeln. */
  startedAt?: number;
  /** Wie der Prozessbaum der laufenden Shell aussieht; für die Prozess-Regeln. */
  tree?: ShellTree;
  /** Prozess-ID von Claude, vom Starter gemeldet; für die Prozess-Regeln. */
  claudePid?: number;
  /** Was Claude tut; bei normalen Tabs „ruht“. */
  claude: ClaudeStatus;
  /** „Fertig, noch nicht angeschaut“: Claude wurde fertig, während der Tab nicht sichtbar war. */
  finished: boolean;
  /** Im Terminal laufen Prozesse, nach den Prozess-Regeln und der letzten Abfrage der Sonde. */
  processes: boolean;
  /** Läuft nach Esc: Kommt bis dahin kein Hook-Ereignis, ruht Claude. */
  cancelEsc?: CancelTimer;
  /** Frist nach dem Ende der Agenten, solange eine Meldung über sie aussteht (`AGENT_REPORT_QUIET_MS`). */
  cancelAgentReports?: CancelTimer;
  /** Offene Antwort auf eine Rückfrage: Arbeitet Claude danach weiter? Entschieden über Hooks und die Prozess-Sonde. */
  answer?: AnswerCheck;
  /** Der Tab kommt aus dem gespeicherten Zustand: Vor dem ersten Start bekommt die Ansicht seinen Verlauf. */
  restorePending: boolean;
  /**
   * Pausierter Claude-Tab nach einem Neustart: noch kein Prozess. Er startet erst, wenn er angezeigt wird, und setzt
   * dann seine Session fort (`resume`).
   */
  paused: boolean;
  /** Der nächste Start setzt diese Claude-Session fort (Startbefehl „Starter mit `--resume <Kennung>`“). */
  resume?: string;
  /**
   * Von THub gestartetes Fortsetzen dieser Session, von dem Claude sich noch nicht gemeldet hat (kein Hook-Ereignis
   * ausser `SessionEnd`). Solange entscheidet erst die Ende-Meldung des Starters, ob der Tab normal wird.
   */
  resuming?: string;
  /**
   * Frist nach einem von THub abgesetzten Fortsetzen, bis der Starter den Start meldet (Ticket 23). Läuft sie ab, läuft
   * Claude ohne Erfassung, und die Claude-Zuordnung fällt weg.
   */
  cancelLaunchWait?: CancelTimer;
  /**
   * Die Claude-Zuordnung, die mit dieser Frist weggefallen ist, solange dieselbe Shell läuft. Meldet der Starter das
   * Fortsetzen doch noch (sehr langsames Profil), gilt sie wieder.
   */
  uncaptured?: PersistedClaudeLink;
  /** Zählt die Ausgabestücke der Shell; daran erkennt die Sicherung, ob sich der Inhalt geändert hat. */
  output: number;
  /** Stand von `output`, als der Verlauf zuletzt angefordert wurde. */
  requested: number;
  /** Stand von `output`, den der gesicherte Verlauf enthält. */
  saved: number;
}

/** Die Shell eines geschlossenen Tabs, solange sie noch auf die Prozess-Sonde wartet (siehe `endShells`). */
interface ClosingShell {
  tabId: string;
  root: ShellRoot;
  /** `kill` ist erteilt. */
  killed: boolean;
}

/** Eine offene Antwort auf eine Rückfrage (siehe `ANSWER_QUIET_MS`). */
interface AnswerCheck {
  /** Zeitpunkt der Antwort (Uhr des Kerns). */
  at: number;
  cancel: CancelTimer;
  /** Eine Abfrage nach der Antwort hat den Claude-Prozess gesehen, ohne neuen Nachfahren. */
  seen: boolean;
  /** Die Wartezeit ist um; entschieden wird mit der laufenden Abfrage. */
  due: boolean;
}

function newRuntime(restorePending: boolean): TabRuntime {
  return {
    process: 'pending',
    restorePending,
    paused: false,
    output: 0,
    requested: 0,
    saved: 0,
    claude: IDLE_CLAUDE,
    finished: false,
    processes: false,
  };
}

class WorkspaceCore implements Workspace {
  private readonly state: PersistedState;
  private readonly runtimes = new Map<string, TabRuntime>();
  private readonly listeners = new Set<(event: WorkspaceEvent) => void>();
  private stopping: Promise<void> | null = null;
  /** Claude-Zuordnungen eingefroren, weil THub sich selbst beendet. */
  private frozen = false;
  /** Vorgemerktes Speichern geänderter Fensterangaben; `null`, wenn nichts aussteht. */
  private cancelWindowSave: CancelTimer | null = null;
  /** Nächste periodische Sicherung des Verlaufs; `null` nach dem Beenden. */
  private cancelHistoryTimer: CancelTimer | null = null;
  /** Beim Beenden: Tabs, deren Verlauf noch aussteht, und wie es danach weitergeht. */
  private quitHistory: { pending: Set<string>; finish: () => void } | null = null;
  /** Das Fenster ist im Vordergrund; bis zur ersten Meldung des Renderers nicht. */
  private foreground = false;
  /** Wertet die Abfragen der Prozess-Sonde aus. */
  private readonly processTracker = new ProcessTracker();
  /** Nächste Abfrage der Prozess-Sonde; `null` nach dem Beenden. */
  private cancelProbeTimer: CancelTimer | null = null;
  /** Eine Abfrage der Sonde läuft; solange fällt der Takt aus. */
  private probing = false;
  /** Ein Fehler der Sonde wurde schon gemeldet; danach nicht bei jedem Takt wieder. */
  private probeErrorLogged = false;
  /** Geschlossene Tabs, deren Verlauf beim Schliessen angefordert wurde und noch aussteht. */
  private readonly closedHistory = new Set<string>();
  /** Shells geschlossener Tabs, die noch auf die Prozess-Sonde warten, nach Tab. */
  private readonly closingShells = new Map<string, ClosingShell>();
  /** Die Hinweise unten rechts im Fenster. */
  private readonly toasts: ToastBoard;
  /** Die zuletzt an den Port Wachhalten gemeldete Stufe; `null` vor der ersten Meldung beim Start. */
  private keepAwakeLevel: KeepAwakeLevel | null = null;

  constructor(
    private readonly ports: WorkspacePorts,
    private readonly shells: ShellInfo[],
    private readonly localApi: LocalApiInfo | undefined,
    /** Frist für die Start-Meldung nach einem Fortsetzen (`RESUME_LAUNCH_GRACE_MS`). */
    private readonly resumeLaunchGraceMs: number,
  ) {
    if (shells.length === 0) throw new Error('Der Workspace-Kern braucht mindestens eine Shell.');
    this.toasts = new ToastBoard(ports.clock, () => this.emit({ type: 'toasts', toasts: this.toasts.snapshot() }));

    const loaded = readPersistedState(ports.storage.loadState(), {
      homeDir: ports.system.homeDir(),
      defaultShellId: this.automaticShell().id,
    });
    this.state = loaded.state;
    // Ein eingeschaltetes Wachhalten läuft nach einem Neustart von selbst wieder, mit derselben Stufe.
    this.reportKeepAwake();
    let restoredChanged = false;
    for (const tab of this.state.tabs) {
      restoredChanged = this.restoreTab(tab, tab.id === this.state.activeTabId) || restoredChanged;
    }

    restoredChanged = this.restoreOpenPoints() || restoredChanged;

    // Wie bisher: Ohne gespeicherte Tabs startet THub mit einem neuen Terminal.
    if (this.state.tabs.length === 0) this.createTab();
    else if (loaded.migrated || restoredChanged) this.save();

    this.scheduleHistorySave();
    this.scheduleProbe();
  }

  // ---------- Abfragen und Ereignisse ----------

  snapshot(): WorkspaceSnapshot {
    return {
      tabs: this.tabSnapshots(),
      groups: this.groupSnapshots(),
      activeTabId: this.state.activeTabId,
      settings: structuredClone(this.state.settings),
      shells: this.shells.map((s) => ({ id: s.id, name: s.name })),
      defaultShellId: this.defaultShell().id,
      homeDir: this.ports.system.homeDir(),
      toasts: this.toasts.snapshot(),
    };
  }

  subscribe(listener: (event: WorkspaceEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // ---------- Tabs ----------

  createTab(options: NewTabOptions = {}): string {
    if (this.stopping) return '';
    // Am Ende der Leiste, egal welcher Tab aktiv ist (Ticket 26, Wunsch aus der Abnahme). Nur Duplizieren und
    // Wiederöffnen legen den Tab an eine bestimmte Stelle.
    const shellId = (this.findShell(options.shellId) ?? this.defaultShell()).id;
    return this.insertNewTab(this.state.tabs.length, this.newTabDir(options.cwd), shellId);
  }

  duplicateTab(tabId: string): string {
    const source = this.findTab(tabId);
    if (this.stopping || !source) return '';
    // Dieselbe Shell-Kennung, auch wenn die Shell auf diesem Rechner fehlt: Dann startet das Duplikat wie die Quelle
    // mit der Standard-Shell und kommt mit seiner Shell zurück, sobald es sie wieder gibt. Direkt nach der Quelle, in
    // ihrer Gruppe, falls sie in einer steht.
    const index = this.state.tabs.indexOf(source) + 1;
    return this.insertNewTab(index, this.resolveCwd(source), source.shellId, source.groupId);
  }

  /**
   * Legt einen neuen Tab an Position `index` an und macht ihn aktiv: automatischer Name nach dem Startordner, keine
   * Claude-Zuordnung, kein Verlauf. Der Startordner kommt an die Spitze der zuletzt benutzten Ordner.
   * @param groupId die Gruppe, in die der Tab kommt; `index` liegt dann in oder direkt hinter ihren Tabs
   */
  private insertNewTab(index: number, startCwd: string, shellId: string, groupId?: string): string {
    const tab: PersistedTab = {
      id: randomUUID(),
      name: this.autoTabName(startCwd),
      nameIsManual: false,
      shellId,
      startCwd,
    };
    if (groupId !== undefined) tab.groupId = groupId;
    this.state.tabs.splice(index, 0, tab);
    this.runtimes.set(tab.id, newRuntime(false));
    this.state.activeTabId = tab.id;
    this.rememberRecentDir(startCwd);
    this.tabsChanged();
    return tab.id;
  }

  renameTab(tabId: string, name: string): void {
    const tab = this.findTab(tabId);
    const trimmed = name.trim();
    if (this.stopping || !tab || !trimmed || trimmed === tab.name) return;
    tab.name = trimmed;
    tab.nameIsManual = true;
    this.tabsChanged();
  }

  moveTab(tabId: string, index: number): void {
    const tab = this.findTab(tabId);
    // Ein Tab in einer Gruppe steht nicht selbst in der Leiste; er wandert mit seiner Gruppe (`moveGroup`).
    if (!tab || tab.groupId !== undefined) return;
    this.moveEntry((entry) => entry.kind === 'tab' && entry.tab === tab, index);
  }

  moveGroup(groupId: string, index: number): void {
    this.moveEntry((entry) => entry.kind === 'group' && entry.groupId === groupId, index);
  }

  /**
   * Verschiebt einen Eintrag der Leiste an Position `index` (ab 0, ausserhalb gilt das nächste Ende). Eine Gruppe wandert
   * als Ganzes; ihre Tabs bleiben zusammen und in ihrer Reihenfolge.
   */
  private moveEntry(match: (entry: BarEntry<PersistedTab>) => boolean, index: number): void {
    if (this.stopping || !Number.isInteger(index)) return;
    const entries = barEntries(this.state.tabs);
    const from = entries.findIndex(match);
    if (from < 0) return;
    const to = Math.max(0, Math.min(index, entries.length - 1));
    if (to === from) return;
    const [entry] = entries.splice(from, 1);
    entries.splice(to, 0, entry);
    this.state.tabs.splice(0, this.state.tabs.length, ...entries.flatMap(entryTabs));
    this.tabsChanged();
  }

  tabFolder(tabId: string): string | undefined {
    const tab = this.findTab(tabId);
    return tab && (tab.lastCwd ?? tab.startCwd);
  }

  activateTab(tabId: string): void {
    if (this.stopping || !this.findTab(tabId) || this.state.activeTabId === tabId) return;
    this.state.activeTabId = tabId;
    this.showTab(tabId);
    this.markShownTabSeen();
    this.tabsChanged();
  }

  activateRelativeTab(offset: number): void {
    const entries = barEntries(this.state.tabs);
    if (entries.length === 0 || !Number.isInteger(offset)) return;
    const current = entries.findIndex((entry) => entryTabs(entry).some((t) => t.id === this.state.activeTabId));
    const next = (((current + offset) % entries.length) + entries.length) % entries.length;
    this.activateTab(this.entryShownTab(entries[next]).id);
  }

  activateTabAt(index: number): void {
    const entry = Number.isInteger(index) ? barEntries(this.state.tabs)[index] : undefined;
    if (entry) this.activateTab(this.entryShownTab(entry).id);
  }

  // ---------- Gruppen ----------

  createGroup(tabId: string): string {
    const tab = this.findTab(tabId);
    if (this.stopping || !tab || tab.groupId !== undefined) return '';
    const group: PersistedGroup = { id: randomUUID(), name: this.autoGroupName(tab), selectedTabId: tab.id };
    this.state.groups.push(group);
    tab.groupId = group.id;
    this.tabsChanged();
    this.emit({ type: 'groupCreated', groupId: group.id });
    return group.id;
  }

  moveTabToGroup(tabId: string, groupId: string): void {
    const tab = this.findTab(tabId);
    const group = this.findGroup(groupId);
    if (this.stopping || !tab || !group || tab.groupId === group.id) return;
    this.leaveGroup(tab);
    const { tabs } = this.state;
    tabs.splice(tabs.indexOf(tab), 1);
    // Die Zielgruppe hat noch ihre Tabs: Verschwinden kann nur die bisherige Gruppe des Tabs.
    const last = this.members(group).at(-1);
    tabs.splice(last ? tabs.indexOf(last) + 1 : tabs.length, 0, tab);
    tab.groupId = group.id;
    this.tabsChanged();
  }

  removeTabFromGroup(tabId: string): void {
    const tab = this.findTab(tabId);
    const group = tab && this.groupOf(tab);
    if (this.stopping || !tab || !group) return;
    const last = this.members(group)
      .filter((t) => t !== tab)
      .at(-1);
    this.leaveGroup(tab);
    if (last) {
      const { tabs } = this.state;
      tabs.splice(tabs.indexOf(tab), 1);
      tabs.splice(tabs.indexOf(last) + 1, 0, tab);
    }
    this.tabsChanged();
  }

  renameGroup(groupId: string, name: string): void {
    const group = this.findGroup(groupId);
    const trimmed = typeof name === 'string' ? name.trim() : '';
    if (this.stopping || !group || !trimmed || trimmed === group.name) return;
    group.name = trimmed;
    this.tabsChanged();
  }

  dissolveGroup(groupId: string): void {
    const group = this.findGroup(groupId);
    if (this.stopping || !group) return;
    for (const tab of this.members(group)) delete tab.groupId;
    this.removeGroup(group);
    this.tabsChanged();
  }

  closeGroup(groupId: string): void {
    const group = this.findGroup(groupId);
    if (group) this.requestClose(this.members(group).map((t) => t.id));
  }

  newTabInGroup(groupId: string): string {
    const group = this.findGroup(groupId);
    if (this.stopping || !group) return '';
    const members = this.members(group);
    const selected = this.findTab(group.selectedTabId) ?? members[0];
    const index = this.state.tabs.indexOf(members[members.length - 1]) + 1;
    return this.insertNewTab(index, this.resolveCwd(selected), this.defaultShell().id, group.id);
  }

  private findGroup(groupId: string): PersistedGroup | undefined {
    return this.state.groups.find((g) => g.id === groupId);
  }

  private groupOf(tab: PersistedTab): PersistedGroup | undefined {
    return tab.groupId === undefined ? undefined : this.findGroup(tab.groupId);
  }

  /** Die Tabs der Gruppe in ihrer Reihenfolge. */
  private members(group: PersistedGroup): PersistedTab[] {
    return this.state.tabs.filter((t) => t.groupId === group.id);
  }

  private removeGroup(group: PersistedGroup): void {
    const at = this.state.groups.indexOf(group);
    if (at >= 0) this.state.groups.splice(at, 1);
  }

  /**
   * Nimmt den Tab aus seiner Gruppe; seine Stelle in der Liste bleibt. War er ihr gewählter Tab, wird der nächste Tab der
   * Gruppe gewählt, sonst der vorherige. War er ihr letzter Tab, verschwindet die Gruppe. Liefert den Tab, den die
   * Gruppe danach wählt (`undefined`, wenn sie verschwunden ist oder er in keiner stand).
   */
  private leaveGroup(tab: PersistedTab): PersistedTab | undefined {
    const group = this.groupOf(tab);
    delete tab.groupId;
    if (!group) return undefined;
    const members = this.members(group);
    if (members.length === 0) {
      this.removeGroup(group);
      return undefined;
    }
    if (group.selectedTabId !== tab.id) return this.findTab(group.selectedTabId);
    // `members` ohne den Tab: Der nächste steht jetzt an seiner bisherigen Stelle in der Gruppe.
    const before = this.state.tabs.indexOf(tab);
    const successor = members.find((t) => this.state.tabs.indexOf(t) > before) ?? members[members.length - 1];
    group.selectedTabId = successor.id;
    return successor;
  }

  /** Der Tab, den ein Eintrag der Leiste zeigt: der einzelne Tab bzw. der gewählte Tab der Gruppe. */
  private entryShownTab(entry: BarEntry<PersistedTab>): PersistedTab {
    return this.shownTab(entryTabs(entry)[0]);
  }

  /** Der Tab, den der Eintrag dieses Tabs zeigt: er selbst, oder der gewählte Tab seiner Gruppe. */
  private shownTab(tab: PersistedTab): PersistedTab {
    const group = this.groupOf(tab);
    return (group && this.findTab(group.selectedTabId)) ?? tab;
  }

  /** Name einer neuen Gruppe nach dem aktuellen Ordner ihres Tabs, eindeutig unter den Gruppen. */
  private autoGroupName(tab: PersistedTab): string {
    const base = folderName(tab.lastCwd ?? tab.startCwd, this.namingContext()) || 'Gruppe';
    return uniqueName(base, this.state.groups.map((g) => g.name));
  }

  /**
   * Der angezeigte Tab ist immer der gewählte Tab seiner Gruppe, auf welchem Weg er auch angezeigt wurde (Klick, Liste,
   * Hinweis, Befehlspalette, Tastenkürzel, Wiederöffnen, Schliessen des Nachbarn).
   */
  private selectShownTab(): void {
    const active = this.state.activeTabId === null ? undefined : this.findTab(this.state.activeTabId);
    const group = active && this.groupOf(active);
    if (active && group) group.selectedTabId = active.id;
  }

  // ---------- Schliessen und wieder öffnen ----------

  requestClose(tabIds: string[]): void {
    if (this.stopping) return;
    const tabs = this.openTabs(tabIds);
    if (tabs.length === 0) return;
    const busy: BusyTab[] = [];
    for (const tab of tabs) {
      const reason = this.busyReason(tab);
      if (!reason) continue;
      const resumes = tab.claude !== undefined && sessionToResume(tab.claude) !== undefined;
      busy.push({ id: tab.id, name: tab.name, reason, resumes });
    }
    const ids = tabs.map((t) => t.id);
    if (busy.length === 0) this.closeTabs(ids);
    else this.emit({ type: 'askClose', tabIds: ids, busy });
  }

  closeOtherTabs(tabId: string): void {
    const tab = this.findTab(tabId);
    if (!tab) return;
    // In einer Gruppe nur die anderen Tabs dieser Gruppe; ein einzelner Tab räumt die ganze Leiste ab, samt Gruppen.
    const group = this.groupOf(tab);
    const scope = group ? this.members(group) : this.state.tabs;
    this.requestClose(scope.filter((t) => t !== tab).map((t) => t.id));
  }

  closeTab(tabId: string): void {
    this.closeTabs([tabId]);
  }

  closeTabs(tabIds: string[]): void {
    if (this.stopping) return;
    const tabs = this.openTabs(tabIds);
    if (tabs.length === 0) return;
    const shells: { tabId: string; root?: ShellRoot }[] = [];
    const changed: string[] = [];
    const activeBefore = this.state.activeTabId;
    for (const tab of tabs) {
      const index = this.state.tabs.indexOf(tab);
      // Zuerst austragen und so einfrieren: Das Ende der Shell und Meldungen von Starter und Claude gehören dann zu
      // keinem Tab mehr, ein später eintreffender Verlauf ebenfalls nicht.
      const runtime = this.runtimes.get(tab.id);
      if (runtime) this.cancelClaudeTimers(runtime);
      this.runtimes.delete(tab.id);
      this.toasts.dismissTab(tab.id);
      shells.push({ tabId: tab.id, root: runtime && shellRoot(runtime) });
      // Claude-Tabs haben keinen Verlauf; sonst nur, wenn es seit der letzten Sicherung Neues gibt.
      if (!tab.claude && runtime && runtime.output !== runtime.saved) changed.push(tab.id);
      // Seine Gruppe merkt sich der geschlossene Tab für das Wiederöffnen; die Gruppe wählt einen anderen Tab.
      const group = this.groupOf(tab);
      const place = group && { id: group.id, name: group.name, position: this.members(group).indexOf(tab) };
      const successor = this.leaveGroup(tab);
      this.state.tabs.splice(index, 1);
      // Ein geschlossener Tab nimmt seine offenen Punkte mit, auch in die Liste der geschlossenen Tabs.
      delete tab.openPoints;
      const closed: ClosedTab = { tab: structuredClone(tab), index, closedAt: this.ports.clock.now() };
      if (place) closed.group = place;
      this.state.closedTabs.unshift(closed);
      this.rememberRecentDir(tab.lastCwd ?? tab.startCwd);
      if (this.state.activeTabId === tab.id) {
        // In der Gruppe der nächste (sonst der vorherige) Tab; ohne ihn der Nachbar in der Leiste.
        const neighbour = successor ?? this.neighbourAt(index);
        this.state.activeTabId = neighbour?.id ?? null;
      }
    }
    this.trimClosedTabs();
    // Noch vor dem Ereignis ohne die Tabs: Bis dahin zeigt der Renderer ihren Inhalt.
    const awaited = changed.filter((id) => this.isClosedTab(id));
    if (awaited.length > 0) {
      for (const id of awaited) this.closedHistory.add(id);
      this.emit({ type: 'requestHistory', tabIds: awaited });
    }
    this.endShells(shells);
    if (this.state.activeTabId !== activeBefore) {
      this.showTab(this.state.activeTabId);
      this.markShownTabSeen();
    }
    this.tabsChanged();
  }

  reopenClosedTab(tabId?: string): string {
    if (this.stopping) return '';
    const { closedTabs } = this.state;
    const at = tabId === undefined ? 0 : closedTabs.findIndex((entry) => entry.tab.id === tabId);
    const entry = closedTabs[at];
    if (!entry) return '';
    closedTabs.splice(at, 1);
    const { tab } = entry;
    // Ein später eintreffender Verlauf gehört jetzt wieder dem offenen Tab.
    this.closedHistory.delete(tab.id);
    // Wartet die alte Shell noch auf die Sonde, endet sie jetzt; die neue startet erst nach „Ansicht bereit“.
    const closing = this.closingShells.get(tab.id);
    if (closing) this.killClosingShell(closing);
    if (this.findTab(tab.id)) {
      // Beschädigter Zustand: Der Tab ist schon offen.
      this.save();
      return '';
    }
    this.state.tabs.splice(this.reopenIndex(entry), 0, tab);
    // Wie nach einem Neustart, als angezeigter Tab: Verlauf bzw. sofortiges Fortsetzen der Claude-Session.
    this.restoreTab(tab, true);
    this.state.activeTabId = tab.id;
    this.showTab(tab.id);
    this.markShownTabSeen();
    this.tabsChanged();
    return tab.id;
  }

  /**
   * Wohin ein wieder geöffneter Tab kommt, und in welche Gruppe. Stand er in einer Gruppe, die es noch gibt: an seine
   * alte Stelle in ihr. Gibt es sie nicht mehr, entsteht sie neu mit ihrem Namen an seiner alten Stelle in der Leiste.
   * Ein einzelner Tab kommt an seine alte Stelle, aber nie mitten in eine Gruppe.
   */
  private reopenIndex(entry: ClosedTab): number {
    const { tab, group: place } = entry;
    const { tabs } = this.state;
    const group = place && this.findGroup(place.id);
    if (group) {
      const members = this.members(group);
      tab.groupId = group.id;
      const after = members[Math.min(place.position, members.length)];
      return after ? tabs.indexOf(after) : tabs.indexOf(members[members.length - 1]) + 1;
    }
    if (place) {
      this.state.groups.push({ id: place.id, name: place.name, selectedTabId: tab.id });
      tab.groupId = place.id;
    }
    return entryBoundary(tabs, entry.index);
  }

  closedTabs(): ClosedTabInfo[] {
    return this.state.closedTabs.map(({ tab, closedAt, group }) => {
      const info: ClosedTabInfo = {
        id: tab.id,
        name: tab.name,
        kind: tab.claude ? 'claude' : 'terminal',
        shellName: this.shellFor(tab).name,
        cwd: tab.claude?.cwd || (tab.lastCwd ?? tab.startCwd),
        closedAt,
      };
      // Der Name, unter dem die Gruppe jetzt steht; gibt es sie nicht mehr, der gemerkte.
      if (group) info.groupName = this.findGroup(group.id)?.name ?? group.name;
      return info;
    });
  }

  /** Die offenen Tabs zu diesen Kennungen, in dieser Reihenfolge, ohne Doppelte und Unbekannte. */
  private openTabs(tabIds: string[]): PersistedTab[] {
    if (!Array.isArray(tabIds)) return [];
    const tabs: PersistedTab[] = [];
    for (const id of tabIds) {
      const tab = typeof id === 'string' ? this.findTab(id) : undefined;
      if (tab && !tabs.includes(tab)) tabs.push(tab);
    }
    return tabs;
  }

  /**
   * Warum der Tab vor dem Schliessen nachfragt, nach den eigentlichen Merkmalen: Claude wartet oder arbeitet, oder es
   * laufen Prozesse. „Fertig, noch nicht angeschaut“ zählt nicht, ein pausierter Tab hat keinen Prozess.
   */
  private busyReason(tab: PersistedTab): BusyReason | undefined {
    const runtime = this.runtimes.get(tab.id);
    if (!runtime) return undefined;
    // Wie am Tab: Auch ein Agent, der noch rechnet, heisst „arbeitet“.
    const activity = tab.claude ? shownActivity(runtime.claude) : 'idle';
    if (activity !== 'idle') return activity;
    return runtime.processes ? 'processes' : undefined;
  }

  private isClosedTab(tabId: string): boolean {
    return this.state.closedTabs.some((entry) => entry.tab.id === tabId);
  }

  /**
   * Der Nachbar in der Leiste, nachdem an Position `index` der Liste ein Eintrag verschwunden ist: der nächste Eintrag,
   * sonst der vorherige; eine Gruppe mit ihrem gewählten Tab.
   */
  private neighbourAt(index: number): PersistedTab | undefined {
    const tab = this.state.tabs[index] ?? this.state.tabs[index - 1];
    return tab && this.shownTab(tab);
  }

  /** Höchstens zehn geschlossene Tabs: Wer aus der Liste fällt, verliert seinen Verlauf. */
  private trimClosedTabs(): void {
    for (const { tab } of this.state.closedTabs.splice(MAX_CLOSED_TABS)) {
      this.closedHistory.delete(tab.id);
      this.deleteHistory(tab.id);
    }
  }

  /**
   * Beendet die Shells geschlossener Tabs samt allen Nachfahren. `kill` erreicht Prozesse mit eigener Konsole nicht (etwa
   * per `Start-Process` gestartet); die beendet die Sonde gezielt. Dafür wird vor dem Beenden noch einmal abgefragt:
   * Nach dem Ende der Shell sind ihre Nachfahren nicht mehr sicher über die Eltern zu finden.
   */
  private endShells(shells: { tabId: string; root?: ShellRoot }[]): void {
    const closing: ClosingShell[] = [];
    for (const { tabId, root } of shells) {
      if (!root) {
        this.ports.terminal.kill(tabId);
        continue;
      }
      const shell: ClosingShell = { tabId, root, killed: false };
      this.closingShells.set(tabId, shell);
      closing.push(shell);
    }
    if (closing.length === 0) return;
    void this.snapshotForKill().then((snapshot) => {
      const doomed = closing.flatMap((shell) => shellProcesses(snapshot, shell.root));
      for (const shell of closing) this.killClosingShell(shell);
      if (doomed.length > 0) this.ports.processes.terminate(doomed);
    });
  }

  private killClosingShell(shell: ClosingShell): void {
    if (this.closingShells.get(shell.tabId) === shell) this.closingShells.delete(shell.tabId);
    if (shell.killed) return;
    shell.killed = true;
    this.ports.terminal.kill(shell.tabId);
  }

  /** Eine Abfrage der Sonde zum Beenden; scheitert sie oder dauert sie zu lange, eine leere. */
  private snapshotForKill(): Promise<ProcessInfo[]> {
    return new Promise((resolve) => {
      let done = false;
      const finish = (snapshot: ProcessInfo[]): void => {
        if (done) return;
        done = true;
        cancel();
        resolve(snapshot);
      };
      const cancel = this.ports.clock.schedule(KILL_PROBE_TIMEOUT_MS, () => finish([]));
      this.ports.processes.snapshot().then(finish, (err: unknown) => {
        console.error('Prozess-Sonde: Abfrage zum Beenden fehlgeschlagen:', err);
        finish([]);
      });
    });
  }

  // ---------- Ordner und Namen ----------

  recentDirs(): RecentDir[] {
    const ctx = this.namingContext();
    // Ein älterer Stand kann denselben Ordner als Kurz- und Langform enthalten; angeboten wird er nur einmal.
    return this.state.recentDirs
      .map((dir) => this.ports.system.longPath(dir))
      .reduceRight<string[]>(rememberDir, [])
      .filter((dir) => this.ports.system.directoryExists(dir))
      .map((dir) => ({ path: dir, name: folderName(dir, ctx) }));
  }

  /** Setzt einen Ordner an die Spitze der zuletzt benutzten, mit aufgelösten 8.3-Kurznamen (sonst stünde er doppelt da). */
  private rememberRecentDir(dir: string): void {
    this.state.recentDirs = rememberDir(this.state.recentDirs, this.ports.system.longPath(dir));
  }

  /** Startordner eines neuen Tabs: gewünschter Ordner → Standardordner → Benutzerordner, der erste, den es gibt. */
  private newTabDir(requested: string | undefined): string {
    const candidates = [requested?.trim(), this.state.settings.defaultCwd];
    const existing = candidates.find((dir) => dir && this.ports.system.directoryExists(dir));
    return existing ?? this.ports.system.homeDir();
  }

  /** Name nach dem Ordner, eindeutig unter allen offenen Tabs, auch den von Hand benannten. */
  private autoTabName(dir: string): string {
    const base = folderName(dir, this.namingContext()) || 'Terminal';
    return uniqueName(base, this.state.tabs.map((t) => t.name));
  }

  private namingContext(): NamingContext {
    return { homeDir: this.ports.system.homeDir(), userName: this.ports.system.userName() };
  }

  // ---------- Ansichten und Shells ----------

  viewReady(tabId: string, cols: number, rows: number): void {
    const tab = this.findTab(tabId);
    const runtime = this.runtimes.get(tabId);
    if (this.stopping || !tab || !runtime || !isValidSize(cols, rows)) return;
    runtime.view = { cols, rows };
    // Ein pausierter Claude-Tab startet erst, wenn er angezeigt wird (`showTab`).
    if (runtime.paused) return;
    if (runtime.process === 'pending') {
      // Erst der Verlauf, dann der Startauftrag: So steht er vor der ersten Ausgabe der Shell.
      this.restoreHistory(tabId, runtime);
      this.startShell(tab, runtime, true);
    } else if (runtime.process === 'running') this.ports.terminal.resize(tabId, cols, rows);
  }

  resizeTab(tabId: string, cols: number, rows: number): void {
    const runtime = this.runtimes.get(tabId);
    // Vor „Ansicht bereit“ zählt nur die dort gemeldete Grösse.
    if (this.stopping || !runtime?.view || !isValidSize(cols, rows)) return;
    runtime.view = { cols, rows };
    if (runtime.process === 'running') this.ports.terminal.resize(tabId, cols, rows);
  }

  writeToTab(tabId: string, data: string): void {
    const runtime = this.runtimes.get(tabId);
    if (this.stopping || runtime?.process !== 'running') return;
    this.ports.terminal.write(tabId, data);
    this.takeInput(tabId, runtime, data);
  }

  restartTab(tabId: string): void {
    const tab = this.findTab(tabId);
    const runtime = this.runtimes.get(tabId);
    if (this.stopping || !tab || runtime?.process !== 'exited' || !runtime.view) return;
    this.startShell(tab, runtime, false);
  }

  /** @param firstStart erster Start in der noch leeren Ansicht; nur dann kommt der Hinweis auf eine fehlende Shell */
  private startShell(tab: PersistedTab, runtime: TabRuntime, firstStart: boolean): void {
    const view = runtime.view;
    if (!view) return;
    const shell = this.shellFor(tab);
    if (firstStart && shell.id !== tab.shellId) {
      this.emit({
        type: 'notice',
        tabId: tab.id,
        level: 'info',
        text: `${shellLabel(tab.shellId)} wurde auf diesem Rechner nicht gefunden. Der Tab startet mit der Standard-Shell ${shell.name}.`,
        beforeStart: true,
      });
    }
    const resume = this.resumeStart(tab, runtime, shell);
    const cwd = resume ? this.sessionCwd(tab) : this.resolveCwd(tab);
    const order: StartOrder = {
      file: shell.file,
      args: shellArgs(shell, cwd),
      cwd,
      env: this.terminalEnv(tab),
      cols: view.cols,
      rows: view.rows,
    };
    if (shell.integration) order.integration = shell.integration;
    if (resume) order.startCommand = resume.command;

    const run = {};
    // Pro Prozess neu: Eine angefangene Sequenz eines früheren Prozesses gehört nicht dazu.
    const cwdReports = new CwdReportScanner();
    const isCurrent = () => !this.stopping && this.runtimes.get(tab.id) === runtime && runtime.run === run;
    runtime.run = run;
    runtime.process = 'running';
    runtime.startedAt = this.ports.clock.now();
    runtime.tree = shellTree(shell);
    try {
      const pid = this.ports.terminal.start(tab.id, order, {
        data: (chunk) => {
          if (!isCurrent()) return;
          runtime.output++;
          // Die Ordner-Meldungen bleiben im Strom; xterm.js ignoriert sie.
          this.emit({ type: 'output', tabId: tab.id, data: chunk });
          this.takeReportedCwd(tab, cwdReports.feed(chunk));
        },
        exit: (exitCode) => {
          if (!isCurrent()) return;
          runtime.process = 'exited';
          runtime.run = undefined;
          runtime.pid = undefined;
          runtime.processes = false;
          runtime.resuming = undefined;
          this.cancelLaunchWait(runtime);
          runtime.uncaptured = undefined;
          // Mit der Shell endet auch ein Claude darin: Der Tab wird ein normales Terminal.
          if (!this.frozen) this.setClaudeLink(tab, undefined);
          this.emit({ type: 'exit', tabId: tab.id, exitCode });
          this.emitTabs();
        },
      });
      if (resume) runtime.resume = undefined;
      if (isCurrent()) {
        runtime.pid = pid;
        // Von THub gestartetes Fortsetzen: Bis Claude sich meldet, entscheidet erst die Ende-Meldung des Starters. Die
        // Frist für die Start-Meldung beginnt erst jetzt, mit dem Startbefehl.
        if (resume) {
          runtime.resuming = resume.sessionId;
          this.awaitResumeLaunch(tab, runtime, cwd);
        }
      }
    } catch (err) {
      if (runtime.run === run) {
        runtime.process = 'exited';
        runtime.run = undefined;
      }
      this.emit({
        type: 'notice',
        tabId: tab.id,
        level: 'error',
        text: `Shell konnte nicht gestartet werden: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
    this.emitTabs();
  }

  /** Umgebung jedes Terminals: Tab-Kennung, dazu Adresse und Token der lokalen Schnittstelle. */
  private terminalEnv(tab: PersistedTab): Record<string, string> {
    const env: Record<string, string> = { THUB_TAB_ID: tab.id };
    if (this.localApi) {
      env.THUB_API = this.localApi.url;
      env.THUB_TOKEN = this.localApi.token;
    }
    return env;
  }

  /**
   * Übernimmt den zuletzt gemeldeten Ordner als zuletzt aktiven Ordner des Tabs. Meldungen von Orten, die
   * es im Dateisystem nicht (mehr) gibt, zählen nicht.
   */
  private takeReportedCwd(tab: PersistedTab, reported: string[]): void {
    let next = tab.lastCwd;
    for (const raw of reported) {
      const dir = this.normalizeDir(raw);
      // Die Shell meldet bei jedem Prompt; geprüft wird nur ein neuer Ordner.
      if (dir && dir !== next && this.ports.system.directoryExists(dir)) next = dir;
    }
    if (next === tab.lastCwd) return;
    tab.lastCwd = next;
    this.tabsChanged();
  }

  /** Startordner: zuletzt aktiver Ordner → Startordner → Standardordner → Benutzerordner. */
  private resolveCwd(tab: PersistedTab): string {
    return this.firstExistingDir([tab.lastCwd, tab.startCwd, this.state.settings.defaultCwd]);
  }

  /**
   * Startordner beim Fortsetzen einer Claude-Session: der Ordner der Session, weil Claude nach `--resume <Kennung>` im
   * aktuellen Ordner läuft; fehlt er, Startordner → Standardordner → Benutzerordner.
   */
  private sessionCwd(tab: PersistedTab): string {
    return this.firstExistingDir([tab.claude?.cwd, tab.startCwd, this.state.settings.defaultCwd]);
  }

  /** Der erste dieser Ordner, den es gibt, sonst der Benutzerordner. */
  private firstExistingDir(candidates: (string | undefined)[]): string {
    const existing = candidates.find((dir) => dir && this.ports.system.directoryExists(dir));
    return existing ?? this.ports.system.homeDir();
  }

  // ---------- Claude-Sessions fortsetzen ----------

  /**
   * Bereitet einen Tab aus dem gespeicherten Zustand auf seinen ersten Start vor. Ein normaler Tab bekommt davor seinen
   * Verlauf. Ein fortzusetzender Claude-Tab (`sessionToResume`) setzt seine Session fort: sofort, wenn er angezeigt
   * wird (`shown`), sonst ist er pausiert, bis er angezeigt wird. Ein anderer Claude-Tab kommt als normales Terminal im
   * Ordner der Session zurück. Claude-Tabs bekommen keinen Verlauf.
   * @returns ob sich der gespeicherte Tab dabei geändert hat
   */
  private restoreTab(tab: PersistedTab, shown: boolean): boolean {
    const link = tab.claude;
    if (!link) {
      this.runtimes.set(tab.id, newRuntime(true));
      return false;
    }
    const runtime = newRuntime(false);
    this.runtimes.set(tab.id, runtime);
    this.deleteHistory(tab.id);
    const sessionId = sessionToResume(link);
    if (sessionId) {
      runtime.resume = sessionId;
      runtime.paused = !shown;
      return false;
    }
    delete tab.claude;
    if (link.cwd) tab.lastCwd = link.cwd;
    return true;
  }

  /** Der Tab wird angezeigt: Ein pausierter Claude-Tab setzt jetzt seine Session fort. */
  private showTab(tabId: string | null): void {
    const tab = tabId ? this.findTab(tabId) : undefined;
    const runtime = tabId ? this.runtimes.get(tabId) : undefined;
    if (!tab || !runtime?.paused) return;
    runtime.paused = false;
    // Hat der Renderer die Ansicht schon gemeldet, startet die Shell sofort, sonst mit „Ansicht bereit“.
    if (runtime.view && runtime.process === 'pending') this.startShell(tab, runtime, true);
  }

  /**
   * Ob dieser Start eine Claude-Session fortsetzt: Kennung und Startbefehl in der Sprache der Shell. Ohne Integration
   * (etwa wenn statt der fehlenden Shell eine WSL-Distribution einspringt) kann die Shell keinen Startbefehl ausführen;
   * dann kommt der Tab wie jeder nicht fortgesetzte Claude-Tab als normales Terminal im Ordner der Session zurück.
   */
  private resumeStart(
    tab: PersistedTab,
    runtime: TabRuntime,
    shell: ShellInfo,
  ): { sessionId: string; command: string } | undefined {
    const sessionId = runtime.resume;
    if (sessionId === undefined) return undefined;
    const link = tab.claude;
    if (!link || !shell.integration || !shell.capturesClaude) {
      runtime.resume = undefined;
      if (link?.cwd) tab.lastCwd = link.cwd;
      this.setClaudeLink(tab, undefined);
      return undefined;
    }
    return { sessionId, command: resumeCommand(shell.integration, sessionId) };
  }

  /**
   * Der Startbefehl zum Fortsetzen ist abgesetzt (Ticket 23). Meldet der Starter innerhalb der Frist keinen Start,
   * läuft Claude ohne Erfassung, etwa ohne THUB_STARTER: Ohne Hooks und ohne Ende-Meldung bliebe der Tab sonst ein
   * Claude-Tab, bis die Shell endet, und jeder weitere Neustart setzte die Session wieder fort. Die Claude-Zuordnung
   * fällt deshalb weg, wie bei einem `claude`, das ohne Starter getippt wurde; die Session läuft in der Shell ungestört
   * weiter. Der Tab steht danach im Ordner, in dem seine Shell gestartet ist, ausser die Shell hat inzwischen selbst
   * einen gemeldet. Start-Meldung, Hook-Ereignis, Ende von Claude oder Shell, Schliessen, Einfrieren und Beenden
   * beenden die Frist ohne Wirkung.
   * @param cwd der Ordner, in dem die Shell gestartet ist
   */
  private awaitResumeLaunch(tab: PersistedTab, runtime: TabRuntime, cwd: string): void {
    this.cancelLaunchWait(runtime);
    const run = runtime.run;
    const cwdBefore = tab.lastCwd;
    runtime.cancelLaunchWait = this.ports.clock.schedule(this.resumeLaunchGraceMs, () => {
      runtime.cancelLaunchWait = undefined;
      const link = tab.claude;
      if (this.frozen || this.stopping || this.runtimes.get(tab.id) !== runtime || runtime.run !== run || !link) return;
      this.updateTab(tab, () => {
        if (tab.lastCwd === cwdBefore) tab.lastCwd = cwd;
        this.setClaudeLink(tab, undefined);
      });
      runtime.uncaptured = link;
    });
  }

  // ---------- Verlauf ----------

  saveHistory(tabId: string, content: string): void {
    const runtime = this.runtimes.get(tabId);
    const quit = this.quitHistory;
    const awaited = quit?.pending.has(tabId) ?? false;
    // Ein geschlossener Tab bekommt nur noch den Verlauf, der beim Schliessen angefordert wurde.
    const closed = !runtime && this.closedHistory.delete(tabId);
    // Beim Beenden zählen nur noch die Antworten, auf die das Beenden wartet.
    if ((!runtime && !closed) || typeof content !== 'string' || (this.stopping && !awaited)) return;
    // Claude-Tabs bekommen keinen Verlauf, auch nicht aus einer Antwort, die erst nach dem Start von Claude eintrifft.
    if (closed || !this.findTab(tabId)?.claude) {
      this.withHistoryStorage('Verlauf konnte nicht gesichert werden', () => {
        this.ports.storage.saveHistory(tabId, { content, savedAt: this.ports.clock.now() });
        if (runtime) runtime.saved = runtime.requested;
      });
    }
    if (quit && awaited) {
      quit.pending.delete(tabId);
      if (quit.pending.size === 0) quit.finish();
    }
  }

  /** Gibt der Ansicht eines wiederhergestellten Tabs seinen Verlauf, einmal und vor dem ersten Start. */
  private restoreHistory(tabId: string, runtime: TabRuntime): void {
    if (!runtime.restorePending) return;
    runtime.restorePending = false;
    const history = this.withHistoryStorage('Verlauf konnte nicht gelesen werden', () =>
      this.ports.storage.loadHistory(tabId),
    );
    if (history?.content) {
      this.emit({ type: 'restoreHistory', tabId, content: history.content, savedAt: history.savedAt });
    }
  }

  /** Sichert alle 30 Sekunden den Verlauf der Tabs, deren Inhalt sich geändert hat. */
  private scheduleHistorySave(): void {
    this.cancelHistoryTimer = this.ports.clock.schedule(HISTORY_SAVE_INTERVAL_MS, () => {
      this.requestHistory(this.changedTabIds());
      this.scheduleHistorySave();
    });
  }

  /** Normale Tabs mit Ausgabe seit der letzten Sicherung, in der Reihenfolge der Leiste; Claude-Tabs haben keinen Verlauf. */
  private changedTabIds(): string[] {
    return this.state.tabs
      .filter((tab) => !tab.claude)
      .map((tab) => tab.id)
      .filter((id) => {
        const runtime = this.runtimes.get(id);
        return runtime !== undefined && runtime.output !== runtime.saved;
      });
  }

  /** Fordert den Verlauf dieser Tabs beim Renderer an; er antwortet je Tab mit `saveHistory`. */
  private requestHistory(tabIds: string[]): void {
    if (tabIds.length === 0) return;
    for (const id of tabIds) {
      const runtime = this.runtimes.get(id);
      if (runtime) runtime.requested = runtime.output;
    }
    this.emit({ type: 'requestHistory', tabIds });
  }

  /**
   * Beim Beenden: fordert den Verlauf geänderter Tabs an und wartet auf alle Antworten, höchstens 2 s; ebenso auf den
   * Verlauf eben geschlossener Tabs, der noch aussteht.
   */
  private collectHistory(): Promise<void> {
    const tabIds = this.changedTabIds();
    const pending = new Set([...tabIds, ...this.closedHistory]);
    if (pending.size === 0) return Promise.resolve();
    return new Promise((resolve) => {
      const finish = (): void => {
        cancelTimeout();
        this.quitHistory = null;
        resolve();
      };
      // Antwortet der Renderer nicht (mehr), geht das Beenden nach dem Zeitlimit trotzdem weiter.
      const cancelTimeout = this.ports.clock.schedule(HISTORY_QUIT_TIMEOUT_MS, finish);
      this.quitHistory = { pending, finish };
      this.requestHistory(tabIds);
    });
  }

  private deleteHistory(tabId: string): void {
    this.withHistoryStorage('Verlauf konnte nicht gelöscht werden', () => this.ports.storage.deleteHistory(tabId));
  }

  /**
   * Der Verlauf ist eine Zugabe: Scheitert der Speicher daran, laufen Tabs und Beenden trotzdem weiter.
   * Liefert das Ergebnis von `action`, bei einem Fehler `undefined`.
   */
  private withHistoryStorage<T>(failure: string, action: () => T): T | undefined {
    try {
      return action();
    } catch (err) {
      console.error(`${failure}:`, err);
      return undefined;
    }
  }

  // ---------- Shells ----------

  /** Die Standard-Shell: die eingestellte, falls sie erkannt ist, sonst die automatisch gewählte. */
  private defaultShell(): ShellInfo {
    return this.findShell(this.state.settings.defaultShellId) ?? this.automaticShell();
  }

  /** Ohne (erkannte) Einstellung: PowerShell 7, sonst Windows PowerShell, sonst die erste erkannte Shell. */
  private automaticShell(): ShellInfo {
    return this.findShell('pwsh') ?? this.findShell('powershell') ?? this.shells[0];
  }

  /** Die Shell eines Tabs; fehlt sie auf diesem Rechner, gilt die Standard-Shell. */
  private shellFor(tab: PersistedTab): ShellInfo {
    return this.findShell(tab.shellId) ?? this.defaultShell();
  }

  private findShell(shellId: string | undefined): ShellInfo | undefined {
    return shellId ? this.shells.find((s) => s.id === shellId) : undefined;
  }

  // ---------- Einstellungen ----------

  updateSettings(patch: Partial<Settings>): void {
    if (this.stopping) return;
    const next = normalizeSettings({ ...this.state.settings, ...patch });
    if (JSON.stringify(next) === JSON.stringify(this.state.settings)) return;
    this.state.settings = next;
    // Offene Punkte ausgeschaltet: Auch die gespeicherten verschwinden; wieder eingeschaltet kommen nur neue.
    if (!next.openPoints) for (const tab of this.state.tabs) delete tab.openPoints;
    this.save();
    this.emit({ type: 'settings', settings: structuredClone(next), defaultShellId: this.defaultShell().id });
    // Ausgeschaltet: Auch die Hinweise, die gerade stehen, verschwinden; jede Einstellung für ihre Arten.
    if (!next.notifications) this.toasts.clear(STATUS_TOASTS);
    if (!next.openPoints) this.toasts.clear(['openPoints']);
    this.reportKeepAwake();
  }

  /**
   * Meldet dem Port Wachhalten die Stufe, die nach den Einstellungen gilt, aber nur, wenn sie sich geändert hat: beim
   * Start einmal, danach bei jeder Änderung von an/aus oder (eingeschaltet) der Stufe. Beenden und Einfrieren melden
   * nichts; Windows gibt die Anforderung mit dem Prozess frei, und die Einstellung bleibt für den nächsten Start.
   */
  private reportKeepAwake(): void {
    const { keepAwake, keepAwakeMode } = this.state.settings;
    const level: KeepAwakeLevel = keepAwake ? keepAwakeMode : 'off';
    if (level === this.keepAwakeLevel) return;
    this.keepAwakeLevel = level;
    let done: Promise<void>;
    try {
      done = this.ports.keepAwake.set(level);
    } catch (err) {
      done = Promise.reject(err);
    }
    done.catch((err: unknown) => this.keepAwakeFailed(level, err));
  }

  /**
   * Die Stufe liess sich nicht setzen (Ticket 31). Scheiterte das Setzen, hält der Port nichts mehr wach: Das Wachhalten
   * wird ausgeschaltet und gespeichert, die Stufe bleibt. Scheiterte nur das Aufheben, bleibt die Einstellung, wie
   * gewählt. In beiden Fällen erscheint der Fehler-Hinweis, unabhängig von „Hinweise im Fenster“. Ein Fehler für eine
   * Stufe, die inzwischen nicht mehr gewünscht ist, ändert nichts.
   */
  private keepAwakeFailed(level: KeepAwakeLevel, err: unknown): void {
    console.error(`Rechner wach halten (${level}):`, err);
    if (this.stopping || level !== this.keepAwakeLevel) return;
    const known = err instanceof KeepAwakeError ? err : undefined;
    const phase = known?.phase ?? (level === 'off' ? 'clear' : 'set');
    if (phase === 'set') {
      this.keepAwakeLevel = 'off';
      if (this.state.settings.keepAwake) {
        this.state.settings = { ...this.state.settings, keepAwake: false };
        this.save();
        this.emit({ type: 'settings', settings: structuredClone(this.state.settings), defaultShellId: this.defaultShell().id });
      }
    }
    this.toasts.showKeepAwakeError({
      action: phase === 'set' ? 'on' : 'off',
      reason: known?.reason ?? 'other',
      ...(known?.code !== undefined ? { code: known.code } : {}),
    });
  }

  stepFontSize(step: number): void {
    if (!Number.isInteger(step)) return;
    this.updateSettings({ fontSize: this.state.settings.fontSize + step });
  }

  // ---------- Fenster ----------

  windowState(): WindowState {
    return placeWindow(this.state.window, this.ports.system.displays());
  }

  windowChanged(state: WindowState): void {
    const next = normalizeWindow(state);
    if (this.stopping || !next || JSON.stringify(next) === JSON.stringify(this.state.window)) return;
    this.state.window = next;
    // Beim Ziehen kommen viele Meldungen kurz nacheinander; gespeichert wird erst, wenn das Fenster ruht.
    this.cancelWindowSave?.();
    this.cancelWindowSave = this.ports.clock.schedule(WINDOW_SAVE_DELAY_MS, () => {
      this.cancelWindowSave = null;
      this.save();
    });
  }

  windowForeground(foreground: boolean): void {
    if (this.stopping || typeof foreground !== 'boolean' || foreground === this.foreground) return;
    this.foreground = foreground;
    if (this.markShownTabSeen()) this.emitTabs();
  }

  windowVisible(visible: boolean): void {
    if (this.stopping || typeof visible !== 'boolean') return;
    this.toasts.setWindowVisible(visible);
  }

  // ---------- Hinweise ----------

  openToast(toastId: string): void {
    if (this.stopping || typeof toastId !== 'string') return;
    const toast = this.toasts.find(toastId);
    if (!toast) return;
    // Der Fehler beim Wachhalten gehört zu keinem Tab: Ein Klick schliesst ihn nur (Ticket 31).
    if (toast.tabId === undefined) {
      this.dismissToast(toastId);
      return;
    }
    // Offene Punkte sind mit dem Klick angeschaut (Ticket 27); das blosse Anzeigen des Tabs lässt sie stehen.
    if (toast.kind === 'openPoints') this.dismissToast(toastId);
    this.activateTab(toast.tabId);
  }

  dismissToast(toastId: string): void {
    if (this.stopping || typeof toastId !== 'string') return;
    const dismissed = this.toasts.dismiss(toastId);
    const tab = dismissed?.kind === 'openPoints' && dismissed.tabId ? this.findTab(dismissed.tabId) : undefined;
    if (tab?.openPoints) {
      delete tab.openPoints;
      this.save();
    }
  }

  holdToast(toastId: string, hold: boolean): void {
    if (this.stopping || typeof toastId !== 'string' || typeof hold !== 'boolean') return;
    this.toasts.hold(toastId, hold);
  }

  /**
   * Hinweis für einen Tab, der gerade nicht sichtbar ist: Claude wartet dort auf dich bzw. ist fertig. Ein „wartet“-
   * oder „fertig“-Hinweis, den der Tab schon hat, verschwindet dafür. Ausgeschaltet in den Einstellungen gibt es keine;
   * die Status-Symbole bleiben.
   */
  private notify(tabId: string, kind: Extract<ToastKind, 'waiting' | 'finished'>): void {
    if (this.state.settings.notifications && !this.isVisible(tabId)) this.toasts.show(tabId, kind);
  }

  /** Ein „wartet“-Hinweis gilt nur, solange Claude (oder einer seiner Agenten) im Tab auf dich wartet. */
  private dropStaleWaitingToast(tab: PersistedTab): void {
    const runtime = this.runtimes.get(tab.id);
    if (tab.claude && runtime && shownActivity(runtime.claude) === 'waiting') return;
    this.toasts.dismissTab(tab.id, ['waiting']);
  }

  /**
   * Hinweis mit den offenen Punkten aus Claudes Antwort (Ticket 22): auch für den sichtbaren Tab, bis er mit × oder einem
   * Klick darauf geschlossen wird (`openToast`), und gespeichert, damit er einen Neustart übersteht. Er ersetzt den
   * bisherigen des Tabs und einen „fertig“-Hinweis.
   */
  private showOpenPoints(tab: PersistedTab, points: string[]): void {
    tab.openPoints = points;
    this.save();
    this.toasts.show(tab.id, 'openPoints', points);
  }

  /**
   * Nach einem Neustart: Die gespeicherten offenen Punkte erscheinen wieder. Bei ausgeschalteter Einstellung fallen sie
   * weg. Liefert, ob sich der gespeicherte Zustand dabei geändert hat.
   */
  private restoreOpenPoints(): boolean {
    let changed = false;
    for (const tab of this.state.tabs) {
      if (!tab.openPoints) continue;
      if (this.state.settings.openPoints) this.toasts.show(tab.id, 'openPoints', tab.openPoints);
      else {
        delete tab.openPoints;
        changed = true;
      }
    }
    return changed;
  }

  // ---------- Claude ----------

  claudeLaunch(request: ClaudeLaunchRequest): ClaudeLaunchResponse | null {
    const tab = this.claudeTab(request.tabId);
    if (!tab || !this.localApi) return null;
    // Im Fall „neu“ vergibt THub die Kennung selbst; so ist sie auch ohne ein einziges Hook-Ereignis
    // bekannt (Sicherheitsnetz).
    const newId = request.case === 'new' ? randomUUID() : undefined;
    const sessionId = newId ?? (request.case === 'withId' ? request.sessionId : undefined);
    // Ein anderer Start als das von THub gestartete Fortsetzen selbst: Dieses ist dann vorbei.
    const runtime = this.runtimes.get(tab.id);
    if (runtime?.resuming !== undefined && sessionId !== runtime.resuming) runtime.resuming = undefined;
    // Kommt die Meldung zum Fortsetzen erst nach der Frist (sehr langsames Profil), gilt die weggefallene Zuordnung
    // wieder, samt „hatte Prompt“ und dem laufenden Fortsetzen.
    const uncaptured = runtime?.uncaptured;
    if (runtime) runtime.uncaptured = undefined;
    const late =
      !tab.claude && uncaptured !== undefined && sessionId !== undefined && uncaptured.sessionId === sessionId;
    const previous = late ? uncaptured : tab.claude;
    const reported = request.cwd ? this.normalizeDir(request.cwd) : '';
    this.updateTab(tab, () => {
      this.setClaudeLink(tab, linkAfterLaunch(previous, sessionId, reported || (tab.lastCwd ?? tab.startCwd)));
      // Ein neu gestartetes Claude ruht, auch wenn das vorige ohne Ende-Meldung verschwunden ist. Die Start-Meldung
      // beendet auch die Frist nach einem Fortsetzen.
      if (runtime) {
        this.cancelClaudeTimers(runtime);
        runtime.claude = IDLE_CLAUDE;
        if (late) runtime.resuming = sessionId;
      }
    });

    const { hookFile } = this.localApi;
    return newId ? { tabName: tab.name, sessionId: newId, hookFile } : { tabName: tab.name, hookFile };
  }

  claudeStarted(tabId: string, pid: number): void {
    const runtime = this.runtimes.get(tabId);
    if (this.claudeTab(tabId)?.claude && runtime) runtime.claudePid = pid;
  }

  claudeExit(tabId: string, sessionId: string | undefined, exitCode: number): void {
    const tab = this.claudeTab(tabId);
    if (!tab) return;
    const runtime = this.runtimes.get(tabId);
    const resuming = runtime?.resuming;
    if (runtime) runtime.resuming = undefined;
    // Claude hat sich beendet, auch ohne SessionEnd (etwa nach einem Absturz): normales Terminal.
    this.updateTab(tab, () => this.setClaudeLink(tab, undefined));
    // Ein von THub gestartetes Fortsetzen, von dem Claude sich nie gemeldet hat, endet mit einem Fehler: unbekannte
    // Kennung oder abgelehnter Vertrauensdialog. `/exit` und zweimal Ctrl+C enden mit 0. Der Tab bleibt offen.
    if (resuming !== undefined && exitCode !== 0 && (sessionId === undefined || sessionId === resuming)) {
      this.emit({ type: 'notice', tabId, level: 'error', text: 'Claude-Session konnte nicht fortgesetzt werden' });
    }
  }

  claudeHook(tabId: string, event: string, payload: unknown): void {
    const tab = this.claudeTab(tabId);
    if (!tab) return;
    const hook = readHook(event, payload);
    const runtime = this.runtimes.get(tabId);
    if (runtime?.resuming !== undefined) {
      // Nach einem von THub gestarteten Fortsetzen entscheidet erst die Ende-Meldung des Starters, bis Claude sich
      // meldet: Ein fehlgeschlagenes Fortsetzen schickt SessionEnd (other) etwa 1,5 s vor seinem Ende.
      if (hook.event === 'SessionEnd') return;
      runtime.resuming = undefined;
    }
    this.updateTab(tab, () => {
      const previous = tab.claude;
      const link = linkAfterHook(previous, hook, (raw) => this.normalizeDir(raw));
      this.setClaudeLink(tab, link);
      if (!link || !runtime) return;
      // Jedes Hook-Ereignis zeigt, dass Claude nach Esc oder einer Antwort weitermacht. Ausgenommen sind
      // Benachrichtigungen: Sie kommen verzögert (Rückfrage nach etwa 6 s, idle_prompt nach etwa 60 s) und sagen darüber
      // nichts. Ereignisse aus Agenten sagen nichts über Claude selbst (Ticket 37); sie zeigen nur, dass Claude läuft.
      if (hook.event !== 'Notification') {
        this.cancelLaunchWait(runtime);
        if (hook.agentId === undefined) this.cancelInputTimers(runtime);
      }
      const wasWaiting = shownActivity(runtime.claude) === 'waiting';
      const step = statusAfterHook(runtime.claude, hook, startsSession(previous, hook), this.ports.clock.now());
      runtime.claude = step.status;
      this.syncAgentReportWait(tab, runtime);
      const unseen = step.stopped && !this.isVisible(tab.id);
      if (unseen) runtime.finished = true;
      // Eine Antwort mit offenen Punkten zeigt sie an, auch im sichtbaren Tab, statt „fertig“; eine ohne lässt den
      // bisherigen Hinweis mit offenen Punkten stehen. Offene Punkte kommen sofort, auch wenn noch Agenten laufen.
      const points = hook.event === 'Stop' ? this.openPointsIn(hook.lastAssistantMessage) : [];
      if (points.length > 0) this.showOpenPoints(tab, points);
      else if (unseen) this.notify(tab.id, 'finished');
      else if (!wasWaiting && shownActivity(step.status) === 'waiting') this.notify(tab.id, 'waiting');
    });
  }

  /**
   * Hält die Frist nach dem Ende der Agenten (`AGENT_REPORT_QUIET_MS`) in Gang, solange Claude ruht und nur noch eine
   * Meldung über einen Agenten aussteht. Läuft sie ab, ruht der Tab; kam vorher `Stop`, wird er wie nach `Stop` fertig.
   */
  private syncAgentReportWait(tab: PersistedTab, runtime: TabRuntime): void {
    if (!awaitsAgentReports(runtime.claude)) {
      this.cancelAgentReportWait(runtime);
      return;
    }
    if (runtime.cancelAgentReports) return;
    runtime.cancelAgentReports = this.ports.clock.schedule(AGENT_REPORT_QUIET_MS, () => {
      runtime.cancelAgentReports = undefined;
      if (this.frozen || this.runtimes.get(tab.id) !== runtime || !tab.claude) return;
      const step = statusAfterAgentReportsDue(runtime.claude);
      this.updateTab(tab, () => {
        runtime.claude = step.status;
        if (step.stopped && !this.isVisible(tab.id)) {
          runtime.finished = true;
          this.notify(tab.id, 'finished');
        }
      });
    });
  }

  private cancelAgentReportWait(runtime: TabRuntime): void {
    runtime.cancelAgentReports?.();
    runtime.cancelAgentReports = undefined;
  }

  claudeHookReply(tabId: string, event: string): object | undefined {
    // Die Anweisung gilt in jeder Session: SessionStart kommt auch bei Fortsetzen, /clear und Kompaktieren. Auch
    // eingefroren beim Beenden: Sie ändert nur, wie Claude schreibt, nicht den Zustand von THub.
    if (event !== 'SessionStart' || !this.state.settings.openPoints || !this.findTab(tabId)) return undefined;
    return openPointsContext();
  }

  /** Die offenen Punkte einer fertigen Antwort; bei ausgeschalteter Einstellung keine. */
  private openPointsIn(message: string | undefined): string[] {
    return this.state.settings.openPoints ? findOpenPoints(message) : [];
  }

  /**
   * Eingabe des Nutzers in einem Claude-Tab: Esc während „arbeitet“ oder „wartet“ startet die Wartezeit, nach der
   * Claude ruht. Enter oder eine Ziffer in einem wartenden Tab ist die Antwort auf die Rückfrage und heisst
   * „arbeitet“, weil nach einer Bestätigung bis `PostToolUse` kein Ereignis kommt; ob Claude wirklich weiterarbeitet,
   * entscheiden danach Hooks und Prozess-Sonde (`startAnswerCheck`). Pfeil- und andere Navigationstasten, Text und
   * Antworten des Terminals (Fokus, Maus usw.) ändern nichts.
   *
   * Agenten (Ticket 37): Esc betrifft nur Claude selbst und eine Rückfrage eines Agenten; laufende Agenten halten den Tab
   * auf „arbeitet“. Die Antwort auf die Rückfrage eines Agenten beendet nur das Warten, ohne Wartezeit: Ob der Agent
   * weiterrechnet, melden seine eigenen Ereignisse.
   */
  private takeInput(tabId: string, runtime: TabRuntime, data: string): void {
    const tab = this.findTab(tabId);
    const { activity, askingAgent } = runtime.claude;
    if (this.frozen || !tab?.claude || (activity === 'idle' && askingAgent === undefined)) return;
    const kind = classifyInput(data);
    if (kind === 'escape') {
      this.cancelEscTimer(runtime);
      runtime.cancelEsc = this.ports.clock.schedule(ESC_QUIET_MS, () => {
        runtime.cancelEsc = undefined;
        const now = runtime.claude;
        if (this.runtimes.get(tabId) !== runtime || (now.activity === 'idle' && now.askingAgent === undefined)) return;
        // Ohne „fertig“: Der Nutzer hat selbst unterbrochen, auch wenn danach noch Agenten zu Ende rechnen.
        this.updateTab(tab, () => {
          runtime.claude = { ...now, activity: 'idle', toolUnanswered: false, askingAgent: undefined, finishPending: false };
          this.syncAgentReportWait(tab, runtime);
        });
      });
    } else if (kind === 'answer' && activity === 'waiting') {
      this.updateTab(tab, () => {
        runtime.claude = { ...runtime.claude, activity: 'working' };
      });
      this.startAnswerCheck(tabId, runtime);
    } else if (kind === 'answer' && askingAgent !== undefined) {
      this.updateTab(tab, () => {
        runtime.claude = { ...runtime.claude, askingAgent: undefined };
        this.syncAgentReportWait(tab, runtime);
      });
    }
  }

  /**
   * Nach einer Antwort auf eine Rückfrage: Kommt innerhalb von `ANSWER_QUIET_MS` weder ein Hook-Ereignis noch ein
   * Nachfahre des Claude-Prozesses, der nach der Antwort gestartet ist, ruht Claude (ohne „fertig“). Ohne brauchbare
   * Abfrage der Sonde (Sonde fehlt, Claude-Prozess nicht zu finden) bleibt es bei „arbeitet“, bis ein Hook kommt.
   */
  private startAnswerCheck(tabId: string, runtime: TabRuntime): void {
    this.cancelAnswerCheck(runtime);
    const check: AnswerCheck = {
      at: this.ports.clock.now(),
      seen: false,
      due: false,
      cancel: () => {},
    };
    check.cancel = this.ports.clock.schedule(ANSWER_QUIET_MS, () => {
      if (runtime.answer !== check) return;
      check.due = true;
      // Eine laufende Abfrage entscheidet mit; ihr Ergebnis kommt gleich.
      if (!this.probing) this.settleAnswer(tabId, runtime);
    });
    runtime.answer = check;
  }

  /** Die Wartezeit nach einer Antwort ist um: Sah die Sonde Claude ohne neuen Prozess, ruht Claude. */
  private settleAnswer(tabId: string, runtime: TabRuntime): void {
    const check = runtime.answer;
    const tab = this.findTab(tabId);
    this.cancelAnswerCheck(runtime);
    if (!check?.seen || !tab?.claude || runtime.claude.activity !== 'working') return;
    this.updateTab(tab, () => {
      runtime.claude = { ...runtime.claude, activity: 'idle', toolUnanswered: false };
      this.syncAgentReportWait(tab, runtime);
    });
  }

  private cancelAnswerCheck(runtime: TabRuntime): void {
    runtime.answer?.cancel();
    runtime.answer = undefined;
  }

  private cancelEscTimer(runtime: TabRuntime): void {
    runtime.cancelEsc?.();
    runtime.cancelEsc = undefined;
  }

  private cancelLaunchWait(runtime: TabRuntime): void {
    runtime.cancelLaunchWait?.();
    runtime.cancelLaunchWait = undefined;
  }

  /** Beendet die Wartezeiten nach Esc und nach einer Antwort. */
  private cancelInputTimers(runtime: TabRuntime): void {
    this.cancelEscTimer(runtime);
    this.cancelAnswerCheck(runtime);
  }

  /**
   * Beendet alle Zeitgeber zu Claude: die Wartezeiten nach Esc und nach einer Antwort, die Frist für die Start-Meldung
   * (Ticket 23) und die Frist nach dem Ende der Agenten (Ticket 37).
   */
  private cancelClaudeTimers(runtime: TabRuntime): void {
    this.cancelInputTimers(runtime);
    this.cancelLaunchWait(runtime);
    this.cancelAgentReportWait(runtime);
  }

  /** Der Tab, für den eine Meldung von Starter oder Claude gilt; keiner, wenn unbekannt oder eingefroren. */
  private claudeTab(tabId: string): PersistedTab | undefined {
    return this.frozen || this.stopping ? undefined : this.findTab(tabId);
  }

  /**
   * Setzt die Claude-Zuordnung eines Tabs; `undefined` macht ihn zum normalen Terminal. Mit der Zuordnung
   * entfallen auch Prozess-ID und Status von Claude.
   */
  private setClaudeLink(tab: PersistedTab, link: PersistedClaudeLink | undefined): void {
    if (sameLink(tab.claude, link)) return;
    const runtime = this.runtimes.get(tab.id);
    if (link) {
      // Claude-Tabs bekommen keinen Verlauf. Wird der Tab wieder normal, sichert ihn die nächste Sicherung neu.
      if (!tab.claude) this.deleteHistory(tab.id);
      tab.claude = link;
    } else {
      delete tab.claude;
      if (runtime) {
        runtime.claudePid = undefined;
        runtime.resuming = undefined;
        runtime.claude = IDLE_CLAUDE;
        runtime.finished = false;
        this.cancelClaudeTimers(runtime);
      }
      // Mit Claude endet auch das Warten.
      this.dropStaleWaitingToast(tab);
    }
    this.save();
  }

  private normalizeDir(raw: string): string {
    return normalizeDirectory(raw, (dir) => this.ports.system.longPath(dir));
  }

  // ---------- Status am Tab ----------

  /**
   * Der Tab ist sichtbar im Sinne von „angeschaut“: aktiv, und das Fenster ist im Vordergrund. Ob das Fenster auf dem
   * Bildschirm sichtbar ist, zählt hier nicht; das wirkt nur auf den Countdown der Hinweise (Ticket 33).
   */
  private isVisible(tabId: string): boolean {
    return this.foreground && this.state.activeTabId === tabId;
  }

  /**
   * Der aktive Tab wird gerade angezeigt (Tab gewechselt, auf welchem Weg auch immer, oder Fenster nach vorne
   * gekommen): Sein „fertig, noch nicht angeschaut“ entfällt, und seine Hinweise „wartet“ und „fertig“ verschwinden;
   * offene Punkte bleiben, bis sie mit × geschlossen werden, die Hinweise der anderen Tabs ohnehin. Liefert, ob sich
   * dabei der Status des Tabs geändert hat (die Hinweise meldet der Kern selbst).
   */
  private markShownTabSeen(): boolean {
    const id = this.state.activeTabId;
    if (!id || !this.isVisible(id)) return false;
    this.toasts.dismissTab(id, STATUS_TOASTS);
    const runtime = this.runtimes.get(id);
    if (!runtime?.finished) return false;
    runtime.finished = false;
    return true;
  }

  private tabStatus(tab: PersistedTab): TabStatus {
    const runtime = this.runtimes.get(tab.id);
    if (!runtime) return 'idle';
    return displayedStatus({
      // Pausiert: Claude-Tab nach einem Neustart, noch nicht angezeigt; er hat keinen Prozess.
      paused: runtime.paused,
      // Mit den Agenten, die noch rechnen oder fragen (Ticket 37).
      activity: tab.claude ? shownActivity(runtime.claude) : 'idle',
      finished: runtime.finished,
      processes: runtime.processes,
    });
  }

  /**
   * Führt `change` aus und meldet die Tabs, wenn sich dabei Art oder angezeigter Status des Tabs geändert haben. Wartet
   * Claude danach nicht mehr, verschwindet ein „wartet“-Hinweis des Tabs.
   */
  private updateTab(tab: PersistedTab, change: () => void): void {
    const badge = () => `${tab.claude ? 'claude' : 'terminal'}:${this.tabStatus(tab)}`;
    const before = badge();
    change();
    this.dropStaleWaitingToast(tab);
    if (badge() !== before) this.emitTabs();
  }

  // ---------- Prozess-Sonde ----------

  /** Fragt etwa alle 1,5 Sekunden die Prozess-Sonde ab, für alle Tabs zusammen. */
  private scheduleProbe(): void {
    this.cancelProbeTimer = this.ports.clock.schedule(PROBE_INTERVAL_MS, () => {
      this.probe();
      this.scheduleProbe();
    });
  }

  /** Eine Abfrage; läuft die vorige noch, fällt dieser Takt aus. Ohne laufende Shell wird nicht abgefragt. */
  private probe(): void {
    if (this.probing || this.stopping) return;
    if (this.processTabs().length === 0) {
      this.processTracker.forgetPrevious();
      return;
    }
    this.probing = true;
    const requestedAt = this.ports.clock.now();
    this.ports.processes.snapshot().then(
      (processes) => {
        this.probing = false;
        if (this.stopping) return;
        // Ausgewertet wird mit dem Stand von jetzt: Während der Abfrage kann sich ein Tab geändert haben.
        const tabs = this.processTabs();
        const report = this.processTracker.update(processes, tabs, (pid) => this.ports.processes.consoleHost(pid));
        this.setProcesses(report.running);
        this.takeAnswers(report.answers, requestedAt);
      },
      (err: unknown) => {
        this.probing = false;
        this.takeAnswers(new Map(), requestedAt);
        if (this.probeErrorLogged) return;
        this.probeErrorLogged = true;
        console.error('Prozess-Sonde: Abfrage fehlgeschlagen:', err);
      },
    );
  }

  /**
   * Offene Antworten auf Rückfragen nach einer Abfrage: Hat Claude seit der Antwort einen Prozess gestartet, arbeitet
   * er weiter, und die Prüfung ist erledigt. Zählt nur eine Abfrage, die nach der Antwort angefordert wurde. Ist die
   * Wartezeit schon um, wird jetzt entschieden.
   */
  private takeAnswers(answers: Map<string, boolean>, requestedAt: number): void {
    for (const tab of this.state.tabs) {
      const runtime = this.runtimes.get(tab.id);
      const check = runtime?.answer;
      if (!runtime || !check) continue;
      if (requestedAt > check.at) {
        const spawned = answers.get(tab.id);
        if (spawned === true) {
          this.cancelAnswerCheck(runtime);
          continue;
        }
        if (spawned === false) check.seen = true;
      }
      if (check.due) this.settleAnswer(tab.id, runtime);
    }
  }

  /**
   * Die Tabs mit laufender Shell, so wie die Prozess-Regeln sie brauchen. WSL-Tabs fehlen: Ihre Prozesse sind für
   * Windows unsichtbar, sie zeigen nie „Prozesse laufen“.
   */
  private processTabs(): ProcessTab[] {
    const result: ProcessTab[] = [];
    for (const tab of this.state.tabs) {
      const runtime = this.runtimes.get(tab.id);
      if (runtime?.process !== 'running' || !runtime.pid || runtime.startedAt === undefined) continue;
      if (!runtime.tree || runtime.tree === 'wsl') continue;
      const entry: ProcessTab = { id: tab.id, rootPid: runtime.pid, startedAt: runtime.startedAt, tree: runtime.tree };
      if (tab.claude) {
        entry.claude = {
          pid: runtime.claudePid,
          promptAt: runtime.claude.promptAt,
          idle: runtime.claude.activity === 'idle',
        };
        if (runtime.answer) entry.claude.answeredAt = runtime.answer.at;
      }
      result.push(entry);
    }
    return result;
  }

  /** Übernimmt das Ergebnis einer Abfrage: In diesen Tabs laufen Prozesse, in allen anderen nicht. */
  private setProcesses(running: Set<string>): void {
    let changed = false;
    for (const tab of this.state.tabs) {
      const runtime = this.runtimes.get(tab.id);
      if (!runtime || runtime.processes === running.has(tab.id)) continue;
      const before = this.tabStatus(tab);
      runtime.processes = running.has(tab.id);
      if (this.tabStatus(tab) !== before) changed = true;
    }
    if (changed) this.emitTabs();
  }

  // ---------- Beenden ----------

  freeze(): void {
    this.frozen = true;
    // Eingefroren ändert sich keine Zuordnung mehr: Die Fristen nach einem Fortsetzen enden ohne Wirkung.
    for (const runtime of this.runtimes.values()) this.cancelLaunchWait(runtime);
    this.saveWindowNow();
    this.ports.storage.flush();
  }

  shutdown(): Promise<void> {
    if (!this.stopping) {
      this.cancelHistoryTimer?.();
      this.cancelHistoryTimer = null;
      this.cancelProbeTimer?.();
      this.cancelProbeTimer = null;
      for (const runtime of this.runtimes.values()) this.cancelClaudeTimers(runtime);
      this.toasts.clear();
      // Sofort einfrieren: Ab jetzt ändern Meldungen von Starter und Claude die Zuordnungen nicht mehr.
      this.frozen = true;
      // Erst den Verlauf, solange die Shells noch laufen und der Renderer ihn zeigt; dann sichern und beenden.
      this.stopping = this.collectHistory().then(() => {
        // Die Shells werden auch dann beendet, wenn das Sichern scheitert; der Fehler kommt danach.
        let saveError: unknown = null;
        try {
          this.freeze();
        } catch (err) {
          saveError = err;
        }
        return this.endAllShells().then(() => {
          if (saveError) throw saveError;
        });
      });
    }
    return this.stopping;
  }

  /**
   * Beim Beenden: alle Shells samt ihren Nachfahren, auch denen mit eigener Konsole und denen geschlossener Tabs, die
   * noch auf die Sonde warten. Wie beim Schliessen eines Tabs wird vorher noch einmal abgefragt.
   */
  private endAllShells(): Promise<void> {
    const roots: ShellRoot[] = [...this.closingShells.values()].map((shell) => shell.root);
    for (const runtime of this.runtimes.values()) {
      const root = shellRoot(runtime);
      if (root) roots.push(root);
    }
    const snapshot = roots.length > 0 ? this.snapshotForKill() : Promise.resolve([]);
    return snapshot.then((processes) => {
      const doomed = roots.flatMap((root) => shellProcesses(processes, root));
      const killed = this.ports.terminal.killAll(SHUTDOWN_TIMEOUT_MS);
      if (doomed.length > 0) this.ports.processes.terminate(doomed);
      return killed;
    });
  }

  sessionEnding(): void {
    // Einfrieren und synchron sichern; der Verlauf liegt von der letzten periodischen Sicherung schon auf der Platte.
    this.freeze();
  }

  // ---------- Intern ----------

  private findTab(tabId: string): PersistedTab | undefined {
    return this.state.tabs.find((t) => t.id === tabId);
  }

  private tabSnapshots(): TabSnapshot[] {
    return this.state.tabs.map((tab) => {
      const snapshot: TabSnapshot = {
        id: tab.id,
        name: tab.name,
        shellId: tab.shellId,
        shellName: this.shellFor(tab).name,
        cwd: tab.lastCwd ?? tab.startCwd,
        process: this.runtimes.get(tab.id)?.process ?? 'pending',
        kind: tab.claude ? 'claude' : 'terminal',
        status: this.tabStatus(tab),
        paused: this.runtimes.get(tab.id)?.paused ?? false,
      };
      if (tab.groupId !== undefined) snapshot.groupId = tab.groupId;
      return snapshot;
    });
  }

  /** Die Gruppen in der Reihenfolge der Leiste, mit dem dringendsten Status ihrer Tabs. */
  private groupSnapshots(): GroupSnapshot[] {
    const result: GroupSnapshot[] = [];
    for (const entry of barEntries(this.state.tabs)) {
      if (entry.kind !== 'group') continue;
      const group = this.findGroup(entry.groupId);
      if (!group) continue;
      result.push({
        id: group.id,
        name: group.name,
        tabIds: entry.tabs.map((t) => t.id),
        selectedTabId: group.selectedTabId,
        status: groupStatus(entry.tabs.map((t) => this.tabStatus(t))),
      });
    }
    return result;
  }

  private tabsChanged(): void {
    this.selectShownTab();
    this.save();
    this.emitTabs();
  }

  private save(): void {
    this.ports.storage.saveState(structuredClone(this.state));
  }

  /** Merkt noch nicht gespeicherte Fensterangaben sofort zum Speichern vor. */
  private saveWindowNow(): void {
    if (!this.cancelWindowSave) return;
    this.cancelWindowSave();
    this.cancelWindowSave = null;
    this.save();
  }

  private emitTabs(): void {
    this.emit({
      type: 'tabs',
      tabs: this.tabSnapshots(),
      groups: this.groupSnapshots(),
      activeTabId: this.state.activeTabId,
    });
  }

  private emit(event: WorkspaceEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}

/**
 * Startargumente einer Shell im Ordner `cwd`. Eine WSL-Distribution bekommt den Ordner als Windows-Pfad
 * dazu (`wsl.exe -d <Distribution> --cd <Ordner>`); wsl.exe übersetzt ihn selbst.
 */
function shellArgs(shell: ShellInfo, cwd: string): string[] {
  return wslDistribution(shell.id) ? [...shell.args, '--cd', cwd] : [...shell.args];
}

/** Die Wurzel des Prozessbaums einer laufenden Shell, zum Beenden; keine, solange keine Shell läuft. */
function shellRoot(runtime: TabRuntime): ShellRoot | undefined {
  if (runtime.process !== 'running' || !runtime.pid || runtime.startedAt === undefined) return undefined;
  return { pid: runtime.pid, startedAt: runtime.startedAt };
}

/** Wie der Prozessbaum einer Shell aussieht: Git Bash startet über einen Starter, WSL bleibt unsichtbar. */
function shellTree(shell: ShellInfo): ShellTree {
  if (wslDistribution(shell.id)) return 'wsl';
  return shell.id === 'gitbash' ? 'gitbash' : 'direct';
}

function isValidSize(cols: number, rows: number): boolean {
  return Number.isInteger(cols) && Number.isInteger(rows) && cols > 0 && rows > 0;
}
