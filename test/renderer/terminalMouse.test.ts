import { Terminal } from '@xterm/xterm';
import { describe, expect, it } from 'vitest';
import {
  linkToOpen,
  rightClick,
  type MouseButtons,
  type MouseTerminal,
  type TerminalClipboard,
} from '../../src/renderer/terminal/mouse';

// Maus im Terminal mit einem echten xterm.js (ohne Bildschirm): Die Mausmeldung schalten dieselben Bytes ein, die das
// Programm schickt; was THub einfügt, kommt wie getippt über `onData` heraus, also dort, wo es zur Shell ginge.
//
// Ursache des doppelten Einfügens (belegt am installierten Claude Code 2.1.329): Claude schaltet im Vollbild die
// Mausmeldung ein und fügt beim Loslassen der rechten Taste selbst ein, wenn nichts markiert ist; das unterlässt es nur in
// Terminals, die sich als xterm.js oder VS Code zu erkennen geben, und xterm.js beantwortet die Frage nach seinem Namen
// (XTVERSION) nicht. THub fügte bei jedem Rechtsklick zusätzlich ein. Fügt THub bei eingeschalteter Mausmeldung nichts
// ein, kommt die Zwischenablage genau einmal an, nämlich von Claude.

/** Claude Code 2.1.329 im Vollbild, Mausmodus „full“: Klicks, Ziehen und Bewegung, Meldung im SGR-Format. */
const CLAUDE_MOUSE_FULL = '\x1b[?1000h\x1b[?1002h\x1b[?1003h\x1b[?1006h';
/** Claude Code 2.1.329, Mausmodus „scroll“. */
const CLAUDE_MOUSE_SCROLL = '\x1b[?1000h\x1b[?1006h';
/** So schaltet Claude die Mausmeldung wieder aus. */
const CLAUDE_MOUSE_OFF = '\x1b[?1006l\x1b[?1003l\x1b[?1002l\x1b[?1000l';

const CLIP = 'aus der Zwischenablage';
const RIGHT = { button: 2, ctrlKey: false, shiftKey: false };
const SHIFT_RIGHT = { ...RIGHT, shiftKey: true };

/** Ein Terminal; `sent` sammelt, was an die Shell bzw. das Programm ginge. */
function createTerminal(): { term: Terminal; sent: string[] } {
  const term = new Terminal({ cols: 80, rows: 10, allowProposedApi: true });
  // Ohne Bildschirm hat xterm.js kein Eingabefeld; `paste` leert es nach dem Einfügen. Ein Ersatz genügt.
  (term as unknown as { _core: { textarea?: { value: string } } })._core.textarea = { value: '' };
  const sent: string[] = [];
  term.onData((data) => sent.push(data));
  return { term, sent };
}

function write(term: Terminal, data: string): Promise<void> {
  return new Promise((resolve) => term.write(data, resolve));
}

/** Zwischenablage im Speicher, wie im Testmodus der App. */
function memoryClipboard(text: string): TerminalClipboard & { text: string } {
  const clipboard = {
    text,
    read: () => Promise.resolve(clipboard.text),
    write: (value: string) => {
      clipboard.text = value;
      return Promise.resolve();
    },
  };
  return clipboard;
}

/** Das Terminal mit einer Auswahl `selected`; ein Terminal ohne Bildschirm kann selbst nichts markieren. */
function withSelection(term: Terminal, selected: string): MouseTerminal & { cleared: boolean } {
  const view = {
    cleared: false,
    modes: term.modes,
    paste: (text: string) => term.paste(text),
    hasSelection: () => !view.cleared,
    getSelection: () => (view.cleared ? '' : selected),
    clearSelection: () => {
      view.cleared = true;
    },
  };
  return view;
}

