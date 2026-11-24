import { Terminal } from '@xterm/xterm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clipboardKeyAction, runningShellId } from '../../src/renderer/terminal/clipboardKeys';
import { copySelection, pasteClipboard, type TerminalClipboard } from '../../src/renderer/terminal/mouse';
import type { TerminalView } from '../../src/renderer/terminal/TerminalView';
import type { ShortcutAction } from '../../src/renderer/shortcuts';
import type { ShellOption, TabSnapshot, THubApi } from '../../src/shared/types';

// Ctrl+C und Ctrl+V im Terminal (Ticket 34), mit einem echten xterm.js (ohne Bildschirm): Bracketed Paste und Mausmeldung
// schalten dieselben Bytes ein, die das Programm schickt; was THub einfügt, kommt wie getippt über `onData` heraus, also
// dort, wo es ans Terminal-Backend ginge.
//
// Die Regeln wie im Windows Terminal: Ctrl+C kopiert, wenn THub etwas markiert hat, sonst bricht es im Programm ab.
// Ctrl+V fügt ein, ausser in PowerShell ohne Bracketed Paste: Dort fügt PSReadLine selbst ein und übernimmt mehrzeiligen
// Text als Ganzes, statt jede Zeile auszuführen.

// `commands.ts` liest `window.thub` beim Laden; der Kern ist hier nicht nötig.
vi.stubGlobal('window', { thub: { send: () => undefined } satisfies Partial<THubApi> });
const { runShortcut, takesSharedKey } = await import('../../src/renderer/commands');
const { resolveShortcut } = await import('../../src/renderer/shortcuts');
const { terminalViews } = await import('../../src/renderer/terminal/terminalViews');

/** Claude Code im Vollbild, Mausmodus „full“: Klicks, Ziehen und Bewegung, Meldung im SGR-Format. */
const CLAUDE_MOUSE_FULL = '\x1b[?1000h\x1b[?1002h\x1b[?1003h\x1b[?1006h';
/** Claude Code, Mausmodus „scroll“. */
const CLAUDE_MOUSE_SCROLL = '\x1b[?1000h\x1b[?1006h';
/** So verlangt ein Programm Bracketed Paste (Claude, Git Bash) und schaltet ihn wieder aus. */
const BRACKETED_PASTE_ON = '\x1b[?2004h';
const BRACKETED_PASTE_OFF = '\x1b[?2004l';

const CLIP = 'aus der Zwischenablage';
const MULTILINE = 'zeile 1\rzeile 2\r';

/**
 * Ein Terminal mit einer Markierung von THub, die sich setzen lässt; ein Terminal ohne Bildschirm kann selbst nichts
 * markieren. `sent` sammelt, was ans Programm ginge.
 */
function createTerminal() {
  const term = new Terminal({ cols: 80, rows: 10, allowProposedApi: true });
  // Ohne Bildschirm hat xterm.js kein Eingabefeld; `paste` leert es nach dem Einfügen. Ein Ersatz genügt.
  (term as unknown as { _core: { textarea?: { value: string } } })._core.textarea = { value: '' };
  const sent: string[] = [];
  term.onData((data) => sent.push(data));
  let selected = '';
  const view = {
    // `modes` liefert bei jedem Zugriff den aktuellen Stand.
    get modes() {
      return term.modes;
    },
    paste: (text: string) => term.paste(text),
    hasSelection: () => selected !== '',
    getSelection: () => selected,
    clearSelection: () => {
      selected = '';
    },
    /** Markiert diesen Text, wie mit der Maus. */
    select: (text: string) => {
      selected = text;
    },
  };
  return { term, view, sent };
}

function write(term: Terminal, data: string): Promise<void> {
  return new Promise((resolve) => term.write(data, resolve));
}

/** Zwischenablage im Speicher, wie im Testmodus der App; zählt, wie oft gelesen wurde. */
function memoryClipboard(text: string): TerminalClipboard & { text: string; reads: number } {
  const clipboard = {
    text,
    reads: 0,
    read: () => {
      clipboard.reads++;
      return Promise.resolve(clipboard.text);
    },
    write: (value: string) => {
      clipboard.text = value;
      return Promise.resolve();
    },
  };
  return clipboard;
}

