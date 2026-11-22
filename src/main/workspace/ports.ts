// Ports: die schmalen Schnittstellen, über die der Workspace-Kern mit der Aussenwelt spricht.
// Im Betrieb sind sie echt (node-pty, state.json, Electron), in den Tests nachgemacht.
// Dieses Modul und der Kern laden nie Electron.

import type { KeepAwakeFailureReason, KeepAwakeMode } from '../../shared/types';
import type { PersistedState } from './schema';

// ---------- Terminal-Backend ----------

/**
 * Welche mitgelieferte Shell-Integration eine Shell bekommt (Ticket 07): Profil des Nutzers, danach
 * Ordner-Meldungen und Startbefehl.
 */
export type ShellIntegration = 'powershell' | 'cmd' | 'bash';

/** Startauftrag für eine Shell. */
export interface StartOrder {
  /** Programm, z.B. "C:\Program Files\PowerShell\7\pwsh.exe". */
  file: string;
  /**
   * Startargumente ohne Integration. Mit Integration bestimmt das Backend die Argumente selbst; diese hier
   * gelten dann nur, wenn die Integration fehlt (Rückfall).
   */
  args: string[];
  cwd: string;
  /** Zusätzliche Umgebungsvariablen; das Backend ergänzt sie zur eigenen, bereinigten Umgebung. */
  env: Record<string, string>;
  cols: number;
  rows: number;
  /** Mit dieser Integration starten; fehlt sie (etwa bei WSL), startet die Shell ohne. */
  integration?: ShellIntegration;
  /**
   * Befehl, den die Shell-Integration genau einmal ausführt, sobald die Shell bereit ist, in der Sprache
   * der Shell. Ohne Integration entfällt er.
   */
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
  /**
   * Beendet die Shell des Tabs, indem es ihre Pseudokonsole schliesst. Prozesse mit eigener Konsole (etwa per
   * `Start-Process` gestartet) erreicht das nicht; die beendet der Kern über die Prozess-Sonde.
   */
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

/**
 * Ein Prozess, wie ihn die Sonde sieht. Er ist erst mit (Prozess-ID, Startzeit) eindeutig: Windows vergibt
 * Prozess-IDs wieder, und die Eltern-ID kann auf einen beendeten Prozess zeigen.
 */
export interface ProcessInfo {
  pid: number;
  /** Prozess-ID des Elternprozesses beim Start; zeigt womöglich auf einen beendeten oder neuen Prozess. */
  ppid: number;
  /** Programmname, z.B. "node.exe". */
  name: string;
  /** Startzeit in Millisekunden seit 1970, mit Bruchteilen; dieselbe Zeitbasis wie `Clock.now()`. */
  startTime: number;
}

export interface ProcessProbe {
  /**
   * Liefert in einer einzigen Abfrage alle Prozesse des Systems. Wird abgefragt, während noch eine Abfrage läuft,
   * darf die Sonde beide mit demselben Ergebnis beantworten.
   */
  snapshot(): Promise<ProcessInfo[]>;
  /**
   * Prozess-ID des Konsolen-Hosts (`conhost.exe`, `OpenConsole.exe`), an dem der Prozess hängt; `null`, wenn
   * sie sich nicht lesen lässt. Der Kern fragt nur für einzelne Prozesse (Git-Bash-Shells und Waisen).
   */
  consoleHost(pid: number): number | null;
  /**
   * Beendet diese Prozesse sofort, in dieser Reihenfolge (Ticket 15). Ein Prozess wird nur beendet, wenn er noch
   * derselbe ist, also Prozess-ID und Startzeit wie in der Abfrage hat; beendete und nicht zugängliche Prozesse werden
   * übergangen.
   */
  terminate(processes: ProcessInfo[]): void;
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
  /**
   * Startargumente ohne Integration, auch für den Rückfall, wenn die Integration fehlt. Bei WSL
   * `-d <Distribution>`; den Ordner ergänzt der Kern mit `--cd <Ordner>`.
   */
  args: string[];
  /** Ob Claude in dieser Shell erfasst wird (alle ausser WSL). */
  capturesClaude: boolean;
  /** Mitgelieferte Integration; alle Windows-Shells haben eine, WSL keine. */
  integration?: ShellIntegration;
}

// ---------- Wachhalten ----------

/** Wie weit Windows den Rechner wach hält (Ticket 28): gar nicht, nur den Rechner, Rechner und Bildschirm. */
export type KeepAwakeLevel = 'off' | KeepAwakeMode;

export interface KeepAwake {
  /**
   * Hält den Rechner ab jetzt auf dieser Stufe wach. Idempotent: Dieselbe Stufe zweimal ergibt eine einzige Anforderung
   * bei Windows. Das Versprechen erfüllt sich, sobald die Stufe gilt, und weist mit einem `KeepAwakeError` zurück, wenn
   * sie sich nicht setzen liess (Ticket 31):
   * - Scheitert das Setzen (`phase: 'set'`), hebt der Port vorher alles auf, was gesetzt war; danach hält er nichts wach.
   * - Scheitert nur das Aufheben (`phase: 'clear'`), bleibt gesetzt, was sich nicht aufheben liess.
   * Ein späterer Aufruf versucht es erneut.
   */
  set(level: KeepAwakeLevel): Promise<void>;
}

/** Ein gescheitertes Wachhalten: in welcher Phase, warum und mit welchem Fehlercode von Windows. */
export class KeepAwakeError extends Error {
  constructor(
    message: string,
    /** `set`: Setzen einer Art scheiterte; `clear`: Aufheben scheiterte. */
    readonly phase: 'set' | 'clear',
    readonly reason: KeepAwakeFailureReason,
    /** Fehlercode von Windows, nur bei `windows`. */
    readonly code?: number,
  ) {
    super(message);
    this.name = 'KeepAwakeError';
  }
}

/** Alle Ports zusammen, wie sie der Kern beim Erzeugen bekommt. */
export interface WorkspacePorts {
  terminal: TerminalBackend;
  storage: StateStorage;
  clock: Clock;
  processes: ProcessProbe;
  system: HostSystem;
  keepAwake: KeepAwake;
}
