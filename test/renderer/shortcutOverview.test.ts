import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ShortcutList } from '../../src/renderer/settings/ShortcutsDialog';
import {
  SHORTCUTS,
  comboText,
  matchShortcut,
  resolveShortcut,
  resolveWheel,
  shortcutOverview,
  type KeyCombo,
  type KeyInput,
  type ShortcutAction,
} from '../../src/renderer/shortcuts';

// Die Übersicht der Tastenkürzel entsteht aus derselben Tabelle, nach der die Tasten verarbeitet werden: Sie nennt jedes
// Kürzel genau einmal, und was sie zeigt, löst beim Tippen genau dieses Kürzel aus.

/** Die Übersicht kompakt: Abschnitt → Bezeichnung → Tasten als Text. */
function overviewAsText(): Record<string, Record<string, string[]>> {
  return Object.fromEntries(
    shortcutOverview().map(({ group, shortcuts }) => [
      group,
      Object.fromEntries(shortcuts.map(({ shortcut, combos }) => [shortcut.label, combos.map(comboText)])),
    ]),
  );
}

/**
 * Die Tastendrücke zu einer angezeigten Kombination, so wie ein Browser sie meldet (Tastenposition und erzeugtes Zeichen).
 * `+`, `-` und `0` auf dem Ziffernblock, dort liegen sie in jedem Layout gleich; „1 … 9“ ergibt neun Tastendrücke.
 */
function inputsFor(combo: KeyCombo): KeyInput[] {
  const ctrlKey = combo.keys.includes('Ctrl');
  const shiftKey = combo.keys.includes('Shift');
  const main = combo.keys.filter((k) => k !== 'Ctrl' && k !== 'Shift');
  expect(main).toHaveLength(1);
  const caps = combo.through ? Array.from({ length: 9 }, (_, i) => String(i + 1)) : main;
  return caps.map((cap): KeyInput => {
    const base = { ctrlKey, shiftKey, altKey: false, metaKey: false };
    if (/^[A-Z]$/.test(cap)) return { ...base, code: `Key${cap}`, key: shiftKey ? cap : cap.toLowerCase() };
    if (/^[1-9]$/.test(cap)) return { ...base, code: `Digit${cap}`, key: cap };
    const numpad: Record<string, string> = { '+': 'NumpadAdd', '-': 'NumpadSubtract', '0': 'Numpad0' };
    if (numpad[cap]) return { ...base, code: numpad[cap], key: cap };
    return { ...base, code: cap, key: cap };
  });
}

