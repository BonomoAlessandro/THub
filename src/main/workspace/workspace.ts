// Workspace-Kern: besitzt die gesamte Tab-Logik und hängt nur über die Ports von der Aussenwelt ab.
// Der Renderer holt einen Schnappschuss, bekommt danach Änderungsereignisse und schickt Befehle.
// Startaufträge erteilt nur der Kern, und zwar erst, wenn die Ansicht des Tabs bereit ist.

import { randomUUID } from 'node:crypto';
import type {
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
import { findOpenPoints, openPointsContext } from './openPoints';
import type { CancelTimer, ShellInfo, StartOrder, WorkspacePorts } from './ports';
import { ProcessTracker, type ProcessTab, type ShellTree } from './processRules';
import { resumeCommand, sessionToResume } from './resume';
import { shellLabel, wslDistribution } from './shellIds';
import {
  normalizeSettings,
  normalizeWindow,
  readPersistedState,
  type PersistedClaudeLink,
  type PersistedState,
  type PersistedTab,
  type WindowState,
} from './schema';
import { classifyInput, displayedStatus, IDLE_CLAUDE, statusAfterHook, type ClaudeStatus } from './tabStatus';
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

export interface WorkspaceOptions {
  /** Die erkannten Shells (Shell-Erkennung), in der Reihenfolge des Pfeil-Menüs; mindestens eine. */
  shells: ShellInfo[];
  /**
   * Die laufende lokale Schnittstelle (Ticket 10). Fehlt sie, weil sie sich nicht starten liess, bekommen die
   * Terminals nur THUB_TAB_ID; der Starter erreicht THub nicht und startet claude unverändert.
   */
  localApi?: LocalApiInfo;
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
   * Legt einen Tab rechts neben dem aktiven an, macht ihn aktiv und liefert seine Kennung
   * (leer, wenn der Kern beendet wird). Der Tab heisst wie sein Startordner, bei Gleichstand mit „ 2“,
   * „ 3“ usw.; der Name ändert sich danach nicht mehr von selbst. Der Startordner kommt an die Spitze
   * der zuletzt benutzten Ordner. Der Tab behält seine Shell, auch über einen Neustart.
   */
  createTab(options?: NewTabOptions): string;
  /** Leere Namen werden ignoriert. Ein so vergebener Name wird nie automatisch überschrieben. */
  renameTab(tabId: string, name: string): void;
  /** Zeigt den Tab an; ein pausierter Claude-Tab setzt dabei seine Session fort. */
  activateTab(tabId: string): void;
  /** Aktiviert den Tab `offset` Plätze weiter, über die Enden hinweg im Kreis. */
  activateRelativeTab(offset: number): void;
  /** Aktiviert den Tab an Position `index` (ab 0); gibt es dort keinen, bleibt alles, wie es ist. */
  activateTabAt(index: number): void;
  /**
   * Beendet die Shell und löscht den Verlauf; war der Tab aktiv, wird sein Nachbar aktiv. Der zuletzt
   * aktive Ordner des Tabs kommt an die Spitze der zuletzt benutzten Ordner.
   */
  closeTab(tabId: string): void;

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
   * angezeigt wird; die Grösse merkt sich der Kern bis dahin.
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
   * Die Countdowns der Hinweise laufen nur im Vordergrund.
   */
  windowForeground(foreground: boolean): void;

  /** Nimmt einen Hinweis weg (× am Hinweis); offene Punkte sind damit auch im gespeicherten Zustand weg. */
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
   * 2 Sekunden, sichert den Zustand und beendet alle Shells. Danach nimmt der Kern keine Befehle mehr an.
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
  return new WorkspaceCore(ports, options.shells, options.localApi);
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
  /** Zählt die Ausgabestücke der Shell; daran erkennt die Sicherung, ob sich der Inhalt geändert hat. */
  output: number;
  /** Stand von `output`, als der Verlauf zuletzt angefordert wurde. */
  requested: number;
  /** Stand von `output`, den der gesicherte Verlauf enthält. */
  saved: number;
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
  /** Die Hinweise unten rechts im Fenster. */
  private readonly toasts: ToastBoard;

  constructor(
    private readonly ports: WorkspacePorts,
    private readonly shells: ShellInfo[],
    private readonly localApi: LocalApiInfo | undefined,
  ) {
    if (shells.length === 0) throw new Error('Der Workspace-Kern braucht mindestens eine Shell.');
    this.toasts = new ToastBoard(ports.clock, () => this.emit({ type: 'toasts', toasts: this.toasts.snapshot() }));

    const loaded = readPersistedState(ports.storage.loadState(), {
      homeDir: ports.system.homeDir(),
      defaultShellId: this.automaticShell().id,
    });
    this.state = loaded.state;
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
    const startCwd = this.newTabDir(options.cwd);
    const tab: PersistedTab = {
      id: randomUUID(),
      name: this.autoTabName(startCwd),
      nameIsManual: false,
      shellId: (this.findShell(options.shellId) ?? this.defaultShell()).id,
      startCwd,
    };
    // Rechts neben dem aktiven Tab, damit zusammengehörige Tabs nebeneinander bleiben; ohne aktiven ganz rechts.
    const activeIndex = this.state.tabs.findIndex((t) => t.id === this.state.activeTabId);
    const index = activeIndex < 0 ? this.state.tabs.length : activeIndex + 1;
    this.state.tabs.splice(index, 0, tab);
    this.runtimes.set(tab.id, newRuntime(false));
    this.state.activeTabId = tab.id;
    this.state.recentDirs = rememberDir(this.state.recentDirs, startCwd);
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

  activateTab(tabId: string): void {
    if (this.stopping || !this.findTab(tabId) || this.state.activeTabId === tabId) return;
    this.state.activeTabId = tabId;
    this.showTab(tabId);
    this.markShownTabSeen();
    this.tabsChanged();
  }

  activateRelativeTab(offset: number): void {
    const { tabs } = this.state;
    if (tabs.length === 0 || !Number.isInteger(offset)) return;
    const current = tabs.findIndex((t) => t.id === this.state.activeTabId);
    const next = (((current + offset) % tabs.length) + tabs.length) % tabs.length;
    this.activateTab(tabs[next].id);
  }

  activateTabAt(index: number): void {
    const tab = Number.isInteger(index) ? this.state.tabs[index] : undefined;
    if (tab) this.activateTab(tab.id);
  }

  closeTab(tabId: string): void {
    const index = this.state.tabs.findIndex((t) => t.id === tabId);
    if (this.stopping || index < 0) return;
    // Zuerst austragen: Das Ende der Shell gehört dann zu keinem Tab mehr, ein später eintreffender
    // Verlauf ebenfalls nicht.
    const closing = this.runtimes.get(tabId);
    if (closing) this.cancelClaudeTimers(closing);
    this.runtimes.delete(tabId);
    this.toasts.dismissTab(tabId);
    this.ports.terminal.kill(tabId);
    // Bis zur Liste der geschlossenen Tabs (Ticket 15) verschwindet der Verlauf mit dem Tab.
    this.deleteHistory(tabId);
    const [tab] = this.state.tabs.splice(index, 1);
    // Ein geschlossener Tab nimmt seine offenen Punkte mit, auch in die Liste der geschlossenen Tabs (Ticket 15).
    delete tab.openPoints;
    this.state.recentDirs = rememberDir(this.state.recentDirs, tab.lastCwd ?? tab.startCwd);
    if (this.state.activeTabId === tabId) {
      const neighbour = this.state.tabs[index] ?? this.state.tabs[index - 1];
      this.state.activeTabId = neighbour?.id ?? null;
      this.showTab(this.state.activeTabId);
      this.markShownTabSeen();
    }
    this.tabsChanged();
  }

  // ---------- Ordner und Namen ----------

  recentDirs(): RecentDir[] {
    const ctx = this.namingContext();
    return this.state.recentDirs
      .filter((dir) => this.ports.system.directoryExists(dir))
      .map((dir) => ({ path: dir, name: folderName(dir, ctx) }));
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
          // Mit der Shell endet auch ein Claude darin: Der Tab wird ein normales Terminal.
          if (!this.frozen) this.setClaudeLink(tab, undefined);
          this.emit({ type: 'exit', tabId: tab.id, exitCode });
          this.emitTabs();
        },
      });
      if (resume) runtime.resume = undefined;
      if (isCurrent()) {
        runtime.pid = pid;
        // Von THub gestartetes Fortsetzen: Bis Claude sich meldet, entscheidet erst die Ende-Meldung des Starters.
        if (resume) runtime.resuming = resume.sessionId;
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

  // ---------- Verlauf ----------

  saveHistory(tabId: string, content: string): void {
    const runtime = this.runtimes.get(tabId);
    const quit = this.quitHistory;
    const awaited = quit?.pending.has(tabId) ?? false;
    // Beim Beenden zählen nur noch die Antworten, auf die das Beenden wartet.
    if (!runtime || typeof content !== 'string' || (this.stopping && !awaited)) return;
    // Claude-Tabs bekommen keinen Verlauf, auch nicht aus einer Antwort, die erst nach dem Start von Claude eintrifft.
    if (!this.findTab(tabId)?.claude) {
      this.withHistoryStorage('Verlauf konnte nicht gesichert werden', () => {
        this.ports.storage.saveHistory(tabId, { content, savedAt: this.ports.clock.now() });
        runtime.saved = runtime.requested;
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

  /** Beim Beenden: fordert den Verlauf geänderter Tabs an und wartet auf alle Antworten, höchstens 2 s. */
  private collectHistory(): Promise<void> {
    const tabIds = this.changedTabIds();
    if (tabIds.length === 0) return Promise.resolve();
    return new Promise((resolve) => {
      const finish = (): void => {
        cancelTimeout();
        this.quitHistory = null;
        resolve();
      };
      // Antwortet der Renderer nicht (mehr), geht das Beenden nach dem Zeitlimit trotzdem weiter.
      const cancelTimeout = this.ports.clock.schedule(HISTORY_QUIT_TIMEOUT_MS, finish);
      this.quitHistory = { pending: new Set(tabIds), finish };
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
    this.toasts.setForeground(foreground);
  }

  // ---------- Hinweise ----------

  dismissToast(toastId: string): void {
    if (this.stopping || typeof toastId !== 'string') return;
    const dismissed = this.toasts.dismiss(toastId);
    const tab = dismissed?.kind === 'openPoints' ? this.findTab(dismissed.tabId) : undefined;
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
  private notify(tabId: string, kind: Exclude<ToastKind, 'openPoints'>): void {
    if (this.state.settings.notifications && !this.isVisible(tabId)) this.toasts.show(tabId, kind);
  }

  /** Ein „wartet“-Hinweis gilt nur, solange Claude im Tab auf dich wartet. */
  private dropStaleWaitingToast(tab: PersistedTab): void {
    if (tab.claude && this.runtimes.get(tab.id)?.claude.activity === 'waiting') return;
    this.toasts.dismissTab(tab.id, ['waiting']);
  }

  /**
   * Hinweis mit den offenen Punkten aus Claudes Antwort (Ticket 22): auch für den sichtbaren Tab, bis er mit ×
   * geschlossen wird, und gespeichert, damit er einen Neustart übersteht. Er ersetzt den bisherigen des Tabs und einen
   * „fertig“-Hinweis.
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
    const reported = request.cwd ? this.normalizeDir(request.cwd) : '';
    this.updateTab(tab, () => {
      this.setClaudeLink(tab, linkAfterLaunch(tab.claude, sessionId, reported || (tab.lastCwd ?? tab.startCwd)));
      // Ein neu gestartetes Claude ruht, auch wenn das vorige ohne Ende-Meldung verschwunden ist.
      if (runtime) {
        this.cancelClaudeTimers(runtime);
        runtime.claude = IDLE_CLAUDE;
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
      // Jedes Hook-Ereignis zeigt, dass Claude nach Esc weitermacht. Ausgenommen sind Benachrichtigungen: Sie
      // kommen verzögert (Rückfrage nach etwa 6 s, idle_prompt nach etwa 60 s) und sagen darüber nichts.
      if (hook.event !== 'Notification') this.cancelClaudeTimers(runtime);
      const wasWaiting = runtime.claude.activity === 'waiting';
      const step = statusAfterHook(runtime.claude, hook, startsSession(previous, hook), this.ports.clock.now());
      runtime.claude = step.status;
      const unseen = step.stopped && !this.isVisible(tab.id);
      if (unseen) runtime.finished = true;
      // Eine Antwort mit offenen Punkten zeigt sie an, auch im sichtbaren Tab, statt „fertig“; eine ohne lässt den
      // bisherigen Hinweis mit offenen Punkten stehen.
      const points = hook.event === 'Stop' ? this.openPointsIn(hook.lastAssistantMessage) : [];
      if (points.length > 0) this.showOpenPoints(tab, points);
      else if (unseen) this.notify(tab.id, 'finished');
      else if (!wasWaiting && step.status.activity === 'waiting') this.notify(tab.id, 'waiting');
    });
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
   */
  private takeInput(tabId: string, runtime: TabRuntime, data: string): void {
    const tab = this.findTab(tabId);
    const { activity } = runtime.claude;
    if (this.frozen || !tab?.claude || activity === 'idle') return;
    const kind = classifyInput(data);
    if (kind === 'escape') {
      this.cancelEscTimer(runtime);
      runtime.cancelEsc = this.ports.clock.schedule(ESC_QUIET_MS, () => {
        runtime.cancelEsc = undefined;
        if (this.runtimes.get(tabId) !== runtime || runtime.claude.activity === 'idle') return;
        // Ohne „fertig“: Der Nutzer hat selbst unterbrochen.
        this.updateTab(tab, () => {
          runtime.claude = { ...runtime.claude, activity: 'idle', toolUnanswered: false };
        });
      });
    } else if (kind === 'answer' && activity === 'waiting') {
      this.updateTab(tab, () => {
        runtime.claude = { ...runtime.claude, activity: 'working' };
      });
      this.startAnswerCheck(tabId, runtime);
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

  /** Beendet die Wartezeiten nach Esc und nach einer Antwort. */
  private cancelClaudeTimers(runtime: TabRuntime): void {
    this.cancelEscTimer(runtime);
    this.cancelAnswerCheck(runtime);
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

  /** Der Tab ist sichtbar: aktiv, und das Fenster ist im Vordergrund. */
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
      activity: tab.claude ? runtime.claude.activity : 'idle',
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
        return this.ports.terminal.killAll(SHUTDOWN_TIMEOUT_MS).then(() => {
          if (saveError) throw saveError;
        });
      });
    }
    return this.stopping;
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
    return this.state.tabs.map((tab) => ({
      id: tab.id,
      name: tab.name,
      shellId: tab.shellId,
      shellName: this.shellFor(tab).name,
      cwd: tab.lastCwd ?? tab.startCwd,
      process: this.runtimes.get(tab.id)?.process ?? 'pending',
      kind: tab.claude ? 'claude' : 'terminal',
      status: this.tabStatus(tab),
      paused: this.runtimes.get(tab.id)?.paused ?? false,
    }));
  }

  private tabsChanged(): void {
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
    this.emit({ type: 'tabs', tabs: this.tabSnapshots(), activeTabId: this.state.activeTabId });
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

/** Wie der Prozessbaum einer Shell aussieht: Git Bash startet über einen Starter, WSL bleibt unsichtbar. */
function shellTree(shell: ShellInfo): ShellTree {
  if (wslDistribution(shell.id)) return 'wsl';
  return shell.id === 'gitbash' ? 'gitbash' : 'direct';
}

function isValidSize(cols: number, rows: number): boolean {
  return Number.isInteger(cols) && Number.isInteger(rows) && cols > 0 && rows > 0;
}
