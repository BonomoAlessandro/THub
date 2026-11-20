import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  detectShells,
  parseWslList,
  runQuietly,
  systemShellSource,
  type ShellDetectionSource,
} from '../../src/main/shells';
import { startWorkspace } from '../support/harness';
import { makeTempDir } from '../support/tempDir';

// Shell-Erkennung mit nachgemachtem Rechner: Dateien, Umgebung, Registry und die Ausgabe von wsl.exe.
// Was die Erkennung auf einem echten Rechner findet, wird von Hand geprüft.

const SYSTEM32 = 'C:\\Windows\\System32';
const WSL_EXE = `${SYSTEM32}\\wsl.exe`;
const POWERSHELL_EXE = `${SYSTEM32}\\WindowsPowerShell\\v1.0\\powershell.exe`;
const CMD_EXE = `${SYSTEM32}\\cmd.exe`;
const PWSH_MSI = 'C:\\Program Files\\PowerShell\\7\\pwsh.exe';
const PWSH_STORE = 'C:\\Users\\tester\\AppData\\Local\\Microsoft\\WindowsApps\\pwsh.exe';
const GIT_BASH = 'C:\\Program Files\\Git\\bin\\bash.exe';

/** So schreibt wsl.exe: UTF-16LE ohne BOM, Zeilen mit CRLF. */
function utf16(text: string): Buffer {
  return Buffer.from(text, 'utf16le');
}

interface MachineOptions {
  files?: string[];
  env?: Record<string, string>;
  /** Registry-Werte, z.B. `{ 'HKLM\\SOFTWARE\\GitForWindows': 'D:\\Git' }` für `InstallPath`. */
  gitInstallPaths?: Record<string, string>;
  /** Ausgabe von `wsl.exe -l -q`; `null`: scheitert oder braucht zu lange. */
  wsl?: Buffer | null;
}

/** Ein nachgemachter Rechner; Dateinamen ohne Gross/klein wie unter Windows. */
function machine(options: MachineOptions = {}) {
  const files = new Set((options.files ?? []).map((f) => f.toLowerCase()));
  const env: Record<string, string> = {
    SystemRoot: 'C:\\Windows',
    ProgramFiles: 'C:\\Program Files',
    'ProgramFiles(x86)': 'C:\\Program Files (x86)',
    LOCALAPPDATA: 'C:\\Users\\tester\\AppData\\Local',
    PATH: `${SYSTEM32};C:\\Windows`,
    ...options.env,
  };
  const registryQueries: string[] = [];
  const wslCalls: string[] = [];
  const source: ShellDetectionSource = {
    env: (name) => env[name],
    fileExists: (file) => files.has(file.toLowerCase()),
    registryString(key, name) {
      registryQueries.push(`${key} ${name}`);
      return Promise.resolve(name === 'InstallPath' ? (options.gitInstallPaths?.[key] ?? null) : null);
    },
    wslList(wslExe) {
      wslCalls.push(wslExe);
      return Promise.resolve(options.wsl ?? null);
    },
  };
  return { source, registryQueries, wslCalls };
}

/** Ein Rechner wie dieser: alles installiert, dazu Docker Desktop mit seinen WSL-Distributionen. */
const FULL_MACHINE: MachineOptions = {
  files: [PWSH_MSI, POWERSHELL_EXE, CMD_EXE, GIT_BASH, WSL_EXE],
  wsl: utf16('Ubuntu\r\ndocker-desktop\r\ndocker-desktop-data\r\nDebian\r\n'),
};

const ids = (shells: { id: string }[]) => shells.map((s) => s.id);

