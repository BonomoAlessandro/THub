import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MenuEntry } from '../../src/renderer/popup/Menu';
import type { PaletteContext, PaletteGroup, PaletteItem } from '../../src/renderer/palette/paletteEntries';
import type { TerminalView } from '../../src/renderer/terminal/TerminalView';
import type { ClosedTabInfo, GroupSnapshot, TabSnapshot, THubApi, WorkspaceCommand } from '../../src/shared/types';
import { startWorkspace, type TestWorkspace } from '../support/harness';

// Tab-Gruppen in der Oberfläche (Ticket 36): Einträge der Befehlspalette mit Gruppennamen und den Befehlen zu Gruppen,
// das Rechtsklick-Menü am Tab und am Gruppen-Tab, die Liste der Gruppe und wie Hinweise einen Tab nennen. Alles ohne
// Fenster: `window.thub` ist nachgemacht und zeichnet die Befehle an den Kern auf.

const sent: WorkspaceCommand[] = [];
const fakeApi: Partial<THubApi> = {
  send: (command) => void sent.push(command),
  loadRecentDirs: async () => [],
  loadClosedTabs: async () => [],
};
vi.stubGlobal('window', { thub: fakeApi });

// Erst jetzt laden: Die Module lesen `window.thub` beim Laden.
const { closedGroups, rootGroups } = await import('../../src/renderer/palette/paletteEntries');
const { searchGroups } = await import('../../src/renderer/palette/search');
const { tabMenuEntries } = await import('../../src/renderer/tabs/tabMenu');
const { groupListEntries, groupMenuEntries } = await import('../../src/renderer/tabs/groupMenu');
const { tabLabel } = await import('../../src/renderer/tabs/tabLabel');
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

/** Die Leiste: termhub, die Gruppe „Kunde X“ mit api (gewählt), web und db, dann notes. */
const TABS = [
  tab('t', 'termhub'),
  tab('a', 'api', { groupId: 'g' }),
  tab('w', 'web', { groupId: 'g', kind: 'claude', status: 'waiting' }),
  tab('d', 'db', { groupId: 'g', status: 'processes' }),
  tab('n', 'notes'),
];
const KUNDE: GroupSnapshot = { id: 'g', name: 'Kunde X', tabIds: ['a', 'w', 'd'], selectedTabId: 'a', status: 'waiting' };
const PRIVAT: GroupSnapshot = { id: 'p', name: 'privat', tabIds: ['x'], selectedTabId: 'x', status: 'idle' };

function palette(activeTabId: string | null, tabs = TABS, groups: GroupSnapshot[] = [KUNDE]) {
  const ui = { startRename: vi.fn(), startRenameGroup: vi.fn(), openSettings: vi.fn(), openShortcuts: vi.fn() };
  const ctx: PaletteContext = { tabs, groups, activeTabId, ...ui, keepAwake: { on: false, mode: 'system' } };
  return { ui, groups: rootGroups(ctx) };
}

function commandLabels(groups: PaletteGroup[]): string[] {
  return groups.find((g) => g.title === 'Befehle')!.items.map((i) => i.label);
}

function item(groups: PaletteGroup[], label: string): PaletteItem {
  const found = groups.flatMap((g) => g.items).find((i) => i.label === label);
  if (!found) throw new Error(`Kein Eintrag „${label}“`);
  return found;
}

type MenuItem = Extract<MenuEntry, { kind: 'item' }>;

function menuItem(entries: MenuEntry[], label: string): MenuItem {
  const found = entries.find((e): e is MenuItem => e.kind === 'item' && e.label === label);
  if (!found) throw new Error(`Kein Menüeintrag „${label}“`);
  return found;
}

function menuLabels(entries: MenuEntry[]): string[] {
  return entries.map((e) => (e.kind === 'item' ? e.label : e.kind === 'separator' ? '—' : e.label));
}

/** Was ein Weg an den Kern schickt. */
function commandsOf(run: () => unknown): WorkspaceCommand[] {
  sent.length = 0;
  run();
  return [...sent];
}

beforeEach(() => {
  sent.length = 0;
  terminalViews.clear();
});

