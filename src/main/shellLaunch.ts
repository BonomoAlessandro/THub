// Wie das Terminal-Backend eine Shell mit der mitgelieferten Integration startet (Ticket 07).
// Befunde dazu: docs/spikes/starter.md, „Robust laden“ und „Startbefehl“. Lädt nie Electron und kein node-pty.
//
//   PowerShell 7/5.1  <Programm> -NoLogo -NoProfile -NoExit -EncodedCommand <integration.ps1, UTF-16LE, Base64>
//                     Die Integration lädt die Profile des Nutzers selbst; -EncodedCommand ist keine
//                     Skriptdatei, eine Execution Policy blockiert es also nicht.
//   cmd               cmd.exe /s /k ""<…>\integration.cmd" & <Startbefehl>"   (ohne /d: AutoRun läuft wie gewohnt)
//   Git Bash          bash.exe --rcfile <…>/integration.bash -i
//                     Die Startdatei lädt, was eine Login-Shell von Git Bash lädt.
//
// Der Startbefehl kommt bei PowerShell und Git Bash über THUB_START_CMD (die Integration entfernt die
// Variable vor dem Ausführen), bei cmd in die /k-Zeile hinter die Integration.
//
// Den claude-Ersatz richtet jede Integration nur ein, wenn THUB_STARTER gesetzt ist (Ticket 11): voller Pfad zu
// starter.ps1 im selben Ordner. Das Backend setzt die Variable selbst; eine Vorgabe aus der Umgebung oder dem
// Startauftrag zählt nicht.

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { StartOrder } from './workspace/ports';

/** So startet node-pty die Shell. */
export interface ShellLaunch {
  file: string;
  /** Argumentliste oder, bei cmd, die fertige Befehlszeile hinter dem Programm (node-pty nimmt beides). */
  args: string[] | string;
  env: Record<string, string>;
}

export interface ShellLaunchOptions {
  /**
   * Den claude-Ersatz einrichten (THUB_STARTER). Nein, wenn eine Gruppenrichtlinie den Starter blockieren würde
   * (siehe executionPolicy.ts): Dann läuft `claude` direkt, ohne Erfassung.
   */
  claudeStarter: boolean;
}

/** Dateiname des claude-Starters im Ordner der Integrationsdateien. */
export const STARTER_FILE_NAME = 'starter.ps1';

/**
 * Ordner mit den Integrationsdateien (`resources/shell`). Im installierten Paket liegen sie als echte
 * Dateien ausserhalb des asar-Archivs unter `resources\shell` (`extraResources` in package.json).
 * @param resourcesPath `process.resourcesPath`
 * @param appPath `app.getAppPath()`, unpaketiert der Projektordner
 */
export function shellIntegrationDir(isPackaged: boolean, resourcesPath: string, appPath: string): string {
  return isPackaged ? path.join(resourcesPath, 'shell') : path.join(appPath, 'resources', 'shell');
}

/**
 * Baut den Start einer Shell aus dem Startauftrag. Fehlt die Integrationsdatei oder lässt sie sich nicht
 * lesen, startet die Shell ohne Integration wie bisher (mit `order.args`), damit das Terminal trotzdem geht.
 * @param env vollständige Umgebung der Shell (bereinigte eigene Umgebung plus `order.env`)
 * @param shellDir Ordner mit den Integrationsdateien
 */
export function shellLaunch(
  order: StartOrder,
  env: Record<string, string>,
  shellDir: string,
  options: ShellLaunchOptions = { claudeStarter: true },
): ShellLaunch {
  const plain: ShellLaunch = { file: order.file, args: order.args, env };
  try {
    const starter = order.integration && options.claudeStarter ? starterPath(shellDir) : undefined;
    switch (order.integration) {
      case 'powershell': {
        const code = fs.readFileSync(path.join(shellDir, 'integration.ps1'), 'utf8');
        const encoded = Buffer.from(code, 'utf16le').toString('base64');
        return {
          file: order.file,
          args: ['-NoLogo', '-NoProfile', '-NoExit', '-EncodedCommand', encoded],
          env: launchEnv(env, order.startCommand, starter),
        };
      }
      case 'cmd': {
        const init = requireFile(path.join(shellDir, 'integration.cmd'));
        // In der /k-Zeile läuft der Startbefehl wie eine getippte Zeile, nicht im Batch-Kontext der
        // Integrationsdatei: So fragt cmd nach Ctrl+C nicht „Batchvorgang abbrechen (J/N)?“.
        const line = order.startCommand ? `"${init}" & ${order.startCommand}` : `"${init}"`;
        return { file: order.file, args: `/s /k "${line}"`, env: launchEnv(env, undefined, starter) };
      }
      case 'bash': {
        const rc = requireFile(path.join(shellDir, 'integration.bash'));
        return {
          file: order.file,
          args: ['--rcfile', rc.replace(/\\/g, '/'), '-i'],
          env: launchEnv(env, order.startCommand, starter),
        };
      }
      default:
        // Ohne Integration (etwa WSL): kein Startbefehl.
        return plain;
    }
  } catch (err) {
    console.error('Shell-Integration fehlt, die Shell startet ohne:', err);
    return plain;
  }
}

/**
 * Umgebung mit genau diesem Startbefehl in THUB_START_CMD und genau diesem Starter in THUB_STARTER; ohne Wert
 * jeweils ohne die Variable.
 */
function launchEnv(
  env: Record<string, string>,
  startCommand: string | undefined,
  starter: string | undefined,
): Record<string, string> {
  const result = { ...env };
  delete result.THUB_START_CMD;
  delete result.THUB_STARTER;
  if (startCommand) result.THUB_START_CMD = startCommand;
  if (starter) result.THUB_STARTER = starter;
  return result;
}

/** Voller Pfad zum Starter; fehlt die Datei, gibt es keinen Ersatz, und `claude` läuft direkt. */
function starterPath(shellDir: string): string | undefined {
  const file = path.join(shellDir, STARTER_FILE_NAME);
  if (fs.existsSync(file)) return file;
  console.error(`claude-Starter fehlt, claude wird nicht erfasst: ${file}`);
  return undefined;
}

function requireFile(file: string): string {
  if (!fs.statSync(file).isFile()) throw new Error(`Keine Datei: ${file}`);
  return file;
}
