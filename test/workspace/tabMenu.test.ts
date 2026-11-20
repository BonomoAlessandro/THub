import { describe, expect, it } from 'vitest';
import { ClaudeTab } from '../support/claudeTab';
import { startWorkspace, startWorkspaceWithApi, type TestWorkspace } from '../support/harness';

// Rechtsklick-Menü und Umsortieren per Ziehen (Ticket 16): Duplizieren, Verschieben und „Andere Tabs schliessen“ im
// Kern. Was das Menü sonst tut (Umbenennen, Pfad kopieren, Ordner im Explorer öffnen), läuft über bestehende Befehle
// bzw. den aktuellen Ordner des Tabs (`tabFolder`).

const HOME = 'C:\\Users\\anna';
const PROJ = 'C:\\proj';
const WEB = 'C:\\web';
const SUB = 'C:\\proj\\src';
const ESC = '\x1b';

/** Ordner-Meldung der Shell-Integration (OSC 9;9), wie sie bei jedem Prompt kommt. */
const cwdReport = (dir: string): string => `${ESC}]9;9;${dir}\x07`;

function setup(): TestWorkspace {
  return startWorkspace({ homeDir: HOME, directories: [PROJ, WEB, SUB] });
}

/** Ein Tab mit Claude im Ordner PROJ (Starter und Hooks über die echte lokale Schnittstelle, kein echtes claude). */
async function setupClaudeTab(): Promise<{ h: TestWorkspace; source: string; claude: ClaudeTab }> {
  const h = await startWorkspaceWithApi({ homeDir: HOME, directories: [PROJ, WEB, SUB] });
  const source = h.workspace.createTab({ cwd: PROJ });
  h.showAllViews();
  return { h, source, claude: await ClaudeTab.launch(h, source) };
}

function ids(h: TestWorkspace): string[] {
  return h.tabs().map((t) => t.id);
}

