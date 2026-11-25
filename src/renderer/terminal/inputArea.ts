/**
 * Wo die Eingabe im sichtbaren Ausschnitt eines Terminals steht (Ticket 32): von ihrem Anfang bis zur Zeile mit dem
 * Cursor, dazu, was darunter frei bleiben muss (Ticket 35). Reine Rechnung ohne DOM und ohne xterm.js; die Ansicht
 * liefert Cursorzeile und Zeilen.
 */

/** Eine Zeile im sichtbaren Ausschnitt, wie xterm.js sie kennt. */
export interface TerminalLine {
  /** Text der Zeile, rechts ohne Leerzeichen. */
  text: string;
  /** xterm.js hat die Zeile umbrochen: Sie setzt die Zeile darüber fort. */
  isWrapped: boolean;
}

/** Der sichtbare Ausschnitt, soweit er für die Eingabe zählt. Zeilen zählen von 0 (oberste sichtbare Zeile). */
export interface TerminalScreen {
  /** Zeile des Cursors im sichtbaren Ausschnitt; ausserhalb von 0 … rows-1, wenn er nicht im Bild ist. */
  cursorRow: number;
  rows: number;
  cols: number;
  /**
   * Liefert eine sichtbare Zeile. Gefragt wird nur, was es braucht: höchstens die halbe Höhe über dem Cursor und die
   * Zeilen darunter, von unten bis zur ersten nicht leeren.
   */
  lineAt(row: number): TerminalLine | undefined;
}

/** Die Eingabe im sichtbaren Ausschnitt: vom Anfang bis zur Cursorzeile, und was darunter frei bleiben muss. */
export interface InputRows {
  startRow: number;
  /**
   * Der Anfang ist eine Linie aus Rahmenzeichen (Claudes Linie über dem Eingabefeld). Sichtbar beginnt die Eingabe dann
   * erst bei der Linie, die etwa in der Mitte ihrer Zeile steht, nicht am oberen Rand der Zeile (Ticket 35).
   */
  startIsRule: boolean;
  cursorRow: number;
  /**
   * Letzte geschützte Zeile (Ticket 35): die letzte nicht leere Zeile im Bild, mindestens die Cursorzeile. In Claude
   * sind das die untere Linie, die Statuszeile und der Modus, im Modus ohne Vollbild auch die Vorschläge beim Tippen; in
   * PowerShell etwa eine Liste der Vorhersagen.
   */
  endRow: number;
}

/**
 * So weit über der Cursorzeile zählt eine Linie aus Rahmenzeichen noch als Linie über dem Eingabefeld: höchstens die
 * halbe Terminalhöhe. Eine Linie weiter oben gehört zur Ausgabe.
 */
const RULE_REACH = 0.5;

/** Unicode-Block „Box Drawing“ (U+2500 bis U+257F), aus dem Claude seine Linie und Rahmen zeichnet. */
const BOX_DRAWING = /^[─-╿]+$/;

/**
 * Die Eingabe im Bild, oder null, wenn der Cursor nicht im sichtbaren Ausschnitt steht (etwa im Verlauf nach oben
 * gescrollt).
 *
 * Anfang der Eingabe:
 * - Zeilen, die xterm.js umbrochen hat (`isWrapped`), gehören zur Zeile darüber: Der Anfang ist die erste nicht
 *   umbrochene Zeile ab der Cursorzeile aufwärts. Das deckt lange Befehle in einer Shell ab.
 * - Claude umbricht selbst und zeichnet über dem Eingabefeld eine waagrechte Linie. Liegt in höchstens halber
 *   Terminalhöhe über der Cursorzeile eine Zeile nur aus Rahmenzeichen über mindestens die halbe Breite, ist die
 *   nächste solche Zeile der Anfang; die Linie bleibt also frei. Das gilt in jedem Tab.
 * - Der höhere der beiden Anfänge gilt; gibt es keinen, ist es die Cursorzeile.
 *
 * Ende des geschützten Bereichs (Ticket 35): die letzte Zeile im Bild, die nicht leer ist (nur Leerzeichen zählen als
 * leer), aber nie über der Cursorzeile.
 */
export function findInput(screen: TerminalScreen): InputRows | null {
  const { cursorRow, rows, cols, lineAt } = screen;
  if (!(cursorRow >= 0 && cursorRow < rows)) return null;

  let startRow = cursorRow;
  while (startRow > 0 && lineAt(startRow)?.isWrapped) startRow--;

  let startIsRule = false;
  const highest = Math.max(0, cursorRow - Math.floor(rows * RULE_REACH));
  for (let row = cursorRow - 1; row >= highest; row--) {
    const line = lineAt(row);
    if (line && isRuleLine(line.text, cols)) {
      if (row <= startRow) {
        startRow = row;
        startIsRule = true;
      }
      break;
    }
  }

  let endRow = rows - 1;
  while (endRow > cursorRow && !lineAt(endRow)?.text.trim()) endRow--;
  return { startRow, startIsRule, cursorRow, endRow };
}

/**
 * Eine Linie aus Rahmenzeichen: Ohne Leerzeichen besteht die Zeile nur aus Zeichen des Blocks „Box Drawing“ und nimmt
 * mindestens die halbe Breite ein. Trifft Claudes Linie aus `─` ebenso wie die obere Zeile eines Rahmens `╭──╮`.
 */
export function isRuleLine(text: string, cols: number): boolean {
  const chars = text.replace(/ /g, '');
  return chars.length > 0 && chars.length >= cols / 2 && BOX_DRAWING.test(chars);
}
