import type { TerminalView } from './TerminalView';

/**
 * Alle offenen Terminal-Ansichten, nach Tab-Kennung. Ausgabe, Ende und Hinweise des Kerns gehen
 * direkt an die Ansicht, ohne Umweg über den React-Zustand.
 */
export const terminalViews = new Map<string, TerminalView>();

/** Gibt dem Terminal eines Tabs den Fokus. */
export function focusTerminal(tabId: string | null): void {
  if (tabId) terminalViews.get(tabId)?.focus();
}

type TerminalChangeListener = (tabId: string) => void;
const changeListeners = new Set<TerminalChangeListener>();

/**
 * Meldet, dass sich im Terminal eines Tabs etwas geändert hat, das die Lage seiner Eingabe betreffen kann: Ausgabe,
 * Cursor, Scrollen, Grösse oder Schrift. Die Hinweise weichen damit der Eingabe aus (Ticket 32).
 */
export function notifyTerminalChange(tabId: string): void {
  for (const listener of changeListeners) listener(tabId);
}

/** Hört auf Änderungen in allen Terminals; liefert, wie man wieder aufhört. */
export function onTerminalChange(listener: TerminalChangeListener): () => void {
  changeListeners.add(listener);
  return () => changeListeners.delete(listener);
}
