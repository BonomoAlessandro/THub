import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';

const api = window.termhub;

/** Ein xterm.js-Terminal im DOM, gekoppelt an den Shell-Prozess einer Session. */
export class TerminalView {
  readonly host: HTMLDivElement;
  private readonly term: Terminal;
  private readonly fitAddon = new FitAddon();
  private _exited = false;

  constructor(
    readonly id: string,
    parent: HTMLElement,
    private readonly onStatusChange: () => void,
  ) {
    this.host = document.createElement('div');
    this.host.className = 'terminal-host';
    parent.appendChild(this.host);

    this.term = new Terminal({
      fontFamily: "'Cascadia Mono', 'Cascadia Code', Consolas, monospace",
      fontSize: 14,
      cursorBlink: true,
      scrollback: 5000,
      windowsPty: { backend: 'conpty' },
      theme: { background: '#1e1e1e' },
    });
    this.term.loadAddon(this.fitAddon);
    this.term.open(this.host);

    this.term.onData((data) => {
      if (this._exited) {
        void this.start();
        return;
      }
      api.writePty(this.id, data);
    });
    this.term.onResize(({ cols, rows }) => api.resizePty(this.id, cols, rows));

    // Rechtsklick wie in der Windows-Konsole: mit Auswahl kopieren, sonst einfügen.
    this.host.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (this.term.hasSelection()) void this.copySelection();
      else void this.paste();
    });
  }

  get exited(): boolean {
    return this._exited;
  }

  /** Startet (oder startet neu) den Shell-Prozess in der aktuellen Terminalgrösse. */
  async start(): Promise<void> {
    this.fit();
    try {
      await api.startPty(this.id, this.term.cols, this.term.rows);
      this._exited = false;
    } catch (err) {
      this._exited = true;
      this.term.write(`\r\n\x1b[31mShell konnte nicht gestartet werden: ${String(err)}\x1b[0m\r\n`);
    }
    this.onStatusChange();
  }

  write(data: string): void {
    this.term.write(data);
  }

  markExited(exitCode: number): void {
    this._exited = true;
    this.term.write(
      `\r\n\x1b[90m[Prozess beendet mit Code ${exitCode} – beliebige Taste startet die Shell neu]\x1b[0m\r\n`,
    );
    this.onStatusChange();
  }

  setActive(active: boolean): void {
    this.host.classList.toggle('active', active);
    if (active) {
      this.fit();
      this.term.focus();
    }
  }

  focus(): void {
    this.term.focus();
  }

  fit(): void {
    try {
      this.fitAddon.fit();
    } catch {
      // Passiert, wenn der Host (noch) keine Grösse hat.
    }
  }

  async copySelection(): Promise<void> {
    if (!this.term.hasSelection()) return;
    await api.writeClipboard(this.term.getSelection());
    this.term.clearSelection();
  }

  async paste(): Promise<void> {
    const text = await api.readClipboard();
    if (text) this.term.paste(text);
  }

  dispose(): void {
    this.term.dispose();
    this.host.remove();
  }
}
