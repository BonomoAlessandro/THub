import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PtyManager } from '../../src/main/ptyManager';
import type { StartOrder } from '../../src/main/workspace/ports';

// Welche ConPTY das Terminal-Backend nimmt (Ticket 24), mit nachgemachtem node-pty. Dass die Shells über die
// mitgelieferte wirklich laufen (Konsolen-Host OpenConsole.exe, Zeitgrenze der Pfeiltasten), prüft Teststelle 2.

const spawn = vi.hoisted(() => vi.fn());
vi.mock('node-pty', () => ({ spawn }));

/** Ein laufender Prozess, wie ihn node-pty liefert; nur was das Backend beim Start braucht. */
function fakePty(pid: number) {
  return { pid, onData: vi.fn(), onExit: vi.fn(), write: vi.fn(), resize: vi.fn(), kill: vi.fn() };
}

function order(): StartOrder {
  return { file: 'C:\\Shells\\pwsh.exe', args: [], cwd: 'C:\\proj', env: {}, cols: 80, rows: 24 };
}

const listener = { data: () => {}, exit: () => {} };

/** Mit welcher ConPTY node-pty den n-ten Start bekam (`useConptyDll`). */
const bundledAt = (n: number): unknown => spawn.mock.calls[n][2].useConptyDll;

describe('ConPTY des Terminal-Backends', () => {
  beforeEach(() => {
    spawn.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('startet die Shells über die mitgelieferte ConPTY (wie das Windows Terminal)', () => {
    spawn.mockImplementation(() => fakePty(100));
    const backend = new PtyManager({ shellDir: 'C:\\fehlt', baseEnv: () => ({}) });

    expect(backend.start('tab-1', order(), listener)).toBe(100);

    expect(spawn).toHaveBeenCalledTimes(1);
    expect(spawn.mock.calls[0][2]).toMatchObject({ useConpty: true, useConptyDll: true, cols: 80, rows: 24, cwd: 'C:\\proj' });
  });

  it('weicht auf die ConPTY von Windows aus, wenn die mitgelieferte nicht startet, und bleibt dabei', () => {
    spawn.mockImplementation((_file, _args, options: { useConptyDll?: boolean }) => {
      if (options.useConptyDll) throw new Error('Cannot find conpty.dll');
      return fakePty(200);
    });
    const backend = new PtyManager({ shellDir: 'C:\\fehlt', baseEnv: () => ({}) });

    expect(backend.start('tab-1', order(), listener)).toBe(200);
    backend.start('tab-2', order(), listener);

    expect([bundledAt(0), bundledAt(1), bundledAt(2)]).toEqual([true, false, false]);
    expect(console.error).toHaveBeenCalledTimes(1);
  });

  it('scheitert auch die ConPTY von Windows, gilt ihr Fehler, und der nächste Start versucht wieder die mitgelieferte', () => {
    spawn.mockImplementation((_file, _args, options: { useConptyDll?: boolean }) => {
      throw new Error(options.useConptyDll ? 'mitgeliefert' : 'Cannot create process, error code: 2');
    });
    const backend = new PtyManager({ shellDir: 'C:\\fehlt', baseEnv: () => ({}) });

    expect(() => backend.start('tab-1', order(), listener)).toThrow('Cannot create process');

    spawn.mockImplementation(() => fakePty(300));
    backend.start('tab-1', order(), listener);
    expect(bundledAt(2)).toBe(true);
  });
});
