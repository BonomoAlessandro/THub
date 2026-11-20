// Shell-Erkennung im Hauptprozess: PowerShell 7, Windows PowerShell, cmd, Git Bash und jede installierte
// WSL-Distribution. Der Workspace-Kern bekommt die erkannte Liste übergeben. Lädt nie Electron.
//
// Die Erkennung läuft beim Start einmal, parallel zum Start von Electron. Nur `wsl.exe` und, falls Git Bash
// nicht am Standardort liegt, `reg.exe` werden gestartet, beide ohne Fenster und mit Zeitlimit: Fehlt WSL
// oder antwortet es nicht rechtzeitig, gibt es eben keine WSL-Shells.

import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ShellInfo } from './workspace/ports';
import { shellLabel, wslShellId } from './workspace/shellIds';

/** So lange darf `wsl.exe -l -q` höchstens brauchen; meist antwortet es nach wenigen Zehntelsekunden. */
const WSL_TIMEOUT_MS = 2000;
/** So lange darf eine Abfrage der Registry höchstens brauchen. */
const REGISTRY_TIMEOUT_MS = 2000;

/** Woher die Erkennung ihre Angaben holt: im Betrieb das echte System, im Test nachgemacht. */
export interface ShellDetectionSource {
  /** Eine Umgebungsvariable, z.B. `ProgramFiles`, `LOCALAPPDATA`, `SystemRoot`, `PATH`. */
  env(name: string): string | undefined;
  /** Ob es die Datei gibt, auch als App-Ausführungsalias (`WindowsApps`), dem `stat` nicht folgen kann. */
  fileExists(file: string): boolean;
  /** Eine Zeichenkette aus der Registry, z.B. `HKLM\SOFTWARE\GitForWindows`, `InstallPath`; sonst `null`. */
  registryString(key: string, name: string): Promise<string | null>;
  /** Die rohe Ausgabe von `<wslExe> -l -q`; `null`, wenn der Aufruf scheitert oder zu lange braucht. */
  wslList(wslExe: string): Promise<Buffer | null>;
}

/**
 * Erkennt die installierten Shells, in der Reihenfolge des Pfeil-Menüs: PowerShell 7, Windows PowerShell,
 * cmd, Git Bash, dann die WSL-Distributionen (ohne `docker-desktop*`). Wirft nie und liefert immer
 * mindestens eine Shell.
 */
export async function detectShells(source: ShellDetectionSource = systemShellSource): Promise<ShellInfo[]> {
  const system32 = path.win32.join(source.env('SystemRoot') || 'C:\\Windows', 'System32');
  // WSL zuerst anstossen: Es braucht am längsten und läuft so neben den übrigen Prüfungen.
  const wsl = findWslShells(source, path.win32.join(system32, 'wsl.exe'));

  const shells: ShellInfo[] = [];
  const pwsh = findPwsh(source);
  if (pwsh) shells.push(windowsShell('pwsh', pwsh));
  const powershell = path.win32.join(system32, 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  if (source.fileExists(powershell)) shells.push(windowsShell('powershell', powershell));
  const cmd = path.win32.join(system32, 'cmd.exe');
  if (source.fileExists(cmd)) shells.push(windowsShell('cmd', cmd));
  const gitBash = await findGitBash(source);
  // Wie in Git Bash selbst als Login-Shell, damit /etc/profile und ~/.bash_profile laden.
  if (gitBash) shells.push(windowsShell('gitbash', gitBash, ['--login', '-i']));
  shells.push(...(await wsl));

  // Unter Windows gibt es immer wenigstens Windows PowerShell; ohne festen Pfad sucht der Start im PATH.
  return shells.length > 0 ? shells : [windowsShell('powershell', 'powershell.exe')];
}

function windowsShell(id: string, file: string, args: string[] = []): ShellInfo {
  return { id, name: shellLabel(id), file, args, capturesClaude: true };
}

/**
 * PowerShell 7: der Standardort des Installers, dann der PATH, dann der App-Ausführungsalias der
 * Store-Version in `%LOCALAPPDATA%\Microsoft\WindowsApps`.
 */
function findPwsh(source: ShellDetectionSource): string | null {
  const programFiles = source.env('ProgramFiles');
  const localAppData = source.env('LOCALAPPDATA');
  const candidates = [
    programFiles && path.win32.join(programFiles, 'PowerShell', '7', 'pwsh.exe'),
    ...pathDirs(source).map((dir) => path.win32.join(dir, 'pwsh.exe')),
    localAppData && path.win32.join(localAppData, 'Microsoft', 'WindowsApps', 'pwsh.exe'),
  ];
  return firstExisting(source, candidates);
}

/**
 * Git Bash: die Standardorte (für alle Benutzer, 32 Bit, nur für den Benutzer), sonst der Installationsort aus
 * der Registry (`HKLM`, dann `HKCU`). Nie `bash.exe` aus dem PATH: Das ist oft die von WSL.
 */
async function findGitBash(source: ShellDetectionSource): Promise<string | null> {
  const bash = (installDir: string | undefined) => installDir && path.win32.join(installDir, 'bin', 'bash.exe');
  const programFiles = source.env('ProgramFiles');
  const programFilesX86 = source.env('ProgramFiles(x86)');
  const localAppData = source.env('LOCALAPPDATA');
  const standard = firstExisting(source, [
    bash(programFiles && path.win32.join(programFiles, 'Git')),
    bash(programFilesX86 && path.win32.join(programFilesX86, 'Git')),
    bash(localAppData && path.win32.join(localAppData, 'Programs', 'Git')),
  ]);
  if (standard) return standard;
  for (const hive of ['HKLM', 'HKCU']) {
    const installDir = await source.registryString(`${hive}\\SOFTWARE\\GitForWindows`, 'InstallPath');
    const found = firstExisting(source, [bash(installDir?.trim())]);
    if (found) return found;
  }
  return null;
}

/** Jede WSL-Distribution einzeln, in der Reihenfolge von `wsl.exe -l -q`; ohne WSL keine. */
async function findWslShells(source: ShellDetectionSource, wslExe: string): Promise<ShellInfo[]> {
  if (!source.fileExists(wslExe)) return [];
  const output = await source.wslList(wslExe);
  if (!output) return [];
  return parseWslList(output).map((distribution) => {
    const id = wslShellId(distribution);
    // Ohne Integration (Claude in WSL wird nicht erfasst); den Ordner ergänzt der Kern mit `--cd`.
    return { id, name: shellLabel(id), file: wslExe, args: ['-d', distribution], capturesClaude: false };
  });
}

/**
 * Die Namen der Distributionen aus der Ausgabe von `wsl.exe -l -q`, ohne die internen von Docker Desktop
 * (`docker-desktop`, `docker-desktop-data`). `wsl.exe` schreibt UTF-16LE, mit `WSL_UTF8=1` aber UTF-8.
 */
export function parseWslList(output: Buffer): string[] {
  const utf16 = (output[0] === 0xff && output[1] === 0xfe) || (output.length >= 2 && output[1] === 0);
  const text = (utf16 ? output.toString('utf16le') : output.toString('utf8')).replace(/^\uFEFF/, '');
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/\0/g, '').trim())
    .filter((name) => name !== '' && !/^docker-desktop/i.test(name));
}

