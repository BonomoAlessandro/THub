import * as pty from 'node-pty';
import { shellEnv } from './shellEnv';
import { shellLaunch } from './shellLaunch';
import type { StartOrder, TerminalBackend, TerminalListener } from './workspace/ports';

export interface PtyManagerOptions {
  /** Ordner mit den Integrationsdateien (`resources/shell`), siehe `shellIntegrationDir`. */
  shellDir: string;
  /**
   * Grundumgebung jeder Shell, zu der der Startauftrag seine Variablen ergänzt. Standard: die eigene,
   * bereinigte Umgebung (`shellEnv`). Die Shell-Integrationstests setzen sie ausdrücklich.
   */
  baseEnv?: () => Record<string, string>;
  /**
   * Ob die Windows-Shells den claude-Ersatz bekommen (THUB_STARTER mit dem Pfad zu `starter.ps1`); wird bei jedem
   * Start einer Shell gefragt. Standard: ja. main.ts gibt das Ergebnis der Execution-Policy-Prüfung hinein
   * (`checkExecutionPolicy`), die beim Start der ersten Shell womöglich noch läuft.
   */
  claudeStarter?: () => boolean;
}

/**
 * Terminal-Backend über node-pty/ConPTY: verwaltet die laufenden Shells, eine pro Tab, und startet jede
 * Windows-Shell mit ihrer Integration (`shellLaunch`).
 */
export class PtyManager implements TerminalBackend {
  private readonly ptys = new Map<string, pty.IPty>();
  private readonly shellDir: string;
  private readonly baseEnv: () => Record<string, string>;
  private readonly claudeStarter: () => boolean;

  constructor(options: PtyManagerOptions) {
    this.shellDir = options.shellDir;
    this.baseEnv = options.baseEnv ?? (() => shellEnv());
    this.claudeStarter = options.claudeStarter ?? (() => true);
  }

  start(tabId: string, order: StartOrder, listener: TerminalListener): number {
    if (this.ptys.has(tabId)) throw new Error(`Für diesen Tab läuft bereits eine Shell: ${tabId}`);

    const launch = shellLaunch(order, { ...this.baseEnv(), ...order.env }, this.shellDir, {
      claudeStarter: this.claudeStarter(),
    });
    const proc = pty.spawn(launch.file, launch.args, {
      name: 'xterm-256color',
      cols: order.cols,
      rows: order.rows,
      cwd: order.cwd,
      env: launch.env,
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
