import { describe, expect, it } from 'vitest';
import { startWorkspace } from '../support/harness';

describe('Tabs', () => {
  it('startet ohne gespeicherten Zustand mit einem Terminal im Benutzerordner', () => {
    const h = startWorkspace({ homeDir: 'C:\\Users\\anna' });

    expect(h.tabs()).toMatchObject([{ name: 'anna', cwd: 'C:\\Users\\anna', process: 'pending' }]);
    expect(h.activeTab()?.name).toBe('anna');
  });

  it('nimmt bis zur Shell-Erkennung wie in Version 0.1.0 Windows PowerShell als Standard-Shell', () => {
    const h = startWorkspace();

    expect(h.activeTab()?.shellId).toBe('powershell');
  });

  it('legt einen neuen Tab im Standardordner an und macht ihn aktiv', () => {
    const h = startWorkspace({ directories: ['D:\\work'] });
    h.workspace.updateSettings({ defaultCwd: 'D:\\work' });

    const id = h.workspace.createTab();

    expect(h.tabs().map((t) => t.name)).toEqual(['tester', 'work']);
    expect(h.snapshot().activeTabId).toBe(id);
    expect(h.activeTab()).toMatchObject({ name: 'work', cwd: 'D:\\work' });
  });

  describe('ein neuer Tab erscheint rechts neben dem aktiven', () => {
    it('zwischen dem aktiven Tab und seinem rechten Nachbarn', () => {
      const h = startWorkspace();
      h.workspace.createTab();
      h.workspace.createTab();
      h.workspace.activateTab(h.tabNamed('tester').id);

      const id = h.workspace.createTab();

      expect(h.tabs().map((t) => t.name)).toEqual(['tester', 'tester 4', 'tester 2', 'tester 3']);
      expect(h.snapshot().activeTabId).toBe(id);
    });

    it('ganz rechts, wenn der aktive Tab der letzte ist', () => {
      const h = startWorkspace();
      h.workspace.createTab();

      h.workspace.createTab();

      expect(h.tabs().map((t) => t.name)).toEqual(['tester', 'tester 2', 'tester 3']);
    });

    it('nacheinander angelegte Tabs reihen sich rechts vom ursprünglich aktiven auf', () => {
      const h = startWorkspace();
      h.workspace.createTab();
      h.workspace.activateTab(h.tabNamed('tester').id);

      h.workspace.createTab();
      h.workspace.createTab();

      expect(h.tabs().map((t) => t.name)).toEqual(['tester', 'tester 3', 'tester 4', 'tester 2']);
    });

    it('als einziger Tab, wenn keiner mehr offen ist', () => {
      const h = startWorkspace();
      h.workspace.closeTab(h.activeTab()!.id);

      const id = h.workspace.createTab();

      expect(h.snapshot()).toMatchObject({ tabs: [{ id, name: 'tester' }], activeTabId: id });
    });
  });

  it('vergibt bei Gleichstand die kleinste freie Nummer im Namen', () => {
    const h = startWorkspace();
    h.workspace.createTab();
    h.workspace.createTab();
    h.workspace.closeTab(h.tabNamed('tester 2').id);

    h.workspace.createTab();

    expect(h.tabs().map((t) => t.name)).toEqual(['tester', 'tester 3', 'tester 2']);
  });

  it('benennt einen Tab um und entfernt Leerraum am Rand', () => {
    const h = startWorkspace();
    const id = h.activeTab()!.id;

    h.workspace.renameTab(id, '  Mein Projekt  ');

    expect(h.activeTab()?.name).toBe('Mein Projekt');
  });

  it('ignoriert leere Namen beim Umbenennen', () => {
    const h = startWorkspace();
    const id = h.activeTab()!.id;
    h.workspace.renameTab(id, 'Server');

    h.workspace.renameTab(id, '');
    h.workspace.renameTab(id, '   ');

    expect(h.activeTab()?.name).toBe('Server');
  });

  it('aktiviert einen Tab', () => {
    const h = startWorkspace();
    const first = h.activeTab()!.id;
    h.workspace.createTab();

    h.workspace.activateTab(first);

    expect(h.snapshot().activeTabId).toBe(first);
  });

  describe('Wechsel zum nächsten, vorherigen und n-ten Tab', () => {
    it('wechselt zum nächsten und vorherigen Tab, über die Enden hinweg im Kreis', () => {
      const h = startWorkspace();
      h.workspace.createTab();
      h.workspace.createTab();

      h.workspace.activateRelativeTab(1);
      expect(h.activeTab()?.name).toBe('tester');

      h.workspace.activateRelativeTab(1);
      expect(h.activeTab()?.name).toBe('tester 2');

      h.workspace.activateRelativeTab(-1);
      h.workspace.activateRelativeTab(-1);
      expect(h.activeTab()?.name).toBe('tester 3');
    });

    it('wechselt zum Tab an einer Position der Leiste', () => {
      const h = startWorkspace();
      h.workspace.createTab();
      h.workspace.createTab();

      h.workspace.activateTabAt(1);

      expect(h.activeTab()?.name).toBe('tester 2');
    });

    it('bleibt beim aktiven Tab, wenn es an der Position keinen Tab gibt', () => {
      const h = startWorkspace();
      h.workspace.createTab();

      h.workspace.activateTabAt(5);
      h.workspace.activateTabAt(-1);

      expect(h.activeTab()?.name).toBe('tester 2');
    });

    it('macht ohne offene Tabs nichts', () => {
      const h = startWorkspace();
      h.workspace.closeTab(h.activeTab()!.id);

      h.workspace.activateRelativeTab(1);
      h.workspace.activateTabAt(0);

      expect(h.snapshot()).toMatchObject({ tabs: [], activeTabId: null });
    });
  });

  it('nennt im Schnappschuss den Anzeigenamen der Shell, auch für eine nicht mehr vorhandene Shell', () => {
    const h = startWorkspace({
      state: {
        version: 2,
        settings: { defaultCwd: '', theme: 'system', fontSize: 14, notifications: true },
        tabs: [
          { id: 'a', name: 'A', nameIsManual: true, shellId: 'cmd', startCwd: 'C:\\Users\\tester' },
          { id: 'b', name: 'B', nameIsManual: true, shellId: 'gitbash', startCwd: 'C:\\Users\\tester' },
        ],
        activeTabId: 'a',
        recentDirs: [],
        closedTabs: [],
      },
    });

    // Eine Shell, die es nicht mehr gibt, startet als Standard-Shell; so heisst sie dann auch.
    expect(h.tabs().map((t) => t.shellName)).toEqual(['cmd', 'Windows PowerShell']);
  });

  it('ignoriert Befehle für unbekannte Tabs', () => {
    const h = startWorkspace();
    const before = h.snapshot();

    h.workspace.activateTab('gibt-es-nicht');
    h.workspace.renameTab('gibt-es-nicht', 'X');
    h.workspace.closeTab('gibt-es-nicht');

    expect(h.snapshot()).toEqual(before);
  });

  it('schliesst einen Tab und beendet seine Shell', () => {
    const h = startWorkspace();
    const keep = h.activeTab()!.id;
    const close = h.workspace.createTab();
    h.showAllViews();
    expect(h.terminal.isRunning(close)).toBe(true);

    h.workspace.closeTab(close);

    expect(h.tabs().map((t) => t.id)).toEqual([keep]);
    expect(h.terminal.kills).toEqual([close]);
    expect(h.terminal.isRunning(close)).toBe(false);
    expect(h.eventsOfType('exit')).toEqual([]);
  });

  describe('nach dem Schliessen des aktiven Tabs wird sein Nachbar aktiv', () => {
    it('der rechte Nachbar', () => {
      const h = startWorkspace();
      h.workspace.createTab();
      h.workspace.createTab();
      h.workspace.activateTab(h.tabNamed('tester 2').id);

      h.workspace.closeTab(h.tabNamed('tester 2').id);

      expect(h.activeTab()?.name).toBe('tester 3');
    });

    it('der linke Nachbar, wenn der Tab ganz rechts war', () => {
      const h = startWorkspace();
      h.workspace.createTab();
      h.workspace.createTab();

      h.workspace.closeTab(h.tabNamed('tester 3').id);

      expect(h.activeTab()?.name).toBe('tester 2');
    });
  });

  it('lässt den aktiven Tab stehen, wenn ein anderer Tab geschlossen wird', () => {
    const h = startWorkspace();
    h.workspace.createTab();
    h.workspace.createTab();
    h.workspace.activateTab(h.tabNamed('tester 3').id);

    h.workspace.closeTab(h.tabNamed('tester').id);

    expect(h.activeTab()?.name).toBe('tester 3');
  });

  it('hat nach dem Schliessen des letzten Tabs keinen aktiven Tab mehr', () => {
    const h = startWorkspace();

    h.workspace.closeTab(h.activeTab()!.id);

    expect(h.snapshot()).toMatchObject({ tabs: [], activeTabId: null });
  });

  it('meldet dem Renderer jede Änderung der Tabs als Ereignis', () => {
    const h = startWorkspace();
    const first = h.activeTab()!.id;

    const second = h.workspace.createTab();
    expect(h.events.at(-1)).toMatchObject({
      type: 'tabs',
      activeTabId: second,
      tabs: [{ name: 'tester' }, { name: 'tester 2' }],
    });

    h.workspace.renameTab(second, 'Build');
    expect(h.events.at(-1)).toMatchObject({ type: 'tabs', tabs: [{ name: 'tester' }, { name: 'Build' }] });

    h.workspace.activateTab(first);
    expect(h.events.at(-1)).toMatchObject({ type: 'tabs', activeTabId: first });

    h.workspace.closeTab(second);
    expect(h.events.at(-1)).toMatchObject({ type: 'tabs', activeTabId: first, tabs: [{ id: first }] });
  });

  it('meldet geänderte Einstellungen als Ereignis', () => {
    const h = startWorkspace();

    h.workspace.updateSettings({ defaultCwd: 'D:\\work' });

    expect(h.events.at(-1)).toMatchObject({ type: 'settings', settings: { defaultCwd: 'D:\\work' } });
    expect(h.snapshot().settings.defaultCwd).toBe('D:\\work');
  });
});
