import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { shellIntegrationDir, shellLaunch } from '../../src/main/shellLaunch';
import type { StartOrder } from '../../src/main/workspace/ports';
import { makeTempDir } from '../support/tempDir';

// Wie das Terminal-Backend die Shells mit der mitgelieferten Integration startet. Ob die Shells damit
// wirklich laufen, prüft Teststelle 2 (npm run test:shells) mit echten Shells.

const REPO = path.resolve(__dirname, '..', '..');
const SHIPPED = path.join(REPO, 'resources', 'shell');
const ENV = { PATH: 'C:\\Windows\\System32', THUB_TAB_ID: 'tab-1' };

function order(patch: Partial<StartOrder>): StartOrder {
  return { file: 'shell.exe', args: ['--eigene'], cwd: 'C:\\proj', env: {}, cols: 80, rows: 24, ...patch };
}

/** Der Text hinter -EncodedCommand, wieder lesbar. */
function decodedCommand(args: string[] | string): string {
  expect(Array.isArray(args)).toBe(true);
  const list = args as string[];
  return Buffer.from(list[list.indexOf('-EncodedCommand') + 1], 'base64').toString('utf16le');
}

describe('Start der Shells mit Integration', () => {
  let shellDir: string;
  beforeEach(() => {
    shellDir = path.join(makeTempDir(), 'Programme äöü', 'resources', 'shell');
    fs.cpSync(SHIPPED, shellDir, { recursive: true });
  });

  describe('PowerShell', () => {
    it('lädt die Integration per -EncodedCommand, ohne eigene Profile und ohne Skriptdatei', () => {
      const launch = shellLaunch(order({ file: 'pwsh.exe', integration: 'powershell' }), ENV, shellDir);

      expect(launch.file).toBe('pwsh.exe');
      expect(launch.args).toEqual(['-NoLogo', '-NoProfile', '-NoExit', '-EncodedCommand', expect.any(String)]);
      expect(decodedCommand(launch.args)).toBe(fs.readFileSync(path.join(shellDir, 'integration.ps1'), 'utf8'));
      expect(launch.env).toEqual(ENV);
    });

    it('gibt den Startbefehl über THUB_START_CMD mit', () => {
      const launch = shellLaunch(
        order({ file: 'powershell.exe', integration: 'powershell', startCommand: "Write-Host 'äöü'" }),
        ENV,
        shellDir,
      );

      expect(launch.env).toEqual({ ...ENV, THUB_START_CMD: "Write-Host 'äöü'" });
    });
  });

  describe('cmd', () => {
    it('lädt die Integration per /k, ohne /d, damit AutoRun läuft', () => {
      const launch = shellLaunch(order({ file: 'cmd.exe', integration: 'cmd' }), ENV, shellDir);

      expect(launch.args).toBe(`/s /k ""${path.join(shellDir, 'integration.cmd')}""`);
      expect(launch.env).toEqual(ENV);
    });

    it('hängt den Startbefehl in der /k-Zeile hinter die Integration, nicht als Variable', () => {
      const launch = shellLaunch(order({ file: 'cmd.exe', integration: 'cmd', startCommand: 'echo "hallo"' }), ENV, shellDir);

      expect(launch.args).toBe(`/s /k ""${path.join(shellDir, 'integration.cmd')}" & echo "hallo""`);
      expect(launch.env).not.toHaveProperty('THUB_START_CMD');
    });
  });

  describe('Git Bash', () => {
    it('lädt die Startdatei per --rcfile, mit Schrägstrichen', () => {
      const launch = shellLaunch(order({ file: 'C:\\Git\\bin\\bash.exe', integration: 'bash' }), ENV, shellDir);

      expect(launch.file).toBe('C:\\Git\\bin\\bash.exe');
      expect(launch.args).toEqual(['--rcfile', path.join(shellDir, 'integration.bash').replace(/\\/g, '/'), '-i']);
      expect(launch.env).toEqual(ENV);
    });

    it('gibt den Startbefehl über THUB_START_CMD mit', () => {
      const launch = shellLaunch(order({ file: 'bash.exe', integration: 'bash', startCommand: 'echo hallo' }), ENV, shellDir);

      expect(launch.env.THUB_START_CMD).toBe('echo hallo');
    });
  });

  it('gibt einen geerbten THUB_START_CMD nie weiter', () => {
    const env = { ...ENV, THUB_START_CMD: 'alt' };

    for (const integration of ['powershell', 'cmd', 'bash'] as const) {
      expect(shellLaunch(order({ integration }), env, shellDir).env).not.toHaveProperty('THUB_START_CMD');
    }
  });

  it('startet eine Shell ohne Integration (WSL) unverändert und ohne Startbefehl', () => {
    const launch = shellLaunch(
      order({ file: 'wsl.exe', args: ['-d', 'Ubuntu', '--cd', 'C:\\proj'], startCommand: 'echo nie' }),
      ENV,
      shellDir,
    );

    expect(launch).toEqual({ file: 'wsl.exe', args: ['-d', 'Ubuntu', '--cd', 'C:\\proj'], env: ENV });
  });

  describe('fehlt die Integration, startet die Shell trotzdem, wie ohne', () => {
    beforeEach(() => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it.each(['powershell', 'cmd', 'bash'] as const)('%s', (integration) => {
      const missing = path.join(makeTempDir(), 'gibt-es-nicht');

      const launch = shellLaunch(order({ integration, startCommand: 'x' }), ENV, missing);

      expect(launch).toEqual({ file: 'shell.exe', args: ['--eigene'], env: ENV });
      expect(console.error).toHaveBeenCalled();
    });
  });
});

describe('Integrationsdateien', () => {
  it('liegen unpaketiert im Projekt, im Paket unter resources\\shell', () => {
    expect(shellIntegrationDir(false, 'C:\\electron\\resources', REPO)).toBe(SHIPPED);
    expect(shellIntegrationDir(true, 'C:\\Programme\\THub\\resources', 'C:\\Programme\\THub\\resources\\app.asar')).toBe(
      'C:\\Programme\\THub\\resources\\shell',
    );
  });

  it('kommen als echte Dateien ausserhalb des asar-Archivs ins Paket (extraResources)', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'));

    expect(pkg.build.extraResources).toContainEqual({ from: 'resources/shell', to: 'shell' });
    expect(pkg.build.files.some((f: string) => f.startsWith('resources'))).toBe(false);
  });

  it.each(['integration.ps1', 'integration.cmd', 'integration.bash', 'starter.ps1'])(
    '%s ist reines ASCII (Windows PowerShell 5.1 liest UTF-8 ohne BOM falsch)',
    (name) => {
      const bytes = fs.readFileSync(path.join(SHIPPED, name));
      expect(bytes.findIndex((b) => b > 0x7f)).toBe(-1);
    },
  );

  it('cmd-Dateien haben CRLF, Bash-Dateien LF', () => {
    const cmd = fs.readFileSync(path.join(SHIPPED, 'integration.cmd'), 'latin1');
    const bash = fs.readFileSync(path.join(SHIPPED, 'integration.bash'), 'latin1');

    expect(cmd.split('\n').slice(0, -1).every((line) => line.endsWith('\r'))).toBe(true);
    expect(bash).not.toContain('\r');
  });
});
