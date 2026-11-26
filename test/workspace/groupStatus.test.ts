import { describe, expect, it } from 'vitest';
import { entryBoundary, gatherGroups, GROUP_STATUS_ORDER, groupStatus } from '../../src/main/workspace/groups';
import { barEntries } from '../../src/shared/barEntries';
import type { TabStatus } from '../../src/shared/types';

// Reine Regeln der Tab-Gruppen (Ticket 36): Status des Gruppen-Tabs, Einträge der Leiste und Stellen in der Liste.

describe('Status einer Gruppe', () => {
  it('ohne Tabs mit Status ruht sie: gedämpft das Ordner-Symbol', () => {
    expect(groupStatus([])).toBe('idle');
    expect(groupStatus(['idle', 'idle'])).toBe('idle');
  });

  it('jeder Status eines einzelnen Tabs gilt auch für die Gruppe', () => {
    for (const status of ['waiting', 'finished', 'working', 'processes', 'paused'] satisfies TabStatus[]) {
      expect(groupStatus(['idle', status, 'idle'])).toBe(status);
    }
  });

  it('der dringendste zählt, in der Reihenfolge wartet, fertig, arbeitet, Prozesse, pausiert', () => {
    expect(GROUP_STATUS_ORDER).toEqual(['waiting', 'finished', 'working', 'processes', 'paused']);
    // Jede Stufe schlägt alle, die nach ihr kommen, egal in welcher Reihenfolge die Tabs stehen.
    for (const [rank, status] of GROUP_STATUS_ORDER.entries()) {
      const lower = GROUP_STATUS_ORDER.slice(rank + 1);
      expect(groupStatus([...lower, status, 'idle'])).toBe(status);
      expect(groupStatus(['idle' as TabStatus, status, ...lower].reverse())).toBe(status);
    }
  });

  it('Beispiele aus dem Alltag', () => {
    // Claude wartet in einem verborgenen Tab, in einem anderen ist es fertig: Das Warten geht vor.
    expect(groupStatus(['finished', 'waiting'])).toBe('waiting');
    // Fertige Arbeit geht vor laufender, damit sie nicht übersehen wird.
    expect(groupStatus(['working', 'finished'])).toBe('finished');
    expect(groupStatus(['processes', 'working'])).toBe('working');
    expect(groupStatus(['paused', 'processes'])).toBe('processes');
    expect(groupStatus(['paused', 'idle'])).toBe('paused');
  });
});

describe('Einträge der Leiste', () => {
  const tab = (id: string, groupId?: string) => ({ id, ...(groupId ? { groupId } : {}) });

  it('einzelne Tabs und Gruppen an der Stelle ihres ersten Tabs', () => {
    const entries = barEntries([tab('a'), tab('b', 'g'), tab('c', 'g'), tab('d')]);
    expect(entries).toEqual([
      { kind: 'tab', tab: tab('a') },
      { kind: 'group', groupId: 'g', tabs: [tab('b', 'g'), tab('c', 'g')] },
      { kind: 'tab', tab: tab('d') },
    ]);
  });

  it('verstreute Tabs einer Gruppe rücken an die Stelle des ersten, in ihrer Reihenfolge', () => {
    const tabs = [tab('a', 'g'), tab('x'), tab('b', 'h'), tab('c', 'g'), tab('d', 'h')];
    expect(gatherGroups(tabs).map((t) => t.id)).toEqual(['a', 'c', 'x', 'b', 'd']);
  });

  it('ein Eintrag kommt nie mitten in eine Gruppe; ausserhalb der Liste gilt das nächste Ende', () => {
    const tabs = [tab('a'), tab('b', 'g'), tab('c', 'g'), tab('d')];
    expect(entryBoundary(tabs, 0)).toBe(0);
    expect(entryBoundary(tabs, 1)).toBe(1);
    expect(entryBoundary(tabs, 2)).toBe(3);
    expect(entryBoundary(tabs, 3)).toBe(3);
    expect(entryBoundary(tabs, 4)).toBe(4);
    expect(entryBoundary(tabs, 9)).toBe(4);
    expect(entryBoundary(tabs, -2)).toBe(0);
    // Zwei Gruppen nebeneinander: zwischen ihnen ist eine Grenze.
    expect(entryBoundary([tab('b', 'g'), tab('c', 'h'), tab('d', 'h')], 1)).toBe(1);
  });
});
