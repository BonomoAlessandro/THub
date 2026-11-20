// Wie sich ConPTY beim Start einer Shell meldet, bevor die Shell selbst etwas ausgibt. Aufgezeichnet mit node-pty 1.1.0
// unter Windows 11 (Ticket 24).

/** Die ConPTY von Windows: sichtbaren Bereich leeren, Cursor nach oben links. */
export const SYSTEM_CONPTY_START = '\x1b[?9001h\x1b[?1004h\x1b[?25l\x1b[2J\x1b[m\x1b[H\x1b[?25h';

/**
 * Die mitgelieferte ConPTY (`OpenConsole.exe`, wie im Windows Terminal): Abfragen und Modi, aber weder Leeren noch
 * Cursor nach oben links. Sie zeichnet trotzdem ab der ersten Zeile des sichtbaren Bereichs und setzt den Cursor danach
 * auch absolut.
 */
export const BUNDLED_CONPTY_START = '\x1b[1t\x1b[c\x1b[?1004h\x1b[?9001h';

/** Beide Varianten für `describe.each`: Name und Startsequenz. */
export const CONPTY_STARTS: [string, string][] = [
  ['ConPTY von Windows', SYSTEM_CONPTY_START],
  ['mitgelieferte ConPTY', BUNDLED_CONPTY_START],
];
