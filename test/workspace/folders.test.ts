import { describe, expect, it } from 'vitest';
import { startWorkspace, type TestWorkspace } from '../support/harness';

// Ordner, automatische Tab-Namen und die zuletzt benutzten Ordner (Ticket 05).

const HOME = 'C:\\Users\\tester';

/** Pfade der zuletzt benutzten Ordner, wie sie das Pfeil-Menü anbietet. */
function recentPaths(h: TestWorkspace): string[] {
  return h.workspace.recentDirs().map((d) => d.path);
}

/** Legt nacheinander Tabs in diesen Ordnern an. */
function createTabsIn(h: TestWorkspace, dirs: string[]): void {
  for (const cwd of dirs) h.workspace.createTab({ cwd });
}

describe('Automatische Tab-Namen', () => {
  it('benennt einen Tab nach dem letzten Teil seines Ordners', () => {
    const h = startWorkspace({ directories: ['D:\\projekte\\termhub', 'D:\\Kunden\\Acme Portal\\'] });

    h.workspace.createTab({ cwd: 'D:\\projekte\\termhub' });
    h.workspace.createTab({ cwd: 'D:\\Kunden\\Acme Portal\\' });

    expect(h.tabs().map((t) => t.name)).toEqual(['tester', 'termhub', 'Acme Portal']);
  });

  it('nennt einen Tab im Benutzerordner nach dem Benutzer, auch bei anderer Schreibweise des Pfads', () => {
    const h = startWorkspace({ homeDir: 'C:\\Users\\a.mueller', userName: 'anna' });

    h.workspace.createTab({ cwd: 'c:\\users\\A.MUELLER\\' });

    expect(h.tabs().map((t) => t.name)).toEqual(['anna', 'anna 2']);
  });

  it('nennt einen Tab auf einem Laufwerk nach dem Laufwerksbuchstaben', () => {
    const h = startWorkspace({ directories: ['D:\\', 'e:\\'] });

    h.workspace.createTab({ cwd: 'D:\\' });
    h.workspace.createTab({ cwd: 'e:\\' });

    expect(h.tabs().map((t) => t.name)).toEqual(['tester', 'D:', 'E:']);
  });

  it('hängt bei Gleichstand „ 2“, „ 3“ an, auch für gleichnamige Ordner an verschiedenen Orten', () => {
    const h = startWorkspace({ directories: ['C:\\work\\api', 'D:\\old\\api'] });

    createTabsIn(h, ['C:\\work\\api', 'C:\\work\\api', 'D:\\old\\api']);

    expect(h.tabs().map((t) => t.name)).toEqual(['tester', 'api', 'api 2', 'api 3']);
  });

  it('zählt von Hand vergebene Namen beim Gleichstand mit, ohne Rücksicht auf Gross-/Kleinschreibung', () => {
    const h = startWorkspace({ directories: ['C:\\work\\api'] });
    h.workspace.renameTab(h.activeTab()!.id, 'API');

    h.workspace.createTab({ cwd: 'C:\\work\\api' });

    expect(h.tabs().map((t) => t.name)).toEqual(['API', 'api 2']);
  });

  it('legt den Namen beim Anlegen fest: Schliessen eines gleichnamigen Tabs benennt nichts um', async () => {
    const h = startWorkspace({ directories: ['C:\\work\\api'] });
    createTabsIn(h, ['C:\\work\\api', 'C:\\work\\api']);

    h.workspace.closeTab(h.tabNamed('api').id);
    await h.restart();

    expect(h.tabs().map((t) => t.name)).toEqual(['tester', 'api 2']);
  });

  it('ändert den Namen nicht, wenn der Tab später in einem anderen Ordner steht', async () => {
    const h = startWorkspace({
      directories: ['C:\\proj', 'D:\\anderswo'],
      state: {
        version: 2,
        settings: { defaultCwd: '', theme: 'system', fontSize: 14, notifications: true },
        tabs: [
          {
            id: 'a',
            name: 'proj',
            nameIsManual: false,
            shellId: 'powershell',
            startCwd: 'C:\\proj',
            lastCwd: 'D:\\anderswo',
          },
        ],
        activeTabId: 'a',
        recentDirs: [],
        closedTabs: [],
      },
    });

    await h.restart();

    expect(h.tabs()).toMatchObject([{ id: 'a', name: 'proj', cwd: 'D:\\anderswo' }]);
  });

  describe('ein von Hand vergebener Name bleibt fest', () => {
    it('über einen Neustart, und er gilt als von Hand vergeben', async () => {
      const h = startWorkspace({ directories: ['C:\\work\\api'] });
      const id = h.workspace.createTab({ cwd: 'C:\\work\\api' });
      h.workspace.renameTab(id, 'Server');

      await h.restart();

      expect(h.tabs().find((t) => t.id === id)?.name).toBe('Server');
      expect(h.storedTab(id)).toMatchObject({ name: 'Server', nameIsManual: true });
    });

    it('auch wenn danach weitere Tabs im selben Ordner entstehen', () => {
      const h = startWorkspace({ directories: ['C:\\work\\api'] });
      const id = h.workspace.createTab({ cwd: 'C:\\work\\api' });
      h.workspace.renameTab(id, 'Server');

      createTabsIn(h, ['C:\\work\\api', 'C:\\work\\api']);

      expect(h.tabs().map((t) => t.name)).toEqual(['tester', 'Server', 'api', 'api 2']);
    });

    it('auch wenn der Nutzer den Namen des Ordners selbst wählt', () => {
      const h = startWorkspace({ directories: ['C:\\work\\api'] });
      const id = h.workspace.createTab({ cwd: 'C:\\work\\api' });
      h.workspace.renameTab(id, 'api-alt');
      h.workspace.renameTab(id, 'api');

      h.workspace.createTab({ cwd: 'C:\\work\\api' });

      expect(h.storedTab(id)).toMatchObject({ name: 'api', nameIsManual: true });
      expect(h.tabs().map((t) => t.name)).toEqual(['tester', 'api', 'api 2']);
    });
  });
});

