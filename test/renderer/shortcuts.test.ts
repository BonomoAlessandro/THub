import { describe, expect, it } from 'vitest';
import { resolveShortcut, type KeyInput } from '../../src/renderer/shortcuts';

/**
 * Ein Tastendruck wie im Browser, z.B. key('Ctrl+Shift+KeyT'). Mit `produced` das Zeichen, das die
 * Taste im eingestellten Layout erzeugt (`KeyboardEvent.key`); ohne es ein Zeichen, das kein Kürzel ist.
 */
function key(combo: string, produced = 'x'): KeyInput {
  const parts = combo.split('+');
  return {
    code: parts.at(-1)!,
    key: produced,
    ctrlKey: parts.includes('Ctrl'),
    shiftKey: parts.includes('Shift'),
    altKey: parts.includes('Alt'),
    metaKey: parts.includes('Meta'),
  };
}

// Die Zuordnung der Tastenkürzel; ausgeführt werden sie von der Oberfläche.
describe('Tastenkürzel', () => {
  it.each([
    ['Ctrl+Shift+KeyT', { type: 'newTab' }],
    ['Ctrl+Shift+KeyW', { type: 'closeTab' }],
    ['Ctrl+Shift+KeyC', { type: 'copy' }],
    ['Ctrl+Shift+KeyV', { type: 'paste' }],
    ['Ctrl+Tab', { type: 'nextTab' }],
    ['Ctrl+PageDown', { type: 'nextTab' }],
    ['Ctrl+Shift+Tab', { type: 'previousTab' }],
    ['Ctrl+PageUp', { type: 'previousTab' }],
    ['Ctrl+Digit1', { type: 'tabAt', index: 0 }],
    ['Ctrl+Digit9', { type: 'tabAt', index: 8 }],
    ['F2', { type: 'renameTab' }],
  ])('%s', (combo, action) => {
    expect(resolveShortcut(key(combo))).toEqual(action);
  });

  it.each([
    ['Ctrl+K für Claude und die Shells', 'Ctrl+KeyK'],
    ['Ctrl+C zum Abbrechen', 'Ctrl+KeyC'],
    ['Ctrl+V', 'Ctrl+KeyV'],
    ['Tab', 'Tab'],
    ['Buchstaben', 'KeyT'],
    ['AltGr-Zeichen (Windows meldet Ctrl+Alt)', 'Ctrl+Alt+Digit2'],
    ['Alt mit einem Kürzel', 'Ctrl+Shift+Alt+KeyT'],
  ])('lässt %s ans Terminal durch', (_label, combo) => {
    expect(resolveShortcut(key(combo))).toBeNull();
  });

  // Erkannt am erzeugten Zeichen, nicht an der Tastenposition.
  describe('Schriftgrösse', () => {
    const bigger = { type: 'fontSize', step: 1 };
    const smaller = { type: 'fontSize', step: -1 };
    const reset = { type: 'resetFontSize' };

    it.each([
      ['Schweizer Tastatur: + liegt auf Shift+1', 'Ctrl+Shift+Digit1', '+', bigger],
      ['Schweizer Tastatur: - rechts neben dem Punkt', 'Ctrl+Slash', '-', smaller],
      ['Schweizer Tastatur: 0 in der Zahlenreihe', 'Ctrl+Digit0', '0', reset],
      ['Deutsche Tastatur: + neben dem Ü', 'Ctrl+BracketRight', '+', bigger],
      ['US-Tastatur: + auf Shift+=', 'Ctrl+Shift+Equal', '+', bigger],
      ['US-Tastatur: = ohne Shift, wie in Browsern', 'Ctrl+Equal', '=', bigger],
      ['US-Tastatur: -', 'Ctrl+Minus', '-', smaller],
      ['Ziffernblock +', 'Ctrl+NumpadAdd', '+', bigger],
      ['Ziffernblock -', 'Ctrl+NumpadSubtract', '-', smaller],
      ['Ziffernblock 0', 'Ctrl+Numpad0', '0', reset],
    ])('%s', (_label, combo, produced, action) => {
      expect(resolveShortcut(key(combo, produced))).toEqual(action);
    });

    it('Ctrl+1 bleibt auf der Schweizer Tastatur der Sprung zum ersten Tab', () => {
      expect(resolveShortcut(key('Ctrl+Digit1', '1'))).toEqual({ type: 'tabAt', index: 0 });
    });

    it.each([
      ['+ ohne Ctrl', 'Shift+Digit1', '+'],
      ['- ohne Ctrl', 'Minus', '-'],
      ['0 ohne Ctrl', 'Digit0', '0'],
      ['Ctrl+_ (Shift+-)', 'Ctrl+Shift+Minus', '_'],
      ['AltGr mit +', 'Ctrl+Alt+Digit1', '+'],
      ['Ctrl+Einfg auf dem Ziffernblock ohne NumLock', 'Ctrl+Numpad0', 'Insert'],
    ])('lässt %s ans Terminal durch', (_label, combo, produced) => {
      expect(resolveShortcut(key(combo, produced))).toBeNull();
    });
  });
});
