import { describe, expect, it } from 'vitest';
import { startWorkspace } from '../support/harness';

describe('Tabs', () => {
  it('startet ohne gespeicherten Zustand mit einem Terminal im Benutzerordner', () => {
    const h = startWorkspace({ homeDir: 'C:\\Users\\anna' });

    expect(h.tabs()).toMatchObject([{ name: 'Terminal 1', cwd: 'C:\\Users\\anna', process: 'pending' }]);
    expect(h.activeTab()?.name).toBe('Terminal 1');
  });

  it('nimmt bis zur Shell-Erkennung wie in Version 0.1.0 Windows PowerShell als Standard-Shell', () => {
    const h = startWorkspace();

    expect(h.activeTab()?.shellId).toBe('powershell');
  });

  it('legt einen neuen Tab am Ende im Standardordner an und macht ihn aktiv', () => {
    const h = startWorkspace({ directories: ['D:\\work'] });
    h.workspace.updateSettings({ defaultCwd: 'D:\\work' });

    const id = h.workspace.createTab();

    expect(h.tabs().map((t) => t.name)).toEqual(['Terminal 1', 'Terminal 2']);
    expect(h.snapshot().activeTabId).toBe(id);
    expect(h.activeTab()).toMatchObject({ name: 'Terminal 2', cwd: 'D:\\work' });
  });

  it('vergibt wie bisher die kleinste freie Nummer im Namen', () => {
    const h = startWorkspace();
    h.workspace.createTab();
    h.workspace.createTab();
    h.workspace.closeTab(h.tabNamed('Terminal 2').id);

    h.workspace.createTab();

    expect(h.tabs().map((t) => t.name)).toEqual(['Terminal 1', 'Terminal 3', 'Terminal 2']);
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
      h.workspace.activateTab(h.tabNamed('Terminal 2').id);

      h.workspace.closeTab(h.tabNamed('Terminal 2').id);

      expect(h.activeTab()?.name).toBe('Terminal 3');
    });

    it('der linke Nachbar, wenn der Tab ganz rechts war', () => {
      const h = startWorkspace();
      h.workspace.createTab();
      h.workspace.createTab();

      h.workspace.closeTab(h.tabNamed('Terminal 3').id);

      expect(h.activeTab()?.name).toBe('Terminal 2');
    });
  });

  it('lässt den aktiven Tab stehen, wenn ein anderer Tab geschlossen wird', () => {
    const h = startWorkspace();
    h.workspace.createTab();
    h.workspace.createTab();
    h.workspace.activateTab(h.tabNamed('Terminal 3').id);

    h.workspace.closeTab(h.tabNamed('Terminal 1').id);

    expect(h.activeTab()?.name).toBe('Terminal 3');
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
      tabs: [{ name: 'Terminal 1' }, { name: 'Terminal 2' }],
    });

    h.workspace.renameTab(second, 'Build');
    expect(h.events.at(-1)).toMatchObject({ type: 'tabs', tabs: [{ name: 'Terminal 1' }, { name: 'Build' }] });

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
