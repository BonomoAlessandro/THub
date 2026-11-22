import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PaletteContext, PaletteGroup, PaletteItem } from '../../src/renderer/palette/paletteEntries';
import type { UiActions } from '../../src/renderer/commands';
import type { TerminalView } from '../../src/renderer/terminal/TerminalView';
import type {
  ClosedTabInfo,
  DirectoryPurpose,
  KeepAwakeMode,
  RecentDir,
  TabSnapshot,
  THubApi,
  WorkspaceCommand,
} from '../../src/shared/types';
import type { ProcessInfo } from '../../src/main/workspace/ports';
import { startWorkspace, type TestWorkspace } from '../support/harness';

// Befehle der Befehlspalette: Jeder hat dieselbe Wirkung wie über Maus oder Tastenkürzel, inklusive der Rückfrage des
// Kerns beim Schliessen. Die Oberfläche läuft ohne Fenster: `window.thub` ist nachgemacht und zeichnet die Befehle an
// den Kern auf.

/** Was an den Kern ging. */
const sent: WorkspaceCommand[] = [];
/** Antwort des Ordner-Dialogs von Windows; `null` heisst abgebrochen. */
let pickedDir: string | null = null;
const pickDirectory = vi.fn(async (_purpose: DirectoryPurpose) => pickedDir);

/** Was in der Zwischenablage liegt. */
let clipboardText = '';
const APP_INFO = { version: '0.2.0', commit: 'e8e865a', dirty: false, packaged: true };

const fakeApi: Partial<THubApi> = {
  send: (command) => void sent.push(command),
  pickDirectory,
  loadRecentDirs: async () => [],
  loadClosedTabs: async () => [],
  loadAppInfo: async () => APP_INFO,
  writeClipboard: async (text) => {
    clipboardText = text;
  },
};
vi.stubGlobal('window', { thub: fakeApi });

// Erst jetzt laden: Die Module lesen `window.thub` beim Laden.
const { closedGroups, folderGroups, rootGroups } = await import('../../src/renderer/palette/paletteEntries');
const { runShortcut } = await import('../../src/renderer/commands');
const { resolveShortcut } = await import('../../src/renderer/shortcuts');
const { newTabMenuEntries } = await import('../../src/renderer/tabs/newTabMenu');
const { keepAwakeMenuEntries } = await import('../../src/renderer/tabs/keepAwakeMenu');
const { copyVersion, setKeepAwake } = await import('../../src/renderer/commands');
const { versionLabel } = await import('../../src/renderer/version');
const { terminalViews } = await import('../../src/renderer/terminal/terminalViews');

function tab(id: string, name: string, overrides: Partial<TabSnapshot> = {}): TabSnapshot {
  return {
    id,
    name,
    shellId: 'pwsh',
    shellName: 'PowerShell 7',
    cwd: `C:\\dev\\${name}`,
    process: 'running',
    kind: 'terminal',
    status: 'idle',
    paused: false,
    ...overrides,
  };
}

const TABS = [
  tab('a', 'termhub'),
  tab('b', 'api-gateway', { kind: 'claude', status: 'waiting' }),
  tab('c', 'web', { status: 'processes' }),
];

/** Eine Palette über diesen Tabs; die Aufrufe an die Oberfläche (Umbenennen, Dialoge) werden aufgezeichnet. */
function palette(
  tabs = TABS,
  activeTabId: string | null = 'b',
  keepAwake: { on: boolean; mode: KeepAwakeMode } = { on: false, mode: 'system' },
) {
  const ui = { startRename: vi.fn(), openSettings: vi.fn(), openShortcuts: vi.fn() };
  const ctx: PaletteContext = { tabs, activeTabId, ...ui, keepAwake };
  return { ctx, ui, groups: rootGroups(ctx) };
}

function item(groups: PaletteGroup[], label: string): PaletteItem {
  const found = groups.flatMap((g) => g.items).find((i) => i.label === label);
  if (!found) throw new Error(`Kein Eintrag „${label}“`);
  return found;
}

function commandLabels(groups: PaletteGroup[]): string[] {
  return groups.find((g) => g.title === 'Befehle')!.items.map((i) => i.label);
}

