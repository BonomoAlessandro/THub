// Tastenkürzel der App: eine einzige Tabelle, nach der die Tasten verarbeitet werden und aus der die Übersicht
// „Tastenkürzel“ entsteht, damit beide nie auseinanderlaufen. Reine Zuordnung von Taste zu Aktion, ohne DOM, damit sie
// sich prüfen lässt. Alles, was hier nicht steht, geht ans Terminal, insbesondere Ctrl+K und Ctrl+C.

export type ShortcutAction =
  | { type: 'newTab' }
  | { type: 'closeTab' }
  /** Den zuletzt geschlossenen Tab wieder öffnen. */
  | { type: 'reopenTab' }
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
  | { type: 'resetFontSize' }
  /** Die Befehlspalette öffnen. */
  | { type: 'palette' };

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

/** Die Angaben einer Bewegung des Mausrads, die für die Kürzel zählen (Teil von `WheelEvent`). */
export interface WheelInput {
  ctrlKey: boolean;
}

/** Die Abschnitte der Übersicht, in dieser Reihenfolge. */
export const SHORTCUT_GROUPS = ['Tabs', 'Bearbeiten', 'Darstellung', 'Fenster'] as const;
export type ShortcutGroup = (typeof SHORTCUT_GROUPS)[number];

/** Wie ein Kürzel erkannt wird. */
export type Trigger =
  /** Nach der Tastenposition (`KeyboardEvent.code`), mit genau diesen Zusatztasten, z.B. Ctrl+Shift+T. */
  | { by: 'code'; code: string; ctrl?: true; shift?: true }
  /** Ctrl mit einer Ziffer 1 bis 9 der Zahlenreihe, nach der Tastenposition; die Ziffer zählt als Wert. */
  | { by: 'digit' }
  /**
   * Ctrl+Shift mit dem erzeugten Buchstaben: Auf der Schweizer und der deutschen Tastatur sind Z und Y gegenüber der
   * US-Tastatur vertauscht. Erzeugt die Taste keinen lateinischen Buchstaben (etwa im russischen Layout), zählt die
   * Tastenposition wie auf der US-Tastatur.
   */
  | { by: 'letter'; letter: string }
  /**
   * Ctrl mit dem erzeugten Zeichen, für Tasten, die je nach Layout woanders liegen: `+` auf der Schweizer Tastatur auf
   * Shift+1, auf der US-Tastatur auf Shift+=; dazu der Ziffernblock. Mit `anyShift` darf Shift gedrückt sein, weil
   * manches Layout es für das Zeichen braucht. `aliases` zählen gleich, erscheinen aber nicht in der Übersicht.
   */
  | { by: 'char'; char: string; aliases?: string[]; anyShift?: true }
  /** Ctrl + Mausrad; die Richtung (1 nach oben, -1 nach unten) zählt als Wert. */
  | { by: 'wheel' };

/** Ein Tastenkürzel der App: wo es in der Übersicht steht, wie es erkannt wird und was es tut. */
export interface Shortcut {
  /** Kennung, z.B. für den Hinweis auf das Kürzel neben einem Befehl der Palette. */
  id: string;
  group: ShortcutGroup;
  /** Was es tut, so wie die Übersicht es nennt. */
  label: string;
  /** Gleichwertige Tasten, z.B. Ctrl+Tab und Ctrl+PageDown. */
  triggers: Trigger[];
  /** Die Aktion; `value` ist die Ziffer bei Ctrl+1 … 9 bzw. die Richtung beim Mausrad, sonst 0. */
  action(value: number): ShortcutAction;
}