describe('Rechtsklick ins Terminal', () => {
  describe('ohne Mausmeldung (Shell, Claude ohne Vollbild) wie bisher', () => {
    it('fügt die Zwischenablage genau einmal ein', async () => {
      const { term, sent } = createTerminal();

      expect(await rightClick(term, RIGHT, memoryClipboard(CLIP))).toBe('paste');
      expect(sent).toEqual([CLIP]);
    });

    it('fügt mit Bracketed Paste ein, wenn das Programm es verlangt', async () => {
      const { term, sent } = createTerminal();
      await write(term, '\x1b[?2004h');

      await rightClick(term, RIGHT, memoryClipboard(CLIP));
      expect(sent).toEqual([`\x1b[200~${CLIP}\x1b[201~`]);
    });

    it('kopiert eine Auswahl und hebt sie auf, ohne einzufügen', async () => {
      const { term, sent } = createTerminal();
      const view = withSelection(term, 'markiert');
      const clipboard = memoryClipboard(CLIP);

      expect(await rightClick(view, RIGHT, clipboard)).toBe('copy');
      expect(clipboard.text).toBe('markiert');
      expect(view.cleared).toBe(true);
      expect(sent).toEqual([]);
    });

    it('fügt bei leerer Zwischenablage nichts ein', async () => {
      const { term, sent } = createTerminal();

      await rightClick(term, RIGHT, memoryClipboard(''));
      expect(sent).toEqual([]);
    });
  });

  describe('bei eingeschalteter Mausmeldung gehört er dem Programm', () => {
    it.each([
      ['Claude im Vollbild', CLAUDE_MOUSE_FULL],
      ['Claude, nur Scrollen', CLAUDE_MOUSE_SCROLL],
      ['nur Klicks (1000)', '\x1b[?1000h'],
      ['mit Ziehen (1002)', '\x1b[?1002h'],
      ['jede Bewegung (1003)', '\x1b[?1003h'],
      ['X10 (9)', '\x1b[?9h'],
    ])('%s: THub fügt nicht selbst ein', async (_name, mouseOn) => {
      const { term, sent } = createTerminal();
      await write(term, mouseOn);
      const clipboard = memoryClipboard(CLIP);

      expect(await rightClick(term, RIGHT, clipboard)).toBe('program');
      expect(sent).toEqual([]);
      expect(clipboard.text).toBe(CLIP);
    });

    it('kopiert auch eine Auswahl von THub nicht', async () => {
      const { term } = createTerminal();
      await write(term, CLAUDE_MOUSE_FULL);
      const view = withSelection(term, 'markiert');
      const clipboard = memoryClipboard(CLIP);

      expect(await rightClick(view, RIGHT, clipboard)).toBe('program');
      expect(clipboard.text).toBe(CLIP);
      expect(view.cleared).toBe(false);
    });

    it('mit Shift fügt THub trotzdem genau einmal ein', async () => {
      const { term, sent } = createTerminal();
      await write(term, CLAUDE_MOUSE_FULL + '\x1b[?2004h');

      expect(await rightClick(term, SHIFT_RIGHT, memoryClipboard(CLIP))).toBe('paste');
      expect(sent).toEqual([`\x1b[200~${CLIP}\x1b[201~`]);
    });

    it('mit Shift kopiert THub trotzdem eine Auswahl', async () => {
      const { term, sent } = createTerminal();
      await write(term, CLAUDE_MOUSE_FULL);
      const view = withSelection(term, 'markiert');
      const clipboard = memoryClipboard(CLIP);

      expect(await rightClick(view, SHIFT_RIGHT, clipboard)).toBe('copy');
      expect(clipboard.text).toBe('markiert');
      expect(sent).toEqual([]);
    });

    it('schaltet das Programm sie wieder aus (Claude beendet), fügt THub wieder ein', async () => {
      const { term, sent } = createTerminal();
      await write(term, CLAUDE_MOUSE_FULL);
      await write(term, CLAUDE_MOUSE_OFF);

      expect(await rightClick(term, RIGHT, memoryClipboard(CLIP))).toBe('paste');
      expect(sent).toEqual([CLIP]);
    });
  });
});

describe('Ctrl+Klick auf einen Link', () => {
  const CTRL_CLICK: MouseButtons = { button: 0, ctrlKey: true, shiftKey: false };

  it('öffnet http- und https-Adressen', () => {
    const { term } = createTerminal();

    expect(linkToOpen(term, CTRL_CLICK, 'http://localhost:3100/#/search-input')).toBe(
      'http://localhost:3100/#/search-input',
    );
    expect(linkToOpen(term, CTRL_CLICK, 'https://example.com/a b')).toBe('https://example.com/a%20b');
  });

  it('öffnet ohne Ctrl nichts, auch nicht mit der rechten oder mittleren Taste', () => {
    const { term } = createTerminal();
    const url = 'https://example.com';

    expect(linkToOpen(term, { button: 0, ctrlKey: false, shiftKey: false }, url)).toBeNull();
    expect(linkToOpen(term, { button: 0, ctrlKey: false, shiftKey: true }, url)).toBeNull();
    expect(linkToOpen(term, { button: 2, ctrlKey: true, shiftKey: false }, url)).toBeNull();
    expect(linkToOpen(term, { button: 1, ctrlKey: true, shiftKey: false }, url)).toBeNull();
  });

  it.each([
    'file:///C:/Windows/System32/calc.exe',
    'javascript:alert(1)',
    'data:text/html,<b>x</b>',
    'mailto:a@example.com',
    'ftp://example.com/x',
    'vscode://file/C:/x',
    'ms-settings:display',
    'C:\\Windows\\notepad.exe',
    'kein Link',
    '',
  ])('öffnet %j nicht', (uri) => {
    const { term } = createTerminal();
    expect(linkToOpen(term, CTRL_CLICK, uri)).toBeNull();
  });

  it('öffnet bei eingeschalteter Mausmeldung nichts, ausser mit Shift; Claude öffnet den Link dann selbst', async () => {
    const { term } = createTerminal();
    await write(term, CLAUDE_MOUSE_FULL);
    const url = 'https://example.com/';

    expect(linkToOpen(term, CTRL_CLICK, url)).toBeNull();
    expect(linkToOpen(term, { ...CTRL_CLICK, shiftKey: true }, url)).toBe(url);
  });
});
