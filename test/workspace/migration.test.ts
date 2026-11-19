import { describe, expect, it } from 'vitest';
import { MemoryStorage } from '../support/fakes';
import { startWorkspace } from '../support/harness';

/** Eine Zustandsdatei, wie sie die App in Version 0.1.0 geschrieben hat. */
function v1State(overrides: { defaultCwd?: string; shell?: string; activeSessionId?: string } = {}) {
  return {
    version: 1,
    settings: {
      defaultCwd: overrides.defaultCwd ?? 'C:\\Users\\tester',
      shell: overrides.shell ?? 'powershell.exe',
    },
    sessions: [
      { id: 's-1', name: 'Mein Projekt', cwd: 'C:\\proj' },
      { id: 's-2', name: 'Terminal 2', cwd: 'C:\\Users\\tester' },
      { id: 's-3', name: 'Logs ansehen', cwd: 'D:\\logs' },
    ],
    activeSessionId: overrides.activeSessionId ?? 's-2',
  };
}

const V1_DIRECTORIES = ['C:\\proj', 'D:\\logs'];

describe('Übernahme aus Version 1', () => {
  it('macht aus Sessions Tabs mit unveränderten Namen, Reihenfolge und aktivem Tab', () => {
    const h = startWorkspace({ state: v1State(), directories: V1_DIRECTORIES });

    expect(h.tabs().map((t) => ({ id: t.id, name: t.name }))).toEqual([
      { id: 's-1', name: 'Mein Projekt' },
      { id: 's-2', name: 'Terminal 2' },
      { id: 's-3', name: 'Logs ansehen' },
    ]);
    expect(h.snapshot().activeTabId).toBe('s-2');
  });

  it('startet übernommene Tabs in ihrem gespeicherten Ordner', () => {
    const h = startWorkspace({ state: v1State(), directories: V1_DIRECTORIES });

    h.showAllViews();

    expect(h.terminal.starts.map((s) => s.order.cwd)).toEqual(['C:\\proj', 'C:\\Users\\tester', 'D:\\logs']);
  });

  it('macht den ersten Tab aktiv, wenn der gespeicherte aktive fehlt', () => {
    const h = startWorkspace({ state: v1State({ activeSessionId: 'weg' }), directories: V1_DIRECTORIES });

    expect(h.snapshot().activeTabId).toBe('s-1');
  });

  describe('bildet settings.shell nach der Tabelle ab', () => {
    it.each([
      ['pwsh.exe', 'pwsh', 'pwsh.exe'],
      ['powershell.exe', 'powershell', 'powershell.exe'],
      ['cmd.exe', 'cmd', 'cmd.exe'],
      ['PWSH.EXE', 'pwsh', 'pwsh.exe'],
      ['C:\\Program Files\\PowerShell\\7\\pwsh.exe', 'pwsh', 'pwsh.exe'],
    ])('%s → %s, für alle übernommenen und neue Tabs', (v1Shell, shellId, program) => {
      const h = startWorkspace({ state: v1State({ shell: v1Shell }), directories: V1_DIRECTORIES });

      expect(h.tabs().map((t) => t.shellId)).toEqual([shellId, shellId, shellId]);
      h.showAllViews();
      expect(h.terminal.starts.map((s) => s.order.file)).toEqual([program, program, program]);

      h.workspace.createTab();
      expect(h.activeTab()?.shellId).toBe(shellId);
    });

    it.each(['bash.exe', 'C:\\Windows\\System32\\wsl.exe', ''])('„%s“ → Standard-Shell', (v1Shell) => {
      const h = startWorkspace({ state: v1State({ shell: v1Shell }), directories: V1_DIRECTORIES });
      const migrated = h.tabs().map((t) => t.shellId);

      h.workspace.createTab();
      const standardShell = h.activeTab()!.shellId;

      expect(migrated).toEqual([standardShell, standardShell, standardShell]);
    });
  });

  it.each(['C:\\Users\\tester', 'c:\\users\\TESTER\\'])(
    'macht einen Standardordner gleich dem Benutzerordner leer („%s“)',
    (defaultCwd) => {
      const h = startWorkspace({ state: v1State({ defaultCwd }), directories: V1_DIRECTORIES });

      expect(h.snapshot().settings.defaultCwd).toBe('');
      h.workspace.createTab();
      expect(h.activeTab()?.cwd).toBe('C:\\Users\\tester');
    },
  );

  it('behält einen anderen Standardordner', () => {
    const h = startWorkspace({ state: v1State({ defaultCwd: 'D:\\logs' }), directories: V1_DIRECTORIES });

    expect(h.snapshot().settings.defaultCwd).toBe('D:\\logs');
  });

  it('speichert den übernommenen Zustand sofort als Version 2 und übernimmt nur einmal', async () => {
    const storage = new MemoryStorage(v1State({ shell: 'cmd.exe' }));
    const h = startWorkspace({ storage, directories: V1_DIRECTORIES });
    const migrated = h.snapshot();

    expect(storage.stored).toMatchObject({ version: 2 });

    await h.restart();
    expect(h.snapshot()).toEqual(migrated);
  });
});
