// Menü der Entwicklungsversion (npm start): wie Electrons Standardmenü, mit Neu laden und
// Entwicklerwerkzeugen, aber ohne Zoom (Ticket 18). Ctrl+Plus, Ctrl+Minus, Ctrl+0 und Ctrl + Mausrad
// ändern in THub die Schriftgrösse der Terminals, nicht die Grösse der ganzen Oberfläche.
// Die installierte App hat kein Menü.

import type { MenuItemConstructorOptions } from 'electron';

export const DEV_MENU: MenuItemConstructorOptions[] = [
  { role: 'fileMenu' },
  { role: 'editMenu' },
  // Statt der Rolle „viewMenu“, die Zoom-Befehle samt Tastenkürzeln mitbringt.
  {
    label: 'Ansicht',
    submenu: [{ role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' }, { type: 'separator' }, { role: 'togglefullscreen' }],
  },
  { role: 'windowMenu' },
];
