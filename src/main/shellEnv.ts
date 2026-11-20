// Umgebung, mit der das Terminal-Backend die Shells startet. Lädt nie Electron und kein node-pty.

/** Geerbte Variablen, die nie in eine Shell gelangen; `TERMHUB_` stammt aus der Zeit, als THub TermHub hiess. */
const DROPPED = /^(npm_|ELECTRON_|THUB_|TERMHUB_)/i;

/** Ziele, die nie über einen Proxy laufen: die lokale Schnittstelle von THub und Claudes HTTP-Hooks. */
const LOCAL_HOSTS = ['127.0.0.1', 'localhost'];

/**
 * Umgebung für die Shell: die eigene, ohne npm-/Electron-Interna aus dem Dev-Start und ohne THUB_* oder
 * TERMHUB_* (etwa wenn THub aus einem THub- oder TermHub-Tab gestartet wurde); die THUB_* setzt der Kern
 * im Startauftrag neu. `NO_PROXY` wird um `127.0.0.1,localhost` ergänzt, damit Anfragen an THub nicht über
 * einen Firmen-Proxy laufen.
 */
export function shellEnv(inherited: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const env: Record<string, string> = {};
  const noProxy: string[] = [];
  for (const [key, value] of Object.entries(inherited)) {
    if (value === undefined) continue;
    if (DROPPED.test(key)) continue;
    // Windows unterscheidet Gross-/Kleinschreibung nicht: no_proxy und NO_PROXY sind dieselbe Variable.
    if (key.toUpperCase() === 'NO_PROXY') {
      noProxy.push(value);
      continue;
    }
    env[key] = value;
  }
  const entries = noProxy.flatMap((v) => v.split(',')).map((v) => v.trim()).filter(Boolean);
  for (const host of LOCAL_HOSTS) {
    if (!entries.some((e) => e.toLowerCase() === host)) entries.push(host);
  }
  env.NO_PROXY = [...new Set(entries)].join(',');
  return env;
}
