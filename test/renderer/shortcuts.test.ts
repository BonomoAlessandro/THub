import { describe, expect, it } from 'vitest';
import { resolveShortcut, type KeyInput } from '../../src/renderer/shortcuts';

/** Ein Tastendruck wie im Browser, z.B. key('Ctrl+Shift+KeyT'). */
function key(combo: string): KeyInput {
  const parts = combo.split('+');
  return {
    code: parts.at(-1)!,
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
    ['Ctrl+0', 'Ctrl+Digit0'],
    ['Tab', 'Tab'],
    ['Buchstaben', 'KeyT'],
    ['AltGr-Zeichen (Windows meldet Ctrl+Alt)', 'Ctrl+Alt+Digit2'],
    ['Alt mit einem Kürzel', 'Ctrl+Shift+Alt+KeyT'],
  ])('lässt %s ans Terminal durch', (_label, combo) => {
    expect(resolveShortcut(key(combo))).toBeNull();
  });
});