describe('Befehlspalette mit Gruppen', () => {
  it('Tabs in einer Gruppe heissen „Gruppenname › Tabname“, in der Reihenfolge der Leiste', () => {
    const { groups } = palette('t');
    expect(groups[0].items.map((i) => i.label)).toEqual([
      'termhub',
      'Kunde X › api',
      'Kunde X › web',
      'Kunde X › db',
      'notes',
    ]);
    expect(item(groups, 'Kunde X › web')).toMatchObject({ detail: 'C:\\dev\\web', tab: { kind: 'claude', status: 'waiting' } });
  });

  it('die Suche trifft auch den Namen der Gruppe', () => {
    const tabs = searchGroups('kunde', palette('t').groups).find((g) => g.title === 'Tabs');
    // Alle Tabs der Gruppe, sonst keiner; bei gleich gutem Treffer geht der kürzere Name vor.
    expect(tabs?.items.map((i) => i.label).sort()).toEqual(['Kunde X › api', 'Kunde X › db', 'Kunde X › web']);
    const one = searchGroups('kunde web', palette('t').groups)[0];
    expect(one.items[0].label).toBe('Kunde X › web');
  });

  it('Enter auf einem Tab der Gruppe zeigt ihn an, wie ein Klick in der Liste', () => {
    const { groups } = palette('t');
    expect(commandsOf(() => item(groups, 'Kunde X › db').run!())).toEqual([{ type: 'activateTab', tabId: 'd' }]);
  });

  it('bei einem einzelnen Tab: „Neue Gruppe“, aber keine Befehle für eine Gruppe', () => {
    const labels = commandLabels(palette('n').groups);
    expect(labels).toContain('Neue Gruppe');
    for (const label of ['Aus Gruppe nehmen', 'Gruppe umbenennen', 'Gruppe auflösen']) expect(labels).not.toContain(label);
    // Ohne aktiven Tab gibt es keinen der Befehle.
    for (const label of ['Neue Gruppe', 'Aus Gruppe nehmen', 'Gruppe umbenennen', 'Gruppe auflösen']) {
      expect(commandLabels(palette(null).groups)).not.toContain(label);
    }
  });

  it('bei einem Tab in einer Gruppe: „Aus Gruppe nehmen“, „Gruppe umbenennen“, „Gruppe auflösen“, aber keine neue Gruppe', () => {
    const labels = commandLabels(palette('w').groups);
    expect(labels).not.toContain('Neue Gruppe');
    expect(labels.filter((l) => /Gruppe/.test(l))).toEqual(['Aus Gruppe nehmen', 'Gruppe umbenennen', 'Gruppe auflösen']);
  });

  it('„Andere Tabs schliessen“ in einer Gruppe nur, wenn sie weitere Tabs hat', () => {
    expect(commandLabels(palette('w').groups)).toContain('Andere Tabs schliessen');
    const alone = [tab('t', 'termhub'), tab('a', 'api', { groupId: 'g' })];
    const group = { ...KUNDE, tabIds: ['a'] };
    expect(commandLabels(palette('a', alone, [group]).groups)).not.toContain('Andere Tabs schliessen');
    expect(commandLabels(palette('t', alone, [group]).groups)).toContain('Andere Tabs schliessen');
  });

  it('die Befehle wirken wie im Rechtsklick-Menü am Tab bzw. am Gruppen-Tab', () => {
    const single = palette('n');
    const viaMenu = tabMenuEntries(TABS[4], [KUNDE], vi.fn());
    expect(commandsOf(() => item(single.groups, 'Neue Gruppe').run!())).toEqual([{ type: 'createGroup', tabId: 'n' }]);
    expect(commandsOf(() => menuItem(viaMenu, 'Neue Gruppe').run())).toEqual([{ type: 'createGroup', tabId: 'n' }]);

    const grouped = palette('w');
    const tabMenu = tabMenuEntries(TABS[2], [KUNDE], vi.fn());
    const groupMenu = groupMenuEntries(KUNDE, vi.fn());
    expect(commandsOf(() => item(grouped.groups, 'Aus Gruppe nehmen').run!())).toEqual([
      { type: 'removeTabFromGroup', tabId: 'w' },
    ]);
    expect(commandsOf(() => menuItem(tabMenu, 'Aus Gruppe nehmen').run())).toEqual([
      { type: 'removeTabFromGroup', tabId: 'w' },
    ]);
    expect(commandsOf(() => item(grouped.groups, 'Gruppe auflösen').run!())).toEqual([
      { type: 'dissolveGroup', groupId: 'g' },
    ]);
    expect(commandsOf(() => menuItem(groupMenu, 'Gruppe auflösen').run())).toEqual([
      { type: 'dissolveGroup', groupId: 'g' },
    ]);

    // Umbenennen zeigt die Oberfläche selbst: wie „Gruppe umbenennen“ im Menü am Gruppen-Tab.
    item(grouped.groups, 'Gruppe umbenennen').run!();
    expect(grouped.ui.startRenameGroup).toHaveBeenCalledWith('g');
    const onRename = vi.fn();
    menuItem(groupMenuEntries(KUNDE, onRename), 'Gruppe umbenennen').run();
    expect(onRename).toHaveBeenCalledOnce();
  });

  it('„Zuletzt geschlossen“ nennt die Gruppe, in die ein Tab zurückkehrt', () => {
    const closed: ClosedTabInfo[] = [
      { id: 'x', name: 'web', kind: 'terminal', shellName: 'cmd', cwd: 'C:\\web', closedAt: 2, groupName: 'Kunde X' },
      { id: 'y', name: 'docs', kind: 'terminal', shellName: 'cmd', cwd: 'C:\\docs', closedAt: 1 },
    ];
    expect(closedGroups(closed)[0].items.map((i) => i.label)).toEqual(['Kunde X › web', 'docs']);
  });

  // Zusammen mit dem echten Kern: Was die Palette schickt, gibt main.ts so an den Kern weiter.
  it('mit dem Kern: „Neue Gruppe“, danach „Aus Gruppe nehmen“ und „Gruppe auflösen“ über die Palette', () => {
    const h = startWorkspace({ homeDir: 'C:\\Users\\anna', directories: ['C:\\kunde\\api'] });
    const first = h.activeTab()!.id;
    const api = h.workspace.createTab({ cwd: 'C:\\kunde\\api' });
    const paletteFor = (w: TestWorkspace) => {
      const { tabs, groups, activeTabId } = w.snapshot();
      return palette(activeTabId, tabs, groups).groups;
    };
    const deliver = (commands: WorkspaceCommand[]) => {
      for (const c of commands) {
        if (c.type === 'createGroup') h.workspace.createGroup(c.tabId);
        else if (c.type === 'moveTabToGroup') h.workspace.moveTabToGroup(c.tabId, c.groupId);
        else if (c.type === 'removeTabFromGroup') h.workspace.removeTabFromGroup(c.tabId);
        else if (c.type === 'dissolveGroup') h.workspace.dissolveGroup(c.groupId);
        else if (c.type === 'activateTab') h.workspace.activateTab(c.tabId);
        else throw new Error(`unerwartet: ${c.type}`);
      }
    };

    deliver(commandsOf(() => item(paletteFor(h), 'Neue Gruppe').run!()));
    const { groups } = h.snapshot();
    expect(groups).toMatchObject([{ name: 'api', tabIds: [api] }]);
    expect(paletteFor(h)[0].items.map((i) => i.label)).toEqual(['anna', 'api › api']);

    // Den ersten Tab über sein Menü in die Gruppe, dann über die Palette wieder heraus.
    const anna = h.tabs().find((t) => t.id === first)!;
    deliver(commandsOf(() => menuItem(tabMenuEntries(anna, groups, vi.fn()), 'In Gruppe „api“').run()));
    deliver(commandsOf(() => item(paletteFor(h), 'api › anna').run!()));
    expect(h.snapshot().groups[0].tabIds).toEqual([api, first]);
    deliver(commandsOf(() => item(paletteFor(h), 'Aus Gruppe nehmen').run!()));
    expect(h.tabs().map((t) => [t.name, t.groupId !== undefined])).toEqual([
      ['api', true],
      ['anna', false],
    ]);

    deliver(commandsOf(() => item(paletteFor(h), 'api › api').run!()));
    deliver(commandsOf(() => item(paletteFor(h), 'Gruppe auflösen').run!()));
    expect(h.snapshot().groups).toEqual([]);
  });
});

