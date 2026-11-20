// Maus im Terminal: Rechtsklick zum Kopieren und Einfügen, Ctrl+Klick auf Links. Ohne `window.thub` und ohne DOM,
// damit es sich in Node mit einem echten xterm.js prüfen lässt; die Zwischenablage kommt über eine schmale Schnittstelle.

import type { Terminal } from '@xterm/xterm';
import { webLink } from '../../shared/links';

/** Die Zwischenablage, die das Terminal benutzt (in THub über den Hauptprozess, im Testmodus im Speicher). */
export interface TerminalClipboard {
  read(): Promise<string>;
  write(text: string): Promise<void>;
}

/** Was die Maus-Regeln vom Terminal brauchen; ein xterm.js-`Terminal` erfüllt es. */
export type MouseTerminal = Pick<Terminal, 'modes' | 'hasSelection' | 'getSelection' | 'clearSelection' | 'paste'>;

/** Die Tasten eines Mausereignisses, auf die es ankommt. */
export interface MouseButtons {
  /** Die gedrückte Taste wie bei `MouseEvent.button`: 0 links, 1 Mitte, 2 rechts. */
  button: number;
  ctrlKey: boolean;
  shiftKey: boolean;
}

/**
 * Gehört ein Klick dem Programm im Terminal statt THub? So ist es, solange das Programm die Mausmeldung eingeschaltet hat
 * (DECSET 1000, 1002 oder 1003; Claude Code im Vollbild etwa mit `?1000h?1002h?1003h?1006h`): xterm.js schickt ihm den
 * Klick dann als Mausereignis, und das Programm reagiert selbst darauf. Claude fügt bei einem Rechtsklick selbst ein und
 * öffnet bei Ctrl+Klick einen Link selbst; täte THub dasselbe, geschähe alles doppelt.
 * Mit Shift gehört der Klick THub: xterm.js meldet ihn dann nicht ans Programm. So hält es auch das Windows Terminal.
 */
export function clickBelongsToProgram(term: Pick<Terminal, 'modes'>, event: Pick<MouseButtons, 'shiftKey'>): boolean {
  return term.modes.mouseTrackingMode !== 'none' && !event.shiftKey;
}

/** Was ein Rechtsklick ins Terminal tut: kopieren, einfügen oder nichts, weil er dem Programm gehört. */
export type RightClickAction = 'copy' | 'paste' | 'program';

/** Rechtsklick wie in der Windows-Konsole: mit Auswahl kopieren, sonst einfügen; es sei denn, er gehört dem Programm. */
export function rightClickAction(
  term: Pick<Terminal, 'modes' | 'hasSelection'>,
  event: Pick<MouseButtons, 'shiftKey'>,
): RightClickAction {
  if (clickBelongsToProgram(term, event)) return 'program';
  return term.hasSelection() ? 'copy' : 'paste';
}

/** Kopiert die Auswahl in die Zwischenablage und hebt sie auf. Ohne Auswahl passiert nichts. */
export async function copySelection(term: MouseTerminal, clipboard: TerminalClipboard): Promise<void> {
  if (!term.hasSelection()) return;
  await clipboard.write(term.getSelection());
  term.clearSelection();
}

/** Fügt die Zwischenablage ins Terminal ein, wie getippt (mit Bracketed Paste, wenn das Programm es verlangt). */
export async function pasteClipboard(term: MouseTerminal, clipboard: TerminalClipboard): Promise<void> {
  const text = await clipboard.read();
  if (text) term.paste(text);
}

/**
 * Rechtsklick ins Terminal: kopiert, fügt ein oder lässt den Klick dem Programm.
 * @returns was der Rechtsklick getan hat
 */
export async function rightClick(
  term: MouseTerminal,
  event: Pick<MouseButtons, 'shiftKey'>,
  clipboard: TerminalClipboard,
): Promise<RightClickAction> {
  const action = rightClickAction(term, event);
  if (action === 'copy') await copySelection(term, clipboard);
  else if (action === 'paste') await pasteClipboard(term, clipboard);
  return action;
}

/**
 * Welche Adresse ein Klick auf einen Link öffnet: nur Ctrl mit der linken Taste und nur `http:` oder `https:`. Ohne Ctrl
 * passiert nichts, damit beim Markieren nichts aus Versehen aufgeht. Gehört der Klick dem Programm (Mausmeldung an, ohne
 * Shift), öffnet THub ebenfalls nichts; Claude öffnet den Link dann selbst.
 * @returns die zu öffnende Adresse, `null`, wenn der Klick nichts öffnet
 */
export function linkToOpen(term: Pick<Terminal, 'modes'>, event: MouseButtons, uri: string): string | null {
  if (event.button !== 0 || !event.ctrlKey || clickBelongsToProgram(term, event)) return null;
  return webLink(uri);
}
