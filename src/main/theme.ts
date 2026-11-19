// Design hell/dunkel im Hauptprozess (Ticket 04): Er bestimmt, welches Design gilt, und zieht bei
// jedem Wechsel Fensterfarbe, native Fensterknöpfe und Oberfläche nach.
// Lädt Electron nicht selbst; main.ts reicht nativeTheme und das Fenster herein.

import { IPC, type ResolvedTheme, type Theme, type Unsubscribe } from '../shared/types';

/** Höhe der Titelleiste in px (--titlebar-h); die nativen Fensterknöpfe sind genau so hoch. */
export const TITLEBAR_HEIGHT = 44;

/**
 * Farben, die das Fenster selbst zeichnet, ohne CSS: Hintergrund (wie --win-solid) und die Symbole
 * der Fensterknöpfe (wie --text). Deckend, ohne Mica und ohne Transparenz.
 */
const WINDOW_COLORS: Record<ResolvedTheme, { background: string; symbol: string }> = {
  dark: { background: '#1d1d22', symbol: '#ececf1' },
  light: { background: '#f3f3f6', symbol: '#1b1b1f' },
};

/** Welches Design gilt: eine feste Wahl („Hell“, „Dunkel“), sonst das von Windows. */
export function resolveTheme(choice: Theme, systemDark: boolean): ResolvedTheme {
  if (choice !== 'system') return choice;
  return systemDark ? 'dark' : 'light';
}

/** Fensterfarbe und Fensterknöpfe eines Designs, so wie BrowserWindow sie erwartet. */
export function windowChrome(theme: ResolvedTheme) {
  const colors = WINDOW_COLORS[theme];
  return {
    backgroundColor: colors.background,
    titleBarOverlay: { color: colors.background, symbolColor: colors.symbol, height: TITLEBAR_HEIGHT },
  };
}

/** Der Teil von Electrons `nativeTheme`, den die Design-Quelle braucht. */
export interface SystemTheme {
  /** Ob dunkel gilt: das Design von Windows, ausser `themeSource` legt es fest. */
  readonly shouldUseDarkColors: boolean;
  themeSource: Theme;
  on(event: 'updated', listener: () => void): unknown;
}

/** Das geltende Design. Folgt Windows, bis eine feste Wahl es übersteuert. */
export interface ThemeSource {
  current(): ResolvedTheme;
  /**
   * Wahl aus den Einstellungen (Ticket 18): „system“ folgt Windows, „light“ und „dark“ legen fest.
   * Sie geht auch an Electron, damit native Dialoge und Menüs dasselbe Design zeigen.
   */
  setChoice(choice: Theme): void;
  /** Meldet jeden Wechsel des geltenden Designs, nicht aber unveränderte Meldungen von Windows. */
  subscribe(listener: (theme: ResolvedTheme) => void): Unsubscribe;
}

export function createThemeSource(system: SystemTheme): ThemeSource {
  let choice: Theme = 'system';
  const resolve = (): ResolvedTheme => resolveTheme(choice, system.shouldUseDarkColors);
  let current = resolve();
  const listeners = new Set<(theme: ResolvedTheme) => void>();

  // Electron meldet „updated“ bei jedem Wechsel des Designs in Windows (auch bei anderen
  // Änderungen, etwa am Kontrast); weitergegeben wird nur ein echter Wechsel.
  const update = (): void => {
    const next = resolve();
    if (next === current) return;
    current = next;
    for (const listener of listeners) listener(next);
  };
  system.on('updated', update);

  return {
    current: () => current,
    setChoice(next) {
      choice = next;
      system.themeSource = next;
      update();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** Der Teil eines BrowserWindow, den das Design nachzieht. */
export interface ThemedWindow {
  isDestroyed(): boolean;
  setBackgroundColor(color: string): void;
  setTitleBarOverlay(options: { color?: string; symbolColor?: string; height?: number }): void;
  webContents: { send(channel: string, ...args: unknown[]): void };
}

/**
 * Zieht bei jedem Wechsel des Designs das Fenster nach: Hintergrund, Farben der nativen Fensterknöpfe
 * und die Oberfläche (Design-Variablen und Terminal-Farbschema). Liefert die Abmeldung.
 */
export function followTheme(win: ThemedWindow, source: ThemeSource): Unsubscribe {
  return source.subscribe((theme) => {
    if (win.isDestroyed()) return;
    const chrome = windowChrome(theme);
    win.setBackgroundColor(chrome.backgroundColor);
    win.setTitleBarOverlay(chrome.titleBarOverlay);
    win.webContents.send(IPC.themeChanged, theme);
  });
}
