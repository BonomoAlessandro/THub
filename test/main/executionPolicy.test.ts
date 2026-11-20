import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkExecutionPolicy,
  runWindowsPowerShell,
  type PowerShellAnswer,
  type RunPowerShell,
} from '../../src/main/executionPolicy';
import { shellLaunch } from '../../src/main/shellLaunch';
import type { StartOrder } from '../../src/main/workspace/ports';
import { makeTempDir } from '../support/tempDir';

// Prüfung der Execution Policy beim Start: Legt eine Gruppenrichtlinie AllSigned oder Restricted fest, bekommen die
// Shells keinen claude-Ersatz (kein THUB_STARTER), sonst schon. Die Richtlinie wird über die Antwort von Windows
// PowerShell nachgemacht; dass THub damit in einer echten Shell ohne Ersatz läuft, prüft Teststelle 2.

const REPO = path.resolve(__dirname, '..', '..');
const ENV = { PATH: 'C:\\Windows\\System32', THUB_TAB_ID: 'tab-1' };

/** Windows PowerShell, das so antwortet und die Argumente der Abfrage festhält. */
function answering(answer: PowerShellAnswer): RunPowerShell & { calls: { args: string[]; timeoutMs: number }[] } {
  const calls: { args: string[]; timeoutMs: number }[] = [];
  const run = (args: string[], timeoutMs: number) => {
    calls.push({ args, timeoutMs });
    return Promise.resolve(answer);
  };
  return Object.assign(run, { calls });
}

/** Ausgabe von `Get-ExecutionPolicy -Scope MachinePolicy; … -Scope UserPolicy`. */
const output = (machine: string, user: string): PowerShellAnswer => ({ kind: 'output', stdout: `${machine}\r\n${user}\r\n` });

function order(patch: Partial<StartOrder>): StartOrder {
  return { file: 'shell.exe', args: [], cwd: 'C:\\proj', env: {}, cols: 80, rows: 24, ...patch };
}

