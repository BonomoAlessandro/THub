// „Ordner im Explorer öffnen“ im Rechtsklick-Menü am Tab. Electron (`shell.openPath`) kommt nur über eine schmale
// Schnittstelle herein, damit es sich ohne Explorer-Fenster prüfen lässt.

import type { Workspace } from './workspace/workspace';

/** Was das Öffnen von der Aussenwelt braucht. */
export interface FolderOpener {
  directoryExists(dir: string): boolean;
  /** Öffnet einen Ordner im Explorer, wie `shell.openPath` von Electron: liefert eine Fehlermeldung, leer bei Erfolg. */
  openPath(dir: string): Promise<string>;
}

/**
 * Öffnet den aktuellen Ordner eines Tabs im Explorer. Die Kennung kommt aus dem Renderer, welcher Ordner das ist,
 * bestimmt der Kern (`tabFolder`). Geöffnet wird nur ein Ordner, den es gibt, nie eine Datei: `shell.openPath` würde
 * eine Datei mit ihrem Programm öffnen oder sie ausführen.
 * @returns der geöffnete Ordner, `null`, wenn nichts geöffnet wurde
 */
export async function openTabFolder(
  workspace: Pick<Workspace, 'tabFolder'>,
  tabId: unknown,
  opener: FolderOpener,
): Promise<string | null> {
  const dir = typeof tabId === 'string' ? workspace.tabFolder(tabId) : undefined;
  if (!dir) return null;
  if (!opener.directoryExists(dir)) {
    console.error(`Ordner im Explorer öffnen: ${dir} gibt es nicht mehr.`);
    return null;
  }
  const error = await opener.openPath(dir);
  if (error) {
    console.error(`Ordner im Explorer öffnen: ${dir} liess sich nicht öffnen: ${error}`);
    return null;
  }
  return dir;
}
