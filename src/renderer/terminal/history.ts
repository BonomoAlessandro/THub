// Verlauf eines Terminals: serialisieren zum Sichern, ausgegraut wiederherstellen nach einem Neustart.
// Ohne DOM, damit es sich mit einem echten xterm.js in Node testen lässt.

import type { SerializeAddon } from '@xterm/addon-serialize';
import type { Terminal } from '@xterm/xterm';

/** So viele Zeilen umfasst der gesicherte Verlauf höchstens. */
export const HISTORY_LINES = 1000;

/** Eine SGR-Sequenz (Farbe, Stil, Reset), z.B. `ESC[0m`, `ESC[38;2;1;2;3m`. */
const SGR = /\x1b\[([0-9;:]*)m/g;

const SAVED_AT = new Intl.DateTimeFormat('de-CH', {
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/**
 * Serialisiert den Inhalt des normalen Puffers: die letzten 1000 Zeilen bis zur letzten mit Inhalt.
 * Der Alternativ-Puffer von Vollbildprogrammen (vim, less) und die Terminal-Modi bleiben aussen vor.
 * Liefert einen leeren Text, wenn das Terminal nichts zeigt.
 */
export function serializeHistory(term: Terminal, serializer: SerializeAddon): string {
  const buffer = term.buffer.normal;
  let last = buffer.length - 1;
  while (last >= 0 && !buffer.getLine(last)?.translateToString(true).trim()) last--;
  if (last < 0) return '';
  return serializer.serialize({
    range: { start: Math.max(0, last - HISTORY_LINES + 1), end: last },
    excludeAltBuffer: true,
    excludeModes: true,
  });
}

/**
 * Bereitet den sichtbaren Bereich auf den Start einer Shell vor: Was darin steht, rutscht in den Scrollback,
 * der Bereich ist leer, und der Cursor steht oben links. Dort beginnt ConPTY: Es zeichnet die Zeilen der Shell
 * ab der ersten Zeile des sichtbaren Bereichs und setzt den Cursor danach auch absolut. Die mitgelieferte
 * ConPTY (Ticket 24) leert den Bereich beim Start nicht selbst; die des Systems tat es (`ESC[2J ESC[H`) und
 * löschte dabei, was noch sichtbar war.
 */
export function startArea(rows: number): string {
  return `${'\r\n'.repeat(rows)}\x1b[H`;
}

/**
 * Was die Ansicht vor dem Start der Shell ins Terminal schreibt: den Verlauf ausgegraut, darunter die
 * Trennlinie, beides im Scrollback (`startArea`); die erste Eingabezeile steht danach direkt unter der
 * Trennlinie.
 * Warum der Verlauf nicht mit `conptyInheritCursor` sichtbar stehen bleibt: docs/spikes/verlauf-sichtbar.md.
 */
export function restoredHistory(content: string, savedAt: number, cols: number, rows: number): string {
  return `${dimmed(content)}\r\n${separator(savedAt, cols)}${startArea(rows)}`;
}

/**
 * Ein Hinweis direkt vor dem ersten Start der Shell, etwa dass die gespeicherte Shell fehlt. Wie der
 * Verlauf kommt er in den Scrollback (`startArea`): direkt unter die Trennlinie (bzw. ganz oben) und über
 * die erste Zeile der Shell. Setzt voraus, dass der sichtbare Bereich noch leer ist: eine frische Ansicht,
 * höchstens mit `restoredHistory` davor.
 */
export function noticeBeforeStart(line: string, rows: number): string {
  return `\x1b[H${line}${startArea(rows)}`;
}

/**
 * Graut Inhalt aus (SGR 2, „gedämpft“). Jede SGR-Sequenz im Inhalt setzt „gedämpft“ danach erneut,
 * damit auch ein Reset wie `ESC[0m` oder `ESC[22m` das Ausgrauen nicht aufhebt.
 */
export function dimmed(content: string): string {
  const redimmed = content.replace(SGR, (_sequence, params: string) => `\x1b[${params || '0'};2m`);
  return `\x1b[2m${redimmed}\x1b[0m`;
}

/** Trennlinie „──── Wiederhergestellt · Do., 19.11.2026, 08:12 ────“ in der gedämpften Farbe. */
export function separator(savedAt: number, cols: number): string {
  const label = ` Wiederhergestellt · ${SAVED_AT.format(new Date(savedAt))} `;
  // Wie im Prototyp 14 Striche je Seite; in schmalen Terminals weniger, damit die Linie nicht umbricht.
  const side = '─'.repeat(Math.max(2, Math.min(14, Math.floor((cols - 1 - label.length) / 2))));
  return `\x1b[0;90m${side}${label}${side}\x1b[0m`;
}
