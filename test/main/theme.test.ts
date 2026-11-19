import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  createThemeSource,
  followTheme,
  resolveTheme,
  windowChrome,
  type SystemTheme,
  type ThemedWindow,
} from '../../src/main/theme';
import { IPC, type ResolvedTheme, type Theme } from '../../src/shared/types';

/**
 * Electrons `nativeTheme`, nachgemacht: `themeSource` legt das Design fest oder lässt Windows
 * entscheiden, und ein Wechsel in Windows meldet sich mit „updated“.
 */
class FakeNativeTheme extends EventEmitter implements SystemTheme {
  themeSource: Theme = 'system';

  constructor(private windowsDark: boolean) {
    super();
  }

  get shouldUseDarkColors(): boolean {
    return this.themeSource === 'system' ? this.windowsDark : this.themeSource === 'dark';
  }

  /** Windows wechselt das Design der Apps (Einstellungen › Personalisierung › Farben). */
  switchWindows(theme: ResolvedTheme): void {
    this.windowsDark = theme === 'dark';
    this.emit('updated');
  }

  /** Windows meldet eine Änderung, die das Design nicht betrifft (etwa am Kontrast). */
  otherUpdate(): void {
    this.emit('updated');
  }
}

/** Ein Fenster, nachgemacht: Es merkt sich, was der Nutzer sieht, und was an die Oberfläche ging. */
function fakeWindow(start: ResolvedTheme) {
  const chrome = windowChrome(start);
  const seen = {
    background: chrome.backgroundColor,
    overlay: chrome.titleBarOverlay as { color?: string; symbolColor?: string; height?: number },
    /** Design, das die Oberfläche zuletzt bekommen hat. */
    renderer: start as ResolvedTheme,
    messages: 0,
  };
  let destroyed = false;
  const win: ThemedWindow = {
    isDestroyed: () => destroyed,
    setBackgroundColor: (color) => (seen.background = color),
    setTitleBarOverlay: (options) => (seen.overlay = { ...seen.overlay, ...options }),
    webContents: {
      send: (channel, ...args) => {
        if (channel !== IPC.themeChanged) return;
        seen.renderer = args[0] as ResolvedTheme;
        seen.messages++;
      },
    },
  };
  return { win, seen, destroy: () => (destroyed = true) };
}

