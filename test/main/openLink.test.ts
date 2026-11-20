import { Terminal } from '@xterm/xterm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openWebLink, type LinkOpener } from '../../src/main/openLink';
import { linkToOpen } from '../../src/renderer/terminal/mouse';
import { MAX_LINK_LENGTH } from '../../src/shared/links';

// Links im Standardbrowser öffnen, mit nachgemachtem `shell.openExternal`: Ein echter Browser ginge auf dem Desktop des
// Nutzers auf. Ob der Browser wirklich aufgeht, steht in der Prüfliste „Abnahme von Hand“.

/** `shell.openExternal`, nachgemacht: merkt sich die geöffneten Adressen; mit `error` schlägt jedes Öffnen fehl. */
function fakeOpener(error?: Error): LinkOpener & { opened: string[] } {
  const opened: string[] = [];
  return {
    opened,
    openExternal: (url) => {
      opened.push(url);
      return error ? Promise.reject(error) : Promise.resolve();
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Link im Standardbrowser öffnen', () => {
  it('öffnet eine http- oder https-Adresse genau einmal', async () => {
    const opener = fakeOpener();

    expect(await openWebLink('http://localhost:3100/#/search-input', opener)).toBe(
      'http://localhost:3100/#/search-input',
    );
    expect(await openWebLink('HTTPS://Example.com', opener)).toBe('https://example.com/');

    expect(opener.opened).toEqual(['http://localhost:3100/#/search-input', 'https://example.com/']);
  });

  it.each([
    'file:///C:/Windows/System32/calc.exe',
    'javascript:alert(1)',
    'data:text/html,<b>x</b>',
    'mailto:a@example.com',
    'ftp://example.com/x',
    'ms-settings:display',
    'C:\\Windows\\notepad.exe',
    '\\\\server\\share\\x.exe',
    'kein Link',
    `https://example.com/${'a'.repeat(MAX_LINK_LENGTH)}`,
  ])('öffnet %j nicht und meldet das', async (url) => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const opener = fakeOpener();

    expect(await openWebLink(url, opener)).toBeNull();
    expect(opener.opened).toEqual([]);
    expect(logged).toHaveBeenCalledOnce();
  });

  it('öffnet nichts, was keine Zeichenkette ist', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const opener = fakeOpener();

    for (const value of [undefined, null, 42, { href: 'https://example.com' }, ['https://example.com']]) {
      expect(await openWebLink(value, opener)).toBeNull();
    }
    expect(opener.opened).toEqual([]);
  });

  it('meldet, wenn sich die Adresse nicht öffnen lässt', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const opener = fakeOpener(new Error('kein Browser'));

    expect(await openWebLink('https://example.com', opener)).toBeNull();
    expect(opener.opened).toEqual(['https://example.com/']);
    expect(logged).toHaveBeenCalledOnce();
  });

  it('vom Ctrl+Klick im Terminal bis zum Browser: genau einmal, nur mit Ctrl und nur für http(s)', async () => {
    const term = new Terminal({ cols: 80, rows: 5, allowProposedApi: true });
    const opener = fakeOpener();
    // So gibt der Renderer einen Klick weiter: nur was `linkToOpen` durchlässt, geht an den Hauptprozess.
    const click = async (event: { button: number; ctrlKey: boolean; shiftKey: boolean }, uri: string) => {
      const url = linkToOpen(term, event, uri);
      if (url) await openWebLink(url, opener);
    };
    const ctrl = { button: 0, ctrlKey: true, shiftKey: false };

    await click(ctrl, 'http://localhost:3100/#/search-input');
    await click({ ...ctrl, ctrlKey: false }, 'https://example.com');
    await click(ctrl, 'file:///C:/Windows/System32/calc.exe');
    await click(ctrl, 'javascript:alert(1)');

    expect(opener.opened).toEqual(['http://localhost:3100/#/search-input']);
  });
});