describe('Standardordner', () => {
  it('ist ohne Einstellung leer, und neue Tabs starten im Benutzerordner', () => {
    const h = startWorkspace();
    expect(h.snapshot().settings.defaultCwd).toBe('');

    const id = h.workspace.createTab();
    h.showAllViews();

    expect(h.activeTab()).toMatchObject({ name: 'tester 2', cwd: HOME });
    expect(h.terminal.startsFor(id)[0].order.cwd).toBe(HOME);
  });

  it('wird nach dem Zurücksetzen wieder zum Benutzerordner', () => {
    const h = startWorkspace({ directories: ['D:\\work'] });
    h.workspace.updateSettings({ defaultCwd: 'D:\\work' });

    h.workspace.updateSettings({ defaultCwd: '' });
    h.workspace.createTab();

    expect(h.activeTab()?.cwd).toBe(HOME);
  });

  it('gilt für neue Tabs mit `+` oder Ctrl+Shift+T; der Tab heisst wie der Ordner', () => {
    const h = startWorkspace({ directories: ['D:\\work'] });
    h.workspace.updateSettings({ defaultCwd: 'D:\\work' });

    const id = h.workspace.createTab();
    h.showAllViews();

    expect(h.activeTab()).toMatchObject({ id, name: 'work', cwd: 'D:\\work' });
    expect(h.terminal.startsFor(id)[0].order.cwd).toBe('D:\\work');
  });

  it('fällt auf den Benutzerordner zurück, wenn es ihn nicht gibt', () => {
    const h = startWorkspace();
    h.workspace.updateSettings({ defaultCwd: 'X:\\gibt-es-nicht' });

    h.workspace.createTab();

    expect(h.activeTab()).toMatchObject({ name: 'tester 2', cwd: HOME });
  });

  it('übersteht einen Neustart', async () => {
    const h = startWorkspace({ directories: ['D:\\work'] });
    h.workspace.updateSettings({ defaultCwd: 'D:\\work' });

    await h.restart();

    expect(h.snapshot().settings.defaultCwd).toBe('D:\\work');
  });

  describe('eine Änderung betrifft bestehende Tabs nicht', () => {
    function tabInOldDefault(): { h: TestWorkspace; id: string } {
      const h = startWorkspace({ directories: ['D:\\alt', 'E:\\neu'] });
      h.workspace.updateSettings({ defaultCwd: 'D:\\alt' });
      const id = h.workspace.createTab();
      h.showAllViews();
      h.workspace.updateSettings({ defaultCwd: 'E:\\neu' });
      return { h, id };
    }

    it('Name und Ordner bleiben; nur neue Tabs starten im neuen Standardordner', () => {
      const { h, id } = tabInOldDefault();

      h.workspace.createTab();

      expect(h.tabs().map((t) => ({ name: t.name, cwd: t.cwd }))).toEqual([
        { name: 'tester', cwd: HOME },
        { name: 'alt', cwd: 'D:\\alt' },
        { name: 'neu', cwd: 'E:\\neu' },
      ]);
      expect(h.tabs()[1].id).toBe(id);
    });

    it('eine neu gestartete Shell startet wieder im alten Ordner', () => {
      const { h, id } = tabInOldDefault();

      h.terminal.exit(id, 0);
      h.workspace.restartTab(id);

      expect(h.terminal.startsFor(id).map((s) => s.order.cwd)).toEqual(['D:\\alt', 'D:\\alt']);
    });

    it('auch nach einem Neustart der App', async () => {
      const { h, id } = tabInOldDefault();

      await h.restart();
      h.showAllViews();

      expect(h.terminal.startsFor(id)[0].order.cwd).toBe('D:\\alt');
      expect(h.tabs().find((t) => t.id === id)?.name).toBe('alt');
    });
  });
});

