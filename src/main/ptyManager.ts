import * as pty from 'node-pty';
import { shellEnv } from './shellEnv';
import type { StartOrder, TerminalBackend, TerminalListener } from './workspace/ports';

/** Terminal-Backend über node-pty/ConPTY: verwaltet die laufenden Shells, eine pro Tab. */
export class PtyManager implements TerminalBackend {
  private readonly ptys = new Map<string, pty.IPty>();

  start(tabId: string, order: StartOrder, listener: TerminalListener): number {
    if (this.ptys.has(tabId)) throw new Error(`Für diesen Tab läuft bereits eine Shell: ${tabId}`);

    // Den Startbefehl (order.startCommand) führt erst die Shell-Integration aus Ticket 07 aus.
    const proc = pty.spawn(order.file, order.args, {
      name: 'xterm-256color',
      cols: order.cols,
      rows: order.rows,
      cwd: order.cwd,
      env: { ...shellEnv(), ...order.env },
      useConpty: true,
    });

    proc.onData((data) => listener.data(data));
    proc.onExit(({ exitCode }) => {
      // Nur entfernen, wenn in der Zwischenzeit nicht schon ein neuer Prozess gestartet wurde.
      if (this.ptys.get(tabId) === proc) this.ptys.delete(tabId);
      listener.exit(exitCode);
    });

    this.ptys.set(tabId, proc);
    return proc.pid;
  }

  write(tabId: string, data: string): void {
    this.ptys.get(tabId)?.write(data);
  }

  resize(tabId: string, cols: number, rows: number): void {
    if (cols < 1 || rows < 1) return;
    try {
      this.ptys.get(tabId)?.resize(cols, rows);
    } catch {
      // Resize auf einen gerade beendeten Prozess ist harmlos.
    }
  }

  kill(tabId: string): void {
    const proc = this.ptys.get(tabId);
    if (!proc) return;
    this.ptys.delete(tabId);
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
