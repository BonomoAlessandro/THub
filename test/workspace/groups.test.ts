import { describe, expect, it } from 'vitest';
import type { ProcessInfo } from '../../src/main/workspace/ports';
import { barEntries } from '../../src/shared/barEntries';
import type { GroupSnapshot } from '../../src/shared/types';
import { ClaudeTab } from '../support/claudeTab';
import { startWorkspace, startWorkspaceWithApi, type TestWorkspace } from '../support/harness';
import { readPersistedState as readStateLikeThub031 } from './fixtures/schema-0.3.1';

// Tab-Gruppen (Ticket 36): Gruppen anlegen, Tabs hinein- und herausschieben, gewählter Tab, Schliessen und
// Wiederöffnen, Zählen für Ctrl+Tab und Ctrl+1 … Ctrl+9, Speichern und tolerantes Laden. Alle Regeln liegen im Kern;
// die Oberfläche zeigt nur an.

const HOME = 'C:\\Users\\anna';
const API = 'C:\\kunde\\api';
const WEB = 'C:\\kunde\\web';
const DB = 'C:\\kunde\\db';
const NOTES = 'C:\\notes';
const SRC = 'C:\\kunde\\api\\src';
const ESC = '\x1b';
/** Der THub-Hauptprozess; die Shells sind seine Kinder. */
const ELECTRON_PID = 29248;

/** Ordner-Meldung der Shell-Integration (OSC 9;9), wie sie bei jedem Prompt kommt. */
const cwdReport = (dir: string): string => `${ESC}]9;9;${dir}\x07`;

function setup(): TestWorkspace {
  return startWorkspace({ homeDir: HOME, directories: [API, WEB, DB, NOTES, SRC] });
}

/** Die Leiste, wie der Nutzer sie sieht: einzelne Tabs mit Namen, eine Gruppe als [Name der Gruppe, ihre Tabs …]. */
function bar(h: TestWorkspace): (string | string[])[] {
  const { tabs, groups } = h.snapshot();
  return barEntries(tabs).map((entry) =>
    entry.kind === 'tab' ? entry.tab.name : [group(h, entry.groupId).name, ...entry.tabs.map((t) => t.name)],
  );
}

function group(h: TestWorkspace, groupId: string): GroupSnapshot {
  const found = h.snapshot().groups.find((g) => g.id === groupId);
  if (!found) throw new Error(`Keine Gruppe ${groupId}`);
  return found;
}

function ids(h: TestWorkspace): string[] {
  return h.tabs().map((t) => t.id);
}

function active(h: TestWorkspace): string | null {
  return h.snapshot().activeTabId;
}

/**
 * Vier Tabs: anna (Benutzerordner), api, web, notes; api und web bilden die Gruppe „kunde“ (api gewählt). Aktiv ist
 * notes, wie nach dem Anlegen.
 */
function withGroup(): { h: TestWorkspace; anna: string; api: string; web: string; notes: string; g: string } {
  const h = setup();
  const anna = h.activeTab()!.id;
  const api = h.workspace.createTab({ cwd: API });
  const web = h.workspace.createTab({ cwd: WEB });
  const notes = h.workspace.createTab({ cwd: NOTES });
  const g = h.workspace.createGroup(api);
  h.workspace.renameGroup(g, 'kunde');
  h.workspace.moveTabToGroup(web, g);
  return { h, anna, api, web, notes, g };
}

