import * as pty from 'node-pty';

export interface PtyEvents {
  onData(id: string, data: string): void;
  onExit(id: string, exitCode: number): void;
}

export interface PtyStartOptions {
  shell: string;
  cwd: string;
  cols: number;
  rows: number;
}

/** Verwaltet die laufenden Shell-Prozesse, eine pro Session-ID. */
export class PtyManager {
  private readonly ptys = new Map<string, pty.IPty>();

  constructor(private readonly events: PtyEvents) {}

  isRunning(id: string): boolean {
    return this.ptys.has(id);
  }

  start(id: string, opts: PtyStartOptions): void {
    if (this.ptys.has(id)) return;

    const proc = pty.spawn(opts.shell, [], {
      name: 'xterm-256color',
      cols: opts.cols,
      rows: opts.rows,
      cwd: opts.cwd,
      env: shellEnv(),
      useConpty: true,
    });

    proc.onData((data) => this.events.onData(id, data));
    proc.onExit(({ exitCode }) => {
      // Nur entfernen, wenn in der Zwischenzeit nicht schon ein neuer Prozess gestartet wurde.
      if (this.ptys.get(id) === proc) this.ptys.delete(id);
      this.events.onExit(id, exitCode);
    });

    this.ptys.set(id, proc);
  }

  write(id: string, data: string): void {
    this.ptys.get(id)?.write(data);
  }

  resize(id: string, cols: number, rows: number): void {
    if (cols < 1 || rows < 1) return;
    try {
      this.ptys.get(id)?.resize(cols, rows);
    } catch {
      // Resize auf einen gerade beendeten Prozess ist harmlos.
    }
  }

  kill(id: string): void {
    const proc = this.ptys.get(id);
    if (!proc) return;
    this.ptys.delete(id);
    try {
      proc.kill();
    } catch {
      // Prozess war schon weg.
    }
  }

  /**
   * Beendet alle Shells und wartet, bis sie sich abgemeldet haben (höchstens `timeoutMs`).
   * Beendet sich die App, während ConPTY noch abbaut, stürzt Electron sporadisch ab.
   */
  killAll(timeoutMs: number): Promise<void> {
    const procs = [...this.ptys.values()];
    this.ptys.clear();
    const exited = procs.map(
      (proc) =>
        new Promise<void>((resolve) => {
          proc.onExit(() => resolve());
          try {
            proc.kill();
          } catch {
            resolve();
          }
        }),
    );
    const timeout = new Promise<void>((resolve) => setTimeout(resolve, timeoutMs));
    return Promise.race([Promise.all(exited).then(() => undefined), timeout]);
  }
}

/** Umgebung für die Shell: die eigene, ohne npm-/Electron-Interna aus dem Dev-Start. */
function shellEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    if (/^(npm_|ELECTRON_)/i.test(key)) continue;
    env[key] = value;
  }
  return env;
}
