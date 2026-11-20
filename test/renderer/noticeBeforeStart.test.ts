import { Terminal } from '@xterm/xterm';
import { describe, expect, it } from 'vitest';
import { noticeBeforeStart, restoredHistory } from '../../src/renderer/terminal/history';
import { CONPTY_STARTS } from './conptyStart';

// Ein Hinweis vor dem ersten Start der Shell (etwa: die gespeicherte Shell fehlt), mit einem echten
// xterm.js ohne Bildschirm. Die Shell beginnt oben links im sichtbaren Bereich; der Hinweis darf dabei nicht
// verloren gehen, ob ConPTY den Bereich beim Start leert (System) oder nicht (mitgeliefert).

const COLS = 60;
const ROWS = 8;
const SAVED_AT = new Date(2026, 10, 19, 8, 12).getTime();

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

function freshTerminal(): Terminal {
  return new Terminal({ cols: COLS, rows: ROWS, scrollback: 5000, allowProposedApi: true });
}

describe.each(CONPTY_STARTS)('Hinweis vor dem Start der Shell (%s)', (_name, conptyStart) => {
  it('steht nach dem Start direkt unter der Trennlinie des Verlaufs und über der ersten Zeile der Shell', async () => {
    const term = freshTerminal();
    await write(term, restoredHistory('PS C:\\> dir', SAVED_AT, COLS, ROWS));

    await write(term, noticeBeforeStart('\x1b[90mGit Bash fehlt.\x1b[0m', ROWS));
    await write(term, `${conptyStart}PS C:\\> `);

    expect(lines(term)).toEqual([
      'PS C:\\> dir',
      expect.stringContaining('Wiederhergestellt'),
      'Git Bash fehlt.',
      'PS C:\\> ',
    ]);
  });

  it('steht ohne Verlauf ganz oben, direkt über der ersten Zeile der Shell', async () => {
    const term = freshTerminal();

    await write(term, noticeBeforeStart('Git Bash fehlt.', ROWS));
    await write(term, `${conptyStart}PS C:\\> `);

    expect(lines(term)).toEqual(['Git Bash fehlt.', 'PS C:\\> ']);
  });

  it('bleibt ganz erhalten, wenn er umbricht', async () => {
    const term = freshTerminal();
    const text = 'Ubuntu (WSL) wurde auf diesem Rechner nicht gefunden. Der Tab startet mit der Standard-Shell PowerShell 7.';

    await write(term, noticeBeforeStart(text, ROWS));
    await write(term, `${conptyStart}$ `);

    expect(lines(term)).toEqual([text.slice(0, COLS), text.slice(COLS), '$ ']);
  });
});