describe('Ctrl+C und Ctrl+V: THub kopiert, fügt ein oder lässt die Taste dem Programm', () => {
  describe('Ctrl+C', () => {
    it('mit Markierung von THub kopiert THub', () => {
      const { view } = createTerminal();
      view.select('markiert');
      expect(clipboardKeyAction('copy', view, 'cmd')).toBe('copy');
    });

    it('ohne Markierung geht es ans Programm (Abbrechen)', () => {
      const { view } = createTerminal();
      expect(clipboardKeyAction('copy', view, 'cmd')).toBe('program');
    });

    it.each([
      ['Claude im Vollbild', CLAUDE_MOUSE_FULL],
      ['Claude, nur Scrollen', CLAUDE_MOUSE_SCROLL],
      ['nur Klicks (1000)', '\x1b[?1000h'],
    ])('bei eingeschalteter Mausmeldung (%s) kopiert THub seine Markierung trotzdem', async (_name, mouseOn) => {
      // Anders als beim Rechtsklick: Eine Markierung von THub entsteht dort nur mit Shift + Ziehen und ist gewollt.
      const { term, view } = createTerminal();
      await write(term, mouseOn);
      expect(term.modes.mouseTrackingMode).not.toBe('none');
      view.select('markiert');

      expect(clipboardKeyAction('copy', view, 'pwsh')).toBe('copy');
    });

    it('bei eingeschalteter Mausmeldung ohne Markierung von THub geht es an Claude, das selbst kopiert oder abbricht', async () => {
      const { term, view } = createTerminal();
      await write(term, CLAUDE_MOUSE_FULL + BRACKETED_PASTE_ON);
      expect(clipboardKeyAction('copy', view, 'pwsh')).toBe('program');
    });

    it.each(['pwsh', 'powershell', 'cmd', 'gitbash', 'wsl:Ubuntu', undefined])(
      'gilt in jeder Shell gleich (%s)',
      (shellId) => {
        const { view } = createTerminal();
        expect(clipboardKeyAction('copy', view, shellId)).toBe('program');
        view.select('markiert');
        expect(clipboardKeyAction('copy', view, shellId)).toBe('copy');
      },
    );
  });

  describe('Ctrl+V', () => {
    it.each([
      ['cmd', 'cmd'],
      ['Git Bash', 'gitbash'],
      ['WSL', 'wsl:Ubuntu'],
      ['eine unbekannte Shell-Kennung', 'fish'],
      ['ohne Shell-Kennung', undefined],
    ])('in %s fügt THub ein', (_name, shellId) => {
      const { view } = createTerminal();
      expect(clipboardKeyAction('paste', view, shellId)).toBe('paste');
    });

    it.each(['pwsh', 'powershell'])('in %s ohne Bracketed Paste geht es an PSReadLine', (shellId) => {
      const { term, view } = createTerminal();
      expect(term.modes.bracketedPasteMode).toBe(false);
      expect(clipboardKeyAction('paste', view, shellId)).toBe('program');
    });

    it.each(['pwsh', 'powershell'])(
      'in %s mit Bracketed Paste (etwa Claude) fügt THub ein, danach wieder PSReadLine',
      async (shellId) => {
        const { term, view } = createTerminal();
        await write(term, CLAUDE_MOUSE_FULL + BRACKETED_PASTE_ON);
        expect(clipboardKeyAction('paste', view, shellId)).toBe('paste');

        await write(term, BRACKETED_PASTE_OFF);
        expect(clipboardKeyAction('paste', view, shellId)).toBe('program');
      },
    );

    it('eine Markierung ändert nichts: Ctrl+V fügt ein bzw. geht an PSReadLine', () => {
      const { view } = createTerminal();
      view.select('markiert');
      expect(clipboardKeyAction('paste', view, 'cmd')).toBe('paste');
      expect(clipboardKeyAction('paste', view, 'pwsh')).toBe('program');
    });
  });

  describe('die Shell, mit der ein Tab läuft', () => {
    const shells = [{ id: 'pwsh' }, { id: 'cmd' }];

    it('ist seine eigene, wenn es sie auf diesem Rechner gibt', () => {
      expect(runningShellId({ shellId: 'cmd' }, shells, 'pwsh')).toBe('cmd');
    });

    it('sonst die Standard-Shell, wie beim Start durch den Kern', () => {
      expect(runningShellId({ shellId: 'gitbash' }, shells, 'pwsh')).toBe('pwsh');
      expect(runningShellId({ shellId: 'powershell' }, shells, 'cmd')).toBe('cmd');
    });
  });
});

