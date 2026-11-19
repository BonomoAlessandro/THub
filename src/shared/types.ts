/** Eine benannte Terminal-Session, wie sie gespeichert und wiederhergestellt wird. */
export interface SessionInfo {
  id: string;
  name: string;
  /** Verzeichnis, in dem die Shell beim (Wieder-)Öffnen startet. */
  cwd: string;
}

export interface Settings {
  /** Verzeichnis, in dem neue Terminals starten. */
  defaultCwd: string;
  /** Ausführbare Shell, z.B. "powershell.exe", "pwsh.exe" oder "cmd.exe". */
  shell: string;
}

/** Alles, was zwischen zwei App-Starts erhalten bleibt (state.json im userData-Ordner). */
export interface PersistedState {
  version: 1;
  settings: Settings;
  sessions: SessionInfo[];
  activeSessionId: string | null;
}

export type Unsubscribe = () => void;

/** Die API, die der Preload-Skript dem Renderer unter `window.termhub` bereitstellt. */
export interface TermHubApi {
  loadState(): Promise<PersistedState>;

  createSession(): Promise<SessionInfo>;
  renameSession(id: string, name: string): Promise<void>;
  closeSession(id: string): Promise<void>;
  setActiveSession(id: string | null): Promise<void>;

  startPty(id: string, cols: number, rows: number): Promise<void>;
  writePty(id: string, data: string): void;
  resizePty(id: string, cols: number, rows: number): void;
  onPtyData(listener: (id: string, data: string) => void): Unsubscribe;
  onPtyExit(listener: (id: string, exitCode: number) => void): Unsubscribe;

  updateSettings(patch: Partial<Settings>): Promise<Settings>;
  pickDirectory(initial?: string): Promise<string | null>;

  readClipboard(): Promise<string>;
  writeClipboard(text: string): Promise<void>;
}

/** IPC-Kanalnamen an einem Ort, damit Main und Preload nicht auseinanderlaufen. */
export const IPC = {
  stateLoad: 'state:load',
  sessionCreate: 'session:create',
  sessionRename: 'session:rename',
  sessionClose: 'session:close',
  sessionSetActive: 'session:set-active',
  ptyStart: 'pty:start',
  ptyWrite: 'pty:write',
  ptyResize: 'pty:resize',
  ptyData: 'pty:data',
  ptyExit: 'pty:exit',
  settingsUpdate: 'settings:update',
  dialogPickDirectory: 'dialog:pick-directory',
  clipboardRead: 'clipboard:read',
  clipboardWrite: 'clipboard:write',
} as const;
