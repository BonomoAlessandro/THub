// Einordnung des Starters (durchreichen / neu / mit Kennung / ohne Kennung) ohne Shell:
// powershell.exe -File starter.ps1 mit einer roh uebergebenen Befehlszeile, TERMHUB_STARTER_DRYRUN.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { REPO } from './harness';

const POWERSHELL = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const STARTER = path.join(REPO, 'resources', 'shell', 'starter.ps1');

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'termhub-classify-'));
  writeFileSync(path.join(dir, 'claude.exe'), ''); // nur zum Finden, wird nicht gestartet
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

function classify(tail: string): any {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined && !/^TERMHUB_/i.test(k)) env[k] = v;
  delete env.Path;
  env.PATH = `${dir};${path.dirname(POWERSHELL)}`;
  env.TERMHUB_STARTER_DRYRUN = '1';
  const r = spawnSync(POWERSHELL, [`-NoProfile -NoLogo -ExecutionPolicy Bypass -File "${STARTER}" ${tail}`], {
    windowsVerbatimArguments: true,
    env,
    encoding: 'utf8',
  });
  if (r.status !== 0) throw new Error(`Starter: ${r.status} ${r.stderr}`);
  return JSON.parse(r.stdout.trim());
}

describe('Einordnung', () => {
  const cases: [string, { pass?: boolean; case?: string; id?: string | null; settings?: boolean; name?: boolean }][] = [
    ['', { pass: false, case: 'new' }],
    ['"fix the bug"', { pass: false, case: 'new' }],
    ['-p "x"', { pass: true }],
    ['--print', { pass: true }],
    ['"prompt" -p', { pass: true }],
    ['-pc', { pass: true }],
    ['-v', { pass: true }],
    ['--version', { pass: true }],
    ['-h', { pass: true }],
    ['--help', { pass: true }],
    ['mcp list', { pass: true }],
    ['plugins', { pass: true }],
    ['--model opus mcp list', { pass: true }],
    ['--model=opus mcp list', { pass: true }],
    ['--verbose doctor', { pass: true }],
    ['--debug mcp list', { pass: false, case: 'new' }], // --debug [filter] verbraucht "mcp"
    ['--add-dir a b mcp', { pass: false, case: 'new' }], // <directories...> verbraucht alles
    ['--add-dir a --verbose mcp', { pass: true }],
    ['--append-system-prompt -p', { pass: false, case: 'new' }], // -p ist hier ein Wert
    ['-- mcp', { pass: false, case: 'new' }],
    ['"mcp list"', { pass: false, case: 'new' }],
    ['MCP', { pass: false, case: 'new' }], // Unterbefehle sind case-sensitiv
    ['-C', { pass: false, case: 'new' }],
    ['--resume x', { case: 'withId', id: 'x' }],
    ['--resume=x', { case: 'withId', id: 'x' }],
    ['-r x', { case: 'withId', id: 'x' }],
    ['-rx', { case: 'withId', id: 'x' }],
    ['--session-id abc', { case: 'withId', id: 'abc' }],
    ['--session-id=abc', { case: 'withId', id: 'abc' }],
    ['--resume', { case: 'withoutId', id: null }],
    ['--resume --verbose', { case: 'withoutId', id: null }],
    ['-r', { case: 'withoutId', id: null }],
    ['-c', { case: 'withoutId', id: null }],
    ['--continue "noch was"', { case: 'withoutId', id: null }],
    ['--from-pr 12', { case: 'withoutId', id: null }],
    ['--settings s.json', { case: 'new', settings: true }],
    ['--settings=s.json', { case: 'new', settings: true }],
    ['--model --settings', { case: 'new', settings: false }],
    ['-n eigener', { case: 'new', name: true }],
    ['-neigener', { case: 'new', name: true }],
    ['--name=eigener', { case: 'new', name: true }],
  ];

  it.each(cases)('claude %s', (tail, want) => {
    const c = classify(tail);
    if (want.pass !== undefined) expect(c.PassThrough).toBe(want.pass);
    if (want.case !== undefined) {
      expect(c.PassThrough).toBe(false);
      expect(c.Case).toBe(want.case);
    }
    if (want.id !== undefined) expect(c.GivenId).toBe(want.id);
    if (want.settings !== undefined) expect(c.HasSettings).toBe(want.settings);
    if (want.name !== undefined) expect(c.HasName).toBe(want.name);
  });

  it('liest den Rest der Befehlszeile roh, auch hinter einem Skriptpfad mit Leerzeichen', () => {
    const c = classify('"a b" "" c\\"d');
    expect(c.Argv).toEqual(['a b', '', 'c"d']);
  });
});