describe('Ctrl+C und Ctrl+V in der Oberfläche', () => {
  // So wie `App.tsx` einen Tastendruck verarbeitet: Kürzel aus der Tabelle; Ctrl+C und Ctrl+V nimmt THub nur, wenn es im
  // aktiven Terminal kopiert bzw. einfügt (`takesSharedKey`). Eine Taste, die THub nicht nimmt, fängt die Oberfläche gar
  // nicht erst ab; xterm.js schickt sie dann als Steuerzeichen ans Programm.

  const SHELLS: ShellOption[] = [
    { id: 'pwsh', name: 'PowerShell 7' },
    { id: 'powershell', name: 'Windows PowerShell' },
    { id: 'cmd', name: 'Eingabeaufforderung' },
    { id: 'gitbash', name: 'Git Bash' },
  ];

  /** Ein Terminal je Tab, in `terminalViews` wie in der App; die Zwischenablage im Speicher. */
  function setup(shellId: string, options: { shells?: ShellOption[]; defaultShellId?: string } = {}) {
    const { term, view, sent } = createTerminal();
    const clipboard = memoryClipboard(CLIP);
    const tab: TabSnapshot = {
      id: 't1',
      name: 'Tab',
      shellId,
      shellName: shellId,
      cwd: 'C:\\dev',
      process: 'running',
      kind: 'terminal',
      status: 'idle',
      paused: false,
    };
    const workspace = {
      tabs: [tab],
      activeTabId: tab.id,
      shells: options.shells ?? SHELLS,
      defaultShellId: options.defaultShellId ?? 'pwsh',
    };
    const terminalView = {
      clipboardKey: (key: 'copy' | 'paste', id: string | undefined) => clipboardKeyAction(key, view, id),
      copySelection: () => copySelection(view, clipboard),
      paste: () => pasteClipboard(view, clipboard),
    };
    terminalViews.set(tab.id, terminalView as unknown as TerminalView);

    /** Ein Tastendruck: `THub`, wenn die Oberfläche ihn nimmt, sonst `Programm` (dann schickt xterm.js ihn selbst). */
    function press(combo: string): 'THub' | 'Programm' {
      const parts = combo.split('+');
      const action = resolveShortcut(
        {
          code: parts.at(-1)!,
          key: 'x',
          ctrlKey: parts.includes('Ctrl'),
          shiftKey: parts.includes('Shift'),
          altKey: parts.includes('Alt'),
          metaKey: false,
        },
        (shared: ShortcutAction) => takesSharedKey(shared, workspace),
      );
      if (!action) return 'Programm';
      runShortcut(action, { activeTabId: tab.id, startRename: vi.fn(), openPalette: vi.fn() });
      return 'THub';
    }

    /** Wartet, bis Lesen bzw. Schreiben der Zwischenablage durch ist. */
    const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

    return { term, view, sent, clipboard, workspace, press, settled };
  }

  beforeEach(() => terminalViews.clear());

  describe('in einem cmd-Tab', () => {
    it('Ctrl+C mit Markierung kopiert und hebt sie auf; ans Programm geht nichts. Das nächste Ctrl+C bricht ab', async () => {
      const { view, sent, clipboard, press, settled } = setup('cmd');
      view.select('echo hallo');

      expect(press('Ctrl+KeyC')).toBe('THub');
      await settled();
      expect(clipboard.text).toBe('echo hallo');
      expect(view.hasSelection()).toBe(false);
      expect(sent).toEqual([]);

      expect(press('Ctrl+KeyC')).toBe('Programm');
    });

    it('ein zweites Ctrl+C gleich danach bricht ab, auch wenn die Zwischenablage noch schreibt', () => {
      const { view, clipboard, press } = setup('cmd');
      clipboard.write = () => new Promise<void>(() => undefined);
      view.select('markiert');

      expect(press('Ctrl+KeyC')).toBe('THub');
      expect(press('Ctrl+KeyC')).toBe('Programm');
    });

    it('Ctrl+V fügt die Zwischenablage genau einmal ein', async () => {
      const { sent, press, settled } = setup('cmd');

      expect(press('Ctrl+KeyV')).toBe('THub');
      await settled();
      expect(sent).toEqual([CLIP]);
    });

    it('Ctrl+V fügt mit Bracketed Paste ein, wenn das Programm es verlangt', async () => {
      const { term, sent, press, settled } = setup('cmd');
      await write(term, BRACKETED_PASTE_ON);

      expect(press('Ctrl+KeyV')).toBe('THub');
      await settled();
      expect(sent).toEqual([`\x1b[200~${CLIP}\x1b[201~`]);
    });

    it('Ctrl+Shift+C ohne Markierung bleibt bei THub und schickt nichts', async () => {
      const { sent, press, settled } = setup('cmd');
      expect(press('Ctrl+Shift+KeyC')).toBe('THub');
      await settled();
      expect(sent).toEqual([]);
    });
  });

  describe('in einem PowerShell-Tab', () => {
    it.each(['pwsh', 'powershell'])('%s: Ctrl+V geht an PSReadLine; THub liest die Zwischenablage nicht', async (shellId) => {
      const { sent, clipboard, press, settled } = setup(shellId);

      expect(press('Ctrl+KeyV')).toBe('Programm');
      await settled();
      expect(sent).toEqual([]);
      expect(clipboard.reads).toBe(0);
    });

    it('läuft Claude (Bracketed Paste), fügt THub mehrzeiligen Text in einem Stück ein', async () => {
      const { term, sent, clipboard, press, settled } = setup('pwsh');
      clipboard.text = MULTILINE;
      await write(term, CLAUDE_MOUSE_FULL + BRACKETED_PASTE_ON);

      expect(press('Ctrl+KeyV')).toBe('THub');
      await settled();
      expect(sent).toEqual([`\x1b[200~${MULTILINE}\x1b[201~`]);
    });

    it('Ctrl+Shift+V fügt weiter über THub ein', async () => {
      const { sent, press, settled } = setup('pwsh');

      expect(press('Ctrl+Shift+KeyV')).toBe('THub');
      await settled();
      expect(sent).toEqual([CLIP]);
    });

    it('Ctrl+C mit Markierung kopiert, ohne bricht es ab', async () => {
      const { view, clipboard, press, settled } = setup('pwsh');
      expect(press('Ctrl+KeyC')).toBe('Programm');

      view.select('Get-ChildItem');
      expect(press('Ctrl+KeyC')).toBe('THub');
      await settled();
      expect(clipboard.text).toBe('Get-ChildItem');
    });

    it('fehlt PowerShell auf diesem Rechner, läuft der Tab mit der Standard-Shell, und dort fügt THub ein', async () => {
      const { sent, press, settled } = setup('pwsh', { shells: [{ id: 'cmd', name: 'cmd' }], defaultShellId: 'cmd' });

      expect(press('Ctrl+KeyV')).toBe('THub');
      await settled();
      expect(sent).toEqual([CLIP]);
    });
  });

  it('ohne Terminal (etwa ein pausierter Claude-Tab) nimmt THub weder Ctrl+C noch Ctrl+V', () => {
    const { press } = setup('cmd');
    terminalViews.clear();
    expect(press('Ctrl+KeyC')).toBe('Programm');
    expect(press('Ctrl+KeyV')).toBe('Programm');
  });
});
