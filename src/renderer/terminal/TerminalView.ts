import { FitAddon } from '@xterm/addon-fit';
import { SerializeAddon } from '@xterm/addon-serialize';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Terminal } from '@xterm/xterm';
import { cssVar, terminalTheme } from '../theme';
import { noticeBeforeStart, restoredHistory, serializeHistory } from './history';
import { removeLinkUnderline } from './linkUnderline';
import { copySelection, linkToOpen, pasteClipboard, rightClick, type TerminalClipboard } from './mouse';

const api = window.thub;

/** Die Zwischenablage über den Hauptprozess (im Testmodus eine eigene im Speicher). */
const clipboard: TerminalClipboard = {
  read: () => api.readClipboard(),
  write: (text) => api.writeClipboard(text),
};

/**
 * Ein xterm.js-Terminal, gekoppelt an die Shell eines Tabs. Die Shell startet der Kern.
 * Das Host-Element gehört der React-Komponente; die Ansicht wird darin geöffnet.
 */
export class TerminalView {
  private readonly term: Terminal;
  private readonly fitAddon = new FitAddon();
  private readonly serializeAddon = new SerializeAddon();
  private exited = false;
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
        api.send({ type: 'restartTab', tabId: this.tabId });
        return;
      }
      api.send({ type: 'writeToTab', tabId: this.tabId, data });
    });
    this.term.onResize(({ cols, rows }) => api.send({ type: 'resizeTab', tabId: this.tabId, cols, rows }));

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
