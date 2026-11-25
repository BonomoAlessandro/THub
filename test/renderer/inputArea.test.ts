import { Terminal } from '@xterm/xterm';
import { describe, expect, it } from 'vitest';
import { findInput, isRuleLine, type InputRows, type TerminalLine, type TerminalScreen } from '../../src/renderer/terminal/inputArea';
import { fullscreenClaude, inlineClaude } from '../support/claudeScreens';

// Anfang der Eingabe im sichtbaren Ausschnitt (Ticket 32): umbrochene Shell-Zeilen und Claudes Linie über dem
// Eingabefeld; dazu die geschützten Zeilen darunter (Ticket 35). Reine Rechnung; dazu dieselbe Rechnung auf dem Puffer
// eines echten xterm.js (ohne Bildschirm).

const COLS = 80;
const ROWS = 30;
const RULE = '─'.repeat(COLS);

/** Ein Ausschnitt aus Zeilen; eine Zeile mit `↪` vorn hat xterm.js umbrochen (`isWrapped`). */
function screen(rows: string[], cursorRow: number, cols = COLS): TerminalScreen & { asked: number[] } {
  return screenOf(
    rows.map((row) => (row.startsWith('↪') ? { text: row.slice(1), isWrapped: true } : { text: row, isWrapped: false })),
    cursorRow,
    cols,
  );
}

function screenOf(given: TerminalLine[], cursorRow: number, cols = COLS, rows = ROWS): TerminalScreen & { asked: number[] } {
  const lines = [...given];
  while (lines.length < rows) lines.push({ text: '', isWrapped: false });
  const asked: number[] = [];
  return {
    cursorRow,
    rows: lines.length,
    cols,
    lineAt: (row) => {
      asked.push(row);
      return lines[row];
    },
    asked,
  };
}

/** Erwartete Eingabe; ohne `end` endet der geschützte Bereich an der Cursorzeile. */
function input(start: number, cursor: number, { rule = false, end = cursor } = {}): InputRows {
  return { startRow: start, startIsRule: rule, cursorRow: cursor, endRow: end };
}

/** Claudes Ende des Bildschirms: Antwort, Linie, Eingabe über drei Zeilen, Linie, Modus. */
function claudeScreen(top = 18): string[] {
  const rows: string[] = Array.from({ length: top }, (_, i) => (i % 3 === 0 ? `● Antwort Zeile ${i}` : ''));
  rows.push(RULE, '> Bitte prüfe die Lage der Hinweise über', '  der Eingabe, auch wenn der Text über', '  mehrere Zeilen geht', RULE, '  ⏵⏵ accept edits on');
  return rows;
}