describe('Rechtsklick-Menü am Tab mit Gruppen', () => {
  it('ein einzelner Tab: „Neue Gruppe“ und „In Gruppe „…““ für jede Gruppe, flach im Menü', () => {
    expect(menuLabels(tabMenuEntries(TABS[4], [KUNDE, PRIVAT], vi.fn()))).toEqual([
      'Umbenennen',
      'Duplizieren',
      '—',
      'Neue Gruppe',
      'In Gruppe „Kunde X“',
      'In Gruppe „privat“',
      '—',
      'Ordner im Explorer öffnen',
      'Pfad kopieren',
      '—',
      'Schliessen',
      'Andere Tabs schliessen',
    ]);
    expect(commandsOf(() => menuItem(tabMenuEntries(TABS[4], [KUNDE, PRIVAT], vi.fn()), 'In Gruppe „privat“').run())).toEqual(
      [{ type: 'moveTabToGroup', tabId: 'n', groupId: 'p' }],
    );
  });

  it('ein Tab in einer Gruppe: die anderen Gruppen und „Aus Gruppe nehmen“, keine neue Gruppe', () => {
    const labels = menuLabels(tabMenuEntries(TABS[1], [KUNDE, PRIVAT], vi.fn()));
    expect(labels.slice(2, 6)).toEqual(['—', 'In Gruppe „privat“', 'Aus Gruppe nehmen', '—']);
    expect(labels).not.toContain('Neue Gruppe');
    expect(labels).not.toContain('In Gruppe „Kunde X“');
  });

  it('ohne Gruppen bleibt nur „Neue Gruppe“ dazu', () => {
    const labels = menuLabels(tabMenuEntries(TABS[0], [], vi.fn()));
    expect(labels.slice(2, 5)).toEqual(['—', 'Neue Gruppe', '—']);
  });
});