describe('Neues Terminal in einem gewählten Ordner', () => {
  it('startet dort, heisst wie der Ordner und steht danach oben in der Liste', () => {
    const h = startWorkspace({ directories: ['D:\\kunden\\acme-portal'] });

    const id = h.workspace.createTab({ cwd: 'D:\\kunden\\acme-portal' });
    h.showAllViews();

    expect(h.snapshot().activeTabId).toBe(id);
    expect(h.activeTab()).toMatchObject({ name: 'acme-portal', cwd: 'D:\\kunden\\acme-portal' });
    expect(h.terminal.startsFor(id)[0].order.cwd).toBe('D:\\kunden\\acme-portal');
    expect(h.workspace.recentDirs()[0]).toEqual({ path: 'D:\\kunden\\acme-portal', name: 'acme-portal' });
  });

  it('erscheint wie jeder neue Tab am Ende der Leiste, auch wenn der erste Tab aktiv ist', () => {
    const h = startWorkspace({ directories: ['C:\\a', 'C:\\b'] });
    createTabsIn(h, ['C:\\a']);
    h.workspace.activateTab(h.tabNamed('tester').id);

    h.workspace.createTab({ cwd: 'C:\\b' });

    expect(h.tabs().map((t) => t.name)).toEqual(['tester', 'a', 'b']);
  });

  it('gilt unabhängig vom Standardordner und ändert ihn nicht', () => {
    const h = startWorkspace({ directories: ['D:\\work', 'C:\\proj'] });
    h.workspace.updateSettings({ defaultCwd: 'D:\\work' });

    h.workspace.createTab({ cwd: 'C:\\proj' });

    expect(h.activeTab()?.cwd).toBe('C:\\proj');
    expect(h.snapshot().settings.defaultCwd).toBe('D:\\work');
  });

  it('fällt auf den Standardordner zurück, wenn es den gewählten Ordner nicht mehr gibt', () => {
    const h = startWorkspace({ directories: ['D:\\work'] });
    h.workspace.updateSettings({ defaultCwd: 'D:\\work' });

    h.workspace.createTab({ cwd: 'C:\\geloescht' });

    expect(h.activeTab()).toMatchObject({ name: 'work', cwd: 'D:\\work' });
    expect(recentPaths(h)[0]).toBe('D:\\work');
  });
});

