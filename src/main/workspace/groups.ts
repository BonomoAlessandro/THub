// Tab-Gruppen (Ticket 36): reine Regeln ohne Ports. Was mit Gruppen geschieht (anlegen, verschieben, schliessen,
// wieder öffnen), regelt der Kern in `workspace.ts`; hier stehen die Rechnungen, die er dafür braucht.

import { barEntries, entryTabs } from '../../shared/barEntries';
import type { GroupDot, TabStatus } from '../../shared/types';

/** Was der Gruppen-Tab zeigt (Ticket 40): das Status-Symbol und den Punkt am Pfeil. */
export interface GroupDisplay {
  status: TabStatus;
  dot: GroupDot;
}

/**
 * Status und Punkt einer Gruppe (Ticket 40, ersetzt den dringendsten Status aus Ticket 36). Das Symbol zeigt genau den
 * Status des gewählten Tabs, wie an einem Tab; ruht er, zeigt der Gruppen-Tab gedämpft das Ordner-Symbol. Den Punkt am
 * Pfeil bestimmen nur die anderen Tabs: orange, wenn einer davon auf dich wartet, sonst grün, wenn einer fertig ist.
 * Arbeitet, Prozesse laufen und pausiert ergeben keinen Punkt; eine Gruppe mit einem einzigen Tab hat nie einen.
 * @param selected der angezeigte Status des gewählten Tabs
 * @param others die angezeigten Status der übrigen Tabs der Gruppe, in beliebiger Reihenfolge
 */
export function groupDisplay(selected: TabStatus, others: readonly TabStatus[]): GroupDisplay {
  let dot: GroupDot = 'none';
  if (others.includes('waiting')) dot = 'waiting';
  else if (others.includes('finished')) dot = 'finished';
  return { status: selected, dot };
}

/**
 * Die Tabs so geordnet, dass die Tabs jeder Gruppe zusammenstehen: Verstreute Tabs einer Gruppe rücken an die Stelle
 * des ersten, in ihrer Reihenfolge; alles andere bleibt, wie es ist.
 */
export function gatherGroups<T extends { groupId?: string }>(tabs: readonly T[]): T[] {
  return barEntries(tabs).flatMap(entryTabs);
}

/**
 * Wohin ein Eintrag (ein einzelner Tab oder eine neue Gruppe) an Position `index` der Liste eingefügt werden kann, ohne
 * eine Gruppe zu teilen: Läge die Stelle mitten in den Tabs einer Gruppe, rückt sie hinter die Gruppe. Ausserhalb der
 * Liste gilt das nächste Ende.
 */
export function entryBoundary<T extends { groupId?: string }>(tabs: readonly T[], index: number): number {
  let at = Math.max(0, Math.min(index, tabs.length));
  const before = tabs[at - 1]?.groupId;
  if (!before) return at;
  while (tabs[at]?.groupId === before) at++;
  return at;
}