describe('Execution Policy beim Start', () => {
  let shellDir: string;
  beforeEach(() => {
    shellDir = path.join(makeTempDir(), 'resources', 'shell');
    fs.cpSync(path.join(REPO, 'resources', 'shell'), shellDir, { recursive: true });
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Umgebung einer Shell, so wie das Terminal-Backend sie nach der Prüfung startet. */
  async function shellEnvAfter(answer: PowerShellAnswer, integration: StartOrder['integration']): Promise<Record<string, string>> {
    const check = checkExecutionPolicy(answering(answer));
    await check.done;
    return shellLaunch(order({ integration }), ENV, shellDir, { claudeStarter: check.starterAllowed() }).env;
  }

  describe.each(['powershell', 'cmd', 'bash'] as const)('%s', (integration) => {
    it.each([
      ['MachinePolicy AllSigned', output('AllSigned', 'Undefined')],
      ['UserPolicy AllSigned', output('Undefined', 'AllSigned')],
      ['MachinePolicy Restricted', output('Restricted', 'Undefined')],
      ['UserPolicy Restricted', output('Undefined', 'Restricted')],
    ])('Gruppenrichtlinie %s: kein THUB_STARTER, claude läuft direkt', async (_name, answer) => {
      expect(await shellEnvAfter(answer, integration)).not.toHaveProperty('THUB_STARTER');
    });

    it.each([
      ['keine Gruppenrichtlinie', output('Undefined', 'Undefined')],
      ['RemoteSigned', output('RemoteSigned', 'Undefined')],
      ['Unrestricted', output('Undefined', 'Unrestricted')],
      ['Bypass', output('Bypass', 'Bypass')],
    ])('%s: THUB_STARTER mit dem Pfad zum Starter', async (_name, answer) => {
      expect((await shellEnvAfter(answer, integration)).THUB_STARTER).toBe(path.join(shellDir, 'starter.ps1'));
    });
  });

  it('fragt beide Richtlinien-Ebenen versteckt ab, ohne Profil und ohne Rückfragen, mit Zeitlimit', async () => {
    const run = answering(output('Undefined', 'Undefined'));

    await checkExecutionPolicy(run).done;

    expect(run.calls).toEqual([
      {
        args: [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          'Get-ExecutionPolicy -Scope MachinePolicy; Get-ExecutionPolicy -Scope UserPolicy',
        ],
        timeoutMs: expect.any(Number),
      },
    ]);
    expect(run.calls[0].timeoutMs).toBeGreaterThan(0);
  });

  it('kehrt sofort zurück; solange die Prüfung läuft, bekommen die Shells den Ersatz', async () => {
    let answer: (a: PowerShellAnswer) => void = () => undefined;
    const check = checkExecutionPolicy(() => new Promise((resolve) => (answer = resolve)));

    expect(check.starterAllowed()).toBe(true);

    answer(output('AllSigned', 'Undefined'));
    expect(await check.done).toBe(false);
    expect(check.starterAllowed()).toBe(false);
  });

  it.each([
    ['keine Antwort innerhalb des Zeitlimits', { kind: 'timeout' }, true],
    ['PowerShell endet mit einem Fehler', { kind: 'failed' }, true],
    ['powershell.exe lässt sich nicht starten', { kind: 'unavailable' }, false],
  ] as [string, PowerShellAnswer, boolean][])('%s: Ersatz %s', async (_name, answer, allowed) => {
    const check = checkExecutionPolicy(answering(answer));

    expect(await check.done).toBe(allowed);
    expect(check.starterAllowed()).toBe(allowed);
  });

  it('nennt im Protokoll die Richtlinie, die den Starter blockiert', async () => {
    await checkExecutionPolicy(answering(output('Undefined', 'AllSigned'))).done;

    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('AllSigned'));
  });
});

describe('Windows PowerShell versteckt ausführen', () => {
  let psModulePath: string | undefined;
  beforeEach(() => {
    psModulePath = process.env.PSModulePath;
  });
  afterEach(() => {
    if (psModulePath === undefined) delete process.env.PSModulePath;
    else process.env.PSModulePath = psModulePath;
  });

  it('liefert die Richtlinien, auch wenn THub aus PowerShell 7 gestartet wurde (dessen PSModulePath)', async () => {
    // In einem Prozess, den PowerShell 7 gestartet hat, stehen dessen Modulordner zuerst in PSModulePath. Windows
    // PowerShell findet dort ein Microsoft.PowerShell.Security, das es nicht laden kann, und Get-ExecutionPolicy
    // scheitert. Nachgemacht mit einem Modul, das PowerShell 7 verlangt.
    const pwshModules = makeTempDir();
    const security = path.join(pwshModules, 'Microsoft.PowerShell.Security');
    fs.mkdirSync(security);
    fs.writeFileSync(
      path.join(security, 'Microsoft.PowerShell.Security.psd1'),
      "@{ ModuleVersion = '7.0.0.0'; PowerShellVersion = '7.0'; CompatiblePSEditions = @('Core'); CmdletsToExport = @('Get-ExecutionPolicy') }\r\n",
    );
    process.env.PSModulePath = [pwshModules, psModulePath ?? ''].join(';');

    const answer = await runWindowsPowerShell(
      ['-NoProfile', '-NonInteractive', '-Command', 'Get-ExecutionPolicy -Scope MachinePolicy; Get-ExecutionPolicy -Scope UserPolicy'],
      20_000,
    );

    expect(answer.kind).toBe('output');
    const lines = (answer as { stdout: string }).stdout.split(/\r?\n/).filter(Boolean);
    expect(lines).toHaveLength(2);
    for (const line of lines) expect(line).toMatch(/^(Undefined|AllSigned|Restricted|RemoteSigned|Unrestricted|Bypass|Default)$/);
    // Echtes Windows PowerShell: Unter Last braucht der Start länger als die 5 s, die Vitest sonst gewährt.
  }, 30_000);

  it('meldet ein Zeitlimit und beendet den Prozess', async () => {
    const answer = await runWindowsPowerShell(['-NoProfile', '-NonInteractive', '-Command', 'Start-Sleep -Seconds 30'], 200);

    expect(answer).toEqual({ kind: 'timeout' });
  });

  it('meldet einen Fehler beim Beenden', async () => {
    const answer = await runWindowsPowerShell(['-NoProfile', '-NonInteractive', '-Command', 'exit 3'], 20_000);

    expect(answer).toEqual({ kind: 'failed' });
  }, 30_000);
});