/** Die absoluten Ordner im PATH, ohne Anführungszeichen. */
function pathDirs(source: ShellDetectionSource): string[] {
  return (source.env('PATH') ?? '')
    .split(';')
    .map((dir) => dir.trim().replace(/^"(.*)"$/, '$1'))
    .filter((dir) => path.win32.isAbsolute(dir));
}

function firstExisting(source: ShellDetectionSource, candidates: (string | undefined | '')[]): string | null {
  return candidates.find((file): file is string => !!file && source.fileExists(file)) ?? null;
}

// ---------- Das echte System ----------

export const systemShellSource: ShellDetectionSource = {
  env: (name) => process.env[name],
  fileExists(file) {
    // lstat statt existsSync: Der Alias der Store-Version von pwsh.exe ist ein Analysepunkt, dem stat nicht folgt.
    try {
      return !fs.lstatSync(file).isDirectory();
    } catch {
      return false;
    }
  },
  async registryString(key, name) {
    const reg = path.win32.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'reg.exe');
    const output = await runQuietly(reg, ['query', key, '/v', name], REGISTRY_TIMEOUT_MS);
    // "    InstallPath    REG_SZ    C:\Program Files\Git"
    const line = output
      ?.toString()
      .split(/\r?\n/)
      .map((l) => /^\s*(.+?)\s+REG_SZ\s+(.*)$/.exec(l))
      .find((m) => m?.[1].toLowerCase() === name.toLowerCase());
    return line?.[2].trim() || null;
  },
  wslList: (wslExe) => runQuietly(wslExe, ['-l', '-q'], WSL_TIMEOUT_MS),
};

/**
 * Startet ein Programm ohne Fenster und liefert seine Ausgabe. `null`, wenn es fehlt, mit einem Fehlercode
 * endet oder länger als `timeoutMs` braucht; dann wird es beendet.
 */
export function runQuietly(file: string, args: string[], timeoutMs: number): Promise<Buffer | null> {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (result: Buffer | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const child = execFile(file, args, { encoding: 'buffer', windowsHide: true, maxBuffer: 1024 * 1024 }, (err, stdout) =>
      settle(err ? null : stdout),
    );
    // Eigenes Zeitlimit statt der Option `timeout`: Das Ergebnis kommt pünktlich, auch wenn das Beenden dauert.
    const timer = setTimeout(() => {
      settle(null);
      child.kill();
    }, timeoutMs);
  });
}
