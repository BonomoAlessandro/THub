// Befehle der Oberfläche, die mehrere Wege auslösen: Tastenkürzel, Maus und Befehlspalette. Tab-Befehle gehen an den
// Kern, Kopieren und Einfügen ans Terminal; was die Oberfläche selbst zeigt (Umbenennen, Palette), meldet sie über
// `UiActions`.

import { FONT_SIZE, type KeepAwakeMode } from '../shared/types';
import type { ShortcutAction } from './shortcuts';
import { versionLabel } from './version';
import { focusTerminal, terminalViews } from './terminal/terminalViews';

const api = window.thub;

/** Was die Oberfläche selbst anzeigt; der Rest geht an den Kern. */
export interface UiActions {
  /** Der aktive Tab, auf den sich Schliessen, Umbenennen, Kopieren und Einfügen beziehen. */
  activeTabId: string | null;
  /** Den Namen dieses Tabs bearbeiten (wie Doppelklick). */
  startRename(tabId: string): void;
  openPalette(): void;
}

/** Führt ein Tastenkürzel aus. */
export function runShortcut(action: ShortcutAction, ui: UiActions): void {
  const activeId = ui.activeTabId;
  switch (action.type) {
    case 'newTab':
      newTab();
      return;
    // Der Kern schliesst sofort oder fragt erst zurück.
    case 'closeTab':
      if (activeId) closeTab(activeId);
      return;
    case 'reopenTab':
      api.send({ type: 'reopenClosedTab' });
      return;
    case 'copy':
      if (activeId) void terminalViews.get(activeId)?.copySelection();
      return;
    case 'paste':
      if (activeId) void terminalViews.get(activeId)?.paste();
      return;
    case 'nextTab':
      api.send({ type: 'activateRelativeTab', offset: 1 });
      return;
    case 'previousTab':
      api.send({ type: 'activateRelativeTab', offset: -1 });
      return;
    case 'tabAt':
      api.send({ type: 'activateTabAt', index: action.index });
      return;
    case 'renameTab':
      if (activeId) ui.startRename(activeId);
      return;
    // Die Schriftgrösse aller Terminals speichert der Kern; er meldet sie zurück, dann passen sich die Terminals an.
    case 'fontSize':
      api.send({ type: 'stepFontSize', step: action.step });
      return;
    case 'resetFontSize':
      api.send({ type: 'updateSettings', patch: { fontSize: FONT_SIZE.default } });
      return;
    case 'palette':
      ui.openPalette();
      return;
  }
}

/** Neues Terminal im Standardordner mit der Standard-Shell (`+`, Ctrl+Shift+T). */
export function newTab(): void {
  api.send({ type: 'createTab' });
}

/** Öffnet den Ordner-Dialog von Windows; der gewählte Ordner bekommt ein neues Terminal („Ordner wählen …“). */
export async function pickFolderForNewTab(): Promise<void> {
  const dir = await api.pickDirectory('newTab');
  if (dir) api.send({ type: 'createTab', cwd: dir });
}

/** Einen Tab schliessen (×, mittlere Maustaste, Ctrl+Shift+W). Läuft darin noch etwas, fragt der Kern erst zurück. */
export function closeTab(tabId: string): void {
  api.send({ type: 'requestClose', tabIds: [tabId] });
}

/** Alle Tabs ausser diesem schliessen, mit höchstens einer gemeinsamen Rückfrage des Kerns. */
export function closeOtherTabs(tabId: string): void {
  api.send({ type: 'closeOtherTabs', tabId });
}

/** Einen Tab anzeigen (Klick auf den Tab); ist er schon aktiv, bekommt nur sein Terminal den Fokus. */
export function showTab(tabId: string, activeTabId: string | null): void {
  if (tabId === activeTabId) focusTerminal(tabId);
  else api.send({ type: 'activateTab', tabId });
}

/** Öffnet den Ordner-Dialog von Windows; der gewählte Ordner wird der Standardordner („Ändern …“ in den Einstellungen). */
export async function pickDefaultFolder(): Promise<void> {
  const dir = await api.pickDirectory('defaultCwd');
  if (dir) api.send({ type: 'updateSettings', patch: { defaultCwd: dir } });
}

/**
 * Rechner wach halten mit dieser Stufe (Pfeil-Menü am Schalter, Befehlspalette): setzt die Stufe und schaltet ein. Ist
 * genau diese Stufe schon an, ändert sich nichts.
 */
export function keepAwake(mode: KeepAwakeMode): void {
  api.send({ type: 'updateSettings', patch: { keepAwake: true, keepAwakeMode: mode } });
}

/** Schaltet das Wachhalten ein (mit der gewählten Stufe) oder aus (Klick auf den Schalter, „Wachhalten beenden“). */
export function setKeepAwake(on: boolean): void {
  api.send({ type: 'updateSettings', patch: { keepAwake: on } });
}

/**
 * „Version kopieren“ (Klick auf die Versionszeile in den Einstellungen, Befehlspalette): legt die Zeile, etwa
 * „THub 2.0.0 · e8e865a“, in die Zwischenablage, zum Einfügen in eine Fehlermeldung. Liefert den kopierten Text.
 */
export async function copyVersion(): Promise<string> {
  const label = versionLabel(await api.loadAppInfo());
  await api.writeClipboard(label);
  return label;
}
