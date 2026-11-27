import { describe, expect, it } from 'vitest';
import { entryBoundary, gatherGroups, groupDisplay } from '../../src/main/workspace/groups';
import { barEntries } from '../../src/shared/barEntries';
import type { TabStatus } from '../../src/shared/types';

// Reine Regeln der Tab-Gruppen (Tickets 36 und 40): Status und Punkt des Gruppen-Tabs, Einträge der Leiste und Stellen
// in der Liste.

/** Alle Status, die ein Tab zeigen kann. */
const ALL: readonly TabStatus[] = ['paused', 'waiting', 'working', 'finished', 'processes', 'idle'];

describe('Status und Punkt einer Gruppe (Ticket 40)', () => {
  it('der Status ist genau der des gewählten Tabs, was auch immer die anderen zeigen', () => {
    for (const selected of ALL) {
      expect(groupDisplay(selected, []).status).toBe(selected);
      expect(groupDisplay(selected, ['idle']).status).toBe(selected);
      // Auch neben jedem anderen Status, also nie mehr der dringendste der Gruppe.
      for (const other of ALL) expect(groupDisplay(selected, [other, 'idle']).status).toBe(selected);
    }
  });

  it('der gewählte Tab ruht, ein anderer wartet: Status ruht (Ordner-Symbol), Punkt orange', () => {
    expect(groupDisplay('idle', ['waiting'])).toEqual({ status: 'idle', dot: 'waiting' });
    expect(groupDisplay('idle', ['idle', 'waiting', 'processes'])).toEqual({ status: 'idle', dot: 'waiting' });
  });

  it('ein anderer ist fertig: Punkt grün; einer wartet und einer ist fertig: orange', () => {
    expect(groupDisplay('idle', ['finished'])).toEqual({ status: 'idle', dot: 'finished' });
    expect(groupDisplay('working', ['idle', 'finished'])).toEqual({ status: 'working', dot: 'finished' });
    // Orange geht vor, in welcher Reihenfolge die Tabs auch stehen.
    expect(groupDisplay('idle', ['waiting', 'finished'])).toEqual({ status: 'idle', dot: 'waiting' });
    expect(groupDisplay('idle', ['finished', 'waiting'])).toEqual({ status: 'idle', dot: 'waiting' });
  });

  it('der gewählte Tab wartet, ein anderer ist fertig: Status wartet, Punkt grün', () => {
    expect(groupDisplay('waiting', ['finished'])).toEqual({ status: 'waiting', dot: 'finished' });
  });

  it('der Punkt gilt nur den anderen Tabs: Wartet oder ist nur der gewählte fertig, gibt es keinen', () => {
    expect(groupDisplay('waiting', ['idle', 'working'])).toEqual({ status: 'waiting', dot: 'none' });
    expect(groupDisplay('finished', ['idle'])).toEqual({ status: 'finished', dot: 'none' });
  });

  it('andere Tabs arbeiten, haben Prozesse oder sind pausiert: kein Punkt', () => {
    for (const other of ['working', 'processes', 'paused', 'idle'] satisfies TabStatus[]) {
      expect(groupDisplay('idle', [other]).dot).toBe('none');
    }
    expect(groupDisplay('finished', ['working', 'processes', 'paused', 'idle']).dot).toBe('none');
  });

  it('eine Gruppe mit einem einzigen Tab hat nie einen Punkt', () => {
    for (const selected of ALL) expect(groupDisplay(selected, [])).toEqual({ status: selected, dot: 'none' });
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