/** Alle Tastenkürzel von THub, in der Reihenfolge der Übersicht. */
export const SHORTCUTS: readonly Shortcut[] = [
  {
    id: 'newTab',
    group: 'Tabs',
    label: 'Neues Terminal',
    triggers: [{ by: 'code', code: 'KeyT', ctrl: true, shift: true }],
    action: () => ({ type: 'newTab' }),
  },
  {
    id: 'closeTab',
    group: 'Tabs',
    label: 'Tab schliessen',
    triggers: [{ by: 'code', code: 'KeyW', ctrl: true, shift: true }],
    action: () => ({ type: 'closeTab' }),
  },
  {
    id: 'reopenTab',
    group: 'Tabs',
    label: 'Zuletzt geschlossenen Tab wieder öffnen',
    triggers: [{ by: 'letter', letter: 'z' }],
    action: () => ({ type: 'reopenTab' }),
  },
  {
    id: 'nextTab',
    group: 'Tabs',
    label: 'Nächster Tab',
    triggers: [
      { by: 'code', code: 'Tab', ctrl: true },
      { by: 'code', code: 'PageDown', ctrl: true },
    ],
    action: () => ({ type: 'nextTab' }),
  },
  {
    id: 'previousTab',
    group: 'Tabs',
    label: 'Vorheriger Tab',
    triggers: [
      { by: 'code', code: 'Tab', ctrl: true, shift: true },
      { by: 'code', code: 'PageUp', ctrl: true },
    ],
    action: () => ({ type: 'previousTab' }),
  },
  {
    id: 'tabAt',
    group: 'Tabs',
    label: 'Zum ersten bis neunten Tab',
    triggers: [{ by: 'digit' }],
    action: (digit) => ({ type: 'tabAt', index: digit - 1 }),
  },
  {
    id: 'renameTab',
    group: 'Tabs',
    label: 'Tab umbenennen',
    triggers: [{ by: 'code', code: 'F2' }],
    action: () => ({ type: 'renameTab' }),
  },
  {
    id: 'copy',
    group: 'Bearbeiten',
    label: 'Kopieren',
    triggers: [{ by: 'code', code: 'KeyC', ctrl: true, shift: true }],
    action: () => ({ type: 'copy' }),
  },
  {
    id: 'paste',
    group: 'Bearbeiten',
    label: 'Einfügen',
    triggers: [{ by: 'code', code: 'KeyV', ctrl: true, shift: true }],
    action: () => ({ type: 'paste' }),
  },
  {
    id: 'fontBigger',
    group: 'Darstellung',
    label: 'Schrift grösser',
    // `=` zählt wie `+` (US-Tastatur ohne Shift, wie in Browsern).
    triggers: [{ by: 'char', char: '+', aliases: ['='], anyShift: true }],
    action: () => ({ type: 'fontSize', step: 1 }),
  },
  {
    id: 'fontSmaller',
    group: 'Darstellung',
    label: 'Schrift kleiner',
    triggers: [{ by: 'char', char: '-', anyShift: true }],
    action: () => ({ type: 'fontSize', step: -1 }),
  },
  {
    id: 'fontReset',
    group: 'Darstellung',
    label: 'Schriftgrösse zurücksetzen',
    // In der Zahlenreihe oder auf dem Ziffernblock; ohne Shift, sonst wäre es auf der Schweizer Tastatur `=`.
    triggers: [{ by: 'char', char: '0' }],
    action: () => ({ type: 'resetFontSize' }),
  },
  {
    id: 'fontWheel',
    group: 'Darstellung',
    label: 'Schriftgrösse ändern',
    triggers: [{ by: 'wheel' }],
    action: (direction) => ({ type: 'fontSize', step: direction < 0 ? -1 : 1 }),
  },
  {
    id: 'palette',
    group: 'Fenster',
    label: 'Befehlspalette',
    triggers: [{ by: 'code', code: 'KeyP', ctrl: true, shift: true }],
    action: () => ({ type: 'palette' }),
  },
];

/** Ein erkanntes Kürzel: der Eintrag der Tabelle und die Aktion, die er für diese Taste liefert. */
export interface ShortcutMatch {
  shortcut: Shortcut;
  action: ShortcutAction;
}

/**
 * Sucht das Kürzel zu einem Tastendruck in der Tabelle; `null`, wenn die Taste ans Terminal gehört.
 * Mit Alt (auch AltGr, das Windows als Ctrl+Alt meldet) ist nie ein Kürzel gemeint. Zuerst zählt die Tastenposition,
 * dann das erzeugte Zeichen: So bleibt Ctrl+1 auch dort der Sprung zum ersten Tab, wo die Taste ein Zeichen wie `-`
 * erzeugt.
 */
export function matchShortcut(e: KeyInput): ShortcutMatch | null {
  if (e.altKey || e.metaKey) return null;
  return findMatch(e, BY_POSITION) ?? findMatch(e, BY_CHARACTER);
}

/** Liefert die Aktion zu einem Tastendruck oder `null`, wenn die Taste ans Terminal gehört. */
export function resolveShortcut(e: KeyInput): ShortcutAction | null {
  return matchShortcut(e)?.action ?? null;
}

/**
 * Liefert die Aktion zu einem Schritt des Mausrads (`direction`: 1 nach oben, -1 nach unten) oder `null`, wenn das
 * Mausrad normal scrollen soll.
 */
export function resolveWheel(e: WheelInput, direction: 1 | -1): ShortcutAction | null {
  if (!e.ctrlKey) return null;
  const shortcut = SHORTCUTS.find((s) => s.triggers.some((t) => t.by === 'wheel'));
  return shortcut ? shortcut.action(direction) : null;
}

const BY_POSITION = new Set<Trigger['by']>(['code', 'digit']);
const BY_CHARACTER = new Set<Trigger['by']>(['letter', 'char']);

