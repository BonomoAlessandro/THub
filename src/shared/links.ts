// Links aus dem Terminal, die THub im Standardbrowser öffnet (Ctrl+Klick). Renderer und Hauptprozess prüfen mit
// derselben Regel: Der Renderer schickt nur, was sie erfüllt, und der Hauptprozess prüft selbst noch einmal.

/** Längste Adresse, die THub öffnet; längere sind kein Link aus einer Ausgabe, sondern Unfug. */
export const MAX_LINK_LENGTH = 8192;

/**
 * Die Adresse, die THub für einen Link öffnet: nur `http:` und `https:`, nie `file:`, `javascript:` oder Ähnliches.
 * Geprüft wird mit dem URL-Parser; geöffnet wird die von ihm normalisierte Form.
 * @returns die normalisierte Adresse, `null`, wenn sich der Wert nicht öffnen lässt
 */
export function webLink(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > MAX_LINK_LENGTH) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
}
