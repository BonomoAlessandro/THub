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
