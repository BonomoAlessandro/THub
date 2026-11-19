// Vertrag zwischen Renderer und Workspace-Kern (über IPC).
// Der Kern im Hauptprozess ist die einzige Quelle der Wahrheit: Der Renderer bekommt einen
// Schnappschuss und danach Änderungsereignisse und schickt nur Befehle.

export type Theme = 'system' | 'light' | 'dark';

export interface Settings {
  /** Standardordner für neue Tabs; leer heisst Benutzerordner. */
  defaultCwd: string;
  /** Kennung der Standard-Shell (z.B. "pwsh"); fehlt sie, wählt der Kern selbst. */
  defaultShellId?: string;
  theme: Theme;
  /** Terminal-Schriftgrösse, 8 bis 32. */
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
  | { type: 'createTab' }
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
  | { type: 'updateSettings'; patch: Partial<Settings> };

export type Unsubscribe = () => void;

/** Die API, die der Preload-Skript dem Renderer unter `window.termhub` bereitstellt. */
export interface TermHubApi {
  loadSnapshot(): Promise<WorkspaceSnapshot>;
  onEvent(listener: (event: WorkspaceEvent) => void): Unsubscribe;
  send(command: WorkspaceCommand): void;

  pickDirectory(initial?: string): Promise<string | null>;

  readClipboard(): Promise<string>;
  writeClipboard(text: string): Promise<void>;
}

/** IPC-Kanalnamen an einem Ort, damit Main und Preload nicht auseinanderlaufen. */
export const IPC = {
  workspaceSnapshot: 'workspace:snapshot',
  workspaceCommand: 'workspace:command',
  workspaceEvent: 'workspace:event',
  dialogPickDirectory: 'dialog:pick-directory',
  clipboardRead: 'clipboard:read',
  clipboardWrite: 'clipboard:write',
} as const;