describe('Rechtsklick-Menü und Umsortieren', () => {
  describe('Duplizieren', () => {
    it('legt den neuen Tab rechts neben der Quelle an, auch wenn sie nicht aktiv ist, und macht ihn aktiv', () => {
      const h = setup();
      const a = h.activeTab()!.id;
      const b = h.workspace.createTab({ cwd: PROJ });
      const c = h.workspace.createTab({ cwd: WEB });

      const copy = h.workspace.duplicateTab(a);

      expect(ids(h)).toEqual([a, copy, b, c]);
      expect(h.snapshot().activeTabId).toBe(copy);
      expect(h.events.at(-1)).toMatchObject({ type: 'tabs', activeTabId: copy });
    });

    it('im aktuellen Ordner der Quelle (nach cd), mit derselben Shell und automatischem Namen nach dem Ordner', () => {
      const h = setup();
      const source = h.workspace.createTab({ cwd: PROJ, shellId: 'cmd' });
      h.showAllViews();
      h.workspace.renameTab(source, 'Mein Tab');
      h.terminal.output(source, `C:\\proj> cd src\r\n${cwdReport(SUB)}C:\\proj\\src> dir\r\n`);

      const copy = h.workspace.duplicateTab(source);

      expect(h.activeTab()).toMatchObject({
        id: copy,
        name: 'src',
        shellId: 'cmd',
        shellName: 'cmd',
        cwd: SUB,
        kind: 'terminal',
        process: 'pending',
      });
      // Der Name ist automatisch: Ein `cd` danach ändert ihn nicht, ein Umbenennen der Quelle auch nicht.
      expect(h.storedTab(copy)).toMatchObject({ name: 'src', nameIsManual: false, startCwd: SUB });
      expect(h.workspace.recentDirs()[0]?.path).toBe(SUB);

      h.workspace.viewReady(copy, 100, 30);

      // Eine eigene, neue Shell im Ordner der Quelle, ohne deren Verlauf.
      expect(h.terminal.startsFor(copy)).toHaveLength(1);
      expect(h.terminal.startsFor(copy)[0].order).toMatchObject({ file: 'cmd.exe', cwd: SUB, cols: 100, rows: 30 });
      expect(h.terminal.startsFor(copy)[0].order.startCommand).toBeUndefined();
      expect(h.eventsOfType('restoreHistory').filter((e) => e.tabId === copy)).toEqual([]);
      expect(h.terminal.isRunning(source)).toBe(true);
    });

    it('ohne cd im Startordner der Quelle; bei Gleichstand mit „ 2“', () => {
      const h = setup();
      const source = h.workspace.createTab({ cwd: PROJ, shellId: 'powershell' });

      const copy = h.workspace.duplicateTab(source);

      expect(h.tabs().map((t) => t.name)).toEqual(['anna', 'proj', 'proj 2']);
      expect(h.activeTab()).toMatchObject({ id: copy, shellId: 'powershell', cwd: PROJ });
    });

    it('gibt es den aktuellen Ordner nicht mehr, gilt wie beim Start der Shell der Startordner', () => {
      const h = setup();
      const source = h.workspace.createTab({ cwd: PROJ });
      h.showAllViews();
      h.terminal.output(source, cwdReport(SUB));
      h.system.removeDirectory(SUB);

      const copy = h.workspace.duplicateTab(source);

      expect(h.activeTab()).toMatchObject({ id: copy, name: 'proj 2', cwd: PROJ });
    });

    it('von einem Claude-Tab nur das Terminal, ohne Claude-Session, auch nach einem Neustart', async () => {
      const { h, source, claude } = await setupClaudeTab();
      await claude.send('UserPromptSubmit');
      expect(h.activeTab()).toMatchObject({ id: source, kind: 'claude', status: 'working' });

      const copy = h.workspace.duplicateTab(source);

      expect(h.activeTab()).toMatchObject({ id: copy, name: 'proj 2', cwd: PROJ, kind: 'terminal', status: 'idle' });
      expect(h.storedTab(copy)?.claude).toBeUndefined();
      expect(h.storedTab(source)?.claude).toMatchObject({ cwd: PROJ, hadPrompt: true });
      h.workspace.viewReady(copy, 100, 30);
      expect(h.terminal.startsFor(copy)[0].order).toMatchObject({ cwd: PROJ });
      expect(h.terminal.startsFor(copy)[0].order.startCommand).toBeUndefined();

      await h.restart();

      // Die Quelle setzt ihre Session fort (pausiert, bis sie angezeigt wird); das Duplikat bleibt ein Terminal.
      expect(h.tabs().find((t) => t.id === source)).toMatchObject({ kind: 'claude', paused: true });
      expect(h.activeTab()).toMatchObject({ id: copy, kind: 'terminal', paused: false });
      h.workspace.viewReady(copy, 100, 30);
      expect(h.terminal.startsFor(copy)[0].order.startCommand).toBeUndefined();
    });

    it('übernimmt keine offenen Punkte der Quelle, auch nicht nach einem Neustart', async () => {
      const { h, source, claude } = await setupClaudeTab();
      await claude.answer('Ich habe die Datei angepasst.\n\n## Offene Punkte\n- Sollen die Tests auch angepasst werden?');
      expect(h.storedTab(source)?.openPoints).toEqual(['Sollen die Tests auch angepasst werden?']);

      const copy = h.workspace.duplicateTab(source);

      expect(h.storedTab(copy)?.openPoints).toBeUndefined();
      expect(h.snapshot().toasts.filter((t) => t.tabId === copy)).toEqual([]);
      expect(claude.toasts()).toMatchObject([{ kind: 'openPoints', points: ['Sollen die Tests auch angepasst werden?'] }]);

      await h.restart();

      expect(h.snapshot().toasts.map((t) => t.tabId)).toEqual([source]);
    });

    it('unbekannte Tabs übergeht der Kern', () => {
      const h = setup();
      const before = h.snapshot();

      expect(h.workspace.duplicateTab('gibt-es-nicht')).toBe('');
      expect(h.snapshot()).toEqual(before);
    });
  });

  describe('Verschieben', () => {
    it('setzt den Tab an die neue Position; die anderen behalten ihre Reihenfolge, der aktive Tab bleibt aktiv', () => {
      const h = setup();
      const a = h.activeTab()!.id;
      const b = h.workspace.createTab({ cwd: PROJ });
      const c = h.workspace.createTab({ cwd: WEB });
      const d = h.workspace.createTab({ cwd: SUB });
      h.workspace.activateTab(b);

      h.workspace.moveTab(a, 2);
      expect(ids(h)).toEqual([b, c, a, d]);

      h.workspace.moveTab(d, 0);
      expect(ids(h)).toEqual([d, b, c, a]);
      expect(h.snapshot().activeTabId).toBe(b);
      expect(h.events.at(-1)).toMatchObject({ type: 'tabs', activeTabId: b, tabs: [{ id: d }, { id: b }, { id: c }, { id: a }] });
    });

    it('die neue Reihenfolge übersteht einen Neustart, und Ctrl+1 … Ctrl+9 folgen ihr', async () => {
      const h = setup();
      const a = h.activeTab()!.id;
      const b = h.workspace.createTab({ cwd: PROJ });
      const c = h.workspace.createTab({ cwd: WEB });

      h.workspace.moveTab(c, 0);
      h.workspace.activateTabAt(1);
      expect(h.activeTab()?.id).toBe(a);

      await h.restart();

      expect(ids(h)).toEqual([c, a, b]);
      expect(h.tabs().map((t) => t.name)).toEqual(['web', 'anna', 'proj']);
      expect(h.activeTab()?.id).toBe(a);
      h.workspace.activateTabAt(0);
      expect(h.activeTab()?.id).toBe(c);
      h.workspace.activateTabAt(2);
      expect(h.activeTab()?.id).toBe(b);
    });

    it('eine Position ausserhalb der Leiste gilt als das nächste Ende', () => {
      const h = setup();
      const a = h.activeTab()!.id;
      const b = h.workspace.createTab({ cwd: PROJ });
      const c = h.workspace.createTab({ cwd: WEB });

      h.workspace.moveTab(a, 99);
      expect(ids(h)).toEqual([b, c, a]);

      h.workspace.moveTab(c, -3);
      expect(ids(h)).toEqual([c, b, a]);
    });

    it('unbekannte Tabs, ungültige Positionen und der eigene Platz ändern nichts und melden nichts', () => {
      const h = setup();
      const a = h.activeTab()!.id;
      h.workspace.createTab({ cwd: PROJ });
      const before = h.snapshot();
      const events = h.events.length;

      h.workspace.moveTab('gibt-es-nicht', 0);
      h.workspace.moveTab(a, 0);
      h.workspace.moveTab(a, 1.5);
      h.workspace.moveTab(a, Number.NaN);

      expect(h.snapshot()).toEqual(before);
      expect(h.events).toHaveLength(events);
    });

    it('ein danach geschlossener Tab kommt beim Wiederöffnen an seinen Platz in der neuen Reihenfolge zurück', () => {
      const h = setup();
      const a = h.activeTab()!.id;
      const b = h.workspace.createTab({ cwd: PROJ });
      const c = h.workspace.createTab({ cwd: WEB });
      h.workspace.moveTab(a, 1);

      h.workspace.closeTab(a);
      h.workspace.reopenClosedTab();

      expect(ids(h)).toEqual([b, a, c]);
    });
  });

  describe('Andere Tabs schliessen', () => {
    it('lässt genau den gewählten Tab übrig, auch wenn er nicht aktiv ist; er wird aktiv, auch nach einem Neustart', async () => {
      const h = setup();
      const a = h.activeTab()!.id;
      const b = h.workspace.createTab({ cwd: PROJ });
      const c = h.workspace.createTab({ cwd: WEB });
      const d = h.workspace.createTab({ cwd: SUB });
      h.showAllViews();
      expect(h.activeTab()?.id).toBe(d);

      h.workspace.closeOtherTabs(b);

      expect(ids(h)).toEqual([b]);
      expect(h.snapshot().activeTabId).toBe(b);
      expect(h.workspace.closedTabs().map((t) => t.id)).toEqual([d, c, a]);

      await h.restart();

      expect(ids(h)).toEqual([b]);
      expect(h.snapshot().activeTabId).toBe(b);
    });
  });

  describe('aktueller Ordner eines Tabs (Pfad kopieren, Ordner im Explorer öffnen)', () => {
    it('ist der zuletzt gemeldete Ordner, vorher der Startordner, wie im Tooltip', () => {
      const h = setup();
      const tab = h.workspace.createTab({ cwd: PROJ });
      expect(h.workspace.tabFolder(tab)).toBe(PROJ);

      h.showAllViews();
      h.terminal.output(tab, cwdReport(SUB));

      expect(h.workspace.tabFolder(tab)).toBe(SUB);
      expect(h.tabs().find((t) => t.id === tab)?.cwd).toBe(SUB);
      expect(h.workspace.tabFolder('gibt-es-nicht')).toBeUndefined();
    });
  });
});