describe('Gruppen-Tab: Menü und Liste', () => {
  it('Menü am Gruppen-Tab: umbenennen, neues Terminal, auflösen, schliessen', () => {
    const entries = groupMenuEntries(KUNDE, vi.fn());
    expect(menuLabels(entries)).toEqual([
      'Gruppe umbenennen',
      'Neues Terminal in der Gruppe',
      '—',
      'Gruppe auflösen',
      'Gruppe schliessen',
    ]);
    expect(commandsOf(() => menuItem(entries, 'Neues Terminal in der Gruppe').run())).toEqual([
      { type: 'newTabInGroup', groupId: 'g' },
    ]);
    // Ob erst nachgefragt wird, entscheidet der Kern, wie bei „Andere Tabs schliessen“.
    expect(commandsOf(() => menuItem(entries, 'Gruppe schliessen').run())).toEqual([{ type: 'closeGroup', groupId: 'g' }]);
  });

  it('die Liste: die Tabs in der Reihenfolge der Gruppe, Haken beim gewählten, darunter „Neues Terminal“', () => {
    const entries = groupListEntries(KUNDE, TABS, 't', vi.fn());
    expect(entries.map((e) => (e.kind === 'item' ? [e.label, e.checked] : e.kind))).toEqual([
      ['api', true],
      ['web', false],
      ['db', false],
      'separator',
      ['Neues Terminal', undefined],
    ]);
    // Symbol wie am Tab: Status, sonst Typ.
    const web = menuItem(entries, 'web');
    expect(web.icon).toMatchObject({ props: { kind: 'claude', status: 'waiting' } });
    expect(commandsOf(() => menuItem(entries, 'Neues Terminal').run())).toEqual([{ type: 'newTabInGroup', groupId: 'g' }]);
  });

  it('ein Klick zeigt den Tab an; ist er schon angezeigt, bekommt nur sein Terminal den Fokus', () => {
    expect(commandsOf(() => menuItem(groupListEntries(KUNDE, TABS, 't', vi.fn()), 'db').run())).toEqual([
      { type: 'activateTab', tabId: 'd' },
    ]);
    const focus = vi.fn();
    terminalViews.set('a', { focus } as unknown as TerminalView);
    expect(commandsOf(() => menuItem(groupListEntries(KUNDE, TABS, 'a', vi.fn()), 'api').run())).toEqual([]);
    expect(focus).toHaveBeenCalled();
  });

  it('ein Rechtsklick auf einen Eintrag öffnet das Menü dieses Tabs an der Stelle des Klicks', () => {
    const onTabMenu = vi.fn();
    const entries = groupListEntries(KUNDE, TABS, 't', onTabMenu);
    menuItem(entries, 'web').context!({ x: 40, y: 80 });
    expect(onTabMenu).toHaveBeenCalledWith('w', { x: 40, y: 80 });
    expect(menuItem(entries, 'Neues Terminal').context).toBeUndefined();
  });
});

describe('Hinweise', () => {
  it('nennen einen Tab in einer Gruppe „Gruppenname › Tabname“, einen einzelnen Tab mit seinem Namen', () => {
    expect(tabLabel(TABS[2], [KUNDE])).toBe('Kunde X › web');
    expect(tabLabel(TABS[4], [KUNDE])).toBe('notes');
    // Kommt die Gruppe (noch) nicht mit, bleibt der Name des Tabs.
    expect(tabLabel(TABS[2], [])).toBe('web');
  });
});