/** Was ein Weg an den Kern schickt. */
async function commandsOf(run: () => unknown): Promise<WorkspaceCommand[]> {
  sent.length = 0;
  await run();
  await Promise.resolve();
  return [...sent];
}

/** Ein Tastendruck wie im Browser, z.B. key('Ctrl+Shift+KeyT'). */
function key(combo: string, produced = 'x') {
  const parts = combo.split('+');
  return {
    code: parts.at(-1)!,
    key: produced,
    ctrlKey: parts.includes('Ctrl'),
    shiftKey: parts.includes('Shift'),
    altKey: false,
    metaKey: false,
  };
}

/** Führt ein Tastenkürzel so aus wie die Oberfläche, mit dem aktiven Tab `b`. */
function shortcut(combo: string, ui: Partial<UiActions> = {}, produced?: string): void {
  const action = resolveShortcut(key(combo, produced));
  if (!action) throw new Error(`${combo} ist kein Kürzel`);
  runShortcut(action, { activeTabId: 'b', startRename: vi.fn(), openPalette: vi.fn(), ...ui });
}

/** Ein Terminal ohne Fenster, das nur den Fokus aufzeichnet. */
function fakeView(tabId: string) {
  const view = { focus: vi.fn() };
  terminalViews.set(tabId, view as unknown as TerminalView);
  return view;
}

beforeEach(() => {
  sent.length = 0;
  pickedDir = null;
  pickDirectory.mockClear();
  terminalViews.clear();
});

