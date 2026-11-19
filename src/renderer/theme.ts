// Hell oder dunkel: Die Oberfläche übernimmt beim Start das Design von Windows.
// Das Nachziehen bei einem Wechsel im laufenden Betrieb folgt mit Ticket 04.

import type { ITheme } from '@xterm/xterm';

export type ResolvedTheme = 'light' | 'dark';

/** Setzt das Design von Windows als Attribut data-theme; daran hängen die Design-Variablen. */
export function applySystemTheme(): ResolvedTheme {
  const theme: ResolvedTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;
  return theme;
}

/** Wert einer Design-Variablen im aktuellen Design. */
export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Das Terminal-Farbschema des aktuellen Designs, aus den Design-Variablen (--term-*, --a-*). */
export function terminalTheme(): ITheme {
  const v = cssVar;
  return {
    background: v('--term-bg'),
    foreground: v('--term-fg'),
    // Cursor neutral in der Hervorhebungsfarbe, wie im Prototyp.
    cursor: v('--accent'),
    cursorAccent: v('--term-bg'),
    selectionBackground: v('--term-sel'),
    black: v('--a-black'),
    red: v('--a-red'),
    green: v('--a-green'),
    yellow: v('--a-yellow'),
    blue: v('--a-blue'),
    magenta: v('--a-magenta'),
    cyan: v('--a-cyan'),
    white: v('--term-fg'),
    brightBlack: v('--a-dim'),
    brightRed: v('--a-red'),
    brightGreen: v('--a-green'),
    brightYellow: v('--a-yellow'),
    brightBlue: v('--a-blue'),
    brightMagenta: v('--a-magenta'),
    brightCyan: v('--a-cyan'),
    brightWhite: v('--a-white'),
  };
}
