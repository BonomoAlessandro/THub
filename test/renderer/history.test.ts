import { SerializeAddon } from '@xterm/addon-serialize';
import { Terminal } from '@xterm/xterm';
import { describe, expect, it } from 'vitest';
import { dimmed, HISTORY_LINES, restoredHistory, serializeHistory } from '../../src/renderer/terminal/history';

// Verlauf im Renderer, mit einem echten xterm.js (ohne Bildschirm): serialisieren und ausgegraut
// wiederherstellen.

const COLS = 60;
const ROWS = 10;
/** Donnerstag, 19.11.2026, 08:12 Ortszeit. */
const SAVED_AT = new Date(2026, 10, 19, 8, 12).getTime();
const SEPARATOR_TEXT = 'Wiederhergestellt · Do., 19.11.2026, 08:12';

function createTerminal(): { term: Terminal; serializer: SerializeAddon } {
  const term = new Terminal({ cols: COLS, rows: ROWS, scrollback: 5000, allowProposedApi: true });
  const serializer = new SerializeAddon();
  term.loadAddon(serializer);
  return { term, serializer };
}

function write(term: Terminal, data: string): Promise<void> {
  return new Promise((resolve) => term.write(data, resolve));
}

/** Alle Zeilen des normalen Puffers als Text, ohne Leerzeilen am Ende. */
function lines(term: Terminal): string[] {
  const buffer = term.buffer.normal;
  const all = Array.from({ length: buffer.length }, (_, i) => buffer.getLine(i)!.translateToString(true));
  while (all.length > 0 && all.at(-1) === '') all.pop();
  return all;
}

/** Schreibt den Verlauf wie die Ansicht vor dem Start der Shell in ein frisches Terminal. */
async function restore(content: string): Promise<{ term: Terminal; serializer: SerializeAddon }> {
  const fresh = createTerminal();
  await write(fresh.term, restoredHistory(content, SAVED_AT, COLS, ROWS));
  return fresh;
}

/** So meldet sich ConPTY beim Start einer Shell: sichtbaren Bereich leeren, Cursor nach oben links. */
const CONPTY_START = '\x1b[?25l\x1b[2J\x1b[m\x1b[H\x1b[?25h';

describe('Verlauf im Renderer', () => {
  describe('sichern', () => {
    it('sichert die normale Shell-Ausgabe, nicht den Inhalt eines offenen Vollbildprogramms', async () => {
      const { term, serializer } = createTerminal();
      await write(term, 'PS C:\\> Get-Content log.txt | less\r\n');
      await write(term, '\x1b[?1049h\x1b[HInhalt von less\r\n~\r\n~\r\n(END)');

      const content = serializeHistory(term, serializer);

      expect(content).toContain('PS C:\\> Get-Content log.txt | less');
      expect(content).not.toContain('Inhalt von less');
      expect(content).not.toContain('\x1b[?1049h');
      const { term: restored } = await restore(content);
      expect(restored.buffer.active.type).toBe('normal');
      expect(lines(restored)[0]).toBe('PS C:\\> Get-Content log.txt | less');
    });

    it('sichert höchstens die letzten 1000 Zeilen', async () => {
      const { term, serializer } = createTerminal();
      const output = Array.from({ length: 1500 }, (_, i) => `Zeile ${i + 1}`).join('\r\n');
      await write(term, output);

      const { term: restored } = await restore(serializeHistory(term, serializer));

      const history = lines(restored).slice(0, -1);
      expect(history).toHaveLength(HISTORY_LINES);
      expect(history[0]).toBe('Zeile 501');
      expect(history.at(-1)).toBe('Zeile 1500');
    });

    it('lässt Leerzeilen am Ende weg und liefert für ein leeres Terminal nichts', async () => {
      const { term, serializer } = createTerminal();
      expect(serializeHistory(term, serializer)).toBe('');

      await write(term, 'PS C:\\>\r\n\r\n\r\n');

      expect(serializeHistory(term, serializer)).toBe('PS C:\\>');
    });

    it('behält Farben', async () => {
      const { term, serializer } = createTerminal();
      await write(term, '\x1b[31mFehler\x1b[0m und gut');

      const { term: restored } = await restore(serializeHistory(term, serializer));

      const cell = restored.buffer.normal.getLine(0)!.getCell(0)!;
      expect(cell.getChars()).toBe('F');
      expect(cell.isFgPalette() && cell.getFgColor()).toBe(1);
    });
  });

  describe('wiederherstellen', () => {
    it('graut den ganzen Verlauf aus, auch über Farb-Resets im Inhalt hinweg', async () => {
      const content = [
        'normal \x1b[31mrot\x1b[0m nach Reset',
        '\x1b[1mfett\x1b[m nach kurzem Reset \x1b[2;22mnach 22',
        '\x1b[38;2;10;200;10mgrün\x1b[39m nach Farbende',
      ].join('\r\n');

      const { term } = await restore(content);

      for (let row = 0; row < 3; row++) {
        const line = term.buffer.normal.getLine(row)!;
        for (let col = 0; col < line.length; col++) {
          const cell = line.getCell(col)!;
          if (cell.getChars().trim()) expect(cell.isDim(), `Zeile ${row}, Spalte ${col}`).toBeTruthy();
        }
      }
      const red = term.buffer.normal.getLine(0)!.getCell(7)!;
      expect(red.getChars()).toBe('r');
      expect(red.getFgColor()).toBe(1);
    });

    it('setzt die Trennlinie mit Datum und Uhrzeit darunter', async () => {
      const { term } = await restore('PS C:\\> dir');

      const [history, separator] = lines(term);
      expect(history).toBe('PS C:\\> dir');
      expect(separator).toMatch(new RegExp(`^─+ ${SEPARATOR_TEXT} ─+$`));
      expect(separator.length).toBeLessThan(COLS);
    });

    it('legt Verlauf und Trennlinie ganz in den Scrollback, sodass das Leeren durch ConPTY nichts löscht', async () => {
      const { term } = await restore('PS C:\\> git status\r\nOn branch main');
      expect(term.buffer.normal.baseY).toBe(3);

      await write(term, `${CONPTY_START}PS C:\\> `);

      const [first, second, separator, prompt] = lines(term);
      expect([first, second]).toEqual(['PS C:\\> git status', 'On branch main']);
      expect(separator).toContain(SEPARATOR_TEXT);
      expect(prompt).toBe('PS C:\\> ');
    });

    it('sichert danach den alten Verlauf, die Trennlinie und die neue Ausgabe ohne Leerzeilen dazwischen', async () => {
      const { term, serializer } = await restore('PS C:\\> git status');
      await write(term, `${CONPTY_START}PS C:\\> npm test\r\nalles grün\r\nPS C:\\> `);

      const { term: again } = await restore(serializeHistory(term, serializer));

      expect(lines(again).slice(0, 4)).toEqual([
        'PS C:\\> git status',
        expect.stringContaining(SEPARATOR_TEXT),
        'PS C:\\> npm test',
        'alles grün',
      ]);
    });

    it('setzt „gedämpft“ nach jeder SGR-Sequenz erneut', () => {
      expect(dimmed('a\x1b[0mb\x1b[mc\x1b[22md\x1b[38;5;2me')).toBe(
        '\x1b[2ma\x1b[0;2mb\x1b[0;2mc\x1b[22;2md\x1b[38;5;2;2me\x1b[0m',
      );
    });
  });
});
