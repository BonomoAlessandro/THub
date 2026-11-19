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
  | { type: 'renameTab' };

/** Die Angaben eines Tastendrucks, die für die Kürzel zählen (Teil von `KeyboardEvent`). */
export interface KeyInput {
  code: string;
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
  return null;
}
