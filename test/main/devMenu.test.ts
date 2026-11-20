import type { MenuItemConstructorOptions } from 'electron';
import { describe, expect, it } from 'vitest';
import { DEV_MENU } from '../../src/main/devMenu';

/** Alle Einträge des Menüs, auch die in Untermenüs. */
function allItems(items: MenuItemConstructorOptions[]): MenuItemConstructorOptions[] {
  return items.flatMap((item) => [
    item,
    ...(Array.isArray(item.submenu) ? allItems(item.submenu as MenuItemConstructorOptions[]) : []),
  ]);
}

describe('Menü der Entwicklungsversion', () => {
  const items = allItems(DEV_MENU);

  it('hat keine Zoom-Befehle: Ctrl+Plus, Ctrl+Minus und Ctrl+0 gehören der Schriftgrösse', () => {
    const roles = items.map((item) => item.role?.toLowerCase());

    // „viewMenu“ brächte Zoom-Befehle mit, „zoom“ im Fenstermenü maximiert nur.
    for (const role of ['zoomin', 'zoomout', 'resetzoom', 'viewmenu']) expect(roles).not.toContain(role);
    expect(items.filter((item) => item.accelerator)).toEqual([]);
  });

  it('behält Neu laden und die Entwicklerwerkzeuge', () => {
    const roles = items.map((item) => item.role);

    expect(roles).toEqual(expect.arrayContaining(['reload', 'forceReload', 'toggleDevTools']));
  });
});
