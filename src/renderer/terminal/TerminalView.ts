import { FitAddon } from '@xterm/addon-fit';
import { SerializeAddon } from '@xterm/addon-serialize';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Terminal } from '@xterm/xterm';
import { cssVar, terminalTheme } from '../theme';
import { noticeBeforeStart, restoredHistory, serializeHistory, startArea } from './history';
import { findInput, type InputRows } from './inputArea';
import { removeLinkUnderline } from './linkUnderline';
import { copySelection, linkToOpen, pasteClipboard, rightClick, type TerminalClipboard } from './mouse';
import { notifyTerminalChange } from './terminalViews';

const api = window.thub;

/** Die Zwischenablage über den Hauptprozess (im Testmodus eine eigene im Speicher). */
const clipboard: TerminalClipboard = {
  read: () => api.readClipboard(),
  write: (text) => api.writeClipboard(text),
};

/** Wo die Eingabe eines Terminals im Fenster steht, in CSS-Pixeln (Ticket 32). */
export interface TerminalInputGeometry {
  /** Oberkante der obersten sichtbaren Zeile, vom oberen Fensterrand. */
  top: number;
  rowHeight: number;
  /** Die Zeilen der Eingabe; null, wenn der Cursor nicht im Bild ist (nach oben gescrollt). */
  input: InputRows | null;
}

/**
 * Ein xterm.js-Terminal, gekoppelt an die Shell eines Tabs. Die Shell startet der Kern.
 * Das Host-Element gehört der React-Komponente; die Ansicht wird darin geöffnet.
 */
export class TerminalView {
  private readonly term: Terminal;
  private readonly fitAddon = new FitAddon();
  private readonly serializeAddon = new SerializeAddon();
  private exited = false;
  /** Seit dem Ende der Shell hat eine Taste den Neustart schon angefordert. */
  private restartRequested = false;
  /** Angeforderte Verläufe, die auf die Verarbeitung der bisherigen Ausgabe warten (`serializeHistory`). */
  private readonly pendingHistory = new Set<() => void>();

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
      // OSC-8-Links (etwa von Claude) öffnet Ctrl+Klick; ersetzt die Rückfrage per window.confirm von xterm.js.
      // Links mit anderen Protokollen als http und https erkennt xterm.js gar nicht erst (allowNonHttpProtocols).
      linkHandler: { activate: this.openLink },
    });
    this.term.loadAddon(this.fitAddon);
    this.term.loadAddon(this.serializeAddon);
    // URLs im Klartext, etwa die Adresse eines Dev-Servers.
    this.term.loadAddon(new WebLinksAddon(this.openLink));
    if (!removeLinkUnderline(this.term)) console.warn('xterm.js: Die gestrichelte Linie unter Links bleibt.');
    this.term.open(host);

    this.term.onData((data) => {
      if (this.exited) {
        // Die neue Shell beginnt oben links in einem leeren Bereich; das Bisherige bleibt im Scrollback. Weitere
        // Tasten bis zum Start schicken nur noch die Anfrage.
        if (!this.restartRequested) this.term.write(startArea(this.term.rows));
        this.restartRequested = true;
        api.send({ type: 'restartTab', tabId: this.tabId });
        return;
      }
      api.send({ type: 'writeToTab', tabId: this.tabId, data });
    });
    this.term.onResize(({ cols, rows }) => {
      api.send({ type: 'resizeTab', tabId: this.tabId, cols, rows });
      this.changed();
    });
    // Die Hinweise weichen der Eingabe aus (Ticket 32): Sie werten deren Lage nach verarbeiteter Ausgabe, nach
    // Bewegungen des Cursors und nach dem Scrollen neu aus.
    this.term.onWriteParsed(this.changed);
    this.term.onCursorMove(this.changed);
    this.term.onScroll(this.changed);

    // Rechtsklick wie in der Windows-Konsole: mit Auswahl kopieren, sonst einfügen. Hat das Programm die Mausmeldung
    // eingeschaltet (Claude), gehört er ihm, ausser mit Shift (`rightClickAction`).
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
    this.restartRequested = false;
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
   * verarbeitet sind; xterm.js schreibt verzögert. Wird die Ansicht vorher geschlossen (der Kern fordert den Verlauf
   * eines Tabs an, den er gerade schliesst), gilt der Inhalt bis dahin.
   */
  serializeHistory(): Promise<string> {
    return new Promise((resolve) => {
      const serialize = (): void => {
        if (!this.pendingHistory.delete(serialize)) return;
        resolve(serializeHistory(this.term, this.serializeAddon));
      };
      this.pendingHistory.add(serialize);
      this.term.write('', serialize);
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
    // Mit der Schrift ändert sich die Zeilenhöhe, auch wenn die Zahl der Zeilen gleich bleibt.
    this.changed();
  }

  /**
   * Wo die Eingabe steht, für die Hinweise (Ticket 32): Cursorzeile im sichtbaren Ausschnitt (Cursor im Puffer abzüglich
   * der Scroll-Position), Anfang der Eingabe (`findInput`), Lage der obersten Zeile und Zeilenhöhe. Alles über die
   * öffentliche Schnittstelle von xterm.js; die Zeilenhöhe ist die Höhe des Terminal-Elements geteilt durch die Zahl der
   * Zeilen. Null, solange das Terminal keine Grösse hat.
   */
  inputGeometry(): TerminalInputGeometry | null {
    const element = this.term.element;
    const { rows, cols } = this.term;
    if (!element || rows <= 0) return null;
    const { top, height } = element.getBoundingClientRect();
    if (height <= 0) return null;
    const buffer = this.term.buffer.active;
    const input = findInput({
      cursorRow: buffer.baseY + buffer.cursorY - buffer.viewportY,
      rows,
      cols,
      lineAt: (row) => {
        const line = buffer.getLine(buffer.viewportY + row);
        return line && { text: line.translateToString(true), isWrapped: line.isWrapped };
      },
    });
    return { top, rowHeight: height / rows, input };
  }

  fit(): void {
    try {
      this.fitAddon.fit();
    } catch {
      // Passiert, wenn der Host (noch) keine Grösse hat.
    }
  }

  copySelection(): Promise<void> {
    return copySelection(this.term, clipboard);
  }

  paste(): Promise<void> {
    return pasteClipboard(this.term, clipboard);
  }

  dispose(): void {
    for (const serialize of [...this.pendingHistory]) serialize();
    this.host.removeEventListener('contextmenu', this.onContextMenu);
    this.term.dispose();
  }

  private readonly changed = (): void => notifyTerminalChange(this.tabId);

  private readonly onContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
    void rightClick(this.term, e, clipboard);
  };

  /**
   * Klick auf einen Link (OSC 8 oder URL im Klartext). xterm.js meldet das Loslassen jeder Maustaste; geöffnet wird nur
   * bei Ctrl mit der linken Taste, nur http und https und nur, wenn der Klick nicht dem Programm gehört (`linkToOpen`).
   */
  private readonly openLink = (event: MouseEvent, uri: string): void => {
    const url = linkToOpen(this.term, event, uri);
    if (url) void api.openLink(url);
  };
}