describe('Anfang der Eingabe', () => {
  it('lange Shell-Zeile über drei Zeilen (umbrochen) → erste der drei', () => {
    const rows = ['Microsoft Windows', '', 'C:\\Temp>dir', ' Datenträger …', '', 'C:\\Temp>echo aaaaaaaa', '↪aaaaaaaaaaaa', '↪aaaa'];
    expect(findInput(screen(rows, 7))).toEqual(input(5, 7));
  });

  it('Claude-Eingabe über drei Zeilen unter einer Linie aus ─ → die Linie', () => {
    const rows = claudeScreen();
    // Linie in Zeile 18, Eingabe 19 bis 21, Cursor am Ende der Eingabe; darunter Linie und Modus bis Zeile 23.
    expect(findInput(screen(rows, 21))).toEqual(input(18, 21, { rule: true, end: 23 }));
    // Steht der Cursor mitten in der Eingabe, gilt dieselbe Linie.
    expect(findInput(screen(rows, 19))).toEqual(input(18, 19, { rule: true, end: 23 }));
  });

  it('alter Rahmen ╭──╮ → dessen obere Zeile', () => {
    const rows = ['● Fertig.', '', `╭${'─'.repeat(COLS - 2)}╮`, `│ > Noch eine Frage${' '.repeat(COLS - 20)}│`, `╰${'─'.repeat(COLS - 2)}╯`];
    expect(findInput(screen(rows, 3))).toEqual(input(2, 3, { rule: true, end: 4 }));
  });

  it('Linie weiter weg als die halbe Terminalhöhe → Cursorzeile', () => {
    const rows = [RULE, ...Array.from({ length: 20 }, (_, i) => `Ausgabe ${i}`), 'C:\\Temp>'];
    // Linie in Zeile 0, Cursor in Zeile 21: 21 Zeilen darüber, mehr als 30 / 2.
    expect(findInput(screen(rows, 21))).toEqual(input(21, 21));
    // Genau die halbe Höhe darüber zählt noch.
    const near = [RULE, ...Array.from({ length: 14 }, (_, i) => `Ausgabe ${i}`), 'C:\\Temp>'];
    expect(findInput(screen(near, 15))).toEqual(input(0, 15, { rule: true }));
  });

  it('Linie schmaler als die halbe Breite → Cursorzeile', () => {
    const rows = ['Ausgabe', '─'.repeat(COLS / 2 - 1), '> Eingabe'];
    expect(findInput(screen(rows, 2))).toEqual(input(2, 2));
    const half = ['Ausgabe', '─'.repeat(COLS / 2), '> Eingabe'];
    expect(findInput(screen(half, 2))).toEqual(input(1, 2, { rule: true }));
  });

  it('eine Linie in Claudes Antwort weiter oben zählt nicht, die nächste über dem Cursor gewinnt', () => {
    const rows = ['● Zusammenfassung', RULE, '  Punkt eins', '  Punkt zwei', RULE, '> Eingabe', RULE, '  ? for shortcuts'];
    expect(findInput(screen(rows, 5))).toEqual(input(4, 5, { rule: true, end: 7 }));
  });

  it('ohne Linie und ohne Umbruch → Cursorzeile', () => {
    const rows = ['C:\\Temp>dir', ' Verzeichnis von C:\\Temp', '', 'C:\\Temp>'];
    expect(findInput(screen(rows, 3))).toEqual(input(3, 3));
  });

  it('Zeilen mit Text neben Rahmenzeichen sind keine Linie (etwa die Ausgabe von tree)', () => {
    const rows = ['├── src', '│   └── main.ts', `── Titel ${'─'.repeat(COLS - 10)}`, '> Eingabe'];
    expect(findInput(screen(rows, 3))).toEqual(input(3, 3));
  });

  it('der höhere Anfang gilt, wenn umbrochene Zeilen über die Linie reichen', () => {
    // Ein langer Befehl, dessen Fortsetzung zufällig nur aus ─ besteht; der Anfang ist dann keine Linie.
    const rows = ['C:\\Temp>echo x', `↪${RULE}`, '↪yyy'];
    expect(findInput(screen(rows, 2))).toEqual(input(0, 2));
  });

  it('Cursor nicht im Bild (im Verlauf nach oben gescrollt) → keine Eingabe', () => {
    expect(findInput(screen(['a', 'b'], ROWS))).toBeNull();
    expect(findInput(screen(['a', 'b'], ROWS + 12))).toBeNull();
    expect(findInput(screen(['a', 'b'], -1))).toBeNull();
  });

  it('fragt über dem Cursor höchstens die halbe Höhe ab, darunter nur bis zur letzten nicht leeren Zeile', () => {
    const empty = screen(['C:\\Temp>'], 25);
    findInput(empty);
    expect(Math.min(...empty.asked)).toBe(25 - ROWS / 2);
    expect(empty.asked.filter((row) => row > 25)).toEqual([29, 28, 27, 26]);

    const rows: string[] = [];
    rows[25] = 'C:\\Temp>';
    rows[28] = '> Vorschlag';
    const filled = screen(Array.from(rows, (row) => row ?? ''), 25);
    findInput(filled);
    expect(filled.asked.filter((row) => row > 25)).toEqual([29, 28]);
  });

  it('Linie aus Rahmenzeichen: nur Zeichen des Blocks „Box Drawing“, Leerzeichen zählen nicht', () => {
    expect(isRuleLine('─'.repeat(40), 80)).toBe(true);
    expect(isRuleLine(` ${'━'.repeat(20)} ${'═'.repeat(20)} `, 80)).toBe(true);
    expect(isRuleLine('-'.repeat(80), 80)).toBe(false);
    expect(isRuleLine('', 80)).toBe(false);
    expect(isRuleLine('    ', 80)).toBe(false);
    expect(isRuleLine(`${'─'.repeat(60)}x`, 80)).toBe(false);
  });
});

describe('Zeilen unter der Eingabe (Ticket 35)', () => {
  it('Claude im Vollbild: untere Linie, Statuszeile mit fünf Zeilen und Modus bis zur letzten Zeile bleiben geschützt', () => {
    const claude = fullscreenClaude({ rows: ROWS, cols: COLS, status: 5 });
    // Linie, Eingabe, Linie, fünf Zeilen Statuszeile, Modus: die Linie steht neun Zeilen über dem unteren Rand.
    expect(claude.ruleRow).toBe(ROWS - 9);

    expect(findInput(screenOf(claude.lines, claude.cursorRow))).toEqual(
      input(claude.ruleRow, claude.cursorRow, { rule: true, end: ROWS - 1 }),
    );
  });

  it('Claude ohne Vollbild: geschützt bis zum Modus, die leeren Zeilen darunter sind frei', () => {
    const claude = inlineClaude({ rows: ROWS, cols: COLS, status: 3, ruleRow: 10 });

    expect(findInput(screenOf(claude.lines, claude.cursorRow))).toEqual(input(10, 11, { rule: true, end: 16 }));
  });

  it('Zeilen nur aus Leerzeichen (Reste von Claudes Neuzeichnen) zählen als leer', () => {
    const rows = ['C:\\Temp>', ' '.repeat(40), '', ' '.repeat(COLS)];
    expect(findInput(screen(rows, 0))).toEqual(input(0, 0));
  });

  it('Shell mit leeren Zeilen unter dem Prompt → nur die Prompt-Zeile', () => {
    const rows = ['Microsoft Windows', '', 'C:\\Temp>'];
    expect(findInput(screen(rows, 2))).toEqual(input(2, 2));
  });

  it('Vorschlagsliste unter dem Prompt (PowerShell) → geschützt bis zu ihrer letzten Zeile', () => {
    const rows = ['PS C:\\Temp> git sta', '> git status                                  [History]', '> git stash list                              [History]', '', ''];
    expect(findInput(screen(rows, 0))).toEqual(input(0, 0, { end: 2 }));
  });
});

