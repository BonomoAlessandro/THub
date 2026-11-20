import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StateStore } from '../../src/main/store';
import { startWorkspace, type TestWorkspace } from '../support/harness';
import { makeTempDir } from '../support/tempDir';

// Der Kern mit dem echten Speicher (state.json im Temp-Ordner) statt mit dem Speicher im Arbeitsspeicher.

const running: TestWorkspace[] = [];

/** Startet den Kern auf state.json in einem frischen Temp-Ordner, optional mit vorhandenem Inhalt. */
function startWithStateFile(content?: string): { h: TestWorkspace; dir: string; file: string } {
  const dir = makeTempDir();
  const file = path.join(dir, 'state.json');
  if (content !== undefined) fs.writeFileSync(file, content, 'utf8');
  const h = startWorkspace({ storage: new StateStore(file) });
  running.push(h);
  return { h, dir, file };
}

function corruptBackups(dir: string): string[] {
  return fs.readdirSync(dir).filter((name) => name.startsWith('state.json.corrupt-'));
}

// Beendet die Kerne vor dem Aufräumen der Temp-Ordner, damit kein entprelltes Schreiben nachläuft.
afterEach(async () => {
  for (const h of running.splice(0)) await h.workspace.shutdown();
  vi.restoreAllMocks();
});

describe('Zustandsdatei', () => {
  it.each([
    ['abgeschnittenes JSON', '{ "version": 2, "tabs": ['],
    ['kein Objekt', '[]'],
    ['null', 'null'],
  ])('legt eine kaputte Datei beiseite, statt sie zu überschreiben (%s)', async (_label, content) => {
    const { h, dir, file } = startWithStateFile(content);

    expect(h.tabs()).toMatchObject([{ name: 'tester' }]);
    const backups = corruptBackups(dir);
    expect(backups).toHaveLength(1);

    await h.restart();
    expect(fs.readFileSync(path.join(dir, backups[0]), 'utf8')).toBe(content);
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toMatchObject({ version: 2 });
    expect(corruptBackups(dir)).toHaveLength(1);
  });

  it('sichert Änderungen beim Beenden sofort, auch innerhalb der Entprellzeit', async () => {
    const { h } = startWithStateFile();
    h.workspace.createTab();
    h.workspace.renameTab(h.tabNamed('tester 2').id, 'Gerade eben');

    await h.restart();

    expect(h.tabs().map((t) => t.name)).toEqual(['tester', 'Gerade eben']);
    expect(h.activeTab()?.name).toBe('Gerade eben');
  });

  it('sichert die Fensterangaben beim Beenden in die Datei und liest sie beim Start wieder', async () => {
    const { h, file } = startWithStateFile();
    const window = { bounds: { x: 120, y: 80, width: 1000, height: 700 }, maximized: true };
    h.workspace.windowChanged(window);

    await h.restart();

    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toMatchObject({ window });
    expect(h.workspace.windowState()).toEqual(window);
  });

  it('übernimmt eine Datei aus Version 0.1.0 und schreibt sie als Version 2 zurück', async () => {
    const v1 = {
      version: 1,
      settings: { defaultCwd: 'C:\\Users\\tester', shell: 'powershell.exe' },
      sessions: [{ id: 'a1', name: 'Mein Projekt', cwd: 'C:\\proj' }],
      activeSessionId: 'a1',
    };
    const { h, file } = startWithStateFile(JSON.stringify(v1, null, 2));

    expect(h.tabs()).toMatchObject([{ id: 'a1', name: 'Mein Projekt', shellId: 'powershell' }]);

    await h.restart();
    const written = JSON.parse(fs.readFileSync(file, 'utf8'));
    expect(written).toMatchObject({
      version: 2,
      settings: { defaultCwd: '', defaultShellId: 'powershell' },
      tabs: [{ id: 'a1', name: 'Mein Projekt', shellId: 'powershell', startCwd: 'C:\\proj' }],
      activeTabId: 'a1',
    });
    expect(h.tabs()).toMatchObject([{ id: 'a1', name: 'Mein Projekt' }]);
  });

  it('liest eine Datei mit BOM', () => {
    const v2 = {
      version: 2,
      settings: { defaultCwd: '' },
      tabs: [{ id: 't1', name: 'Mit BOM', shellId: 'cmd', startCwd: 'C:\\' }],
      activeTabId: 't1',
    };
    const { h, dir } = startWithStateFile(`\uFEFF${JSON.stringify(v2)}`);

    expect(h.tabs()).toMatchObject([{ id: 't1', name: 'Mit BOM', shellId: 'cmd' }]);
    expect(corruptBackups(dir)).toEqual([]);
  });
});

describe('Verlaufsdateien', () => {
  it('legt den Verlauf pro Tab als eigene Datei ab und gibt ihn nach einem Neustart zurück', async () => {
    const { h, dir } = startWithStateFile();
    const id = h.activeTab()!.id;
    const content = '\x1b[32mgrün\x1b[0m Übersicht\r\n';
    h.showAllViews();
    h.terminal.output(id, content);
    h.clock.advance(30_000);

    expect(fs.readdirSync(path.join(dir, 'history'))).toEqual([`${id}.json`]);
    await h.restart();
    h.showAllViews();
    expect(h.eventsOfType('restoreHistory')).toEqual([
      { type: 'restoreHistory', tabId: id, content, savedAt: expect.any(Number) },
    ]);
  });

  it('löscht die Datei, wenn der Tab geschlossen wird', () => {
    const { h, dir } = startWithStateFile();
    const id = h.activeTab()!.id;
    h.showAllViews();
    h.terminal.output(id, 'Ausgabe\r\n');
    h.clock.advance(30_000);

    h.workspace.closeTab(id);

    expect(fs.readdirSync(path.join(dir, 'history'))).toEqual([]);
  });

  it('übergeht eine unlesbare Verlaufsdatei und startet die Shell trotzdem', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { h, dir } = startWithStateFile();
    const id = h.activeTab()!.id;
    h.showAllViews();
    h.terminal.output(id, 'Ausgabe\r\n');
    await h.restart();
    fs.writeFileSync(path.join(dir, 'history', `${id}.json`), '{ "content": ', 'utf8');

    h.showAllViews();

    expect(h.eventsOfType('restoreHistory')).toEqual([]);
    expect(h.terminal.startsFor(id)).toHaveLength(1);
  });

  it('macht aus anderen Tab-Kennungen (etwa aus Version 1) sichere Dateinamen', () => {
    const dir = makeTempDir();
    const store = new StateStore(path.join(dir, 'state.json'));
    const ids = ['a1', 'CON', '..\\..\\böse', 'x/y:z*?'];

    for (const id of ids) store.saveHistory(id, { content: `Verlauf von ${id}`, savedAt: 1 });

    const files = fs.readdirSync(path.join(dir, 'history'));
    expect(files).toHaveLength(ids.length);
    expect(files.every((name) => /^[0-9a-f]{64}\.json$/.test(name))).toBe(true);
    expect(fs.readdirSync(dir)).toEqual(['history']);
    for (const id of ids) expect(store.loadHistory(id)).toEqual({ content: `Verlauf von ${id}`, savedAt: 1 });
  });

  it('schreibt bei einer Windows-Abmeldung sofort, auch innerhalb der Entprellzeit', () => {
    const { h, file } = startWithStateFile();
    h.workspace.renameTab(h.activeTab()!.id, 'Kurz vor der Abmeldung');

    h.workspace.sessionEnding();

    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toMatchObject({
      tabs: [{ name: 'Kurz vor der Abmeldung' }],
    });
  });
});
