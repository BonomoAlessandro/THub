import * as pty from 'node-pty';
import { shellEnv } from './shellEnv';
import { shellLaunch } from './shellLaunch';
import type { ProcessInfo, ProcessProbe, StartOrder, TerminalBackend, TerminalListener } from './workspace/ports';
import { ptyConsoleHost } from './workspace/processRules';

/** So oft fragt das Backend höchstens nach dem Konsolen-Host einer neuen Shell (eine laufende Abfrage kann älter sein). */
const HOST_LOOKUPS = 3;

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
  /**
   * Prozess-Sonde, über die das Backend den Konsolen-Host jeder Shell findet und nach ihrem Ende beendet. Ohne sie
   * bleibt er nach einem `exit` bis zum Ende von THub bestehen (siehe `start`).
   */
  processes?: ProcessProbe;
}

/** Was node-pty 1.1.0 intern hat und hier gebraucht wird; jedes Feld kann in einer anderen Version fehlen. */
interface PtyInternals {
  _agent?: {
    _getConsoleProcessList?: () => Promise<number[]>;
    _conoutSocketWorker?: { dispose?: () => void };
  };
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
  private readonly processes: ProcessProbe | undefined;

  constructor(options: PtyManagerOptions) {
    this.shellDir = options.shellDir;
    this.baseEnv = options.baseEnv ?? (() => shellEnv());
    this.claudeStarter = options.claudeStarter ?? (() => true);
    this.processes = options.processes;
  }

  /**
   * Startet die Shell. Endet sie von selbst (etwa mit `exit`), räumt das Backend hinter node-pty 1.1.0 auf: Es schliesst
   * die Pseudokonsole nur in `kill`, und `kill` taugt nach dem Ende nicht mehr (siehe `skipConsoleListKill`). Ohne
   * Aufräumen blieben pro beendeter Shell ihr `conhost.exe` und ein Worker-Thread bis zum Ende von THub bestehen.
   */
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
    skipConsoleListKill(proc);
    // Sofort, solange die Shell sicher läuft: Nach ihrem Ende lässt sich der Host nicht mehr zuordnen.
    const host = this.findConsoleHost(proc.pid);

    proc.onData((data) => listener.data(data));
    proc.onExit(({ exitCode }) => {
      // Nur entfernen, wenn in der Zwischenzeit nicht schon ein neuer Prozess gestartet wurde. Steht er nicht mehr
      // in der Liste, hat ihn `kill` beendet und dabei die Pseudokonsole geschlossen.
      if (this.ptys.get(tabId) === proc) {
        this.ptys.delete(tabId);
        this.closeEndedPty(proc, host);
      }
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

  /**
   * Der Konsolen-Host der Pseudokonsole einer gerade gestarteten Shell, über die Prozess-Sonde (`ptyConsoleHost`). Eine
   * Abfrage, die schon vor dem Start lief, kennt die Shell noch nicht; dann wird noch einmal gefragt.
   */
  private async findConsoleHost(shellPid: number): Promise<ProcessInfo | undefined> {
    const probe = this.processes;
    if (!probe) return undefined;
    for (let attempt = 0; attempt < HOST_LOOKUPS; attempt++) {
      let snapshot: ProcessInfo[];
      try {
        snapshot = await probe.snapshot();
      } catch {
        return undefined;
      }
      const host = ptyConsoleHost(snapshot, process.pid, shellPid);
      if (host || snapshot.some((p) => p.pid === shellPid)) return host;
    }
    return undefined;
  }

  /** Nach dem Ende einer Shell: ihren Konsolen-Host beenden, sobald er bekannt ist, und den Worker von node-pty. */
  private closeEndedPty(proc: pty.IPty, host: Promise<ProcessInfo | undefined>): void {
    void host.then((found) => {
      if (found) this.processes?.terminate([found]);
    });
    try {
      (proc as unknown as PtyInternals)._agent?._conoutSocketWorker?.dispose?.();
    } catch {
      // Schon aufgeräumt.
    }
  }
}

/**
 * node-pty 1.1.0 beendet bei `kill()` zusätzlich die Prozesse der Pseudokonsole: Ein Hilfsprozess (ein weiteres
 * Electron als Node) soll sie auflisten. Das scheitert, weil ConPTY die Shell bis dahin schon beendet hat; nach
 * 5 Sekunden beendet node-pty dann ersatzweise die Prozess-ID der Shell, die inzwischen an einen anderen Prozess
 * vergeben sein kann. THub beendet die Nachfahren selbst, genau und über den Prozessbaum der Sonde (Ticket 15);
 * deshalb fällt dieser Schritt weg. Das Schliessen der Pseudokonsole bleibt.
 */
function skipConsoleListKill(proc: pty.IPty): void {
  const agent = (proc as unknown as PtyInternals)._agent;
  if (agent && typeof agent._getConsoleProcessList === 'function') agent._getConsoleProcessList = () => Promise.resolve([]);
}