function findMatch(e: KeyInput, kinds: Set<Trigger['by']>): ShortcutMatch | null {
  for (const shortcut of SHORTCUTS) {
    for (const trigger of shortcut.triggers) {
      if (!kinds.has(trigger.by)) continue;
      const value = triggerValue(trigger, e);
      if (value !== null) return { shortcut, action: shortcut.action(value) };
    }
  }
  return null;
}

/** Ob die Taste zum Auslöser passt; dann sein Wert (die Ziffer bei Ctrl+1 … 9, sonst 0), sonst `null`. */
function triggerValue(t: Trigger, e: KeyInput): number | null {
  switch (t.by) {
    case 'code':
      return e.code === t.code && e.ctrlKey === (t.ctrl === true) && e.shiftKey === (t.shift === true) ? 0 : null;
    case 'digit': {
      const digit = /^Digit([1-9])$/.exec(e.code);
      return digit && e.ctrlKey && !e.shiftKey ? Number(digit[1]) : null;
    }
    case 'letter':
      return e.ctrlKey && e.shiftKey && isLetter(e, t.letter) ? 0 : null;
    case 'char':
      if (!e.ctrlKey || (e.shiftKey && !t.anyShift)) return null;
      return e.key === t.char || (t.aliases ?? []).includes(e.key) ? 0 : null;
    case 'wheel':
      return null;
  }
}

/** Ob die Taste diesen Buchstaben erzeugt; ohne lateinischen Buchstaben zählt die Tastenposition (siehe `Trigger`). */
function isLetter(e: KeyInput, letter: string): boolean {
  if (/^[a-z]$/i.test(e.key)) return e.key.toLowerCase() === letter;
  return e.code === `Key${letter.toUpperCase()}`;
}

// ---------- Anzeige ----------

/**
 * Eine Tastenkombination zur Anzeige: Tasten mit „+“ dazwischen; `through` setzt eine Reihe fort (Ctrl+1 … 9),
 * `gesture` ist eine Bewegung statt einer Taste (Ctrl + Mausrad).
 */
export interface KeyCombo {
  keys: string[];
  through?: string;
  gesture?: string;
}

/** Ein Abschnitt der Übersicht mit seinen Kürzeln, in der Reihenfolge der Tabelle. */
export interface ShortcutSection {
  group: ShortcutGroup;
  shortcuts: { shortcut: Shortcut; combos: KeyCombo[] }[];
}

/** Die Übersicht der Tastenkürzel, erzeugt aus der Tabelle: jedes Kürzel einmal, nach Abschnitten. */
export function shortcutOverview(): ShortcutSection[] {
  return SHORTCUT_GROUPS.map((group) => ({
    group,
    shortcuts: SHORTCUTS.filter((s) => s.group === group).map((shortcut) => ({
      shortcut,
      combos: shortcut.triggers.map(triggerCombo),
    })),
  })).filter((section) => section.shortcuts.length > 0);
}

/** Die erste Tastenkombination eines Kürzels als Text, z.B. „Ctrl+Shift+T“, als Hinweis neben einem Befehl. */
export function shortcutHint(id: string): string | undefined {
  const trigger = SHORTCUTS.find((s) => s.id === id)?.triggers[0];
  return trigger ? comboText(triggerCombo(trigger)) : undefined;
}

/** Eine Tastenkombination als Text, z.B. „Ctrl+Shift+T“, „Ctrl+1 … 9“ oder „Ctrl + Mausrad“. */
export function comboText(combo: KeyCombo): string {
  const keys = combo.keys.join('+');
  if (combo.through) return `${keys} … ${combo.through}`;
  if (combo.gesture) return `${keys} + ${combo.gesture}`;
  return keys;
}

/** Wie der Auslöser in der Übersicht erscheint. */
function triggerCombo(t: Trigger): KeyCombo {
  switch (t.by) {
    case 'code':
      return { keys: [...(t.ctrl ? ['Ctrl'] : []), ...(t.shift ? ['Shift'] : []), keyName(t.code)] };
    case 'digit':
      return { keys: ['Ctrl', '1'], through: '9' };
    case 'letter':
      return { keys: ['Ctrl', 'Shift', t.letter.toUpperCase()] };
    case 'char':
      return { keys: ['Ctrl', t.char] };
    case 'wheel':
      return { keys: ['Ctrl'], gesture: 'Mausrad' };
  }
}

/** Beschriftung einer Taste nach ihrer Position: „KeyT“ → „T“, „Digit1“ → „1“, sonst der Name („Tab“, „F2“). */
function keyName(code: string): string {
  return /^(?:Key|Digit)(.)$/.exec(code)?.[1] ?? code;
}
