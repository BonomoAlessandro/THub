import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import { cssVar, terminalTheme } from '../theme';

const api = window.termhub;

/**
 * Ein xterm.js-Terminal, gekoppelt an die Shell eines Tabs. Die Shell startet der Kern.
 * Das Host-Element gehört der React-Komponente; die Ansicht wird darin geöffnet.
 */
export class TerminalView {
  private readonly term: Terminal;
  private readonly fitAddon = new FitAddon();
  private exited = false;

  constructor(
    readonly tabId: string,
    private readonly host: HTMLElement,
  ) {
    this.term = new Terminal({
      fontFamily: cssVar('--font-mono'),
      fontSize: 14,
      cursorBlink: true,
      scrollback: 5000,
      windowsPty: { backend: 'conpty' },
      theme: terminalTheme(),
    });
    this.term.loadAddon(this.fitAddon);
    this.term.open(host);

    this.term.onData((data) => {
      if (this.exited) {
        api.send({ type: 'restartTab', tabId: this.tabId });
        return;
      }
      api.send({ type: 'writeToTab', tabId: this.tabId, data });
    });
    this.term.onResize(({ cols, rows }) => api.send({ type: 'resizeTab', tabId: this.tabId, cols, rows }));

    // Rechtsklick wie in der Windows-Konsole: mit Auswahl kopieren, sonst einfügen.
    host.addEventListener('contextmenu', this.onContextMenu);
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

  /**
   * Die Ansicht ist gerade sichtbar geworden: Grösse anpassen und Fokus holen. Ein offenes
   * Eingabefeld (etwa beim Umbenennen eines Tabs) behält den Fokus.
   */
  show(): void {
    this.fit();
    if (!(document.activeElement instanceof HTMLInputElement)) this.term.focus();
  }

  focus(): void {
    this.term.focus();
  }

  /** Das Design hat gewechselt: Farbschema neu aus den Design-Variablen übernehmen. */
  updateTheme(): void {
    this.term.options.theme = terminalTheme();
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
    this.host.removeEventListener('contextmenu', this.onContextMenu);
    this.term.dispose();
  }

  private readonly onContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
    if (this.term.hasSelection()) void this.copySelection();
    else void this.paste();
  };
}
