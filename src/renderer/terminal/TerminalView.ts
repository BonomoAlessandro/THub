import { FitAddon } from '@xterm/addon-fit';
import { SerializeAddon } from '@xterm/addon-serialize';
import { Terminal } from '@xterm/xterm';
import { cssVar, terminalTheme } from '../theme';
import { noticeBeforeStart, restoredHistory, serializeHistory } from './history';

const api = window.thub;

/**
 * Ein xterm.js-Terminal, gekoppelt an die Shell eines Tabs. Die Shell startet der Kern.
 * Das Host-Element gehört der React-Komponente; die Ansicht wird darin geöffnet.
 */
export class TerminalView {
  private readonly term: Terminal;
  private readonly fitAddon = new FitAddon();
  private readonly serializeAddon = new SerializeAddon();
  private exited = false;

  constructor(
    readonly tabId: string,
    private readonly host: HTMLElement,
    fontSize: number,
  ) {
    this.term = new Terminal({
      fontFamily: cssVar('--font-mono'),
      fontSize,
      cursorBlink: true,
      scrollback: 5000,
      windowsPty: { backend: 'conpty' },
      theme: terminalTheme(),
    });
    this.term.loadAddon(this.fitAddon);
    this.term.loadAddon(this.serializeAddon);
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

  /**
   * Hinweis des Kerns im Terminal. Kommt er vor dem ersten Start der Shell (`beforeStart`), landet er wie
   * der wiederhergestellte Verlauf direkt über der ersten Zeile der Shell, sonst wird er einfach angehängt.
   */
  notice(level: 'info' | 'error', text: string, beforeStart = false): void {
    const color = level === 'error' ? '31' : '90';
    const line = `\x1b[${color}m${text}\x1b[0m`;
    this.term.write(beforeStart ? noticeBeforeStart(line, this.term.rows) : `\r\n${line}\r\n`);
  }

  /**
   * Schreibt den gesicherten Verlauf ins noch leere Terminal, bevor die Shell etwas ausgibt: ausgegraut,
   * mit Trennlinie und ganz im Scrollback, damit ihn das Leeren durch ConPTY beim Start nicht trifft.
   */
  restoreHistory(content: string, savedAt: number): void {
    this.term.write(restoredHistory(content, savedAt, this.term.cols, this.term.rows));
  }

  /**
   * Der aktuelle Inhalt zum Sichern. Serialisiert wird erst, wenn alle bisher empfangenen Ausgaben
   * verarbeitet sind; xterm.js schreibt verzögert.
   */
  serializeHistory(): Promise<string> {
    return new Promise((resolve) => {
      this.term.write('', () => resolve(serializeHistory(this.term, this.serializeAddon)));
    });
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

  /**
   * Neue Schriftgrösse: Spalten und Zeilen passen sich der Fläche an, und die Shell erfährt die neue
   * Grösse (über `onResize`). Auch verdeckte Ansichten lassen sich messen, sie sind nur unsichtbar.
   */
  setFontSize(size: number): void {
    if (this.term.options.fontSize === size) return;
    this.term.options.fontSize = size;
    this.fit();
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
