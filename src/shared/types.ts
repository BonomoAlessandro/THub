// Vertrag zwischen Renderer und Workspace-Kern (über IPC).
// Der Kern im Hauptprozess ist die einzige Quelle der Wahrheit: Der Renderer bekommt einen
// Schnappschuss und danach Änderungsereignisse und schickt nur Befehle.

export type Theme = 'system' | 'light' | 'dark';

/** Das Design, das gerade gilt: hell oder dunkel; „System“ ist dabei schon aufgelöst. */
export type ResolvedTheme = 'light' | 'dark';

/** Terminal-Schriftgrösse in px: kleinste, grösste und Standardgrösse (`Ctrl+0` setzt darauf zurück). */
export const FONT_SIZE = { min: 8, max: 32, default: 14 } as const;

export interface Settings {
  /** Standardordner für neue Tabs; leer heisst Benutzerordner. */
  defaultCwd: string;
  /** Kennung der Standard-Shell (z.B. "pwsh"); fehlt sie, wählt der Kern selbst. */
  defaultShellId?: string;
  theme: Theme;
  /** Terminal-Schriftgrösse, 8 bis 32 (`FONT_SIZE`). */
  fontSize: number;
  /** Hinweise im Fenster an/aus. */
  notifications: boolean;
}

/**
 * Prozess-Zustand eines Tabs:
 * - `pending`: wartet auf „Ansicht bereit“, es läuft noch keine Shell;
 * - `running`: die Shell läuft;
 * - `exited`: die Shell ist beendet (oder liess sich nicht starten).
 */
export type TabProcessState = 'pending' | 'running' | 'exited';

/** Ein Tab, wie ihn der Renderer anzeigt. */
export interface TabSnapshot {
  id: string;
  name: string;
  shellId: string;
  /** Anzeigename der Shell, mit der der Tab läuft, z.B. "PowerShell 7". */
  shellName: string;
  /** Ordner zur Anzeige: zuletzt aktiver Ordner, sonst Startordner. */
  cwd: string;
  process: TabProcessState;
}

/** Ein zuletzt benutzter Ordner, wie ihn das Pfeil-Menü unter „Neues Terminal in …“ anbietet. */
export interface RecentDir {
  path: string;
  /** Name, den ein neuer Tab in diesem Ordner bekäme (ohne „ 2“ usw.). */
  name: string;
}

/** Vollständiger Zustand für den Renderer, beim Laden abgeholt. */
export interface WorkspaceSnapshot {
  tabs: TabSnapshot[];
  activeTabId: string | null;
  settings: Settings;
  /** Benutzerordner, zur Anzeige eines leeren Standardordners. */
  homeDir: string;
}

/** Änderungsereignisse vom Kern an den Renderer. */
export type WorkspaceEvent =
  /** Tabs, Reihenfolge, aktiver Tab oder Prozess-Zustand haben sich geändert. */
  | { type: 'tabs'; tabs: TabSnapshot[]; activeTabId: string | null }
  | { type: 'settings'; settings: Settings }
  /** Rohe Ausgabe der Shell eines Tabs. */
  | { type: 'output'; tabId: string; data: string }
  /** Die Shell eines Tabs hat sich beendet. */
  | { type: 'exit'; tabId: string; exitCode: number }
  /** Hinweis im Terminal eines Tabs (z.B. Shell liess sich nicht starten). */
  | { type: 'notice'; tabId: string; level: 'info' | 'error'; text: string }
  /**
   * Gesicherter Verlauf eines Tabs zum Wiederherstellen. Kommt nach „Ansicht bereit“, aber vor dem
   * Startauftrag, und damit vor der ersten Ausgabe der Shell. `savedAt`: Zeitpunkt der Sicherung.
   */
  | { type: 'restoreHistory'; tabId: string; content: string; savedAt: number }
  /** Der Kern möchte den aktuellen Verlauf dieser Tabs; der Renderer antwortet je Tab mit `saveHistory`. */
  | { type: 'requestHistory'; tabIds: string[] };

