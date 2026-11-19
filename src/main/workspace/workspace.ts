// Workspace-Kern: besitzt die gesamte Tab-Logik und hängt nur über die Ports von der Aussenwelt ab.
// Der Renderer holt einen Schnappschuss, bekommt danach Änderungsereignisse und schickt Befehle.
// Startaufträge erteilt nur der Kern, und zwar erst, wenn die Ansicht des Tabs bereit ist.

import { randomUUID } from 'node:crypto';
import type {
  Settings,
  TabProcessState,
  TabSnapshot,
  WorkspaceEvent,
  WorkspaceSnapshot,
} from '../../shared/types';
import {
  linkAfterHook,
  linkAfterLaunch,
  normalizeDirectory,
  readHook,
  sameLink,
  type ClaudeLaunchRequest,
  type ClaudeLaunchResponse,
  type ClaudeReceiver,
  type LocalApiInfo,
} from './claude';
import type { CancelTimer, ShellInfo, StartOrder, WorkspacePorts } from './ports';
import {
  normalizeSettings,
  normalizeWindow,
  readPersistedState,
  type PersistedClaudeLink,
  type PersistedState,
  type PersistedTab,
  type WindowState,
} from './schema';
import { placeWindow } from './windowPlacement';

/** So lange wartet das Beenden höchstens auf die Shells. */
const SHUTDOWN_TIMEOUT_MS = 3000;
/** Fensterangaben werden gespeichert, sobald das Fenster so lange nicht mehr verändert wurde. */
const WINDOW_SAVE_DELAY_MS = 500;

export interface WorkspaceOptions {
  /** Shells, die der Kern starten kann. Bis zur Shell-Erkennung (Ticket 06) eine feste Liste. */
  shells: ShellInfo[];
  /**
   * Die laufende lokale Schnittstelle (Ticket 10). Fehlt sie, weil sie sich nicht starten liess, bekommen die
   * Terminals nur TERMHUB_TAB_ID; der Starter erreicht TermHub nicht und startet claude unverändert.
   */
  localApi?: LocalApiInfo;
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

  /** Legt einen Tab an, macht ihn aktiv und liefert seine Kennung (leer, wenn der Kern beendet wird). */
  createTab(): string;
  /** Leere Namen werden ignoriert. */
  renameTab(tabId: string, name: string): void;
  activateTab(tabId: string): void;
  /** Beendet die Shell; war der Tab aktiv, wird sein Nachbar aktiv. */
  closeTab(tabId: string): void;

  /** Die Ansicht des Tabs ist bereit; erst jetzt startet seine Shell, in dieser Grösse. */
  viewReady(tabId: string, cols: number, rows: number): void;
  resizeTab(tabId: string, cols: number, rows: number): void;
  writeToTab(tabId: string, data: string): void;
  /** Startet eine beendete Shell neu. */
  restartTab(tabId: string): void;

  updateSettings(patch: Partial<Settings>): void;

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
   * TermHub beendet sich selbst (etwa bei einer Windows-Abmeldung): Die Claude-Zuordnungen werden eingefroren
   * und der Zustand sofort geschrieben. Danach ändern weder Meldungen von Starter und Claude noch das Ende
   * einer Shell die Zuordnungen; sonst käme nach dem Beenden jeder Claude-Tab als normales Terminal zurück.
   */
  freeze(): void;
  /** Friert ein, sichert den Zustand und beendet alle Shells. Danach nimmt der Kern keine Befehle mehr an. */
  shutdown(): Promise<void>;
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
  /** Prozess-ID von Claude, vom Starter gemeldet; für die Prozess-Regeln (Ticket 13). */
  claudePid?: number;
}

class WorkspaceCore implements Workspace {
  private readonly state: PersistedState;
  private readonly runtimes = new Map<string, TabRuntime>();
  private readonly listeners = new Set<(event: WorkspaceEvent) => void>();
  private stopping: Promise<void> | null = null;
  /** Claude-Zuordnungen eingefroren, weil TermHub sich selbst beendet. */
  private frozen = false;
  /** Vorgemerktes Speichern geänderter Fensterangaben; `null`, wenn nichts aussteht. */
  private cancelWindowSave: CancelTimer | null = null;

  constructor(
    private readonly ports: WorkspacePorts,
    private readonly shells: ShellInfo[],
    private readonly localApi: LocalApiInfo | undefined,
  ) {
    if (shells.length === 0) throw new Error('Der Workspace-Kern braucht mindestens eine Shell.');

    const loaded = readPersistedState(ports.storage.loadState(), {
      homeDir: ports.system.homeDir(),
      defaultShellId: this.defaultShell(undefined).id,
    });
    this.state = loaded.state;
    for (const tab of this.state.tabs) this.runtimes.set(tab.id, { process: 'pending' });

    // Wie bisher: Ohne gespeicherte Tabs startet TermHub mit einem neuen Terminal.
    if (this.state.tabs.length === 0) this.createTab();
    else if (loaded.migrated) this.save();
  }

  // ---------- Abfragen und Ereignisse ----------

