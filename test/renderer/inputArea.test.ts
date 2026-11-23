import { Terminal } from '@xterm/xterm';
import { describe, expect, it } from 'vitest';
import { findInput, isRuleLine, type TerminalLine, type TerminalScreen } from '../../src/renderer/terminal/inputArea';

// Anfang der Eingabe im sichtbaren Ausschnitt (Ticket 32): umbrochene Shell-Zeilen und Claudes Linie über dem
// Eingabefeld. Reine Rechnung; dazu dieselbe Rechnung auf dem Puffer eines echten xterm.js (ohne Bildschirm).

const COLS = 80;
const ROWS = 30;
const RULE = '─'.repeat(COLS);

/** Ein Ausschnitt aus Zeilen; eine Zeile mit `↪` vorn hat xterm.js umbrochen (`isWrapped`). */
function screen(rows: string[], cursorRow: number, cols = COLS): TerminalScreen & { asked: number[] } {
  const lines: TerminalLine[] = rows.map((row) =>
    row.startsWith('↪') ? { text: row.slice(1), isWrapped: true } : { text: row, isWrapped: false },
  );
  while (lines.length < ROWS) lines.push({ text: '', isWrapped: false });
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

/** Claudes Ende des Bildschirms: Antwort, Linie, Eingabe über drei Zeilen, Linie, Statuszeile. */
function claudeScreen(top = 18): string[] {
  const rows: string[] = Array.from({ length: top }, (_, i) => (i % 3 === 0 ? `● Antwort Zeile ${i}` : ''));
  rows.push(RULE, '> Bitte prüfe die Lage der Hinweise über', '  der Eingabe, auch wenn der Text über', '  mehrere Zeilen geht', RULE, '  ⏵⏵ accept edits on');
  return rows;
}

describe('Anfang der Eingabe', () => {
  it('lange Shell-Zeile über drei Zeilen (umbrochen) → erste der drei', () => {
    const rows = ['Microsoft Windows', '', 'C:\\Temp>dir', ' Datenträger …', '', 'C:\\Temp>echo aaaaaaaa', '↪aaaaaaaaaaaa', '↪aaaa'];
    expect(findInput(screen(rows, 7))).toEqual({ startRow: 5, cursorRow: 7 });
  });

  it('Claude-Eingabe über drei Zeilen unter einer Linie aus ─ → die Linie', () => {
    const rows = claudeScreen();
    // Linie in Zeile 18, Eingabe 19 bis 21, Cursor am Ende der Eingabe.
    expect(findInput(screen(rows, 21))).toEqual({ startRow: 18, cursorRow: 21 });
    // Steht der Cursor mitten in der Eingabe, gilt dieselbe Linie.
    expect(findInput(screen(rows, 19))).toEqual({ startRow: 18, cursorRow: 19 });
  });

  it('alter Rahmen ╭──╮ → dessen obere Zeile', () => {
    const rows = ['● Fertig.', '', `╭${'─'.repeat(COLS - 2)}╮`, `│ > Noch eine Frage${' '.repeat(COLS - 20)}│`, `╰${'─'.repeat(COLS - 2)}╯`];
    expect(findInput(screen(rows, 3))).toEqual({ startRow: 2, cursorRow: 3 });
  });

  it('Linie weiter weg als die halbe Terminalhöhe → Cursorzeile', () => {
    const rows = [RULE, ...Array.from({ length: 20 }, (_, i) => `Ausgabe ${i}`), 'C:\\Temp>'];
    // Linie in Zeile 0, Cursor in Zeile 21: 21 Zeilen darüber, mehr als 30 / 2.
    expect(findInput(screen(rows, 21))).toEqual({ startRow: 21, cursorRow: 21 });
    // Genau die halbe Höhe darüber zählt noch.
    const near = [RULE, ...Array.from({ length: 14 }, (_, i) => `Ausgabe ${i}`), 'C:\\Temp>'];
    expect(findInput(screen(near, 15))).toEqual({ startRow: 0, cursorRow: 15 });
  });

  it('Linie schmaler als die halbe Breite → Cursorzeile', () => {
    const rows = ['Ausgabe', '─'.repeat(COLS / 2 - 1), '> Eingabe'];
    expect(findInput(screen(rows, 2))).toEqual({ startRow: 2, cursorRow: 2 });
    const half = ['Ausgabe', '─'.repeat(COLS / 2), '> Eingabe'];
    expect(findInput(screen(half, 2))).toEqual({ startRow: 1, cursorRow: 2 });
  });

  it('eine Linie in Claudes Antwort weiter oben zählt nicht, die nächste über dem Cursor gewinnt', () => {
    const rows = ['● Zusammenfassung', RULE, '  Punkt eins', '  Punkt zwei', RULE, '> Eingabe', RULE, '  ? for shortcuts'];
    expect(findInput(screen(rows, 5))).toEqual({ startRow: 4, cursorRow: 5 });
  });

  it('ohne Linie und ohne Umbruch → Cursorzeile', () => {
    const rows = ['C:\\Temp>dir', ' Verzeichnis von C:\\Temp', '', 'C:\\Temp>'];
    expect(findInput(screen(rows, 3))).toEqual({ startRow: 3, cursorRow: 3 });
  });

  it('Zeilen mit Text neben Rahmenzeichen sind keine Linie (etwa die Ausgabe von tree)', () => {
    const rows = ['├── src', '│   └── main.ts', `── Titel ${'─'.repeat(COLS - 10)}`, '> Eingabe'];
    expect(findInput(screen(rows, 3))).toEqual({ startRow: 3, cursorRow: 3 });
  });

  it('der höhere Anfang gilt, wenn umbrochene Zeilen über die Linie reichen', () => {
    // Ein langer Befehl, dessen Fortsetzung zufällig nur aus ─ besteht.
    const rows = ['C:\\Temp>echo x', `↪${RULE}`, '↪yyy'];
    expect(findInput(screen(rows, 2))).toEqual({ startRow: 0, cursorRow: 2 });
  });

  it('Cursor nicht im Bild (im Verlauf nach oben gescrollt) → keine Eingabe', () => {
    expect(findInput(screen(['a', 'b'], ROWS))).toBeNull();
    expect(findInput(screen(['a', 'b'], ROWS + 12))).toBeNull();
    expect(findInput(screen(['a', 'b'], -1))).toBeNull();
  });

  it('fragt nur die Zeilen über dem Cursor ab, höchstens die halbe Höhe', () => {
    const s = screen(['C:\\Temp>'], 25);
    findInput(s);
    expect(Math.min(...s.asked)).toBe(25 - ROWS / 2);
    expect(Math.max(...s.asked)).toBe(25);
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
    expect(findInput(visible(term))).toEqual({ startRow: 7, cursorRow: 9 });
  });

  it('Claude zeichnet mit Cursor-Bewegungen; die Linie über dem Eingabefeld ist der Anfang', async () => {
    const term = new Terminal({ cols: 40, rows: 12, allowProposedApi: true });
    const rule = '─'.repeat(40);
    // Wie Ink: Zeilen absolut setzen, danach den Cursor an die Eingabe (Zeile 9, Spalte 12; 1-basiert).
    await write(term, `\x1b[6;1H● Antwort\x1b[8;1H${rule}\x1b[9;1H> Hallo Welt\x1b[10;1H${rule}\x1b[11;1H  ? for shortcuts`);
    await write(term, '\x1b[9;12H');

    expect(findInput(visible(term))).toEqual({ startRow: 7, cursorRow: 8 });
  });

  it('nach oben gescrollt ist der Cursor nicht im Bild', async () => {
    const term = new Terminal({ cols: 40, rows: 10, scrollback: 100, allowProposedApi: true });
    for (let i = 0; i < 40; i++) await write(term, `Zeile ${i}\r\n`);
    term.scrollLines(-15);

    expect(findInput(visible(term))).toBeNull();
  });
});
