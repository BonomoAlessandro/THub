// Offene Menüs und Dialoge. Solange eines offen ist, gehören die Tasten ihm: Die Tastenkürzel der App
// (neuer Tab, Tab-Wechsel, Umbenennen …) ruhen, und nichts geht ans Terminal.

import { useLayoutEffect } from 'react';

let openCount = 0;

/** Ob gerade ein Menü oder Dialog offen ist. */
export function isPopupOpen(): boolean {
  return openCount > 0;
}

/** Meldet ein Menü oder einen Dialog als offen, solange die Komponente angezeigt wird. */
export function usePopupOpen(): void {
  useLayoutEffect(() => {
    openCount++;
    return () => {
      openCount--;
    };
  }, []);
}
