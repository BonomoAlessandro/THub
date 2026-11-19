// Nachgemachte Ports für die Kern-Tests. Nachgemacht wird nur an den Systemgrenzen, nie im Kern.

import type {
  CancelTimer,
  Clock,
  DisplayInfo,
  HostSystem,
  ProcessInfo,
  ProcessProbe,
  StartOrder,
  StateStorage,
  TerminalBackend,
  TerminalListener,
} from '../../src/main/workspace/ports';
import type { PersistedState } from '../../src/main/workspace/schema';

// ---------- Terminal-Backend ----------

export interface RecordedStart {
  tabId: string;
  order: StartOrder;
  pid: number;
}

/**
 * Zeichnet Startaufträge auf und lässt den Test rohe Ausgabestücke und Prozessende einspeisen.
 * Wie beim echten Backend meldet auch ein beendeter (kill) Prozess sein Ende.
 */
export class FakeTerminalBackend implements TerminalBackend {
  readonly starts: RecordedStart[] = [];
  readonly writes: { tabId: string; data: string }[] = [];
  readonly resizes: { tabId: string; cols: number; rows: number }[] = [];
  readonly kills: string[] = [];
  killAllCalls = 0;
  private readonly running = new Map<string, TerminalListener>();
  private nextPid = 1000;
  private startError: Error | null = null;

  start(tabId: string, order: StartOrder, listener: TerminalListener): number {
    if (this.startError) throw this.startError;
    if (this.running.has(tabId)) throw new Error(`Für diesen Tab läuft bereits eine Shell: ${tabId}`);
    const pid = this.nextPid++;
    this.running.set(tabId, listener);
    this.starts.push({ tabId, order: structuredClone(order), pid });
    return pid;
  }

  write(tabId: string, data: string): void {
    this.writes.push({ tabId, data });
  }

  resize(tabId: string, cols: number, rows: number): void {
    this.resizes.push({ tabId, cols, rows });
  }

  kill(tabId: string): void {
    this.kills.push(tabId);
    this.exit(tabId, 1);
  }

  killAll(_timeoutMs: number): Promise<void> {
    this.killAllCalls++;
    for (const tabId of [...this.running.keys()]) this.exit(tabId, 1);
    return Promise.resolve();
  }

  // ---------- Steuerung durch den Test ----------

  /** Die Shell des Tabs gibt ein rohes Stück Ausgabe aus. */
  output(tabId: string, chunk: string): void {
    const listener = this.running.get(tabId);
    if (!listener) throw new Error(`Keine laufende Shell für ${tabId}`);
    listener.data(chunk);
  }

  /** Die Shell des Tabs beendet sich. */
  exit(tabId: string, exitCode: number): void {
    const listener = this.running.get(tabId);
    if (!listener) return;
    this.running.delete(tabId);
    listener.exit(exitCode);
  }

  /** Der nächste Start scheitert mit dieser Meldung (bis `failStarts(null)`). */
  failStarts(message: string | null): void {
    this.startError = message === null ? null : new Error(message);
  }

  isRunning(tabId: string): boolean {
    return this.running.has(tabId);
  }

  startsFor(tabId: string): RecordedStart[] {
    return this.starts.filter((s) => s.tabId === tabId);
  }
}

// ---------- Speicher ----------

/** Speicher im Arbeitsspeicher. `stored` ist das, was „auf der Platte“ liegt. */
export class MemoryStorage implements StateStorage {
  stored: unknown;
  saves = 0;
  flushes = 0;

  /** @param initial roher gespeicherter Zustand, z.B. eine Datei der Version 1 */
  constructor(initial: unknown = null) {
    this.stored = structuredClone(initial);
  }

  loadState(): unknown {
    return structuredClone(this.stored);
  }

  saveState(state: PersistedState): void {
    this.stored = structuredClone(state);
    this.saves++;
  }

  flush(): void {
    this.flushes++;
  }
}

// ---------- Uhr ----------

/** Steuerbare Uhr: Die Zeit läuft nur mit `advance`. */
export class FakeClock implements Clock {
  private time: number;
  private seq = 0;
  private timers: { due: number; seq: number; callback: () => void }[] = [];

