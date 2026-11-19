// Ports: die schmalen Schnittstellen, über die der Workspace-Kern mit der Aussenwelt spricht.
// Im Betrieb sind sie echt (node-pty, state.json, Electron), in den Tests nachgemacht.
// Dieses Modul und der Kern laden nie Electron.

import type { PersistedState } from './schema';

// ---------- Terminal-Backend ----------

/** Startauftrag für eine Shell. */
export interface StartOrder {
  /** Programm, z.B. "pwsh.exe". */
  file: string;
  args: string[];
  cwd: string;
  /** Zusätzliche Umgebungsvariablen; das Backend ergänzt sie zur eigenen, bereinigten Umgebung. */
  env: Record<string, string>;
  cols: number;
  rows: number;
  /** Befehl, den die Shell-Integration genau einmal ausführt, sobald die Shell bereit ist. */
  startCommand?: string;
}

/** Meldungen eines gestarteten Shell-Prozesses. */
export interface TerminalListener {
  /** Rohe Ausgabe in Stücken, so wie sie ankommt. */
  data(chunk: string): void;
  exit(exitCode: number): void;
}

/** Startet und steuert die Shell-Prozesse, höchstens einen pro Tab. */
export interface TerminalBackend {
  /** Startet die Shell eines Tabs und liefert die Prozess-ID. Wirft, wenn der Start scheitert. */
  start(tabId: string, order: StartOrder, listener: TerminalListener): number;
  write(tabId: string, data: string): void;
  resize(tabId: string, cols: number, rows: number): void;
  kill(tabId: string): void;
  /** Beendet alle Shells und wartet, bis sie weg sind, höchstens `timeoutMs`. */
  killAll(timeoutMs: number): Promise<void>;
}

// ---------- Speicher ----------

/** Lädt und speichert den Zustand. Der Verlauf pro Tab kommt mit Ticket 08 dazu. */
export interface StateStorage {
  /**
   * Liest den gespeicherten Zustand roh, also noch nicht übernommen oder geprüft.
   * Liefert `null`, wenn es keinen gibt. Eine unlesbare Datei legt der Speicher beiseite.
   */
  loadState(): unknown;
  /** Merkt den Zustand zum Speichern vor; darf entprellt schreiben. */
  saveState(state: PersistedState): void;
  /** Schreibt vorgemerkten Zustand sofort. */
  flush(): void;
}

// ---------- Uhr ----------

export type CancelTimer = () => void;

export interface Clock {
  /** Millisekunden seit 1970, wie `Date.now()`. */
  now(): number;
  /** Ruft `callback` einmal nach `ms` Millisekunden auf. */
  schedule(ms: number, callback: () => void): CancelTimer;
}

// ---------- Prozess-Sonde ----------

export interface ProcessInfo {
  pid: number;
  ppid: number;
  /** Programmname, z.B. "node.exe". */
  name: string;
}

export interface ProcessProbe {
  /** Liefert in einer einzigen Abfrage den Prozessbaum aller Prozesse. */
  snapshot(): Promise<ProcessInfo[]>;
}

// ---------- System ----------

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DisplayInfo {
  bounds: Rect;
  workArea: Rect;
  primary: boolean;
}

export interface HostSystem {
  directoryExists(path: string): boolean;
  homeDir(): string;
  userName(): string;
  displays(): DisplayInfo[];
}

// ---------- Shells ----------

/** Eine Shell, die der Kern starten kann. Die Liste wird dem Kern übergeben. */
export interface ShellInfo {
  /** Stabile Kennung: "pwsh", "powershell", "cmd", "gitbash" oder "wsl:<Distribution>". */
  id: string;
  /** Anzeigename, z.B. "PowerShell 7". */
  name: string;
  file: string;
  args: string[];
  /** Ob Claude in dieser Shell erfasst wird (alle ausser WSL). */
  capturesClaude: boolean;
}

/** Alle Ports zusammen, wie sie der Kern beim Erzeugen bekommt. */
export interface WorkspacePorts {
  terminal: TerminalBackend;
  storage: StateStorage;
  clock: Clock;
  processes: ProcessProbe;
  system: HostSystem;
}