describe('Anfang der Eingabe auf dem Puffer von xterm.js', () => {
  function write(term: Terminal, data: string): Promise<void> {
    return new Promise((resolve) => term.write(data, resolve));
  }

  /** Der sichtbare Ausschnitt so, wie die Ansicht ihn liefert. */
  function visible(term: Terminal): TerminalScreen {
    const buffer = term.buffer.active;
    return {
      cursorRow: buffer.baseY + buffer.cursorY - buffer.viewportY,
      rows: term.rows,
      cols: term.cols,
      lineAt: (row) => {
        const line = buffer.getLine(buffer.viewportY + row);
        return line && { text: line.translateToString(true), isWrapped: line.isWrapped };
      },
    };
  }

  it('ein langer Befehl am unteren Rand: umbrochen und hochgescrollt, Anfang ist seine erste Zeile', async () => {
    const term = new Terminal({ cols: 40, rows: 10, allowProposedApi: true });
    for (let i = 0; i < 12; i++) await write(term, `Zeile ${i}\r\n`);
    await write(term, `C:\\Temp>echo ${'x'.repeat(80)}`);

    // 93 Zeichen auf 40 Spalten: drei Zeilen, die letzte mit dem Cursor ganz unten.
    expect(findInput(visible(term))).toEqual(input(7, 9));
  });

  it('Claude zeichnet mit Cursor-Bewegungen; die Linie über dem Eingabefeld ist der Anfang', async () => {
    const term = new Terminal({ cols: 40, rows: 12, allowProposedApi: true });
    const rule = '─'.repeat(40);
    // Wie Ink: Zeilen absolut setzen, danach den Cursor an die Eingabe (Zeile 9, Spalte 12; 1-basiert).
    await write(term, `\x1b[6;1H● Antwort\x1b[8;1H${rule}\x1b[9;1H> Hallo Welt\x1b[10;1H${rule}\x1b[11;1H  ? for shortcuts`);
    await write(term, '\x1b[9;12H');

    expect(findInput(visible(term))).toEqual(input(7, 8, { rule: true, end: 10 }));
  });

  it('Claude im Vollbild schrumpft die Statuszeile: Reste aus Leerzeichen bleiben stehen und zählen nicht', async () => {
    const term = new Terminal({ cols: 40, rows: 12, allowProposedApi: true });
    const rule = '─'.repeat(40);
    // Alternativer Bildschirm; erst vier Zeilen Statuszeile, dann zwei. Claude überschreibt Altes mit Leerzeichen.
    await write(term, `\x1b[?1049h\x1b[4;1H${rule}\x1b[5;1H> \x1b[6;1H${rule}\x1b[7;1HStatus\x1b[8;1HBalken 1\x1b[9;1HBalken 2\x1b[10;1HBalken 3\x1b[11;1H  ⏵⏵ auto mode on\x1b[5;3H`);
    expect(findInput(visible(term))).toEqual(input(3, 4, { rule: true, end: 10 }));

    const blank = ' '.repeat(40);
    await write(term, `\x1b[4;1H${blank}\x1b[5;1H${blank}\x1b[6;1H${rule}\x1b[7;1H> \x1b[K\x1b[8;1H${rule}\x1b[9;1HStatus\x1b[K\x1b[10;1HBalken 1\x1b[K\x1b[11;1H  ⏵⏵ auto mode on\x1b[K\x1b[7;3H`);
    expect(findInput(visible(term))).toEqual(input(5, 6, { rule: true, end: 10 }));
  });

  it('nach oben gescrollt ist der Cursor nicht im Bild', async () => {
    const term = new Terminal({ cols: 40, rows: 10, scrollback: 100, allowProposedApi: true });
    for (let i = 0; i < 40; i++) await write(term, `Zeile ${i}\r\n`);
    term.scrollLines(-15);

    expect(findInput(visible(term))).toBeNull();
  });
});