describe('Tab-Gruppen', () => {
  describe('Neue Gruppe', () => {
    it('entsteht mit dem Tab an seiner Stelle, heisst wie sein Ordner und geht danach ins Umbenennen', () => {
      const h = setup();
      const anna = h.activeTab()!.id;
      const api = h.workspace.createTab({ cwd: API });
      const notes = h.workspace.createTab({ cwd: NOTES });

      const g = h.workspace.createGroup(api);

      expect(g).not.toBe('');
      expect(bar(h)).toEqual(['anna', ['api', 'api'], 'notes']);
      expect(ids(h)).toEqual([anna, api, notes]);
      expect(h.snapshot().groups).toEqual([
        { id: g, name: 'api', tabIds: [api], selectedTabId: api, status: 'idle' },
      ]);
      expect(h.tabs().find((t) => t.id === api)?.groupId).toBe(g);
      // Der aktive Tab bleibt; erst die Tabs, dann die Meldung für das Umbenennen.
      expect(active(h)).toBe(notes);
      expect(h.events.slice(-2)).toMatchObject([{ type: 'tabs', groups: [{ id: g }] }, { type: 'groupCreated', groupId: g }]);
    });

    it('nach dem aktuellen Ordner des Tabs und den Regeln der Tab-Namen, bei Gleichstand mit „ 2“', () => {
      const h = setup();
      const anna = h.activeTab()!.id;
      const moved = h.workspace.createTab({ cwd: API });
      const api2 = h.workspace.createTab({ cwd: API });
      const api3 = h.workspace.createTab({ cwd: API });
      h.showAllViews();
      h.terminal.output(moved, `C:\\kunde\\api> cd src\r\n${cwdReport(SRC)}`);

      const names = [anna, moved, api2, api3].map((id) => group(h, h.workspace.createGroup(id)).name);

      // Benutzerordner wie der Benutzer; nach `cd` der neue Ordner; zwei Gruppen in „api“ heissen „api“ und „api 2“.
      expect(names).toEqual(['anna', 'src', 'api', 'api 2']);
    });

    it('nicht aus einem Tab, der schon in einer Gruppe steht, und nicht für unbekannte Tabs', () => {
      const { h, api } = withGroup();
      const before = h.snapshot();
      const events = h.events.length;

      expect(h.workspace.createGroup(api)).toBe('');
      expect(h.workspace.createGroup('gibt-es-nicht')).toBe('');

      expect(h.snapshot()).toEqual(before);
      expect(h.events).toHaveLength(events);
    });
  });

  describe('Tabs hineinschieben und herausnehmen', () => {
    it('„In Gruppe“ setzt den Tab ans Ende der Gruppe, auch von weiter vorne; die Gruppe behält ihren gewählten Tab', () => {
      const { h, anna, api, web, notes, g } = withGroup();

      h.workspace.moveTabToGroup(anna, g);

      expect(bar(h)).toEqual([['kunde', 'api', 'web', 'anna'], 'notes']);
      expect(ids(h)).toEqual([api, web, anna, notes]);
      expect(group(h, g)).toMatchObject({ tabIds: [api, web, anna], selectedTabId: api });
      expect(active(h)).toBe(notes);
    });

    it('der angezeigte Tab wird in der neuen Gruppe der gewählte; die Gruppe ist dann aktiv', () => {
      const { h, notes, g } = withGroup();

      h.workspace.moveTabToGroup(notes, g);

      expect(group(h, g).selectedTabId).toBe(notes);
      expect(active(h)).toBe(notes);
    });

    it('aus einer anderen Gruppe: Die alte wählt den nächsten Tab und verschwindet mit ihrem letzten', () => {
      const { h, api, web, notes, g } = withGroup();
      const other = h.workspace.createGroup(notes);
      h.workspace.activateTab(api);

      h.workspace.moveTabToGroup(api, other);

      expect(bar(h)).toEqual(['anna', ['kunde', 'web'], ['notes', 'notes', 'api']]);
      expect(group(h, g).selectedTabId).toBe(web);
      expect(group(h, other).selectedTabId).toBe(api);

      h.workspace.moveTabToGroup(web, other);

      expect(bar(h)).toEqual(['anna', ['notes', 'notes', 'api', 'web']]);
      expect(h.snapshot().groups.map((x) => x.id)).toEqual([other]);
    });

    it('„Aus Gruppe nehmen“: Der Tab steht einzeln rechts neben der Gruppe; war er gewählt, wird der nächste gewählt', () => {
      const { h, api, web, notes, g } = withGroup();
      h.workspace.activateTab(api);

      h.workspace.removeTabFromGroup(api);

      expect(bar(h)).toEqual(['anna', ['kunde', 'web'], 'api', 'notes']);
      expect(group(h, g).selectedTabId).toBe(web);
      // Er bleibt angezeigt, jetzt als einzelner Tab.
      expect(active(h)).toBe(api);
      expect(h.tabs().find((t) => t.id === api)?.groupId).toBeUndefined();
      expect(ids(h).indexOf(notes)).toBe(3);
    });

    it('der letzte Tab der Gruppe: Die Gruppe verschwindet, der Tab bleibt an ihrer Stelle', () => {
      const { h, api, web, g } = withGroup();
      h.workspace.removeTabFromGroup(web);

      h.workspace.removeTabFromGroup(api);

      expect(bar(h)).toEqual(['anna', 'api', 'web', 'notes']);
      expect(h.snapshot().groups).toEqual([]);
      expect(h.storedState().groups).toEqual([]);
      h.workspace.renameGroup(g, 'weg');
      expect(h.snapshot().groups).toEqual([]);
    });

    it('unbekannte Tabs und Gruppen, die eigene Gruppe und ein einzelner Tab beim Herausnehmen ändern nichts', () => {
      const { h, api, notes, g } = withGroup();
      const before = h.snapshot();

      h.workspace.moveTabToGroup(api, g);
      h.workspace.moveTabToGroup('gibt-es-nicht', g);
      h.workspace.moveTabToGroup(notes, 'gibt-es-nicht');
      h.workspace.removeTabFromGroup(notes);
      h.workspace.removeTabFromGroup('gibt-es-nicht');

      expect(h.snapshot()).toEqual(before);
    });
  });

  describe('die Tabs einer Gruppe bleiben zusammen', () => {
    it('beim Umsortieren der Gruppe: Sie wandert als Ganzes, gezählt wird nach Einträgen der Leiste', () => {
      const { h, anna, api, web, notes, g } = withGroup();

      h.workspace.moveGroup(g, 2);
      expect(bar(h)).toEqual(['anna', 'notes', ['kunde', 'api', 'web']]);
      expect(ids(h)).toEqual([anna, notes, api, web]);

      h.workspace.moveGroup(g, 0);
      expect(bar(h)).toEqual([['kunde', 'api', 'web'], 'anna', 'notes']);

      // Ein einzelner Tab zählt die Gruppe als einen Eintrag.
      h.workspace.moveTab(notes, 1);
      expect(bar(h)).toEqual([['kunde', 'api', 'web'], 'notes', 'anna']);
      h.workspace.moveTab(anna, 0);
      expect(bar(h)).toEqual(['anna', ['kunde', 'api', 'web'], 'notes']);
      h.workspace.moveTab(anna, 99);
      expect(bar(h)).toEqual([['kunde', 'api', 'web'], 'notes', 'anna']);
    });

    it('ein Tab in einer Gruppe lässt sich nicht einzeln in der Leiste verschieben', () => {
      const { h, web } = withGroup();
      const before = h.snapshot();

      h.workspace.moveTab(web, 0);

      expect(h.snapshot()).toEqual(before);
    });

    it('beim Ziehen eines Tabs auf die Gruppe, auch von hinter ihr; über einen Neustart', async () => {
      const { h, api, web, notes, g } = withGroup();
      const last = h.workspace.createTab({ cwd: DB });

      h.workspace.moveTabToGroup(last, g);
      h.workspace.moveGroup(g, 0);
      h.workspace.moveTabToGroup(notes, g);

      expect(bar(h)).toEqual([['kunde', 'api', 'web', 'db', 'notes'], 'anna']);
      await h.restart();
      expect(bar(h)).toEqual([['kunde', 'api', 'web', 'db', 'notes'], 'anna']);
      expect(group(h, g).tabIds).toEqual([api, web, last, notes]);
    });

    it('neue Tabs über +, Ctrl+Shift+T und das Pfeil-Menü kommen einzeln ans Ende, nie in eine Gruppe', () => {
      const { h, g } = withGroup();
      h.workspace.moveGroup(g, 2);
      h.workspace.activateTab(group(h, g).selectedTabId);

      const fresh = h.workspace.createTab({ cwd: DB, shellId: 'cmd' });

      expect(bar(h)).toEqual(['anna', 'notes', ['kunde', 'api', 'web'], 'db']);
      expect(h.tabs().find((t) => t.id === fresh)?.groupId).toBeUndefined();
    });
  });

  describe('gewählter Tab', () => {
    it('ist der zuletzt angezeigte Tab der Gruppe; der Gruppen-Tab zeigt ihn', () => {
      const { h, api, web, notes, g } = withGroup();
      expect(group(h, g).selectedTabId).toBe(api);

      h.workspace.activateTab(web);
      expect(group(h, g).selectedTabId).toBe(web);
      h.workspace.activateTab(notes);
      // Die Gruppe ist nicht mehr aktiv, behält aber ihren gewählten Tab, auch über einen Neustart.
      expect(group(h, g).selectedTabId).toBe(web);
      expect(h.events.at(-1)).toMatchObject({ type: 'tabs', activeTabId: notes, groups: [{ id: g, selectedTabId: web }] });
    });

    it('schliesst sich der gewählte Tab einer aktiven Gruppe, wird der nächste angezeigt, beim letzten der vorherige', () => {
      const { h, api, web, g } = withGroup();
      const db = h.workspace.createTab({ cwd: DB });
      h.workspace.moveTabToGroup(db, g);
      h.workspace.activateTab(web);

      h.workspace.closeTab(web);
      expect(active(h)).toBe(db);
      expect(group(h, g)).toMatchObject({ tabIds: [api, db], selectedTabId: db });

      h.workspace.closeTab(db);
      expect(active(h)).toBe(api);
      expect(group(h, g)).toMatchObject({ tabIds: [api], selectedTabId: api });
    });

    it('schliesst sich der gewählte Tab einer anderen Gruppe, wählt sie den nächsten; der aktive Tab bleibt', () => {
      const { h, api, web, notes, g } = withGroup();
      expect(active(h)).toBe(notes);

      h.workspace.closeTab(api);

      expect(active(h)).toBe(notes);
      expect(group(h, g).selectedTabId).toBe(web);
    });

    it('ein nicht gewählter Tab schliesst, ohne dass sich die Wahl ändert', () => {
      const { h, api, web, g } = withGroup();
      h.workspace.activateTab(api);

      h.workspace.closeTab(web);

      expect(active(h)).toBe(api);
      expect(group(h, g)).toMatchObject({ tabIds: [api], selectedTabId: api });
    });

    it('schliesst sich der letzte Tab einer Gruppe, verschwindet sie; danach gilt der Nachbar in der Leiste', () => {
      const { h, anna, api, web, notes, g } = withGroup();
      h.workspace.removeTabFromGroup(web);
      h.workspace.activateTab(api);

      h.workspace.closeTab(api);

      expect(h.snapshot().groups).toEqual([]);
      expect(bar(h)).toEqual(['anna', 'web', 'notes']);
      // Der nächste Eintrag rechts, wie bei einem einzelnen Tab.
      expect(active(h)).toBe(web);
      expect(ids(h)).toEqual([anna, web, notes]);
      expect(h.storedState().groups.find((x) => x.id === g)).toBeUndefined();
    });

    it('ist der Nachbar in der Leiste eine Gruppe, wird ihr gewählter Tab angezeigt, rechts wie links', () => {
      const { h, anna, api, web, notes, g } = withGroup();
      h.workspace.activateTab(web);
      h.workspace.activateTab(anna);

      // Rechts der Gruppen-Tab: sein gewählter Tab web, nicht ihr erster Tab api.
      h.workspace.closeTab(anna);
      expect(active(h)).toBe(web);

      // Links der Gruppen-Tab: sein gewählter Tab api, nicht ihr letzter Tab web.
      h.workspace.activateTab(api);
      h.workspace.activateTab(notes);
      h.workspace.closeTab(notes);
      expect(active(h)).toBe(api);
      expect(group(h, g).selectedTabId).toBe(api);
    });

    it('wird ein Tab angezeigt, auf welchem Weg auch immer, wird er der gewählte seiner Gruppe', () => {
      const { h, api, web, notes, g } = withGroup();

      h.workspace.activateTab(web);
      expect(group(h, g).selectedTabId).toBe(web);
      h.workspace.activateTab(notes);
      h.workspace.closeTab(notes);
      // Schliessen des Nachbarn zeigt den gewählten Tab der Gruppe.
      expect(active(h)).toBe(web);
      h.workspace.activateTab(api);
      h.workspace.reopenClosedTab();
      expect(active(h)).toBe(notes);
      expect(group(h, g).selectedTabId).toBe(api);
    });
  });

  describe('Gruppe umbenennen, auflösen und schliessen', () => {
    it('umbenennen: Leerzeichen am Rand fallen weg, ein leerer Name zählt nicht; der Name übersteht einen Neustart', async () => {
      const { h, g } = withGroup();

      h.workspace.renameGroup(g, '  Kunde X  ');
      h.workspace.renameGroup(g, '   ');
      h.workspace.renameGroup('gibt-es-nicht', 'egal');

      expect(group(h, g).name).toBe('Kunde X');
      await h.restart();
      expect(group(h, g).name).toBe('Kunde X');
    });

    it('auflösen: Die Tabs bleiben offen und stehen in ihrer Reihenfolge einzeln an der Stelle der Gruppe', () => {
      const { h, anna, api, web, notes, g } = withGroup();
      h.showAllViews();
      h.workspace.activateTab(web);

      h.workspace.dissolveGroup(g);

      expect(bar(h)).toEqual(['anna', 'api', 'web', 'notes']);
      expect(ids(h)).toEqual([anna, api, web, notes]);
      expect(h.snapshot().groups).toEqual([]);
      expect(h.storedState().groups).toEqual([]);
      expect(active(h)).toBe(web);
      expect(h.terminal.kills).toEqual([]);
      expect(h.workspace.closedTabs()).toEqual([]);
    });

    it('schliessen: Ruhen alle Tabs, schliessen sie sofort; der Nachbar in der Leiste wird angezeigt', () => {
      const { h, anna, notes, g } = withGroup();
      h.showAllViews();
      h.workspace.activateTab(group(h, g).selectedTabId);

      h.workspace.closeGroup(g);

      expect(ids(h)).toEqual([anna, notes]);
      expect(h.snapshot().groups).toEqual([]);
      expect(h.eventsOfType('askClose')).toEqual([]);
      expect(active(h)).toBe(notes);
    });

    it('schliessen mit einem laufenden Programm darin: eine gemeinsame Rückfrage für alle Tabs der Gruppe', async () => {
      const h = setup();
      const anna = h.activeTab()!.id;
      const api = h.workspace.createTab({ cwd: API });
      h.terminal.usePids(19996);
      const started = h.clock.now();
      h.workspace.viewReady(api, 120, 30);
      const web = h.workspace.createTab({ cwd: WEB });
      const db = h.workspace.createTab({ cwd: DB });
      h.workspace.viewReady(web, 120, 30);
      h.workspace.viewReady(db, 120, 30);
      const g = h.workspace.createGroup(api);
      h.workspace.moveTabToGroup(web, g);
      h.workspace.moveTabToGroup(db, g);
      const tree: ProcessInfo[] = [
        { pid: ELECTRON_PID, ppid: 1200, name: 'electron.exe', startTime: started - 600_000 },
        { pid: 19996, ppid: ELECTRON_PID, name: 'pwsh.exe', startTime: started + 100 },
        { pid: 8120, ppid: 19996, name: 'node.exe', startTime: started + 2000 },
      ];
      await h.probe(tree);
      await h.probe(tree);
      expect(group(h, g).status).toBe('processes');

      h.workspace.closeGroup(g);

      expect(h.eventsOfType('askClose')).toEqual([
        { type: 'askClose', tabIds: [api, web, db], busy: [{ id: api, name: 'api', reason: 'processes', resumes: false }] },
      ]);
      expect(group(h, g).tabIds).toEqual([api, web, db]);

      // Bestätigt: alle Tabs der Gruppe schliessen, die Gruppe verschwindet.
      h.workspace.closeTabs([api, web, db]);
      expect(ids(h)).toEqual([anna]);
      expect(h.snapshot().groups).toEqual([]);
    });
  });

  describe('Andere Tabs schliessen', () => {
    it('bei einem einzelnen Tab: alle anderen Einträge der Leiste samt Gruppen', async () => {
      const { h, notes } = withGroup();
      h.showAllViews();

      h.workspace.closeOtherTabs(notes);

      expect(bar(h)).toEqual(['notes']);
      expect(h.snapshot().groups).toEqual([]);
      await h.restart();
      expect(bar(h)).toEqual(['notes']);
    });

    it('in einer Gruppe: nur die anderen Tabs dieser Gruppe', () => {
      const { h, api, web, g } = withGroup();
      const db = h.workspace.createTab({ cwd: DB });
      h.workspace.moveTabToGroup(db, g);
      const other = h.workspace.createGroup(h.tabNamed('notes').id);
      h.showAllViews();

      h.workspace.closeOtherTabs(web);

      expect(bar(h)).toEqual(['anna', ['kunde', 'web'], ['notes', 'notes']]);
      expect(group(h, g).selectedTabId).toBe(web);
      expect(group(h, other).tabIds).toHaveLength(1);
      expect(h.workspace.closedTabs().map((t) => t.id)).toEqual([db, api]);
    });
  });

  it('Duplizieren in einer Gruppe: Das Duplikat bleibt in der Gruppe, direkt nach dem Original, und wird angezeigt', () => {
    const { h, api, web, g } = withGroup();

    const copy = h.workspace.duplicateTab(api);

    expect(bar(h)).toEqual(['anna', ['kunde', 'api', 'api 2', 'web'], 'notes']);
    expect(group(h, g)).toMatchObject({ tabIds: [api, copy, web], selectedTabId: copy });
    expect(active(h)).toBe(copy);
  });

  describe('Neues Terminal in der Gruppe', () => {
    it('am Ende der Gruppe, im aktuellen Ordner des gewählten Tabs, mit der Standard-Shell und einem Namen nach dem Ordner', () => {
      const h = setup();
      const anna = h.activeTab()!.id;
      const api = h.workspace.createTab({ cwd: API, shellId: 'cmd' });
      const web = h.workspace.createTab({ cwd: WEB, shellId: 'cmd' });
      const notes = h.workspace.createTab({ cwd: NOTES });
      const g = h.workspace.createGroup(api);
      h.workspace.moveTabToGroup(web, g);
      h.showAllViews();
      h.workspace.activateTab(api);
      h.terminal.output(api, `C:\\kunde\\api> cd src\r\n${cwdReport(SRC)}`);
      h.workspace.activateTab(notes);

      const fresh = h.workspace.newTabInGroup(g);

      expect(ids(h)).toEqual([anna, api, web, fresh, notes]);
      expect(group(h, g)).toMatchObject({ tabIds: [api, web, fresh], selectedTabId: fresh });
      expect(active(h)).toBe(fresh);
      expect(h.activeTab()).toMatchObject({ name: 'src', cwd: SRC, shellId: 'pwsh', groupId: g });
      h.workspace.viewReady(fresh, 100, 30);
      expect(h.terminal.startsFor(fresh)[0].order).toMatchObject({ file: 'pwsh.exe', cwd: SRC });
      expect(h.workspace.recentDirs()[0]?.path).toBe(SRC);
    });

    it('gibt es den Ordner des gewählten Tabs nicht mehr, gilt wie beim Start der Shell der Startordner', () => {
      const { h, api, g } = withGroup();
      h.showAllViews();
      h.terminal.output(api, cwdReport(SRC));
      h.system.removeDirectory(SRC);

      const fresh = h.workspace.newTabInGroup(g);

      expect(h.tabs().find((t) => t.id === fresh)).toMatchObject({ name: 'api 2', cwd: API });
      expect(h.workspace.newTabInGroup('gibt-es-nicht')).toBe('');
    });
  });

  describe('Wiederöffnen', () => {
    it('in die bestehende Gruppe, an die alte Stelle darin; der Tab wird angezeigt und gewählt', () => {
      const { h, api, web, g } = withGroup();
      const db = h.workspace.createTab({ cwd: DB });
      h.workspace.moveTabToGroup(db, g);
      h.workspace.activateTab(api);

      h.workspace.closeTab(web);
      expect(group(h, g).tabIds).toEqual([api, db]);
      expect(h.workspace.closedTabs()[0]).toMatchObject({ id: web, groupName: 'kunde' });
      h.workspace.renameGroup(g, 'Kunde X');

      expect(h.workspace.reopenClosedTab()).toBe(web);

      expect(bar(h)).toEqual(['anna', ['Kunde X', 'api', 'web', 'db'], 'notes']);
      expect(group(h, g).selectedTabId).toBe(web);
      expect(active(h)).toBe(web);
    });

    it('gibt es die Gruppe nicht mehr, entsteht sie neu mit Namen und Stelle; weitere Tabs derselben Gruppe kommen dazu', () => {
      const { h, api, web, notes, g } = withGroup();
      h.workspace.activateTab(notes);

      h.workspace.closeGroup(g);
      expect(bar(h)).toEqual(['anna', 'notes']);
      expect(h.workspace.closedTabs().map((t) => [t.name, t.groupName])).toEqual([
        ['web', 'kunde'],
        ['api', 'kunde'],
      ]);

      // Ctrl+Shift+Z holt die Gruppe Tab für Tab zurück, mit Namen, Stelle und Reihenfolge.
      h.workspace.reopenClosedTab();
      expect(bar(h)).toEqual(['anna', ['kunde', 'web'], 'notes']);
      h.workspace.reopenClosedTab();
      expect(bar(h)).toEqual(['anna', ['kunde', 'api', 'web'], 'notes']);
      expect(group(h, g)).toMatchObject({ id: g, tabIds: [api, web], selectedTabId: api });
      expect(active(h)).toBe(api);
    });

    it('jeder wieder geöffnete Tab der Gruppe startet mit „Ansicht bereit“ eine neue Shell, mit seinem Verlauf', () => {
      const { h, api, web, g } = withGroup();
      h.workspace.activateTab(web);
      h.showAllViews();
      h.terminal.output(api, 'api-Ausgabe\r\n');
      h.terminal.output(web, 'web-Ausgabe\r\n');

      h.workspace.closeGroup(g);
      for (const id of [web, api]) {
        expect(h.workspace.reopenClosedTab()).toBe(id);
        h.workspace.viewReady(id, 100, 30);
        expect(h.tabs().find((t) => t.id === id)?.process).toBe('running');
        expect(h.terminal.startsFor(id)).toHaveLength(2);
      }
      expect(h.eventsOfType('restoreHistory').map((e) => [e.tabId, e.content])).toEqual([
        [web, 'web-Ausgabe\r\n'],
        [api, 'api-Ausgabe\r\n'],
      ]);
    });

    it('über einen Neustart: Geschlossene Tabs merken sich ihre Gruppe', async () => {
      const { h, g } = withGroup();
      h.workspace.closeGroup(g);

      await h.restart();
      h.workspace.reopenClosedTab();
      h.workspace.reopenClosedTab();

      expect(bar(h)).toEqual(['anna', ['kunde', 'api', 'web'], 'notes']);
    });

    it('ein einzelner Tab kommt nie mitten in eine Gruppe, die inzwischen an seiner Stelle steht', () => {
      const h = setup();
      const anna = h.activeTab()!.id;
      const api = h.workspace.createTab({ cwd: API });
      const web = h.workspace.createTab({ cwd: WEB });
      const notes = h.workspace.createTab({ cwd: NOTES });
      h.workspace.closeTab(web);
      const g = h.workspace.createGroup(api);
      h.workspace.moveTabToGroup(notes, g);

      h.workspace.reopenClosedTab();

      expect(ids(h)).toEqual([anna, api, notes, web]);
      expect(bar(h)).toEqual(['anna', ['api', 'api', 'notes'], 'web']);
    });

    it('auch eine neu entstehende Gruppe nicht', () => {
      const { h, api, web, notes, g } = withGroup();
      h.workspace.closeTab(web);
      h.workspace.closeTab(api);
      // Inzwischen steht an der alten Stelle eine andere Gruppe.
      const other = h.workspace.createGroup(h.tabNamed('anna').id);
      h.workspace.moveTabToGroup(notes, other);

      h.workspace.reopenClosedTab();

      expect(bar(h)).toEqual([['anna', 'anna', 'notes'], ['kunde', 'api']]);
      expect(group(h, g).tabIds).toEqual([api]);
    });
  });

  describe('Tastatur: Ctrl+Tab und Ctrl+1 … Ctrl+9 zählen die Einträge der Leiste', () => {
    it('eine Gruppe zählt als ihr gewählter Tab', () => {
      const { h, anna, web, notes, g } = withGroup();
      h.workspace.activateTab(web);
      h.workspace.activateTab(anna);

      h.workspace.activateRelativeTab(1);
      expect(active(h)).toBe(web);
      h.workspace.activateRelativeTab(1);
      expect(active(h)).toBe(notes);
      h.workspace.activateRelativeTab(1);
      expect(active(h)).toBe(anna);
      h.workspace.activateRelativeTab(-1);
      expect(active(h)).toBe(notes);
      h.workspace.activateRelativeTab(-1);
      expect(active(h)).toBe(web);
      expect(group(h, g).selectedTabId).toBe(web);
    });

    it('Ctrl+1 … Ctrl+9 nach Einträgen; was dahinter kommt, rückt um die Gruppe vor', () => {
      const { h, anna, api, notes } = withGroup();

      h.workspace.activateTabAt(2);
      expect(active(h)).toBe(notes);
      h.workspace.activateTabAt(1);
      expect(active(h)).toBe(api);
      h.workspace.activateTabAt(0);
      expect(active(h)).toBe(anna);
      h.workspace.activateTabAt(3);
      expect(active(h)).toBe(anna);
    });
  });

  describe('Speichern und Laden', () => {
    it('Gruppen, Namen, Reihenfolge, Zugehörigkeit und gewählter Tab überstehen einen Neustart', async () => {
      const { h, anna, api, web, notes, g } = withGroup();
      const second = h.workspace.createGroup(anna);
      h.workspace.renameGroup(second, 'privat');
      h.workspace.activateTab(web);
      h.workspace.activateTab(notes);

      expect(h.storedState()).toMatchObject({
        tabs: [
          { id: anna, groupId: second },
          { id: api, groupId: g },
          { id: web, groupId: g },
          { id: notes },
        ],
        groups: expect.arrayContaining([
          { id: g, name: 'kunde', selectedTabId: web },
          { id: second, name: 'privat', selectedTabId: anna },
        ]),
        activeTabId: notes,
      });
      expect(h.storedTab(notes)?.groupId).toBeUndefined();

      await h.restart();

      expect(bar(h)).toEqual([['privat', 'anna'], ['kunde', 'api', 'web'], 'notes']);
      expect(group(h, g).selectedTabId).toBe(web);
      expect(active(h)).toBe(notes);
    });

    describe('gelesen wird tolerant', () => {
      const tab = (id: string, groupId?: string) => ({
        id,
        name: id,
        nameIsManual: true,
        shellId: 'cmd',
        startCwd: HOME,
        ...(groupId === undefined ? {} : { groupId }),
      });
      const load = (state: Record<string, unknown>) =>
        startWorkspace({ homeDir: HOME, state: { version: 2, activeTabId: 'a', ...state } });

      it('ohne Liste der Gruppen (Zustand einer älteren THub) gibt es keine Gruppen', () => {
        const h = load({ tabs: [tab('a'), tab('b', 'g1')] });

        expect(bar(h)).toEqual(['a', 'b']);
        expect(h.snapshot().groups).toEqual([]);
      });

      it('ein Tab mit unbekannter Gruppe wird ein einzelner Tab', () => {
        const h = load({
          tabs: [tab('a', 'g1'), tab('b', 'unbekannt'), tab('c', 'g1')],
          groups: [{ id: 'g1', name: 'Eins', selectedTabId: 'c' }],
        });

        expect(bar(h)).toEqual([['Eins', 'a', 'c'], 'b']);
        expect(h.tabs().find((t) => t.id === 'b')?.groupId).toBeUndefined();
      });

      it('verstreute Tabs einer Gruppe rücken an die Stelle des ersten, in ihrer Reihenfolge', () => {
        const h = load({
          tabs: [tab('x'), tab('a', 'g1'), tab('y'), tab('b', 'g1'), tab('z'), tab('c', 'g1')],
          groups: [{ id: 'g1', name: 'Eins', selectedTabId: 'b' }],
          activeTabId: 'x',
        });

        expect(bar(h)).toEqual(['x', ['Eins', 'a', 'b', 'c'], 'y', 'z']);
        expect(group(h, 'g1').selectedTabId).toBe('b');
      });

      it('eine Gruppe ohne Tabs entfällt; ein ungültiger gewählter Tab wird der erste der Gruppe', () => {
        const h = load({
          tabs: [tab('a'), tab('b', 'g2'), tab('c', 'g2')],
          groups: [
            { id: 'leer', name: 'Leer', selectedTabId: 'a' },
            { id: 'g2', name: 'Zwei', selectedTabId: 'a' },
          ],
        });

        expect(h.snapshot().groups).toEqual([
          { id: 'g2', name: 'Zwei', tabIds: ['b', 'c'], selectedTabId: 'b', status: 'idle' },
        ]);
      });

      it('steht der aktive Tab in einer Gruppe, ist er ihr gewählter Tab', () => {
        const h = load({
          tabs: [tab('a', 'g1'), tab('b', 'g1')],
          groups: [{ id: 'g1', name: 'Eins', selectedTabId: 'a' }],
          activeTabId: 'b',
        });

        expect(group(h, 'g1').selectedTabId).toBe('b');
      });

      it('unbrauchbare Einträge fallen weg, unbekannte Felder stören nicht', () => {
        const h = load({
          tabs: [{ ...tab('a', 'g1'), zukunft: { farbe: 'blau' } }, tab('b', 'g1'), tab('c', '')],
          groups: [
            null,
            'g1',
            { id: '', name: 'Ohne Kennung' },
            { id: 'g1', name: '', selectedTabId: 42, farbe: 'blau' },
            { id: 'g1', name: 'Doppelt', selectedTabId: 'b' },
          ],
          zukunft: [1, 2, 3],
        });

        expect(bar(h)).toEqual([['Gruppe', 'a', 'b'], 'c']);
        expect(group(h, 'g1').selectedTabId).toBe('a');
      });

      it('ein geschlossener Tab mit unbrauchbarer Gruppe kommt einzeln zurück', () => {
        const h = load({
          tabs: [tab('a')],
          closedTabs: [
            { tab: tab('b', 'g9'), index: 1, closedAt: 1, group: { id: 'g9', name: '' } },
            { tab: tab('c'), index: 1, closedAt: 2, group: { id: 'g8', name: 'Acht', position: -3 } },
          ],
        });

        h.workspace.reopenClosedTab();
        expect(bar(h)).toEqual(['a', 'b']);
        h.workspace.reopenClosedTab();
        expect(bar(h)).toEqual(['a', ['Acht', 'c'], 'b']);
      });
    });

    it('eine ältere THub (0.3.1) liest den Zustand weiter und zeigt alle Tabs einzeln', async () => {
      const { h, anna, api, web, notes, g } = withGroup();
      h.workspace.activateTab(web);
      h.workspace.closeTab(api);
      const stored = h.storedState();

      // Der Leser von THub 0.3.1, unverändert: Unbekannte Felder (`groups`, `groupId`, `group`) übergeht er.
      const old = readStateLikeThub031(JSON.parse(JSON.stringify(stored)), { homeDir: HOME, defaultShellId: 'pwsh' });

      expect(old.migrated).toBe(false);
      expect(old.state.tabs.map((t) => t.id)).toEqual([anna, web, notes]);
      expect(old.state.tabs.every((t) => !('groupId' in t))).toBe(true);
      expect(old.state).not.toHaveProperty('groups');
      expect(old.state.activeTabId).toBe(web);
      expect(old.state.closedTabs).toMatchObject([{ tab: { id: api, name: 'api' }, index: 1 }]);
      expect(old.state.closedTabs[0]).not.toHaveProperty('group');

      // Was die ältere THub zurückschreibt, liest die neue wieder: ohne Gruppen, alle Tabs einzeln.
      const back = startWorkspace({ homeDir: HOME, directories: [API, WEB, NOTES], state: old.state });
      expect(bar(back)).toEqual(['anna', 'web', 'notes']);
      expect(back.snapshot().groups).toEqual([]);
      expect(group(h, g).tabIds).toEqual([web]);
    });
  });

  describe('Status und Hinweise', () => {
    it('der Gruppen-Tab zeigt den dringendsten Status; ein Klick auf den Hinweis zeigt genau diesen Tab der Gruppe', async () => {
      const h = await startWorkspaceWithApi({ homeDir: HOME, directories: [API, WEB] });
      const shown = h.activeTab()!.id;
      const api = h.workspace.createTab({ cwd: API });
      const web = h.workspace.createTab({ cwd: WEB });
      const g = h.workspace.createGroup(api);
      h.workspace.moveTabToGroup(web, g);
      h.workspace.activateTab(api);
      h.showAllViews();
      h.workspace.windowForeground(true);
      h.workspace.windowVisible(true);
      const claude = await ClaudeTab.launch(h, web);

      // Die Gruppe ist aktiv (api wird angezeigt); das genügt nicht, damit web als angeschaut gilt.
      await claude.send('UserPromptSubmit');
      expect(group(h, g).status).toBe('working');
      await claude.stop();
      expect(claude.status()).toBe('finished');
      expect(group(h, g).status).toBe('finished');
      const toast = claude.toast();
      expect(toast).toMatchObject({ kind: 'finished', tabId: web });

      h.workspace.activateTab(shown);
      h.workspace.openToast(toast!.id);

      expect(active(h)).toBe(web);
      expect(group(h, g).selectedTabId).toBe(web);
      expect(claude.status()).toBe('idle');
      expect(group(h, g).status).toBe('idle');
      expect(claude.toasts()).toEqual([]);
    });

    it('ein pausierter Claude-Tab in einer Gruppe setzt seine Session erst fort, wenn er angezeigt wird', async () => {
      const h = await startWorkspaceWithApi({ homeDir: HOME, directories: [API, WEB] });
      const shown = h.activeTab()!.id;
      const api = h.workspace.createTab({ cwd: API });
      const web = h.workspace.createTab({ cwd: WEB });
      const g = h.workspace.createGroup(api);
      h.workspace.moveTabToGroup(web, g);
      h.showAllViews();
      const claude = await ClaudeTab.launch(h, web);
      await claude.answer();
      h.workspace.activateTab(api);
      h.workspace.activateTab(shown);

      await h.restart();
      h.showAllViews();

      expect(h.tabs().find((t) => t.id === web)).toMatchObject({ paused: true, groupId: g });
      expect(group(h, g)).toMatchObject({ selectedTabId: api, status: 'paused' });
      h.workspace.activateTab(api);
      expect(h.terminal.startsFor(web)).toEqual([]);

      h.workspace.activateTab(web);

      expect(h.terminal.startsFor(web)).toHaveLength(1);
      expect(h.terminal.startsFor(web)[0].order.startCommand).toContain(claude.sessionId);
      expect(group(h, g)).toMatchObject({ selectedTabId: web });
    });
  });
});