/** Befehle vom Renderer an den Kern. */
export type WorkspaceCommand =
  /** Neuer Tab im Ordner `cwd`; ohne ihn (oder wenn es ihn nicht gibt) im Standardordner. */
  | { type: 'createTab'; cwd?: string }
  | { type: 'renameTab'; tabId: string; name: string }
  | { type: 'activateTab'; tabId: string }
  /** Zum Tab `offset` Plätze weiter, im Kreis (Ctrl+Tab: 1, Ctrl+Shift+Tab: -1). */
  | { type: 'activateRelativeTab'; offset: number }
  /** Zum Tab an Position `index` der Leiste, ab 0 (Ctrl+1 … Ctrl+9). */
  | { type: 'activateTabAt'; index: number }
  | { type: 'closeTab'; tabId: string }
  /** Die Ansicht des Tabs ist bereit; erst danach erteilt der Kern den Startauftrag. */
  | { type: 'viewReady'; tabId: string; cols: number; rows: number }
  | { type: 'resizeTab'; tabId: string; cols: number; rows: number }
  | { type: 'writeToTab'; tabId: string; data: string }
  /** Beendete Shell neu starten (beliebige Taste im Terminal). */
  | { type: 'restartTab'; tabId: string }
  /** Antwort auf `requestHistory`: der serialisierte Inhalt des Terminals eines Tabs. */
  | { type: 'saveHistory'; tabId: string; content: string }
  | { type: 'updateSettings'; patch: Partial<Settings> }
  /**
   * Schriftgrösse einen Schritt grösser (1) oder kleiner (-1). Der Kern rechnet vom eigenen Stand aus,
   * damit bei schnellen Schritten (Mausrad, gehaltene Taste) keiner verloren geht.
   */
  | { type: 'stepFontSize'; step: number };

export type Unsubscribe = () => void;

/** Wofür der Ordner-Dialog einen Ordner wählt; davon hängen Titel und Startordner des Dialogs ab. */
export type DirectoryPurpose = 'newTab' | 'defaultCwd';

/** Die API, die der Preload-Skript dem Renderer unter `window.thub` bereitstellt. */
export interface THubApi {
  loadSnapshot(): Promise<WorkspaceSnapshot>;
  onEvent(listener: (event: WorkspaceEvent) => void): Unsubscribe;
  send(command: WorkspaceCommand): void;
  /** Zuletzt benutzte Ordner, die es noch gibt, neueste zuerst; abgefragt beim Öffnen des Pfeil-Menüs. */
  loadRecentDirs(): Promise<RecentDir[]>;

  /** Öffnet den Ordner-Dialog von Windows; `null`, wenn er abgebrochen wurde. */
  pickDirectory(purpose: DirectoryPurpose): Promise<string | null>;

  readClipboard(): Promise<string>;
  writeClipboard(text: string): Promise<void>;

  /** Das geltende Design; es bestimmt der Hauptprozess. */
  loadTheme(): Promise<ResolvedTheme>;
  /** Meldet jeden Wechsel des Designs, zum Beispiel wenn Windows von dunkel auf hell wechselt. */
  onThemeChange(listener: (theme: ResolvedTheme) => void): Unsubscribe;
}

/** IPC-Kanalnamen an einem Ort, damit Main und Preload nicht auseinanderlaufen. */
export const IPC = {
  workspaceSnapshot: 'workspace:snapshot',
  workspaceCommand: 'workspace:command',
  workspaceEvent: 'workspace:event',
  workspaceRecentDirs: 'workspace:recent-dirs',
  dialogPickDirectory: 'dialog:pick-directory',
  clipboardRead: 'clipboard:read',
  clipboardWrite: 'clipboard:write',
  themeCurrent: 'theme:current',
  themeChanged: 'theme:changed',
} as const;
