import { describe, expect, it } from 'vitest';
import { resolveShortcut, resolveWheel, type KeyInput, type ShortcutAction } from '../../src/renderer/shortcuts';

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
    ['Ctrl+KeyC', { type: 'copy' }],
    ['Ctrl+KeyV', { type: 'paste' }],
    ['Ctrl+Tab', { type: 'nextTab' }],
    ['Ctrl+PageDown', { type: 'nextTab' }],
    ['Ctrl+Shift+Tab', { type: 'previousTab' }],
    ['Ctrl+PageUp', { type: 'previousTab' }],
    ['Ctrl+Digit1', { type: 'tabAt', index: 0 }],
    ['Ctrl+Digit9', { type: 'tabAt', index: 8 }],
    ['F2', { type: 'renameTab' }],
    ['Ctrl+Shift+KeyP', { type: 'palette' }],
  ])('%s', (combo, action) => {
    expect(resolveShortcut(key(combo))).toEqual(action);
  });

  it.each([
    ['Ctrl+K für Claude und die Shells', 'Ctrl+KeyK'],
    ['Tab', 'Tab'],
    ['Buchstaben', 'KeyT'],
    ['AltGr-Zeichen (Windows meldet Ctrl+Alt)', 'Ctrl+Alt+Digit2'],
    ['Alt mit einem Kürzel', 'Ctrl+Shift+Alt+KeyT'],
    ['Ctrl+P', 'Ctrl+KeyP'],
    ['Shift+P', 'Shift+KeyP'],
    ['F2 mit Ctrl', 'Ctrl+F2'],
  ])('lässt %s ans Terminal durch', (_label, combo) => {
    expect(resolveShortcut(key(combo))).toBeNull();
  });

  // Ctrl+C und Ctrl+V stehen in der Tabelle, gehören aber weiter dem Programm, wenn THub nichts zu kopieren bzw. einzufügen
  // hat (Ticket 34). Ob THub sie nimmt, entscheidet beim Tastendruck `takesShared` (in der App `takesSharedKey`).
  describe('Ctrl+C und Ctrl+V', () => {
    /** Zeichnet auf, wofür `resolveShortcut` nachfragt, und antwortet mit `answer`. */
    function asked(answer: boolean): { takesShared: (a: ShortcutAction) => boolean; questions: ShortcutAction[] } {
      const questions: ShortcutAction[] = [];
      return { takesShared: (a) => (questions.push(a), answer), questions };
    }

    it.each([
      ['Ctrl+C', 'Ctrl+KeyC', { type: 'copy' }],
      ['Ctrl+V', 'Ctrl+KeyV', { type: 'paste' }],
    ])('%s: THub nimmt die Taste nur, wenn es kopiert bzw. einfügt', (_label, combo, action) => {
      const yes = asked(true);
      expect(resolveShortcut(key(combo), yes.takesShared)).toEqual(action);
      expect(yes.questions).toEqual([action]);

      const no = asked(false);
      expect(resolveShortcut(key(combo), no.takesShared)).toBeNull();
      expect(no.questions).toEqual([action]);
    });

    it.each([
      ['Ctrl+Shift+C', 'Ctrl+Shift+KeyC', { type: 'copy' }],
      ['Ctrl+Shift+V', 'Ctrl+Shift+KeyV', { type: 'paste' }],
      ['Ctrl+Shift+T', 'Ctrl+Shift+KeyT', { type: 'newTab' }],
    ])('%s bleibt ein Kürzel und fragt nicht nach', (_label, combo, action) => {
      const no = asked(false);
      expect(resolveShortcut(key(combo), no.takesShared)).toEqual(action);
      expect(no.questions).toEqual([]);
    });

    it.each([
      ['AltGr+C (Windows meldet Ctrl+Alt)', 'Ctrl+Alt+KeyC'],
      ['AltGr+V (Windows meldet Ctrl+Alt)', 'Ctrl+Alt+KeyV'],
      ['Ctrl+Shift+Alt+C', 'Ctrl+Shift+Alt+KeyC'],
      ['Ctrl+Shift+Alt+V', 'Ctrl+Shift+Alt+KeyV'],
      ['Alt+V (Bild einfügen in Claude)', 'Alt+KeyV'],
      ['Alt+C', 'Alt+KeyC'],
      ['C ohne Ctrl', 'KeyC'],
      ['Shift+V ohne Ctrl', 'Shift+KeyV'],
    ])('lässt %s ans Terminal durch, ohne nachzufragen', (_label, combo) => {
      const yes = asked(true);
      expect(resolveShortcut(key(combo), yes.takesShared)).toBeNull();
      expect(yes.questions).toEqual([]);
    });
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

    it('Ctrl+6 bleibt auf der französischen Tastatur der Sprung zum sechsten Tab, obwohl die Taste - erzeugt', () => {
      expect(resolveShortcut(key('Ctrl+Digit6', '-'))).toEqual({ type: 'tabAt', index: 5 });
    });

    it('Ctrl + Mausrad: nach oben grösser, nach unten kleiner; ohne Ctrl scrollt es', () => {
      expect(resolveWheel({ ctrlKey: true }, 1)).toEqual(bigger);
      expect(resolveWheel({ ctrlKey: true }, -1)).toEqual(smaller);
      expect(resolveWheel({ ctrlKey: false }, 1)).toBeNull();
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

  // Erkannt am erzeugten Buchstaben: Auf der Schweizer Tastatur liegt Z dort, wo die US-Tastatur Y hat.
  describe('Zuletzt geschlossenen Tab wieder öffnen', () => {
    const reopen = { type: 'reopenTab' };

    it.each([
      ['US-Tastatur', 'Ctrl+Shift+KeyZ', 'Z'],
      ['Schweizer Tastatur: Z liegt auf der Taste KeyY', 'Ctrl+Shift+KeyY', 'Z'],
      ['ohne lateinische Buchstaben (russisch): nach der Tastenposition', 'Ctrl+Shift+KeyZ', 'Я'],
    ])('%s', (_label, combo, produced) => {
      expect(resolveShortcut(key(combo, produced))).toEqual(reopen);
    });

    it.each([
      ['Ctrl+Shift+Y auf der Schweizer Tastatur (Taste KeyZ)', 'Ctrl+Shift+KeyZ', 'Y'],
      ['Ctrl+Z ohne Shift', 'Ctrl+KeyZ', 'z'],
      ['Shift+Z ohne Ctrl', 'Shift+KeyZ', 'Z'],
      ['AltGr mit Shift+Z', 'Ctrl+Shift+Alt+KeyZ', 'Z'],
    ])('lässt %s ans Terminal durch', (_label, combo, produced) => {
      expect(resolveShortcut(key(combo, produced))).toBeNull();
    });
  });
});
