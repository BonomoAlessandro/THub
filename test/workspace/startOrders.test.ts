import { describe, expect, it } from 'vitest';
import { startWorkspace } from '../support/harness';

describe('Startaufträge', () => {
  it('erteilt keinen Startauftrag, bevor die Ansicht des Tabs bereit ist', () => {
    const h = startWorkspace();
    h.workspace.createTab();

    expect(h.terminal.starts).toEqual([]);
  });

  it('startet die Shell nach „Ansicht bereit“ mit der gemeldeten Grösse', () => {
    const h = startWorkspace({ homeDir: 'C:\\Users\\anna' });
    const id = h.activeTab()!.id;

    h.workspace.viewReady(id, 132, 41);

    expect(h.terminal.starts).toMatchObject([
      { tabId: id, order: { file: 'pwsh.exe', args: [], cwd: 'C:\\Users\\anna', cols: 132, rows: 41 } },
    ]);
    expect(h.activeTab()?.process).toBe('running');
    expect(h.events.at(-1)).toMatchObject({ type: 'tabs', tabs: [{ id, process: 'running' }] });
  });

  it('startet nur die Shells, deren Ansicht bereit ist', () => {
    const h = startWorkspace();
    const first = h.activeTab()!.id;
    const second = h.workspace.createTab();

    h.workspace.viewReady(second, 80, 24);

    expect(h.terminal.starts.map((s) => s.tabId)).toEqual([second]);
    expect(h.tabs().find((t) => t.id === first)?.process).toBe('pending');
  });

  it('startet eine Shell nur einmal, auch wenn die Ansicht erneut „bereit“ meldet', () => {
    const h = startWorkspace();
    const id = h.activeTab()!.id;
    h.workspace.viewReady(id, 80, 24);

    h.workspace.viewReady(id, 100, 30);

    expect(h.terminal.starts).toHaveLength(1);
    expect(h.terminal.resizes).toEqual([{ tabId: id, cols: 100, rows: 30 }]);
  });

  it('ignoriert „Ansicht bereit“ ohne gültige Grösse', () => {
    const h = startWorkspace();
    const id = h.activeTab()!.id;

    h.workspace.viewReady(id, 0, 24);

    expect(h.terminal.starts).toEqual([]);
  });

  it('gibt Ausgabe und Ende der Shell an den Renderer weiter', () => {
    const h = startWorkspace();
    const id = h.activeTab()!.id;
    h.workspace.viewReady(id, 80, 24);

    h.terminal.output(id, 'PS C:\\Users\\tester> ');
    h.terminal.output(id, '\x1b[32mgrün\x1b[0m');
    h.terminal.exit(id, 0);

    expect(h.eventsOfType('output')).toEqual([
      { type: 'output', tabId: id, data: 'PS C:\\Users\\tester> ' },
      { type: 'output', tabId: id, data: '\x1b[32mgrün\x1b[0m' },
    ]);
    expect(h.eventsOfType('exit')).toEqual([{ type: 'exit', tabId: id, exitCode: 0 }]);
    expect(h.activeTab()?.process).toBe('exited');
  });

  it('leitet Eingaben und Grössenänderungen an die laufende Shell weiter', () => {
    const h = startWorkspace();
    const id = h.activeTab()!.id;
    h.workspace.viewReady(id, 80, 24);

    h.workspace.writeToTab(id, 'dir\r');
    h.workspace.resizeTab(id, 120, 40);

    expect(h.terminal.writes).toEqual([{ tabId: id, data: 'dir\r' }]);
    expect(h.terminal.resizes).toEqual([{ tabId: id, cols: 120, rows: 40 }]);
  });

  it('verwirft Eingaben, solange keine Shell läuft', () => {
    const h = startWorkspace();
    const id = h.activeTab()!.id;

    h.workspace.writeToTab(id, 'vor dem Start');
    h.workspace.viewReady(id, 80, 24);
    h.terminal.exit(id, 0);
    h.workspace.writeToTab(id, 'nach dem Ende');

    expect(h.terminal.writes).toEqual([]);
  });

  it('startet eine beendete Shell auf Wunsch neu, in der zuletzt gemeldeten Grösse', () => {
    const h = startWorkspace();
    const id = h.activeTab()!.id;
    h.workspace.viewReady(id, 80, 24);
    h.workspace.resizeTab(id, 90, 20);
    h.terminal.exit(id, 1);

    h.workspace.restartTab(id);

    expect(h.terminal.starts).toHaveLength(2);
    expect(h.terminal.starts[1].order).toMatchObject({ cols: 90, rows: 20 });
    expect(h.activeTab()?.process).toBe('running');
  });

  it('startet eine laufende Shell nicht ein zweites Mal', () => {
    const h = startWorkspace();
    const id = h.activeTab()!.id;
    h.workspace.viewReady(id, 80, 24);

    h.workspace.restartTab(id);

    expect(h.terminal.starts).toHaveLength(1);
  });

  it('meldet einen gescheiterten Start als Hinweis im Terminal; die nächste Taste versucht es erneut', () => {
    const h = startWorkspace();
    const id = h.activeTab()!.id;
    h.terminal.failStarts('Datei nicht gefunden: powershell.exe');

    h.workspace.viewReady(id, 80, 24);

    expect(h.eventsOfType('notice')).toEqual([
      {
        type: 'notice',
        tabId: id,
        level: 'error',
        text: 'Shell konnte nicht gestartet werden: Datei nicht gefunden: powershell.exe',
      },
    ]);
    expect(h.activeTab()?.process).toBe('exited');

    h.terminal.failStarts(null);
    h.workspace.restartTab(id);

    expect(h.terminal.starts).toHaveLength(1);
    expect(h.activeTab()?.process).toBe('running');
  });
});
