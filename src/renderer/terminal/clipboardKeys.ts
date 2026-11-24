// Ctrl+C und Ctrl+V im Terminal (Ticket 34): Beim Tastendruck entscheidet sich, ob THub kopiert, einfügt oder die Taste
// dem Programm lässt. Ohne DOM und ohne `window.thub`, damit es sich in Node mit einem echten xterm.js prüfen lässt.

import type { Terminal } from '@xterm/xterm';
import type { ShellOption, TabSnapshot } from '../../shared/types';

/** Was `Ctrl+C` bzw. `Ctrl+V` tut: THub kopiert, THub fügt ein, oder die Taste geht als `^C` bzw. `^V` ans Programm. */
export type ClipboardKeyAction = 'copy' | 'paste' | 'program';

/**
 * Die Shells, in denen PSReadLine `Ctrl+V` selbst einfügt: PowerShell 7 und Windows PowerShell. PSReadLine belegt die
 * Taste im Windows-Modus mit „Paste“, liest die Zwischenablage selbst und übernimmt mehrzeiligen Text als Ganzes in die
 * Eingabe. Fügte THub dort ein, käme jeder Zeilenumbruch als Enter an, weil PowerShell keinen Bracketed Paste verlangt.
 */
const SHELLS_THAT_PASTE = new Set(['pwsh', 'powershell']);

/**
 * Was `Ctrl+C` (`copy`) bzw. `Ctrl+V` (`paste`) im Terminal eines Tabs tut, wie im Windows Terminal:
 * - `Ctrl+C` kopiert, wenn THub im Terminal etwas markiert hat; sonst geht es ans Programm (Abbrechen). Das gilt auch bei
 *   eingeschalteter Mausmeldung (Claude im Vollbild): Eine Markierung von THub entsteht dort nur mit Shift + Ziehen und
 *   ist damit gewollt. Markiert Claude selbst, hat THub keine Markierung, und Claude bekommt `^C` und kopiert.
 * - `Ctrl+V` fügt ein, mit Bracketed Paste, wenn das Programm es verlangt. Ausnahme: In PowerShell und Windows PowerShell
 *   geht es ans Programm, solange dieses keinen Bracketed Paste verlangt; dort fügt PSReadLine selbst ein. Läuft dort
 *   Claude, verlangt es Bracketed Paste, und THub fügt ein.
 * @param shellId Kennung der Shell, mit der der Tab läuft (`runningShellId`), z.B. "pwsh"
 */
export function clipboardKeyAction(
  key: 'copy' | 'paste',
  term: Pick<Terminal, 'modes' | 'hasSelection'>,
  shellId: string | undefined,
): ClipboardKeyAction {
  if (key === 'copy') return term.hasSelection() ? 'copy' : 'program';
  if (shellId !== undefined && SHELLS_THAT_PASTE.has(shellId) && !term.modes.bracketedPasteMode) return 'program';
  return 'paste';
}

/**
 * Die Shell, mit der ein Tab läuft: seine eigene, wenn es sie auf diesem Rechner gibt, sonst die Standard-Shell (so
 * startet sie der Kern).
 */
export function runningShellId(
  tab: Pick<TabSnapshot, 'shellId'>,
  shells: readonly Pick<ShellOption, 'id'>[],
  defaultShellId: string,
): string {
  return shells.some((s) => s.id === tab.shellId) ? tab.shellId : defaultShellId;
}
