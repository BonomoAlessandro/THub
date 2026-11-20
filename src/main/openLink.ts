// Ctrl+Klick auf einen Link im Terminal: Der Hauptprozess öffnet ihn im Standardbrowser. Electron (`shell.openExternal`)
// kommt nur über eine schmale Schnittstelle herein, damit es sich ohne Browser-Fenster prüfen lässt.

import { webLink } from '../shared/links';

/** Was das Öffnen von der Aussenwelt braucht. */
export interface LinkOpener {
  /** Öffnet eine Adresse im Standardbrowser, wie `shell.openExternal` von Electron. */
  openExternal(url: string): Promise<void>;
}

/**
 * Öffnet einen Link aus dem Renderer im Standardbrowser. Der Renderer schickt nur http- und https-Adressen; geprüft
 * wird hier trotzdem noch einmal, denn `shell.openExternal` öffnet auch Dateien und Programme (`file:` und Ähnliches).
 * @returns die geöffnete Adresse, `null`, wenn nichts geöffnet wurde
 */
export async function openWebLink(value: unknown, opener: LinkOpener): Promise<string | null> {
  const url = webLink(value);
  if (!url) {
    console.error(`Link öffnen: ${String(value).slice(0, 200)} ist keine http- oder https-Adresse.`);
    return null;
  }
  try {
    await opener.openExternal(url);
    return url;
  } catch (err) {
    console.error(`Link öffnen: ${url} liess sich nicht öffnen:`, err);
    return null;
  }
}
