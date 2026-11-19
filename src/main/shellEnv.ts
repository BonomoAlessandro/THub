// Umgebung, mit der das Terminal-Backend die Shells startet. Lädt nie Electron und kein node-pty.

/** Geerbte Variablen, die nie in eine Shell gelangen; `TERMHUB_` stammt aus der Zeit, als THub TermHub hiess. */
const DROPPED = /^(npm_|ELECTRON_|THUB_|TERMHUB_)/i;

/**
 * Umgebung für die Shell: die eigene, ohne npm-/Electron-Interna aus dem Dev-Start und ohne THUB_* oder
 * TERMHUB_* (etwa wenn THub aus einem THub- oder TermHub-Tab gestartet wurde); die THUB_* setzt der Kern
 * im Startauftrag neu.
 */
export function shellEnv(inherited: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(inherited)) {
    if (value === undefined) continue;
    if (DROPPED.test(key)) continue;
    env[key] = value;
  }
  return env;
}
