// Umgebung, mit der das Terminal-Backend die Shells startet. Lädt nie Electron und kein node-pty.

import * as fs from 'node:fs';
import * as path from 'node:path';

/** Geerbte Variablen, die nie in eine Shell gelangen; `TERMHUB_` stammt aus der Zeit, als THub TermHub hiess. */
const DROPPED = /^(npm_|ELECTRON_|THUB_|TERMHUB_)/i;

/** Ziele, die nie über einen Proxy laufen: die lokale Schnittstelle von THub und Claudes HTTP-Hooks. */
const LOCAL_HOSTS = ['127.0.0.1', 'localhost'];

/**
 * Umgebung für die Shell: die eigene, ohne npm-/Electron-Interna aus dem Dev-Start und ohne THUB_* oder
 * TERMHUB_* (etwa wenn THub aus einem THub- oder TermHub-Tab gestartet wurde); die THUB_* setzt der Kern
 * im Startauftrag neu. `NO_PROXY` wird um `127.0.0.1,localhost` ergänzt, damit Anfragen an THub nicht über
 * einen Firmen-Proxy laufen. `PSModulePath` verliert die Modulordner von PowerShell 7 (`withoutPowerShell7Modules`).
 * @param isFile ob es diese Datei gibt; nur für Tests ersetzbar
 */
export function shellEnv(
  inherited: NodeJS.ProcessEnv = process.env,
  isFile: (file: string) => boolean = fs.existsSync,
): Record<string, string> {
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
    if (key.toUpperCase() === 'PSMODULEPATH') {
      const modulePath = withoutPowerShell7Modules(value, isFile);
      if (modulePath) env[key] = modulePath;
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

/**
 * `PSModulePath` ohne die Modulordner von PowerShell 7, sonst unverändert; ein leerer Text heisst: Variable
 * weglassen.
 *
 * Wurde THub aus PowerShell 7 gestartet, erbt es dessen PSModulePath mit den Ordnern von PowerShell 7 vorne.
 * Windows PowerShell 5.1 findet dort zuerst die Fassung von PowerShell 7 von Modulen wie
 * Microsoft.PowerShell.Security und kann sie nicht laden: In einem Windows-PowerShell-Tab, im Starter und in
 * jedem powershell.exe aus cmd oder Git Bash scheitern dann Befehle wie Get-ExecutionPolicy. PowerShell 7 selbst
 * nimmt dieselben Ordner weg, wenn es powershell.exe startet, und ergänzt sie beim eigenen Start wieder.
 *
 * Weggelassen werden Ordner `…\PowerShell\Modules` (Benutzer- und gemeinsamer Modulordner von PowerShell 7, auch
 * in umgeleiteten Dokumenten) und Ordner, neben denen ein pwsh.exe liegt (`$PSHOME\Modules`).
 */
export function withoutPowerShell7Modules(value: string, isFile: (file: string) => boolean = fs.existsSync): string {
  return value
    .split(';')
    .filter((entry) => {
      const dir = entry.trim().replace(/[\\/]+$/, '');
      if (!dir) return false;
      if (/(^|[\\/])PowerShell[\\/]Modules$/i.test(dir)) return false;
      return !isFile(path.win32.join(path.win32.dirname(dir), 'pwsh.exe'));
    })
    .join(';');
}