describe('Shell-Erkennung', () => {
  it('findet alle Shells in der Reihenfolge des Pfeil-Menüs, ohne die Distributionen von Docker Desktop', async () => {
    const { source } = machine(FULL_MACHINE);

    expect(await detectShells(source)).toEqual([
      { id: 'pwsh', name: 'PowerShell 7', file: PWSH_MSI, args: [], capturesClaude: true, integration: 'powershell' },
      {
        id: 'powershell',
        name: 'Windows PowerShell',
        file: POWERSHELL_EXE,
        args: [],
        capturesClaude: true,
        integration: 'powershell',
      },
      { id: 'cmd', name: 'Eingabeaufforderung', file: CMD_EXE, args: [], capturesClaude: true, integration: 'cmd' },
      { id: 'gitbash', name: 'Git Bash', file: GIT_BASH, args: ['--login', '-i'], capturesClaude: true, integration: 'bash' },
      { id: 'wsl:Ubuntu', name: 'Ubuntu (WSL)', file: WSL_EXE, args: ['-d', 'Ubuntu'], capturesClaude: false },
      { id: 'wsl:Debian', name: 'Debian (WSL)', file: WSL_EXE, args: ['-d', 'Debian'], capturesClaude: false },
    ]);
  });

  describe('PowerShell 7', () => {
    it('findet die Store-Version über ihren App-Ausführungsalias in WindowsApps', async () => {
      const { source } = machine({ files: [PWSH_STORE, POWERSHELL_EXE, CMD_EXE] });

      const [pwsh] = await detectShells(source);

      expect(pwsh).toMatchObject({ id: 'pwsh', file: PWSH_STORE });
    });

    it('findet sie im PATH, etwa als .NET-Werkzeug', async () => {
      const tool = 'C:\\Users\\tester\\.dotnet\\tools\\pwsh.exe';
      const { source } = machine({
        files: [tool, POWERSHELL_EXE],
        env: { PATH: `${SYSTEM32};"C:\\Users\\tester\\.dotnet\\tools";relativ` },
      });

      const [pwsh] = await detectShells(source);

      expect(pwsh).toMatchObject({ id: 'pwsh', file: tool });
    });

    it('nimmt zuerst die Installation am Standardort', async () => {
      const { source } = machine({ files: [PWSH_MSI, PWSH_STORE] });

      const [pwsh] = await detectShells(source);

      expect(pwsh.file).toBe(PWSH_MSI);
    });

    it('fehlt ohne Installation', async () => {
      const { source } = machine({ files: [POWERSHELL_EXE, CMD_EXE] });

      expect(ids(await detectShells(source))).toEqual(['powershell', 'cmd']);
    });
  });

  describe('Git Bash', () => {
    it('fragt die Registry nicht, wenn Git Bash am Standardort liegt', async () => {
      const { source, registryQueries } = machine(FULL_MACHINE);

      await detectShells(source);

      expect(registryQueries).toEqual([]);
    });

    it('findet eine Installation nur für den Benutzer', async () => {
      const userGit = 'C:\\Users\\tester\\AppData\\Local\\Programs\\Git\\bin\\bash.exe';
      const { source } = machine({ files: [userGit] });

      expect(await detectShells(source)).toMatchObject([{ id: 'gitbash', file: userGit }]);
    });

    it.each(['HKLM', 'HKCU'])('findet einen anderen Installationsort über die Registry (%s)', async (hive) => {
      const { source, registryQueries } = machine({
        files: ['D:\\Werkzeuge\\Git\\bin\\bash.exe'],
        gitInstallPaths: { [`${hive}\\SOFTWARE\\GitForWindows`]: 'D:\\Werkzeuge\\Git' },
      });

      expect(await detectShells(source)).toMatchObject([{ id: 'gitbash', file: 'D:\\Werkzeuge\\Git\\bin\\bash.exe' }]);
      expect(registryQueries[0]).toBe('HKLM\\SOFTWARE\\GitForWindows InstallPath');
    });

    it('übergeht einen Registry-Eintrag, unter dem es kein bash.exe gibt', async () => {
      const { source } = machine({
        files: [POWERSHELL_EXE],
        gitInstallPaths: { 'HKLM\\SOFTWARE\\GitForWindows': 'D:\\Weg' },
      });

      expect(ids(await detectShells(source))).toEqual(['powershell']);
    });

    it('nimmt nie bash.exe aus dem PATH, das ist oft die von WSL', async () => {
      const { source } = machine({ files: [POWERSHELL_EXE, `${SYSTEM32}\\bash.exe`] });

      expect(ids(await detectShells(source))).toEqual(['powershell']);
    });
  });

  describe('WSL', () => {
    it('liest die Namen aus UTF-16LE, mit und ohne BOM, und aus UTF-8 (WSL_UTF8=1)', () => {
      const names = ['Ubuntu-24.04', 'Debian', 'kali-linux'];
      const text = `${names.join('\r\n')}\r\n`;

      expect(parseWslList(utf16(text))).toEqual(names);
      expect(parseWslList(utf16(`\uFEFF${text}`))).toEqual(names);
      expect(parseWslList(Buffer.from(text, 'utf8'))).toEqual(names);
    });

    it('blendet docker-desktop und docker-desktop-data aus und übergeht leere Zeilen', () => {
      expect(parseWslList(utf16('docker-desktop\r\n\r\nUbuntu\r\nDocker-Desktop-Data\r\n'))).toEqual(['Ubuntu']);
    });

    it('ohne Distributionen oder ohne Antwort von wsl.exe gibt es keine WSL-Shells', async () => {
      for (const wsl of [null, utf16(''), utf16('docker-desktop\r\n')]) {
        const { source } = machine({ ...FULL_MACHINE, wsl });

        expect(ids(await detectShells(source))).toEqual(['pwsh', 'powershell', 'cmd', 'gitbash']);
      }
    });

    it('fragt wsl.exe gar nicht, wenn es fehlt', async () => {
      const { source, wslCalls } = machine({ files: [POWERSHELL_EXE] });

      await detectShells(source);

      expect(wslCalls).toEqual([]);
    });
  });

  it('liefert immer mindestens eine Shell', async () => {
    const { source } = machine();

    expect(await detectShells(source)).toEqual([
      {
        id: 'powershell',
        name: 'Windows PowerShell',
        file: 'powershell.exe',
        args: [],
        capturesClaude: true,
        integration: 'powershell',
      },
    ]);
  });

  describe('Übernahme aus Version 1', () => {
    it.each([
      ['pwsh.exe', 'pwsh', PWSH_MSI],
      ['powershell.exe', 'powershell', POWERSHELL_EXE],
      ['cmd.exe', 'cmd', CMD_EXE],
    ])('settings.shell „%s“ wird zur erkannten Shell %s', async (v1Shell, shellId, program) => {
      const shells = await detectShells(machine(FULL_MACHINE).source);
      const v1 = {
        version: 1,
        settings: { defaultCwd: '', shell: v1Shell },
        sessions: [{ id: 's-1', name: 'Projekt', cwd: 'C:\\Users\\tester' }],
        activeSessionId: 's-1',
      };
      const h = startWorkspace({ state: v1, shells });

      h.showAllViews();

      expect(ids(shells)).toContain(shellId);
      expect(h.tabs()).toMatchObject([{ id: 's-1', shellId }]);
      expect(h.snapshot().defaultShellId).toBe(shellId);
      expect(h.terminal.starts).toMatchObject([{ order: { file: program } }]);
    });
  });
});