describe('Zuletzt benutzte Ordner', () => {
  it('enthalten die Startordner neuer Tabs, neueste zuerst', () => {
    const h = startWorkspace({ directories: ['C:\\a', 'C:\\b', 'C:\\c'] });

    createTabsIn(h, ['C:\\a', 'C:\\b', 'C:\\c']);

    // Auch das erste Terminal beim Start ist ein neu angelegter Tab.
    expect(recentPaths(h)).toEqual(['C:\\c', 'C:\\b', 'C:\\a', HOME]);
  });

  it('nennen jeden Ordner so, wie ein neuer Tab dort hiesse', () => {
    const h = startWorkspace({ homeDir: 'C:\\Users\\a.mueller', userName: 'anna', directories: ['D:\\', 'C:\\work\\api'] });
    createTabsIn(h, ['D:\\', 'C:\\work\\api', 'C:\\work\\api']);

    expect(h.workspace.recentDirs()).toEqual([
      { path: 'C:\\work\\api', name: 'api' },
      { path: 'D:\\', name: 'D:' },
      { path: 'C:\\Users\\a.mueller', name: 'anna' },
    ]);
  });

  it('enthalten keinen Ordner doppelt; ein wieder benutzter Ordner rückt nach oben', () => {
    const h = startWorkspace({ directories: ['C:\\a', 'C:\\b'] });

    createTabsIn(h, ['C:\\a', 'C:\\b', 'c:\\A\\']);

    expect(recentPaths(h)).toEqual(['c:\\A\\', 'C:\\b', HOME]);
  });

  it('enthalten einen Ordner nicht doppelt, nur weil er einmal als 8.3-Kurzname kam', () => {
    // Wie unter Windows gibt es den Ordner unter beiden Namen.
    const h = startWorkspace({
      directories: ['C:\\Users\\anna.mueller\\proj', 'C:\\Users\\ANNA~1\\proj'],
      shortPaths: { 'C:\\Users\\ANNA~1': 'C:\\Users\\anna.mueller' },
    });

    createTabsIn(h, ['C:\\Users\\anna.mueller\\proj', 'C:\\Users\\ANNA~1\\proj']);

    expect(recentPaths(h)).toEqual(['C:\\Users\\anna.mueller\\proj', HOME]);
  });

  it('fassen Kurz- und Langform aus einem älteren Stand beim Anbieten zusammen', () => {
    const h = startWorkspace({
      directories: ['C:\\Users\\anna.mueller\\proj', 'C:\\b'],
      shortPaths: { 'C:\\Users\\ANNA~1': 'C:\\Users\\anna.mueller' },
      state: {
        version: 2,
        settings: { defaultCwd: '', theme: 'system', fontSize: 14, notifications: true },
        tabs: [{ id: 'a', name: 'b', nameIsManual: false, shellId: 'cmd', startCwd: 'C:\\b' }],
        activeTabId: 'a',
        recentDirs: ['C:\\Users\\ANNA~1\\proj', 'C:\\b', 'C:\\Users\\anna.mueller\\proj'],
        closedTabs: [],
      },
    });

    expect(recentPaths(h)).toEqual(['C:\\Users\\anna.mueller\\proj', 'C:\\b']);
  });

  it('sind höchstens acht', () => {
    const dirs = Array.from({ length: 10 }, (_, i) => `D:\\p${i + 1}`);
    const h = startWorkspace({ directories: dirs });

    createTabsIn(h, dirs);

    expect(recentPaths(h)).toEqual(['D:\\p10', 'D:\\p9', 'D:\\p8', 'D:\\p7', 'D:\\p6', 'D:\\p5', 'D:\\p4', 'D:\\p3']);
  });

  describe('beim Schliessen kommt der Ordner des Tabs hinzu', () => {
    it('der zuletzt aktive Ordner, sobald die Shell ihn gemeldet hat', () => {
      const h = startWorkspace({
        directories: ['C:\\start', 'D:\\zuletzt', 'C:\\x'],
        state: {
          version: 2,
          settings: { defaultCwd: '', theme: 'system', fontSize: 14, notifications: true },
          tabs: [
            { id: 'a', name: 'start', nameIsManual: false, shellId: 'cmd', startCwd: 'C:\\start', lastCwd: 'D:\\zuletzt' },
            { id: 'b', name: 'x', nameIsManual: false, shellId: 'cmd', startCwd: 'C:\\x' },
          ],
          activeTabId: 'a',
          recentDirs: ['C:\\x', 'C:\\start'],
          closedTabs: [],
        },
      });

      h.workspace.closeTab('a');

      expect(recentPaths(h)).toEqual(['D:\\zuletzt', 'C:\\x', 'C:\\start']);
    });

    it('sonst der Startordner', () => {
      const h = startWorkspace({ directories: ['C:\\a', 'C:\\b'] });
      createTabsIn(h, ['C:\\a', 'C:\\b']);

      h.workspace.closeTab(h.tabNamed('a').id);

      expect(recentPaths(h)).toEqual(['C:\\a', 'C:\\b', HOME]);
    });
  });

  it('überstehen einen Neustart, in derselben Reihenfolge', async () => {
    const h = startWorkspace({ directories: ['C:\\a', 'C:\\b'] });
    createTabsIn(h, ['C:\\a', 'C:\\b']);
    h.workspace.closeTab(h.tabNamed('a').id);
    const before = h.workspace.recentDirs();

    await h.restart();

    expect(h.workspace.recentDirs()).toEqual(before);
    expect(h.storedState().recentDirs).toEqual(['C:\\a', 'C:\\b', HOME]);
  });

  it('bieten Ordner, die es nicht mehr gibt, nicht an, vergessen sie aber nicht', async () => {
    const h = startWorkspace({ directories: ['C:\\a', 'E:\\netz', 'C:\\b'] });
    createTabsIn(h, ['C:\\a', 'E:\\netz', 'C:\\b']);

    h.system.removeDirectory('E:\\netz');
    expect(recentPaths(h)).toEqual(['C:\\b', 'C:\\a', HOME]);

    await h.restart();
    expect(recentPaths(h)).toEqual(['C:\\b', 'C:\\a', HOME]);

    // Das Netzlaufwerk ist wieder verbunden.
    h.system.addDirectory('E:\\netz');
    expect(recentPaths(h)).toEqual(['C:\\b', 'E:\\netz', 'C:\\a', HOME]);
  });

  it('werden aus der Zustandsdatei tolerant gelesen: ohne Doppelte, höchstens acht', () => {
    const stored = ['C:\\a', 'c:\\a\\', 'C:\\b', 42, '', ...Array.from({ length: 8 }, (_, i) => `D:\\p${i}`)];
    const h = startWorkspace({
      directories: ['C:\\a', 'C:\\b', ...Array.from({ length: 8 }, (_, i) => `D:\\p${i}`)],
      state: {
        version: 2,
        settings: { defaultCwd: '', theme: 'system', fontSize: 14, notifications: true },
        tabs: [{ id: 'a', name: 'a', nameIsManual: false, shellId: 'cmd', startCwd: 'C:\\a' }],
        activeTabId: 'a',
        recentDirs: stored,
        closedTabs: [],
      },
    });

    expect(recentPaths(h)).toEqual(['C:\\a', 'C:\\b', 'D:\\p0', 'D:\\p1', 'D:\\p2', 'D:\\p3', 'D:\\p4', 'D:\\p5']);
  });

  it('ändern sich nicht durch das Wiederherstellen gespeicherter Tabs', async () => {
    const h = startWorkspace({ directories: ['C:\\a'] });
    createTabsIn(h, ['C:\\a']);
    const before = recentPaths(h);

    await h.restart();
    h.showAllViews();

    expect(recentPaths(h)).toEqual(before);
  });
});
