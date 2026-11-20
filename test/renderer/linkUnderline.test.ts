import { Terminal, type IBufferCell } from '@xterm/xterm';
import { describe, expect, it } from 'vitest';
import { removeLinkUnderline } from '../../src/renderer/terminal/linkUnderline';

// Links ohne gestrichelte Linie, mit einem echten xterm.js (ohne Bildschirm). Geprüft wird, was der DOM-Renderer von
// xterm.js für die Unterstreichung liest: `isUnderline()` und den Stil der erweiterten Attribute. Daraus macht er die
// Klasse `xterm-underline-<Stil>` (DomRendererRowFactory); 5 ist gestrichelt.

/** Eine Zelle, wie der DOM-Renderer sie sieht. */
type RenderedCell = IBufferCell & { extended: { underlineStyle: number; urlId: number } };

/** Ein Terminal wie in der Ansicht eines Tabs: mit entfernter Link-Linie. */
function createTerminal(): Terminal {
  const term = new Terminal({ cols: 80, rows: 5, allowProposedApi: true });
  expect(removeLinkUnderline(term)).toBe(true);
  return term;
}

function write(term: Terminal, data: string): Promise<void> {
  return new Promise((resolve) => term.write(data, resolve));
}

function cell(term: Terminal, x: number, y = 0): RenderedCell {
  return term.buffer.active.getLine(y)!.getCell(x) as RenderedCell;
}

/** Die Klasse, die der DOM-Renderer von xterm.js für die Unterstreichung einer Zelle setzt; `null` heisst keine Linie. */
function underlineClass(c: RenderedCell): string | null {
  return c.isUnderline() ? `xterm-underline-${c.extended.underlineStyle}` : null;
}

/** OSC 8: ein Link mit Adresse `uri` und sichtbarem Text `text`, so wie Claude ihn ausgibt. */
function link(uri: string, text: string): string {
  return `\x1b]8;;${uri}\x07${text}\x1b]8;;\x07`;
}

describe('Links ohne gestrichelte Linie', () => {
  it('zeichnet unter einem OSC-8-Link keine Linie; xterm.js erkennt den Link weiter', async () => {
    const term = createTerminal();
    await write(term, link('http://localhost:3100/#/search-input', 'http://localhost:3100/#/search-input'));

    for (const x of [0, 10, 35]) {
      expect(underlineClass(cell(term, x))).toBeNull();
      // Daran erkennt xterm.js den Link (Hand-Zeiger und Linie beim Überfahren, Ctrl+Klick).
      expect(cell(term, x).extended.urlId).toBeGreaterThan(0);
    }
  });

  it('gilt auch für Links mit anderem Text und anderem Protokoll, etwa Dateipfade', async () => {
    const term = createTerminal();
    await write(term, `${link('file:///C:/proj/src/main.ts', 'src/main.ts')} ${link('https://example.com', 'Doku')}`);

    expect(underlineClass(cell(term, 0))).toBeNull();
    expect(underlineClass(cell(term, 12))).toBeNull();
  });

  it('lässt eine ausdrücklich verlangte Unterstreichung stehen, auch gestrichelt und in einem Link', async () => {
    const term = createTerminal();
    await write(term, '\x1b[4:5mgestrichelt\x1b[0m');
    await write(term, `\r\n\x1b[4:5m${link('https://a.example', 'Link')}\x1b[0m`);
    await write(term, `\r\n\x1b[4m${link('https://b.example', 'Link')}\x1b[0m`);
    await write(term, `\r\n\x1b[4:3m${link('https://c.example', 'Link')}\x1b[0m`);

    expect(underlineClass(cell(term, 0, 0))).toBe('xterm-underline-5');
    expect(underlineClass(cell(term, 0, 1))).toBe('xterm-underline-5');
    expect(underlineClass(cell(term, 0, 2))).toBe('xterm-underline-1');
    expect(underlineClass(cell(term, 0, 3))).toBe('xterm-underline-3');
  });

  it('nimmt einem Link nach SGR 24 die Linie wieder', async () => {
    const term = createTerminal();
    await write(term, `\x1b[4:5m${link('https://a.example', 'mit')}\x1b[24m${link('https://a.example', 'ohne')}`);

    expect(underlineClass(cell(term, 0))).toBe('xterm-underline-5');
    expect(underlineClass(cell(term, 3))).toBeNull();
  });

  it('wirkt für alle Terminals; ein zweiter Aufruf ändert nichts mehr', async () => {
    const first = createTerminal();
    const second = createTerminal();
    expect(removeLinkUnderline(first)).toBe(true);
    expect(removeLinkUnderline(second)).toBe(true);

    for (const term of [first, second]) {
      await write(term, `${link('https://a.example', 'Link')} \x1b[4:5m${link('https://a.example', 'Link')}\x1b[0m`);
      expect(underlineClass(cell(term, 0))).toBeNull();
      expect(underlineClass(cell(term, 5))).toBe('xterm-underline-5');
      expect(cell(term, 0).extended.urlId).toBeGreaterThan(0);
    }
  });
});
