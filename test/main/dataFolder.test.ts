import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { dataFolders, takeOverLegacyData, type DataFolders } from '../../src/main/dataFolder';
import { StateStore } from '../../src/main/store';
import { startWorkspace, type TestWorkspace } from '../support/harness';
import { makeTempDir } from '../support/tempDir';

// Datenordner und einmalige Übernahme aus dem Ordner, den die App unter ihrem alten Namen hatte. Die alten
// Daten schreibt hier der echte Kern mit dem echten Speicher, so wie es die App als „TermHub“ getan hat.

const running: TestWorkspace[] = [];

// Beendet die Kerne vor dem Aufräumen der Temp-Ordner, damit kein entprelltes Schreiben nachläuft.
afterEach(async () => {
  for (const h of running.splice(0)) await h.workspace.shutdown();
});

/** Startet den Kern auf dem echten Speicher im Datenordner `dir`. */
function startIn(dir: string): TestWorkspace {
  const h = startWorkspace({ storage: new StateStore(path.join(dir, 'state.json')) });
  running.push(h);
  return h;
}

/** Datenordner unter einem frischen Temp-„%APPDATA%“. */
function freshFolders(packaged = true): DataFolders {
  return dataFolders(makeTempDir(), packaged);
}

/**
 * Lässt die App unter dem alten Namen laufen und beenden: zwei Tabs, einer umbenannt, beide mit Verlauf.
 * Liefert die Tab-Kennungen.
 */
async function oldAppWroteData(legacy: string): Promise<{ a: string; b: string }> {
  const h = startIn(legacy);
  const a = h.activeTab()!.id;
  const b = h.workspace.createTab();
  h.workspace.renameTab(b, 'Projekt');
  h.showAllViews();
  h.terminal.output(a, 'PS C:\\> dir\r\n');
  h.terminal.output(b, 'PS C:\\Projekt> git status\r\n');
  await h.workspace.shutdown();
  running.splice(running.indexOf(h), 1);
  // Was ausser Zustand und Verlauf sonst im Ordner liegt, bleibt dort.
  fs.writeFileSync(path.join(legacy, 'claude-hooks.json'), '{"alt": true}');
  return { a, b };
}

/** Alle Dateien unter `dir` mit ihrem Inhalt, Pfade relativ zu `dir`. */
function filesIn(dir: string): Record<string, string> {
  const files: Record<string, string> = {};
  for (const entry of fs.readdirSync(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const file = path.join(entry.parentPath, entry.name);
    files[path.relative(dir, file)] = fs.readFileSync(file, 'utf8');
  }
  return files;
}

describe('Datenordner', () => {
  it('heisst THub, unpaketiert THub-dev; der alte Ordner TermHub bzw. TermHub-dev', () => {
    const appData = 'C:\\Users\\ich\\AppData\\Roaming';

    expect(dataFolders(appData, true)).toEqual({
      current: path.join(appData, 'THub'),
      legacy: path.join(appData, 'TermHub'),
    });
    expect(dataFolders(appData, false)).toEqual({
      current: path.join(appData, 'THub-dev'),
      legacy: path.join(appData, 'TermHub-dev'),
    });
  });

  describe('Übernahme aus dem alten Ordner', () => {
    it('übernimmt Zustand und Verlauf, wenn der neue Ordner noch keinen Zustand hat: die Tabs sind wieder da', async () => {
      const folders = freshFolders();
      const { a, b } = await oldAppWroteData(folders.legacy);

      expect(takeOverLegacyData(folders)).toBe('taken-over');

      const h = startIn(folders.current);
      expect(h.tabs().map((t) => t.name)).toEqual(['Terminal 1', 'Projekt']);
      expect(h.tabs().map((t) => t.id)).toEqual([a, b]);
      h.showAllViews();
      expect(h.renderer.screen(a)).toBe('PS C:\\> dir\r\n');
      expect(h.renderer.screen(b)).toBe('PS C:\\Projekt> git status\r\n');
    });

    it('übernimmt nur Zustandsdatei und Verlauf, nichts sonst aus dem alten Ordner', async () => {
      const folders = freshFolders();
      const { a, b } = await oldAppWroteData(folders.legacy);

      takeOverLegacyData(folders);

      expect(Object.keys(filesIn(folders.current)).sort()).toEqual(
        ['state.json', path.join('history', `${a}.json`), path.join('history', `${b}.json`)].sort(),
      );
    });

    it('übernimmt auch in einen schon vorhandenen Ordner ohne Zustandsdatei', async () => {
      const folders = freshFolders();
      await oldAppWroteData(folders.legacy);
      fs.mkdirSync(folders.current, { recursive: true });
      fs.writeFileSync(path.join(folders.current, 'claude-hooks.json'), '{}');

      expect(takeOverLegacyData(folders)).toBe('taken-over');
      expect(startIn(folders.current).tabs().map((t) => t.name)).toEqual(['Terminal 1', 'Projekt']);
    });

    it('übernimmt nichts, wenn der neue Ordner schon eine Zustandsdatei hat', async () => {
      const folders = freshFolders();
      await oldAppWroteData(folders.legacy);
      const h = startIn(folders.current);
      h.workspace.renameTab(h.activeTab()!.id, 'Schon in THub');
      await h.workspace.shutdown();
      running.splice(running.indexOf(h), 1);
      const before = filesIn(folders.current);

      expect(takeOverLegacyData(folders)).toBe('not-needed');

      expect(filesIn(folders.current)).toEqual(before);
      expect(startIn(folders.current).tabs().map((t) => t.name)).toEqual(['Schon in THub']);
    });

    it('übernimmt nur einmal und lässt den alten Ordner unangetastet, auch wenn danach weitergearbeitet wird', async () => {
      const folders = freshFolders(false);
      await oldAppWroteData(folders.legacy);
      const legacyBefore = filesIn(folders.legacy);

      expect(takeOverLegacyData(folders)).toBe('taken-over');
      const h = startIn(folders.current);
      h.workspace.createTab();
      h.workspace.closeTab(h.tabNamed('Projekt').id);
      await h.workspace.shutdown();
      running.splice(running.indexOf(h), 1);

      expect(takeOverLegacyData(folders)).toBe('not-needed');
      expect(startIn(folders.current).tabs().map((t) => t.name)).toEqual(['Terminal 1', 'Terminal 2']);
      expect(filesIn(folders.legacy)).toEqual(legacyBefore);
    });

    it('übernimmt eine Zustandsdatei auch ohne Verlaufsordner', () => {
      const folders = freshFolders();
      fs.mkdirSync(folders.legacy, { recursive: true });
      const state = { version: 2, tabs: [], activeTabId: null };
      fs.writeFileSync(path.join(folders.legacy, 'state.json'), JSON.stringify(state));

      expect(takeOverLegacyData(folders)).toBe('taken-over');

      expect(fs.readdirSync(folders.current)).toEqual(['state.json']);
      expect(JSON.parse(fs.readFileSync(path.join(folders.current, 'state.json'), 'utf8'))).toEqual(state);
    });

    it('tut nichts, wenn auch der alte Ordner keine Zustandsdatei hat', () => {
      const folders = freshFolders();

      expect(takeOverLegacyData(folders)).toBe('nothing-to-take-over');
      expect(fs.existsSync(folders.current)).toBe(false);

      fs.mkdirSync(path.join(folders.legacy, 'history'), { recursive: true });
      expect(takeOverLegacyData(folders)).toBe('nothing-to-take-over');
      expect(fs.existsSync(folders.current)).toBe(false);
    });
  });
});
