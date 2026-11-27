// Solange ein Menü offen ist, ist die Titelleiste keine Zieh-Fläche (Ticket 39).
//
// Die freie Fläche der Titelleiste ist eine Zieh-Fläche (`-webkit-app-region: drag`). Einen Klick dort behandelt Windows
// selbst, als Klick auf den Rahmen des Fensters; die Seite bekommt kein mousedown, und ein offenes Menü bliebe offen.
// Deshalb trägt das Wurzel-Element ein Merkmal, solange ein Menü offen ist, und das CSS nimmt die Titelleiste dann von
// der Zieh-Fläche aus. Der erste Klick dort landet bei der Seite und schliesst das Menü wie jeder Klick daneben; erst
// danach verschiebt die freie Fläche wieder das Fenster, wie bei den Menüs von Windows.

import { useLayoutEffect } from 'react';

/** Merkmal am Wurzel-Element (`<html>`), solange mindestens ein Menü offen ist. */
export const MENU_OPEN_ATTRIBUTE = 'data-menu-open';

/** Das Element, das das Merkmal trägt; im Betrieb `document.documentElement`. */
export interface MarkTarget {
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
}

export interface MenuOpenMark {
  /**
   * Meldet ein Menü als offen. Die gelieferte Funktion meldet es wieder ab; ein zweiter Aufruf ändert nichts. Das
   * Merkmal bleibt, solange noch ein anderes Menü gemeldet ist, egal in welcher Reihenfolge Menüs auf- und zugehen.
   */
  open(): () => void;
}

/** Zählt die offenen Menüs und setzt das Merkmal, solange es mindestens eines gibt. */
export function createMenuOpenMark(target: MarkTarget): MenuOpenMark {
  let openCount = 0;
  return {
    open() {
      if (openCount++ === 0) target.setAttribute(MENU_OPEN_ATTRIBUTE, '');
      let closed = false;
      return () => {
        if (closed) return;
        closed = true;
        if (--openCount === 0) target.removeAttribute(MENU_OPEN_ATTRIBUTE);
      };
    },
  };
}

let mark: MenuOpenMark | null = null;

/**
 * Meldet ein Menü als offen, solange die Komponente angezeigt wird. Ersetzt ein Menü direkt ein anderes, laufen Abmelden
 * und Anmelden im selben Durchgang von React; dazwischen zeichnet Chromium nicht, und die Titelleiste bleibt ohne
 * Zieh-Fläche.
 */
export function useMenuOpenMark(): void {
  useLayoutEffect(() => (mark ??= createMenuOpenMark(document.documentElement)).open(), []);
}