  snapshot(): WorkspaceSnapshot {
    return {
      tabs: this.tabSnapshots(),
      activeTabId: this.state.activeTabId,
      settings: structuredClone(this.state.settings),
      homeDir: this.ports.system.homeDir(),
    };
  }

  subscribe(listener: (event: WorkspaceEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // ---------- Tabs ----------

  createTab(): string {
    if (this.stopping) return '';
    const tab: PersistedTab = {
      id: randomUUID(),
      name: this.nextTabName(),
      nameIsManual: false,
      shellId: this.defaultShell(this.state.settings.defaultShellId).id,
      startCwd: this.state.settings.defaultCwd || this.ports.system.homeDir(),
    };
    this.state.tabs.push(tab);
    this.runtimes.set(tab.id, { process: 'pending' });
    this.state.activeTabId = tab.id;
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
    this.tabsChanged();
  }

  closeTab(tabId: string): void {
    const index = this.state.tabs.findIndex((t) => t.id === tabId);
    if (this.stopping || index < 0) return;
    // Zuerst austragen: Das Ende der Shell gehört dann zu keinem Tab mehr.
    this.runtimes.delete(tabId);
    this.ports.terminal.kill(tabId);
    this.state.tabs.splice(index, 1);
    if (this.state.activeTabId === tabId) {
      const neighbour = this.state.tabs[index] ?? this.state.tabs[index - 1];
      this.state.activeTabId = neighbour?.id ?? null;
    }
    this.tabsChanged();
  }

  // ---------- Ansichten und Shells ----------

  viewReady(tabId: string, cols: number, rows: number): void {
    const tab = this.findTab(tabId);
    const runtime = this.runtimes.get(tabId);
    if (this.stopping || !tab || !runtime || !isValidSize(cols, rows)) return;
    runtime.view = { cols, rows };
    if (runtime.process === 'pending') this.startShell(tab, runtime);
    else if (runtime.process === 'running') this.ports.terminal.resize(tabId, cols, rows);
  }

  resizeTab(tabId: string, cols: number, rows: number): void {
    const runtime = this.runtimes.get(tabId);
    // Vor „Ansicht bereit“ zählt nur die dort gemeldete Grösse.
    if (this.stopping || !runtime?.view || !isValidSize(cols, rows)) return;
    runtime.view = { cols, rows };
    if (runtime.process === 'running') this.ports.terminal.resize(tabId, cols, rows);
  }

  writeToTab(tabId: string, data: string): void {
    if (this.stopping || this.runtimes.get(tabId)?.process !== 'running') return;
    this.ports.terminal.write(tabId, data);
  }

  restartTab(tabId: string): void {
    const tab = this.findTab(tabId);
    const runtime = this.runtimes.get(tabId);
    if (this.stopping || !tab || runtime?.process !== 'exited' || !runtime.view) return;
    this.startShell(tab, runtime);
  }

  private startShell(tab: PersistedTab, runtime: TabRuntime): void {
    const view = runtime.view;
    if (!view) return;
    const shell = this.shellFor(tab);
    const order: StartOrder = {
      file: shell.file,
      args: [...shell.args],
      cwd: this.resolveCwd(tab),
      env: this.terminalEnv(tab),
      cols: view.cols,
      rows: view.rows,
    };

    const run = {};
    const isCurrent = () => !this.stopping && this.runtimes.get(tab.id) === runtime && runtime.run === run;
    runtime.run = run;
    runtime.process = 'running';
    try {
      const pid = this.ports.terminal.start(tab.id, order, {
        data: (chunk) => {
          if (isCurrent()) this.emit({ type: 'output', tabId: tab.id, data: chunk });
        },
        exit: (exitCode) => {
          if (!isCurrent()) return;
          runtime.process = 'exited';
          runtime.run = undefined;
          runtime.pid = undefined;
          // Mit der Shell endet auch ein Claude darin: Der Tab wird ein normales Terminal.
          if (!this.frozen) this.setClaudeLink(tab, undefined);
          this.emit({ type: 'exit', tabId: tab.id, exitCode });
          this.emitTabs();
        },
      });
      if (isCurrent()) runtime.pid = pid;
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
    const env: Record<string, string> = { TERMHUB_TAB_ID: tab.id };
    if (this.localApi) {
      env.TERMHUB_API = this.localApi.url;
      env.TERMHUB_TOKEN = this.localApi.token;
    }
    return env;
  }

  /** Startordner: zuletzt aktiver Ordner → Startordner → Standardordner → Benutzerordner. */
  private resolveCwd(tab: PersistedTab): string {
    const candidates = [tab.lastCwd, tab.startCwd, this.state.settings.defaultCwd];
    const existing = candidates.find((dir) => dir && this.ports.system.directoryExists(dir));
    return existing ?? this.ports.system.homeDir();
  }

  // ---------- Shells ----------

  /** Die eingestellte Standard-Shell, sonst die automatisch gewählte. */
  private defaultShell(settingId: string | undefined): ShellInfo {
    // Bis zur Shell-Erkennung (Ticket 06) bleibt Windows PowerShell der Standard wie in Version 0.1.0.
    return (
      this.shells.find((s) => s.id === settingId) ??
      this.shells.find((s) => s.id === 'powershell') ??
      this.shells[0]
    );
  }

  /** Die Shell eines Tabs; fehlt sie, gilt die Standard-Shell. */
  private shellFor(tab: PersistedTab): ShellInfo {
    return (
      this.shells.find((s) => s.id === tab.shellId) ?? this.defaultShell(this.state.settings.defaultShellId)
    );
  }

  // ---------- Einstellungen ----------

  updateSettings(patch: Partial<Settings>): void {
    if (this.stopping) return;
    const next = normalizeSettings({ ...this.state.settings, ...patch });
    if (JSON.stringify(next) === JSON.stringify(this.state.settings)) return;
    this.state.settings = next;
    this.save();
    this.emit({ type: 'settings', settings: structuredClone(next) });
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

  // ---------- Claude ----------

  claudeLaunch(request: ClaudeLaunchRequest): ClaudeLaunchResponse | null {
    const tab = this.claudeTab(request.tabId);
    if (!tab || !this.localApi) return null;
    // Im Fall „neu“ vergibt TermHub die Kennung selbst; so ist sie auch ohne ein einziges Hook-Ereignis
    // bekannt (Sicherheitsnetz).
    const newId = request.case === 'new' ? randomUUID() : undefined;
    const sessionId = newId ?? (request.case === 'withId' ? request.sessionId : undefined);
    const reported = request.cwd ? this.normalizeDir(request.cwd) : '';
    this.setClaudeLink(tab, linkAfterLaunch(tab.claude, sessionId, reported || (tab.lastCwd ?? tab.startCwd)));

    const { hookFile } = this.localApi;
    return newId ? { tabName: tab.name, sessionId: newId, hookFile } : { tabName: tab.name, hookFile };
  }

  claudeStarted(tabId: string, pid: number): void {
    const runtime = this.runtimes.get(tabId);
    if (this.claudeTab(tabId)?.claude && runtime) runtime.claudePid = pid;
  }

  claudeExit(tabId: string, _sessionId: string | undefined, _exitCode: number): void {
    // Claude hat sich beendet, auch ohne SessionEnd (etwa nach einem Absturz): normales Terminal.
    // Session-Kennung und Exit-Code braucht erst das fehlgeschlagene Fortsetzen (Ticket 12).
    const tab = this.claudeTab(tabId);
    if (tab) this.setClaudeLink(tab, undefined);
  }

  claudeHook(tabId: string, event: string, payload: unknown): void {
    const tab = this.claudeTab(tabId);
    if (!tab) return;
    this.setClaudeLink(tab, linkAfterHook(tab.claude, readHook(event, payload), (raw) => this.normalizeDir(raw)));
  }

  /** Der Tab, für den eine Meldung von Starter oder Claude gilt; keiner, wenn unbekannt oder eingefroren. */
  private claudeTab(tabId: string): PersistedTab | undefined {
    return this.frozen || this.stopping ? undefined : this.findTab(tabId);
  }

  /** Setzt die Claude-Zuordnung eines Tabs; `undefined` macht ihn zum normalen Terminal. */
  private setClaudeLink(tab: PersistedTab, link: PersistedClaudeLink | undefined): void {
    if (sameLink(tab.claude, link)) return;
    if (link) {
      tab.claude = link;
    } else {
      delete tab.claude;
      const runtime = this.runtimes.get(tab.id);
      if (runtime) runtime.claudePid = undefined;
    }
    this.save();
  }

  private normalizeDir(raw: string): string {
    return normalizeDirectory(raw, (dir) => this.ports.system.longPath(dir));
  }

  // ---------- Beenden ----------

  freeze(): void {
    this.frozen = true;
    this.saveWindowNow();
    this.ports.storage.flush();
  }

  shutdown(): Promise<void> {
    if (!this.stopping) {
      // Die Shells werden auch dann beendet, wenn das Sichern scheitert; der Fehler kommt danach.
      let saveError: unknown = null;
      try {
        this.freeze();
      } catch (err) {
        saveError = err;
      }
      this.stopping = this.ports.terminal.killAll(SHUTDOWN_TIMEOUT_MS).then(() => {
        if (saveError) throw saveError;
      });
    }
    return this.stopping;
  }

  // ---------- Intern ----------

  private findTab(tabId: string): PersistedTab | undefined {
    return this.state.tabs.find((t) => t.id === tabId);
  }

  /** Wie bisher: „Terminal 1“, „Terminal 2“ …, die kleinste freie Nummer. */
  private nextTabName(): string {
    const used = new Set(this.state.tabs.map((t) => t.name));
    for (let n = 1; ; n++) {
      const name = `Terminal ${n}`;
      if (!used.has(name)) return name;
    }
  }

  private tabSnapshots(): TabSnapshot[] {
    return this.state.tabs.map((tab) => ({
      id: tab.id,
      name: tab.name,
      shellId: tab.shellId,
      cwd: tab.lastCwd ?? tab.startCwd,
      process: this.runtimes.get(tab.id)?.process ?? 'pending',
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

function isValidSize(cols: number, rows: number): boolean {
  return Number.isInteger(cols) && Number.isInteger(rows) && cols > 0 && rows > 0;
}
