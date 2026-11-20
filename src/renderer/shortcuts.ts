// Tastenkürzel der App. Reine Zuordnung von Taste zu Aktion, ohne DOM, damit sie sich prüfen lässt.
// Alles, was hier nicht steht, geht ans Terminal, insbesondere Ctrl+K und Ctrl+C.

export type ShortcutAction =
  | { type: 'newTab' }
  | { type: 'closeTab' }
  | { type: 'copy' }
  | { type: 'paste' }
  | { type: 'nextTab' }
  | { type: 'previousTab' }
  /** Zum Tab an Position `index` (ab 0). */
  | { type: 'tabAt'; index: number }
  | { type: 'renameTab' }
  /** Schriftgrösse aller Terminals einen Schritt grösser (1) oder kleiner (-1). */
  | { type: 'fontSize'; step: 1 | -1 }
  /** Schriftgrösse aller Terminals zurück auf den Standard. */
  | { type: 'resetFontSize' };

/** Die Angaben eines Tastendrucks, die für die Kürzel zählen (Teil von `KeyboardEvent`). */
export interface KeyInput {
  /** Tastenposition, unabhängig vom Layout (z.B. "Digit1"). */
  code: string;
  /** Erzeugtes Zeichen im eingestellten Layout, mit Shift, ohne Ctrl (z.B. "+" für Shift+1 auf der Schweizer Tastatur). */
  key: string;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}

/** Kürzel nach Tastenposition (`KeyboardEvent.code`), wie bisher. */
const SHORTCUTS = new Map<string, ShortcutAction>([
  ['Ctrl+Shift+KeyT', { type: 'newTab' }],
  ['Ctrl+Shift+KeyW', { type: 'closeTab' }],
  ['Ctrl+Shift+KeyC', { type: 'copy' }],
  ['Ctrl+Shift+KeyV', { type: 'paste' }],
  ['Ctrl+Tab', { type: 'nextTab' }],
  ['Ctrl+PageDown', { type: 'nextTab' }],
  ['Ctrl+Shift+Tab', { type: 'previousTab' }],
  ['Ctrl+PageUp', { type: 'previousTab' }],
  ['F2', { type: 'renameTab' }],
]);

/**
 * Kürzel nach dem erzeugten Zeichen (`KeyboardEvent.key`), für Tasten, die je nach Layout woanders liegen:
 * `+` auf der Schweizer Tastatur auf Shift+1, auf der US-Tastatur auf Shift+=; dazu der Ziffernblock.
 * Shift darf dabei gedrückt sein, weil manches Layout es für das Zeichen braucht. `=` zählt wie `+`
 * (US-Tastatur ohne Shift, wie in Browsern).
 */
const CHARACTER_SHORTCUTS = new Map<string, ShortcutAction>([
  ['+', { type: 'fontSize', step: 1 }],
  ['=', { type: 'fontSize', step: 1 }],
  ['-', { type: 'fontSize', step: -1 }],
]);

/**
 * Liefert die Aktion zu einem Tastendruck oder `null`, wenn die Taste ans Terminal gehört.
 * Mit Alt (auch AltGr, das Windows als Ctrl+Alt meldet) ist nie ein Kürzel gemeint.
 */
export function resolveShortcut(e: KeyInput): ShortcutAction | null {
  if (e.altKey || e.metaKey) return null;
  const combo = `${e.ctrlKey ? 'Ctrl+' : ''}${e.shiftKey ? 'Shift+' : ''}${e.code}`;

  const action = SHORTCUTS.get(combo);
  if (action) return action;

  // Ctrl+1 … Ctrl+9: direkt zum n-ten Tab.
  const digit = /^Ctrl\+Digit([1-9])$/.exec(combo);
  if (digit) return { type: 'tabAt', index: Number(digit[1]) - 1 };

  if (!e.ctrlKey) return null;
  // Ctrl+0 in der Zahlenreihe oder auf dem Ziffernblock: Schriftgrösse zurücksetzen.
  if (e.key === '0' && !e.shiftKey) return { type: 'resetFontSize' };
  return CHARACTER_SHORTCUTS.get(e.key) ?? null;
}
