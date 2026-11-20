import { describe, expect, it } from 'vitest';
import { MemoryStorage } from '../support/fakes';
import { startWorkspace } from '../support/harness';

describe('Neustart', () => {
  it('stellt Tabs, Reihenfolge, Namen und den aktiven Tab wieder her', async () => {
    const h = startWorkspace();
    h.workspace.createTab();
    h.workspace.createTab();
    h.workspace.renameTab(h.tabNamed('tester 2').id, 'Server');
    h.workspace.activateTab(h.tabNamed('Server').id);
    const before = h.tabs().map((t) => ({ id: t.id, name: t.name, shellId: t.shellId, cwd: t.cwd }));

    await h.restart();

    expect(h.tabs().map((t) => ({ id: t.id, name: t.name, shellId: t.shellId, cwd: t.cwd }))).toEqual(before);
    expect(h.activeTab()?.name).toBe('Server');
  });

  it('behält die Reihenfolge, wenn Tabs umsortiert und neue am Ende angehängt wurden', async () => {
    const h = startWorkspace();
    h.workspace.createTab();
    h.workspace.moveTab(h.tabNamed('tester 2').id, 0);
    h.workspace.activateTab(h.tabNamed('tester').id);
    h.workspace.createTab();

    await h.restart();

    expect(h.tabs().map((t) => t.name)).toEqual(['tester 2', 'tester', 'tester 3']);
    expect(h.activeTab()?.name).toBe('tester 3');
  });

  it('lässt geschlossene Tabs weg', async () => {
    const h = startWorkspace();
    h.workspace.createTab();
    h.workspace.closeTab(h.tabNamed('tester').id);

    await h.restart();

    expect(h.tabs().map((t) => t.name)).toEqual(['tester 2']);
  });

  it('startet ohne Tabs wieder mit einem neuen Terminal', async () => {
    const h = startWorkspace();
    h.workspace.closeTab(h.activeTab()!.id);

    await h.restart();

    expect(h.tabs()).toMatchObject([{ name: 'tester' }]);
  });

  it('startet die Shells erst, wenn ihre Ansichten bereit sind, in gespeicherter Reihenfolge', async () => {
    const h = startWorkspace();
    h.workspace.createTab();
    h.workspace.createTab();
    h.showAllViews();

    await h.restart();
    expect(h.terminal.starts).toEqual([]);
    expect(h.tabs().map((t) => t.process)).toEqual(['pending', 'pending', 'pending']);

    h.showAllViews(100, 30);
    expect(h.terminal.starts.map((s) => s.tabId)).toEqual(h.tabs().map((t) => t.id));
    expect(h.terminal.starts.every((s) => s.order.cols === 100 && s.order.rows === 30)).toBe(true);
  });

  it('sichert beim Beenden den Zustand und beendet alle Shells', async () => {
    const storage = new MemoryStorage();
    const h = startWorkspace({ storage });
    h.showAllViews();
    const terminalBefore = h.terminal;

    await h.restart();

    expect(storage.flushes).toBe(1);
    expect(terminalBefore.killAllCalls).toBe(1);
  });

  it('beendet die Shells auch, wenn das Sichern beim Beenden scheitert', async () => {
    const storage = new MemoryStorage();
    storage.flush = () => {
      throw new Error('Datenträger voll');
    };
    const h = startWorkspace({ storage });
    h.showAllViews();

    await expect(h.workspace.shutdown()).rejects.toThrow('Datenträger voll');
    expect(h.terminal.killAllCalls).toBe(1);
  });

  it('nimmt nach dem Beenden keine Befehle mehr an', async () => {
    const h = startWorkspace();
    const id = h.activeTab()!.id;
    await h.workspace.shutdown();

    h.workspace.renameTab(id, 'Zu spät');
    h.workspace.createTab();
    h.workspace.viewReady(id, 80, 24);

    expect(h.tabs()).toMatchObject([{ id, name: 'tester' }]);
    expect(h.terminal.starts).toEqual([]);
  });

  describe('Ordner beim Start', () => {
    it('startet im Startordner des Tabs, solange es ihn gibt', async () => {
      const h = startWorkspace({ directories: ['C:\\proj'] });
      h.workspace.updateSettings({ defaultCwd: 'C:\\proj' });
      h.workspace.createTab();

      await h.restart();
      h.showAllViews();

      expect(h.terminal.startsFor(h.tabNamed('proj').id)[0].order.cwd).toBe('C:\\proj');
    });

    it('fällt auf den Standardordner zurück, wenn der Ordner des Tabs fehlt', async () => {
      const h = startWorkspace({ directories: ['C:\\proj', 'D:\\default'] });
      h.workspace.updateSettings({ defaultCwd: 'C:\\proj' });
      h.workspace.createTab();
      h.workspace.updateSettings({ defaultCwd: 'D:\\default' });
      h.system.removeDirectory('C:\\proj');

      await h.restart();
      h.showAllViews();

      expect(h.terminal.startsFor(h.tabNamed('proj').id)[0].order.cwd).toBe('D:\\default');
    });

    it('fällt auf den Benutzerordner zurück, wenn auch der Standardordner fehlt', async () => {
      const h = startWorkspace({ homeDir: 'C:\\Users\\anna', directories: ['C:\\proj'] });
      h.workspace.updateSettings({ defaultCwd: 'C:\\proj' });
      h.workspace.createTab();
      h.system.removeDirectory('C:\\proj');

      await h.restart();
      h.showAllViews();

      expect(h.terminal.startsFor(h.tabNamed('proj').id)[0].order.cwd).toBe('C:\\Users\\anna');
    });

    it('nimmt den Benutzerordner, wenn kein Standardordner eingestellt ist', async () => {
      const h = startWorkspace({ homeDir: 'C:\\Users\\anna', directories: ['C:\\proj'] });
      h.workspace.updateSettings({ defaultCwd: 'C:\\proj' });
      h.workspace.createTab();
      h.workspace.updateSettings({ defaultCwd: '' });
      h.system.removeDirectory('C:\\proj');

      await h.restart();
      h.showAllViews();

      expect(h.terminal.startsFor(h.tabNamed('proj').id)[0].order.cwd).toBe('C:\\Users\\anna');
    });
  });
});