describe('Echtes System', () => {
  it('erkennt Dateien, aber keine Ordner', () => {
    const dir = makeTempDir();
    const file = path.join(dir, 'pwsh.exe');
    fs.writeFileSync(file, '');

    expect(systemShellSource.fileExists(file)).toBe(true);
    expect(systemShellSource.fileExists(dir)).toBe(false);
    expect(systemShellSource.fileExists(path.join(dir, 'fehlt.exe'))).toBe(false);
  });

  it('liest Zeichenketten aus der Registry; einen fehlenden Wert gibt es nicht', async () => {
    const key = 'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion';

    expect(await systemShellSource.registryString(key, 'ProductName')).toMatch(/^Windows/);
    expect(await systemShellSource.registryString(key, 'GibtEsNicht')).toBeNull();
    expect(await systemShellSource.registryString('HKCU\\SOFTWARE\\GibtEsNicht', 'InstallPath')).toBeNull();
  });

  describe('Programm ohne Fenster starten', () => {
    const node = process.execPath;

    it('liefert die Ausgabe', async () => {
      const output = await runQuietly(node, ['-e', 'process.stdout.write("Ubuntu")'], 10_000);

      expect(output?.toString()).toBe('Ubuntu');
    });

    it('liefert nichts bei einem Fehlercode oder einem fehlenden Programm', async () => {
      expect(await runQuietly(node, ['-e', 'process.exit(3)'], 10_000)).toBeNull();
      expect(await runQuietly('C:\\gibt-es-nicht\\wsl.exe', ['-l', '-q'], 10_000)).toBeNull();
    });

    it('gibt nach dem Zeitlimit auf, damit ein hängendes wsl.exe den Start nicht aufhält', async () => {
      const started = Date.now();

      const output = await runQuietly(node, ['-e', 'setTimeout(() => {}, 20000)'], 300);

      expect(output).toBeNull();
      expect(Date.now() - started).toBeLessThan(5000);
    });
  });
});