describe('Befehlspalette', () => {
  describe('Einträge', () => {
    it('zuerst die Tabs mit Name, Ordner und Status, dann die Befehle', () => {
      const { groups } = palette();
      expect(groups.map((g) => g.title)).toEqual(['Tabs', 'Befehle']);
      expect(groups[0].items.map(({ label, detail, tab: t }) => ({ label, detail, tab: t }))).toEqual([
        { label: 'termhub', detail: 'C:\\dev\\termhub', tab: { kind: 'terminal', status: 'idle' } },
        { label: 'api-gateway', detail: 'C:\\dev\\api-gateway', tab: { kind: 'claude', status: 'waiting' } },
        { label: 'web', detail: 'C:\\dev\\web', tab: { kind: 'terminal', status: 'processes' } },
      ]);
      expect(commandLabels(groups)).toEqual([
        'Neues Terminal',
        'Neues Terminal in …',
        'Tab umbenennen',
        'Tab schliessen',
        'Andere Tabs schliessen',
        'Zuletzt geschlossen …',
        'Einstellungen',
        'Standardordner ändern',
        'Tastenkürzel anzeigen',
        'Version kopieren',
        'Rechner wach halten',
        'Rechner und Bildschirm wach halten',
      ]);
    });

    it('„Wachhalten beenden“ gibt es nur, solange der Rechner wach gehalten wird', () => {
      const keepAwakeLabels = (on: boolean, mode: KeepAwakeMode) =>
        commandLabels(palette(TABS, 'b', { on, mode }).groups).filter((l) => /wach/i.test(l));
      expect(keepAwakeLabels(false, 'display')).toEqual(['Rechner wach halten', 'Rechner und Bildschirm wach halten']);
      expect(keepAwakeLabels(true, 'system')).toEqual([
        'Rechner wach halten',
        'Rechner und Bildschirm wach halten',
        'Wachhalten beenden',
      ]);
      expect(item(palette(TABS, 'b', { on: true, mode: 'display' }).groups, 'Wachhalten beenden').icon).toBe('monitor');
      expect(item(palette(TABS, 'b', { on: true, mode: 'system' }).groups, 'Wachhalten beenden').icon).toBe('coffee');
    });

    it('keine Claude-Befehle, auch wenn Claude-Tabs offen sind', () => {
      expect(commandLabels(palette().groups).filter((label) => /claude/i.test(label))).toEqual([]);
    });

    it('die Hinweise auf Tastenkürzel kommen aus der Tabelle der Tastenkürzel', () => {
      const { groups } = palette();
      expect(item(groups, 'Neues Terminal').hint).toBe('Ctrl+Shift+T');
      expect(item(groups, 'Tab umbenennen').hint).toBe('F2');
      expect(item(groups, 'Tab schliessen').hint).toBe('Ctrl+Shift+W');
      expect(item(groups, 'Zuletzt geschlossen …').hint).toBe('Ctrl+Shift+Z');
      // Die Übersicht hat kein eigenes Kürzel.
      expect(item(groups, 'Tastenkürzel anzeigen').hint).toBeUndefined();
    });

    it('ohne aktiven Tab fehlen Umbenennen und Schliessen; mit nur einem Tab fehlt „Andere Tabs schliessen“', () => {
      const none = commandLabels(palette([], null).groups);
      for (const label of ['Tab umbenennen', 'Tab schliessen', 'Andere Tabs schliessen']) expect(none).not.toContain(label);
      expect(none).toContain('Neues Terminal');
      const single = commandLabels(palette([TABS[0]], 'a').groups);
      expect(single).toContain('Tab schliessen');
      expect(single).not.toContain('Andere Tabs schliessen');
    });
  });

  describe('jeder Befehl wirkt wie über Maus oder Tastenkürzel', () => {
    it('ein Tab: Enter zeigt ihn an wie ein Klick auf den Tab', async () => {
      const { groups } = palette();
      expect(await commandsOf(() => item(groups, 'web').run!())).toEqual([{ type: 'activateTab', tabId: 'c' }]);
    });

    it('der schon aktive Tab bekommt nur den Fokus, wie beim Klick auf ihn', async () => {
      const { groups } = palette();
      const view = fakeView('b');
      expect(await commandsOf(() => item(groups, 'api-gateway').run!())).toEqual([]);
      expect(view.focus).toHaveBeenCalled();
    });

    it('Neues Terminal wie Ctrl+Shift+T und der Knopf +', async () => {
      const { groups } = palette();
      const fromPalette = await commandsOf(() => item(groups, 'Neues Terminal').run!());
      expect(fromPalette).toEqual(await commandsOf(() => shortcut('Ctrl+Shift+KeyT')));
      expect(fromPalette).toEqual([{ type: 'createTab' }]);
    });

    it('Neues Terminal in … führt zu den zuletzt benutzten Ordnern und „Ordner wählen …“, wie im Pfeil-Menü', async () => {
      expect(item(palette().groups, 'Neues Terminal in …').opens).toBe('folders');
      const dirs: RecentDir[] = [
        { path: 'C:\\dev\\termhub', name: 'termhub' },
        { path: 'D:\\work\\api', name: 'api' },
      ];
      const fromPalette = folderGroups(dirs)[0].items;
      const menu = newTabMenuEntries([], 'pwsh', dirs).filter((e) => e.kind === 'item');
      expect(fromPalette.map(({ label, detail }) => ({ label, detail }))).toEqual([
        { label: 'termhub', detail: 'C:\\dev\\termhub' },
        { label: 'api', detail: 'D:\\work\\api' },
        { label: 'Ordner wählen …', detail: undefined },
      ]);
      for (const [i, entry] of fromPalette.entries()) {
        const viaMenu = menu[i];
        if (viaMenu.kind !== 'item') throw new Error('kein Eintrag');
        expect(viaMenu.label).toBe(entry.label);
        pickedDir = 'C:\\neu';
        const viaPalette = await commandsOf(() => entry.run!());
        expect(viaPalette).toEqual(await commandsOf(() => viaMenu.run()));
      }
      expect(await commandsOf(() => fromPalette[1].run!())).toEqual([{ type: 'createTab', cwd: 'D:\\work\\api' }]);
    });

    it('„Ordner wählen …“ öffnet den Ordner-Dialog; der gewählte Ordner bekommt ein neues Terminal, abgebrochen keines', async () => {
      const choose = folderGroups([])[0].items[0];
      pickedDir = 'C:\\neu';
      expect(await commandsOf(() => choose.run!())).toEqual([{ type: 'createTab', cwd: 'C:\\neu' }]);
      expect(pickDirectory).toHaveBeenCalledWith('newTab');
      pickedDir = null;
      expect(await commandsOf(() => choose.run!())).toEqual([]);
    });

    it('Tab umbenennen wie F2: der Name des aktiven Tabs wird bearbeitbar', () => {
      const { groups, ui } = palette();
      item(groups, 'Tab umbenennen').run!();
      const viaF2 = vi.fn();
      shortcut('F2', { startRename: viaF2 });
      expect(ui.startRename).toHaveBeenCalledWith('b');
      expect(viaF2).toHaveBeenCalledWith('b');
    });

    it('Tab schliessen wie Ctrl+Shift+W und ×: der Kern schliesst oder fragt erst zurück', async () => {
      const { groups } = palette();
      const fromPalette = await commandsOf(() => item(groups, 'Tab schliessen').run!());
      expect(fromPalette).toEqual(await commandsOf(() => shortcut('Ctrl+Shift+KeyW')));
      // Wie das × am Tab: eine Bitte an den Kern, nie ein Schliessen ohne seine Rückfrage.
      expect(fromPalette).toEqual([{ type: 'requestClose', tabIds: ['b'] }]);
    });

    it('Andere Tabs schliessen: alle ausser dem aktiven, mit höchstens einer gemeinsamen Rückfrage des Kerns', async () => {
      const { groups } = palette();
      expect(await commandsOf(() => item(groups, 'Andere Tabs schliessen').run!())).toEqual([
        { type: 'closeOtherTabs', tabId: 'b' },
      ]);
    });

    it('Zuletzt geschlossen zeigt die Liste mit Namen, neueste zuerst, und öffnet den gewählten Tab wieder', async () => {
      expect(item(palette().groups, 'Zuletzt geschlossen …').opens).toBe('closed');
      const closed: ClosedTabInfo[] = [
        { id: 'x', name: 'docs', kind: 'terminal', shellName: 'cmd', cwd: 'C:\\docs', closedAt: 2000 },
        { id: 'y', name: 'anna', kind: 'claude', shellName: 'PowerShell 7', cwd: 'C:\\proj', closedAt: 1000 },
      ];
      const items = closedGroups(closed)[0].items;
      expect(items.map(({ label, detail, tab: t }) => ({ label, detail, tab: t }))).toEqual([
        { label: 'docs', detail: 'C:\\docs', tab: { kind: 'terminal', status: 'idle' } },
        { label: 'anna', detail: 'C:\\proj', tab: { kind: 'claude', status: 'idle' } },
      ]);
      expect(await commandsOf(() => items[1].run!())).toEqual([{ type: 'reopenClosedTab', tabId: 'y' }]);
    });

    it('Einstellungen wie das Zahnrad', () => {
      const { groups, ui } = palette();
      item(groups, 'Einstellungen').run!();
      expect(ui.openSettings).toHaveBeenCalledOnce();
    });

    it('Standardordner ändern wie „Ändern …“ in den Einstellungen; danach ist der Fokus im Terminal', async () => {
      const { groups } = palette();
      const view = fakeView('b');
      pickedDir = 'D:\\work';
      expect(await commandsOf(() => item(groups, 'Standardordner ändern').run!())).toEqual([
        { type: 'updateSettings', patch: { defaultCwd: 'D:\\work' } },
      ]);
      expect(pickDirectory).toHaveBeenCalledWith('defaultCwd');
      expect(view.focus).toHaveBeenCalled();
      pickedDir = null;
      expect(await commandsOf(() => item(groups, 'Standardordner ändern').run!())).toEqual([]);
    });

    it('Tastenkürzel anzeigen öffnet die Übersicht', () => {
      const { groups, ui } = palette();
      item(groups, 'Tastenkürzel anzeigen').run!();
      expect(ui.openShortcuts).toHaveBeenCalledOnce();
    });

    it('die beiden Stufen wie die Wahl im Pfeil-Menü am Schalter: Stufe setzen und einschalten', async () => {
      const { groups } = palette();
      const [system, display] = keepAwakeMenuEntries('system');
      if (system.kind !== 'item' || display.kind !== 'item') throw new Error('Einträge erwartet');
      const onSystem = [{ type: 'updateSettings', patch: { keepAwake: true, keepAwakeMode: 'system' } }];
      const onDisplay = [{ type: 'updateSettings', patch: { keepAwake: true, keepAwakeMode: 'display' } }];

      expect(await commandsOf(() => item(groups, 'Rechner wach halten').run!())).toEqual(onSystem);
      expect(await commandsOf(() => system.run())).toEqual(onSystem);
      expect(await commandsOf(() => item(groups, 'Rechner und Bildschirm wach halten').run!())).toEqual(onDisplay);
      expect(await commandsOf(() => display.run())).toEqual(onDisplay);
    });

    it('Version kopieren legt dieselbe Zeile in die Zwischenablage wie der Klick auf die Versionszeile', async () => {
      const { groups } = palette();

      clipboardText = '';
      expect(await commandsOf(() => item(groups, 'Version kopieren').run!())).toEqual([]);
      await new Promise((resolve) => setTimeout(resolve, 0));
      const fromPalette = clipboardText;

      // Die Versionszeile in den Einstellungen ruft beim Klick copyVersion auf.
      clipboardText = '';
      const copied = await copyVersion();

      expect(fromPalette).toBe('THub 0.2.0 · e8e865a');
      expect(clipboardText).toBe(fromPalette);
      expect(copied).toBe(versionLabel(APP_INFO));
    });

    it('Wachhalten beenden wie ein Klick auf den eingeschalteten Schalter', async () => {
      const { groups } = palette(TABS, 'b', { on: true, mode: 'display' });
      const off = [{ type: 'updateSettings', patch: { keepAwake: false } }];

      expect(await commandsOf(() => item(groups, 'Wachhalten beenden').run!())).toEqual(off);
      expect(await commandsOf(() => setKeepAwake(false))).toEqual(off);
    });
  });

  describe('Pfeil-Menü am Schalter „Rechner wach halten“', () => {
    it('zeigt beide Stufen mit Symbol; die gewählte hat ein Häkchen, auch ausgeschaltet', () => {
      const shown = (mode: KeepAwakeMode) =>
        keepAwakeMenuEntries(mode).map((e) => (e.kind === 'item' ? [e.label, e.checked, e.icon !== undefined] : e.kind));
      expect(shown('system')).toEqual([
        ['Nur Rechner wach halten', true, true],
        ['Rechner und Bildschirm wach halten', false, true],
      ]);
      expect(shown('display')).toEqual([
        ['Nur Rechner wach halten', false, true],
        ['Rechner und Bildschirm wach halten', true, true],
      ]);
    });
  });

  // Zusammen mit dem echten Kern: Was die Palette und der Schalter schicken, bewirkt beim Port Wachhalten das Erwartete.
  describe('mit dem Kern: Rechner wach halten', () => {
    function deliver(h: TestWorkspace, commands: WorkspaceCommand[]): void {
      for (const c of commands) {
        if (c.type === 'updateSettings') h.workspace.updateSettings(c.patch);
        else throw new Error(`unerwartet: ${c.type}`);
      }
    }

    function paletteFor(h: TestWorkspace) {
      const { tabs, activeTabId, settings } = h.snapshot();
      return palette(tabs, activeTabId, { on: settings.keepAwake, mode: settings.keepAwakeMode }).groups;
    }

    it('Stufe wählen, dieselbe noch einmal, andere Stufe, beenden, Schalter wieder an', async () => {
      const h = startWorkspace();

      deliver(h, await commandsOf(() => item(paletteFor(h), 'Rechner und Bildschirm wach halten').run!()));
      deliver(h, await commandsOf(() => item(paletteFor(h), 'Rechner und Bildschirm wach halten').run!()));
      deliver(h, await commandsOf(() => item(paletteFor(h), 'Rechner wach halten').run!()));
      deliver(h, await commandsOf(() => item(paletteFor(h), 'Wachhalten beenden').run!()));
      expect(commandLabels(paletteFor(h))).not.toContain('Wachhalten beenden');
      deliver(h, await commandsOf(() => setKeepAwake(true)));

      expect(h.keepAwake.levels).toEqual(['off', 'display', 'system', 'off', 'system']);
    });
  });

  it('Ctrl+Shift+P öffnet die Palette und schickt nichts an die Shell', async () => {
    const openPalette = vi.fn();
    expect(await commandsOf(() => shortcut('Ctrl+Shift+KeyP', { openPalette }, 'P'))).toEqual([]);
    expect(openPalette).toHaveBeenCalledOnce();
  });

  // Zusammen mit dem echten Kern: Die Palette schickt ihre Befehle so, wie main.ts sie an den Kern weitergibt.
  describe('mit dem Kern: Rückfrage beim Schliessen', () => {
    const HOME = 'C:\\Users\\anna';
    const ELECTRON_PID = 29248;

    /** Gibt die Befehle der Palette an den Kern weiter, wie main.ts. */
    function deliver(h: TestWorkspace, commands: WorkspaceCommand[]): void {
      for (const c of commands) {
        if (c.type === 'requestClose') h.workspace.requestClose(c.tabIds);
        else if (c.type === 'closeOtherTabs') h.workspace.closeOtherTabs(c.tabId);
        else throw new Error(`unerwartet: ${c.type}`);
      }
    }

    /** Ein Tab, in dem `node.exe` läuft; die Prozess-Sonde hat es zweimal gesehen. */
    async function busyTab(h: TestWorkspace): Promise<string> {
      const tabId = h.workspace.createTab();
      h.terminal.usePids(19996);
      const start = h.clock.now();
      h.workspace.viewReady(tabId, 120, 30);
      const proc = (pid: number, ppid: number, name: string, ms: number): ProcessInfo => ({
        pid,
        ppid,
        name,
        startTime: start + ms,
      });
      const tree = [proc(ELECTRON_PID, 1200, 'electron.exe', -600_000), proc(19996, ELECTRON_PID, 'pwsh.exe', 100)];
      tree.push(proc(8120, 19996, 'node.exe', 2000));
      await h.probe(tree);
      await h.probe(tree);
      return tabId;
    }

    function paletteFor(h: TestWorkspace) {
      const { tabs, activeTabId } = h.snapshot();
      return palette(tabs, activeTabId).groups;
    }

    it('Tab schliessen: läuft noch etwas, fragt der Kern nach, und der Tab bleibt offen', async () => {
      const h = startWorkspace({ homeDir: HOME });
      const busy = await busyTab(h);
      expect(h.snapshot().activeTabId).toBe(busy);

      deliver(h, await commandsOf(() => item(paletteFor(h), 'Tab schliessen').run!()));

      expect(h.eventsOfType('askClose')).toEqual([
        { type: 'askClose', tabIds: [busy], busy: [{ id: busy, name: 'anna 2', reason: 'processes', resumes: false }] },
      ]);
      expect(h.tabs().map((t) => t.id)).toContain(busy);
    });

    it('Tab schliessen: ein ruhender Tab schliesst sofort', async () => {
      const h = startWorkspace({ homeDir: HOME });
      const keep = h.activeTab()!.id;
      const idle = h.workspace.createTab();
      h.showAllViews();

      deliver(h, await commandsOf(() => item(paletteFor(h), 'Tab schliessen').run!()));

      expect(h.eventsOfType('askClose')).toEqual([]);
      expect(h.tabs().map((t) => t.id)).toEqual([keep]);
      expect(idle).not.toBe(keep);
    });

    it('Andere Tabs schliessen: eine gemeinsame Rückfrage, die den beschäftigten Tab nennt', async () => {
      const h = startWorkspace({ homeDir: HOME });
      const first = h.activeTab()!.id;
      const busy = await busyTab(h);
      h.workspace.activateTab(first);

      deliver(h, await commandsOf(() => item(paletteFor(h), 'Andere Tabs schliessen').run!()));

      expect(h.eventsOfType('askClose')).toEqual([
        { type: 'askClose', tabIds: [busy], busy: [{ id: busy, name: 'anna 2', reason: 'processes', resumes: false }] },
      ]);
      expect(h.tabs()).toHaveLength(2);
    });
  });
});