describe('Übersicht der Tastenkürzel', () => {
  it('nennt alle Kürzel nach Abschnitten: Tabs, Bearbeiten, Darstellung, Fenster', () => {
    expect(overviewAsText()).toEqual({
      Tabs: {
        'Neues Terminal': ['Ctrl+Shift+T'],
        'Tab schliessen': ['Ctrl+Shift+W'],
        'Zuletzt geschlossenen Tab wieder öffnen': ['Ctrl+Shift+Z'],
        'Nächster Tab': ['Ctrl+Tab', 'Ctrl+PageDown'],
        'Vorheriger Tab': ['Ctrl+Shift+Tab', 'Ctrl+PageUp'],
        'Zum ersten bis neunten Tab': ['Ctrl+1 … 9'],
        'Tab umbenennen': ['F2'],
      },
      Bearbeiten: {
        Kopieren: ['Ctrl+Shift+C', 'Ctrl+C (nur mit Markierung)'],
        Einfügen: ['Ctrl+Shift+V', 'Ctrl+V'],
      },
      Darstellung: {
        'Schrift grösser': ['Ctrl++'],
        'Schrift kleiner': ['Ctrl+-'],
        'Schriftgrösse zurücksetzen': ['Ctrl+0'],
        'Schriftgrösse ändern': ['Ctrl + Mausrad'],
      },
      Fenster: {
        Befehlspalette: ['Ctrl+Shift+P'],
      },
    });
    expect(shortcutOverview().map((s) => s.group)).toEqual(['Tabs', 'Bearbeiten', 'Darstellung', 'Fenster']);
  });

  it('listet jedes Kürzel der Tabelle genau einmal und nichts sonst', () => {
    const listed = shortcutOverview().flatMap((s) => s.shortcuts.map((row) => row.shortcut));
    expect(listed).toHaveLength(SHORTCUTS.length);
    expect(new Set(listed)).toEqual(new Set(SHORTCUTS));
    const combos = shortcutOverview().flatMap((s) => s.shortcuts.flatMap((row) => row.combos.map(comboText)));
    expect(new Set(combos).size).toBe(combos.length);
  });

  it('jede angezeigte Taste löst beim Tippen genau ihr Kürzel aus', () => {
    for (const { shortcuts } of shortcutOverview()) {
      for (const { shortcut, combos } of shortcuts) {
        for (const combo of combos) {
          if (combo.gesture) {
            expect(resolveWheel({ ctrlKey: true }, 1), shortcut.label).toEqual(shortcut.action(1));
            continue;
          }
          for (const input of inputsFor(combo)) {
            expect(matchShortcut(input)?.shortcut, `${comboText(combo)} (${input.code})`).toBe(shortcut);
          }
        }
      }
    }
  });

  it('jede Aktion der Oberfläche hat ein Kürzel in der Tabelle', () => {
    const all: ShortcutAction['type'][] = [
      'newTab',
      'closeTab',
      'reopenTab',
      'copy',
      'paste',
      'nextTab',
      'previousTab',
      'tabAt',
      'renameTab',
      'fontSize',
      'resetFontSize',
      'palette',
    ];
    const fromTable = new Set(SHORTCUTS.flatMap((s) => [s.action(1).type, s.action(-1).type]));
    expect(fromTable).toEqual(new Set(all));
  });

  // Sucht über sehr viele Tastendrücke: Was THub verarbeitet, kommt immer aus der Tabelle und steht in der Übersicht.
  it('was THub verarbeitet, kommt aus der Tabelle und steht in der Übersicht', () => {
    const codes = [
      ...[...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map((c) => `Key${c}`),
      ...[...'0123456789'].map((d) => `Digit${d}`),
      ...[...'0123456789'].map((d) => `Numpad${d}`),
      ...Array.from({ length: 12 }, (_, i) => `F${i + 1}`),
      ...['Tab', 'PageUp', 'PageDown', 'Home', 'End', 'Insert', 'Delete', 'Backspace', 'Enter', 'Escape', 'Space'],
      ...['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Minus', 'Equal', 'BracketLeft', 'BracketRight'],
      ...['Backslash', 'Semicolon', 'Quote', 'Comma', 'Period', 'Slash', 'Backquote', 'IntlBackslash'],
      ...['NumpadAdd', 'NumpadSubtract', 'NumpadMultiply', 'NumpadDivide', 'NumpadDecimal', 'NumpadEnter'],
    ];
    const produced = ['x', 'X', '+', '-', '=', '0', '1', 'z', 'Z', 'y', 'Y', 'k', 'Я', '_', 'Insert'];
    const listed = new Set(shortcutOverview().flatMap((s) => s.shortcuts.map((row) => row.shortcut)));
    const hit = new Set<string>();
    let handled = 0;

    for (const code of codes) {
      for (const key of produced) {
        for (let mods = 0; mods < 16; mods++) {
          const e: KeyInput = {
            code,
            key,
            ctrlKey: (mods & 1) !== 0,
            shiftKey: (mods & 2) !== 0,
            altKey: (mods & 4) !== 0,
            metaKey: (mods & 8) !== 0,
          };
          const match = matchShortcut(e);
          expect(resolveShortcut(e)).toEqual(match?.action ?? null);
          if (!match) continue;
          handled++;
          expect(listed.has(match.shortcut)).toBe(true);
          hit.add(match.shortcut.id);
        }
      }
    }

    expect(handled).toBeGreaterThan(0);
    // Jedes Kürzel mit Tasten ist dabei vorgekommen; das Mausrad prüft der Test oben.
    expect(hit).toEqual(new Set(SHORTCUTS.filter((s) => s.id !== 'fontWheel').map((s) => s.id)));
  });

  it('der Dialog zeigt die Übersicht: jede Bezeichnung genau einmal, die Abschnitte in ihrer Reihenfolge', () => {
    const html = renderToStaticMarkup(createElement(ShortcutList));
    for (const shortcut of SHORTCUTS) {
      expect(html.split(`>${shortcut.label}<`).length - 1, shortcut.label).toBe(1);
    }
    const headings = [...html.matchAll(/<h4>([^<]+)<\/h4>/g)].map((m) => m[1]);
    expect(headings).toEqual(['Tabs', 'Bearbeiten', 'Darstellung', 'Fenster']);
    expect(html).toContain('<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd>');
    expect(html).toContain('<kbd>Ctrl</kbd>+<kbd>1</kbd> … <kbd>9</kbd>');
    expect(html).toContain('<kbd>Ctrl</kbd> + Mausrad');
    expect(html).toContain('<kbd>Ctrl</kbd>+<kbd>C</kbd> (nur mit Markierung)');
    expect(html).toContain('<kbd>Ctrl</kbd>+<kbd>V</kbd>');
  });

  it('Ctrl+K steht nicht darin, es gehört dem Terminal; Ctrl+C nur mit dem Zusatz „nur mit Markierung“', () => {
    const combos = shortcutOverview().flatMap((s) => s.shortcuts.flatMap((row) => row.combos.map(comboText)));
    expect(combos).not.toContain('Ctrl+K');
    expect(combos).not.toContain('Ctrl+C');
    expect(combos).toContain('Ctrl+C (nur mit Markierung)');
  });
});
