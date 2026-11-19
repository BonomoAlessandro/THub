import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';

const api = window.termhub;

/** Ein xterm.js-Terminal im DOM, gekoppelt an die Shell eines Tabs. Die Shell startet der Kern. */
export class TerminalView {
  readonly host: HTMLDivElement;
  private readonly term: Terminal;
  private readonly fitAddon = new FitAddon();
  private exited = false;

  constructor(
    readonly tabId: string,
    parent: HTMLElement,
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
      if (this.exited) {
        api.send({ type: 'restartTab', tabId: this.tabId });
        return;
      }
      api.send({ type: 'writeToTab', tabId: this.tabId, data });
    });
    this.term.onResize(({ cols, rows }) => api.send({ type: 'resizeTab', tabId: this.tabId, cols, rows }));

    // Rechtsklick wie in der Windows-Konsole: mit Auswahl kopieren, sonst einfügen.
    this.host.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (this.term.hasSelection()) void this.copySelection();
      else void this.paste();
    });
  }

  /**
   * Meldet dem Kern „Ansicht bereit“ mit der aktuellen Grösse. Eine verdeckte Ansicht meldet ihre
   * beste bekannte Grösse und passt sie beim Anzeigen an.
   */
  reportReady(): void {
    this.fit();
    api.send({ type: 'viewReady', tabId: this.tabId, cols: this.term.cols, rows: this.term.rows });
  }

  /** Beendete Shells startet die nächste Taste über den Kern neu. */
  setExited(exited: boolean): void {
    this.exited = exited;
  }

  write(data: string): void {
    this.term.write(data);
  }

  markExited(exitCode: number): void {
    this.term.write(
      `\r\n\x1b[90m[Prozess beendet mit Code ${exitCode} – beliebige Taste startet die Shell neu]\x1b[0m\r\n`,
    );
  }

  /** Hinweis des Kerns im Terminal. */
  notice(level: 'info' | 'error', text: string): void {
    const color = level === 'error' ? '31' : '90';
    this.term.write(`\r\n\x1b[${color}m${text}\x1b[0m\r\n`);
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