/** Design-Variablen eines Designs aus styles/tokens.css. */
function cssTokens(selector: string): Record<string, string> {
  const css = readFileSync(new URL('../../src/renderer/styles/tokens.css', import.meta.url), 'utf8');
  const escaped = selector.replace(/[[\]]/g, '\\$&');
  const block = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  if (!block) throw new Error(`Block ${selector} fehlt in tokens.css`);
  return Object.fromEntries([...block[1].matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}

describe('Design hell/dunkel', () => {
  describe('welches Design gilt', () => {
    it('„System“ folgt Windows', () => {
      expect(resolveTheme('system', true)).toBe('dark');
      expect(resolveTheme('system', false)).toBe('light');
    });

    it('eine feste Wahl übersteuert Windows', () => {
      expect(resolveTheme('light', true)).toBe('light');
      expect(resolveTheme('dark', false)).toBe('dark');
    });
  });

  describe('Design-Quelle', () => {
    it('übernimmt beim Start das Design von Windows', () => {
      expect(createThemeSource(new FakeNativeTheme(true)).current()).toBe('dark');
      expect(createThemeSource(new FakeNativeTheme(false)).current()).toBe('light');
    });

    it('meldet einen Wechsel in Windows sofort', () => {
      const system = new FakeNativeTheme(true);
      const source = createThemeSource(system);
      const seen: ResolvedTheme[] = [];
      source.subscribe((theme) => seen.push(theme));

      system.switchWindows('light');
      system.switchWindows('dark');

      expect(seen).toEqual(['light', 'dark']);
      expect(source.current()).toBe('dark');
    });

    it('meldet nichts, wenn sich am Design nichts ändert', () => {
      const system = new FakeNativeTheme(true);
      const source = createThemeSource(system);
      const seen: ResolvedTheme[] = [];
      source.subscribe((theme) => seen.push(theme));

      system.otherUpdate();
      system.switchWindows('dark');

      expect(seen).toEqual([]);
    });

    it('eine feste Wahl gilt, bis wieder „System“ gewählt wird; auch Electron bekommt sie', () => {
      const system = new FakeNativeTheme(true);
      const source = createThemeSource(system);
      const seen: ResolvedTheme[] = [];
      source.subscribe((theme) => seen.push(theme));

      source.setChoice('light');
      expect(system.themeSource).toBe('light');
      system.switchWindows('light');
      system.switchWindows('dark');
      expect(source.current()).toBe('light');

      source.setChoice('system');
      expect(system.themeSource).toBe('system');
      expect(source.current()).toBe('dark');
      expect(seen).toEqual(['light', 'dark']);
    });

    it('nach dem Abmelden kommen keine Meldungen mehr', () => {
      const system = new FakeNativeTheme(true);
      const source = createThemeSource(system);
      const seen: ResolvedTheme[] = [];
      const unsubscribe = source.subscribe((theme) => seen.push(theme));

      unsubscribe();
      system.switchWindows('light');

      expect(seen).toEqual([]);
    });
  });

  describe('Fenster folgt dem Design ohne Neustart', () => {
    it('Wechsel in Windows: Hintergrund, Fensterknöpfe und Oberfläche ziehen mit', () => {
      const system = new FakeNativeTheme(true);
      const source = createThemeSource(system);
      const { win, seen } = fakeWindow(source.current());
      followTheme(win, source);

      system.switchWindows('light');

      expect(seen.background).toBe('#f3f3f6');
      expect(seen.overlay).toEqual({ color: '#f3f3f6', symbolColor: '#1b1b1f', height: 44 });
      expect(seen.renderer).toBe('light');

      system.switchWindows('dark');

      expect(seen.background).toBe('#1d1d22');
      expect(seen.overlay).toEqual({ color: '#1d1d22', symbolColor: '#ececf1', height: 44 });
      expect(seen.renderer).toBe('dark');
      expect(seen.messages).toBe(2);
    });

    it('ein geschlossenes Fenster wird nicht mehr angefasst', () => {
      const system = new FakeNativeTheme(true);
      const source = createThemeSource(system);
      const { win, seen, destroy } = fakeWindow(source.current());
      followTheme(win, source);

      destroy();
      system.switchWindows('light');

      expect(seen.background).toBe('#1d1d22');
      expect(seen.messages).toBe(0);
    });

    it('nach dem Abmelden (Fenster geschlossen) folgt es nicht mehr', () => {
      const system = new FakeNativeTheme(true);
      const source = createThemeSource(system);
      const { win, seen } = fakeWindow(source.current());
      const stop = followTheme(win, source);

      stop();
      system.switchWindows('light');

      expect(seen.renderer).toBe('dark');
      expect(seen.messages).toBe(0);
    });
  });

  describe('Fensterfarben passen zu den Design-Variablen', () => {
    it.each(['dark', 'light'] as const)('%s: deckender Hintergrund wie --win-solid, Symbole wie --text', (theme) => {
      const tokens = cssTokens(`:root[data-theme='${theme}']`);
      const chrome = windowChrome(theme);

      expect(chrome.backgroundColor).toBe(tokens['--win-solid']);
      expect(chrome.titleBarOverlay.color).toBe(tokens['--win-solid']);
      expect(chrome.titleBarOverlay.symbolColor).toBe(tokens['--text']);
      // Deckend: sechsstellige Farbe ohne Deckkraft.
      expect(chrome.backgroundColor).toMatch(/^#[0-9a-f]{6}$/i);
    });

    it('Fensterknöpfe sind so hoch wie die Titelleiste', () => {
      const height = cssTokens(':root')['--titlebar-h'];

      expect(`${windowChrome('dark').titleBarOverlay.height}px`).toBe(height);
      expect(`${windowChrome('light').titleBarOverlay.height}px`).toBe(height);
    });
  });
});
