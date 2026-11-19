// Hell oder dunkel: Welches Design gilt, bestimmt der Hauptprozess (er folgt Windows). Die Oberfläche
// übernimmt es beim Start und zieht bei jedem Wechsel sofort mit, auch in allen offenen Terminals.

import type { ITheme } from '@xterm/xterm';
import type { ResolvedTheme } from '../shared/types';
import { terminalViews } from './terminal/terminalViews';

const api = window.termhub;

/**
 * Übernimmt das Design des Hauptprozesses und folgt danach jedem Wechsel. Erfüllt sich, sobald das
 * Design gesetzt ist; erst dann soll die Oberfläche zeichnen.
 */
export function followTheme(): Promise<void> {
  // Zuerst abonnieren, dann abfragen: So geht kein Wechsel verloren.
  api.onThemeChange(applyTheme);
  return api.loadTheme().then(applyTheme);
}

/**
 * Setzt das Design als Attribut data-theme, daran hängen die Design-Variablen. Die Terminals lesen
 * ihr Farbschema aus diesen Variablen und bekommen es deshalb danach neu.
 */
function applyTheme(theme: ResolvedTheme): void {
  document.documentElement.dataset.theme = theme;
  for (const view of terminalViews.values()) view.updateTheme();
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
