// Ports: die schmalen Schnittstellen, über die der Workspace-Kern mit der Aussenwelt spricht.
// Im Betrieb sind sie echt (node-pty, state.json, Electron), in den Tests nachgemacht.
// Dieses Modul und der Kern laden nie Electron.

import type { PersistedState } from './schema';

// ---------- Terminal-Backend ----------

/** Startauftrag für eine Shell. */
export interface StartOrder {
  /** Programm, z.B. "C:\Program Files\PowerShell\7\pwsh.exe". */
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

/** Der gesicherte Inhalt eines Terminals. */
export interface TabHistory {
  /** Serialisierter Terminal-Inhalt: Text mit Escape-Sequenzen, so wie ihn der Renderer liefert. */
  content: string;
  /** Wann gesichert wurde, in Millisekunden seit 1970. */
  savedAt: number;
}

/** Lädt und speichert den Zustand und den Verlauf pro Tab. */
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

  /** Liest den Verlauf eines Tabs; `null`, wenn es keinen (lesbaren) gibt. */
  loadHistory(tabId: string): TabHistory | null;
  /** Schreibt den Verlauf eines Tabs sofort und ersetzt den bisherigen. */
  saveHistory(tabId: string, history: TabHistory): void;
  /** Löscht den Verlauf eines Tabs; gibt es keinen, passiert nichts. */
  deleteHistory(tabId: string): void;
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
  /**
   * Langform eines Pfads: 8.3-Kurznamen wie `C:\Users\ANNA~1` aufgelöst. Andere Pfade und Pfade,
   * die es nicht gibt, bleiben unverändert.
   */
  longPath(path: string): string;
}

// ---------- Shells ----------

/** Eine Shell, die der Kern starten kann. Die Liste kommt von der Shell-Erkennung (`src/main/shells.ts`). */
export interface ShellInfo {
  /** Stabile Kennung: "pwsh", "powershell", "cmd", "gitbash" oder "wsl:<Distribution>". */
  id: string;
  /** Anzeigename, z.B. "PowerShell 7" oder "Ubuntu (WSL)". */
  name: string;
  /** Programm, wie es die Erkennung gefunden hat, meist mit vollem Pfad. */
  file: string;
  /** Startargumente; bei WSL `-d <Distribution>`, den Ordner ergänzt der Kern mit `--cd <Ordner>`. */
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