  constructor(start = Date.UTC(2026, 10, 19, 8, 0, 0)) {
    this.time = start;
  }

  now(): number {
    return this.time;
  }

  schedule(ms: number, callback: () => void): CancelTimer {
    const timer = { due: this.time + Math.max(0, ms), seq: this.seq++, callback };
    this.timers.push(timer);
    return () => {
      this.timers = this.timers.filter((t) => t !== timer);
    };
  }

  /** Lässt die Zeit laufen und ruft fällige Zeitgeber der Reihe nach auf. */
  advance(ms: number): void {
    const target = this.time + ms;
    for (;;) {
      const due = this.timers
        .filter((t) => t.due <= target)
        .sort((a, b) => a.due - b.due || a.seq - b.seq)[0];
      if (!due) break;
      this.timers = this.timers.filter((t) => t !== due);
      this.time = due.due;
      due.callback();
    }
    this.time = target;
  }

  pendingTimers(): number {
    return this.timers.length;
  }
}

// ---------- Prozess-Sonde ----------

/** Steuerbare Prozess-Sonde: liefert den Prozessbaum, den der Test gesetzt hat. */
export class FakeProcessProbe implements ProcessProbe {
  processes: ProcessInfo[] = [];
  queries = 0;

  set(processes: ProcessInfo[]): void {
    this.processes = processes;
  }

  snapshot(): Promise<ProcessInfo[]> {
    this.queries++;
    return Promise.resolve(structuredClone(this.processes));
  }
}

// ---------- System ----------

export interface FakeSystemOptions {
  homeDir?: string;
  userName?: string;
  /** Vorhandene Ordner; der Benutzerordner ist immer vorhanden. */
  directories?: string[];
  displays?: DisplayInfo[];
  /** 8.3-Kurzpfade und ihre Langform, z.B. `{ 'C:\\Users\\ANNA~1': 'C:\\Users\\anna.mueller' }`. */
  shortPaths?: Record<string, string>;
}

export const PRIMARY_DISPLAY: DisplayInfo = {
  bounds: { x: 0, y: 0, width: 1920, height: 1080 },
  workArea: { x: 0, y: 0, width: 1920, height: 1040 },
  primary: true,
};

/** Nachgemachtes System mit einer Liste vorhandener Ordner (Windows-Pfade, ohne Gross/klein). */
export class FakeSystem implements HostSystem {
  private readonly home: string;
  private readonly user: string;
  private readonly dirs = new Set<string>();
  private screens: DisplayInfo[];
  private readonly shortPaths: Record<string, string>;

  constructor(options: FakeSystemOptions = {}) {
    this.home = options.homeDir ?? 'C:\\Users\\tester';
    this.user = options.userName ?? 'tester';
    this.screens = options.displays ?? [PRIMARY_DISPLAY];
    this.shortPaths = options.shortPaths ?? {};
    this.addDirectory(this.home);
    for (const dir of options.directories ?? []) this.addDirectory(dir);
  }

  addDirectory(dir: string): void {
    this.dirs.add(dirKey(dir));
  }

  removeDirectory(dir: string): void {
    this.dirs.delete(dirKey(dir));
  }

  setDisplays(displays: DisplayInfo[]): void {
    this.screens = displays;
  }

  directoryExists(dir: string): boolean {
    return this.dirs.has(dirKey(dir));
  }

  homeDir(): string {
    return this.home;
  }

  userName(): string {
    return this.user;
  }

  displays(): DisplayInfo[] {
    return structuredClone(this.screens);
  }

  /** Ersetzt einen bekannten Kurzpfad am Anfang durch seine Langform, wie GetLongPathName. */
  longPath(path: string): string {
    for (const [short, long] of Object.entries(this.shortPaths)) {
      const key = dirKey(short);
      const candidate = dirKey(path);
      if (candidate === key || candidate.startsWith(`${key}\\`)) return long + path.slice(short.length);
    }
    return path;
  }
}

function dirKey(dir: string): string {
  return dir.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase();
}
