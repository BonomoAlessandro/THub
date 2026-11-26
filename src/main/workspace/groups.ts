// Tab-Gruppen (Ticket 36): reine Regeln ohne Ports. Was mit Gruppen geschieht (anlegen, verschieben, schliessen,
// wieder öffnen), regelt der Kern in `workspace.ts`; hier stehen die Rechnungen, die er dafür braucht.

import { barEntries, entryTabs } from '../../shared/barEntries';
import type { TabStatus } from '../../shared/types';

/**
 * Reihenfolge, in der der Gruppen-Tab den Status seiner Tabs zeigt, dringendster zuerst: Wer auf dich wartet, geht vor
 * fertiger, noch nicht angeschauter Arbeit, die vor laufender, laufende Prozesse vor einer pausierten Session.
 */
export const GROUP_STATUS_ORDER: readonly TabStatus[] = ['waiting', 'finished', 'working', 'processes', 'paused'];

/**
 * Der Status einer Gruppe: der dringendste Status ihrer Tabs nach `GROUP_STATUS_ORDER`, sonst `idle` (der Gruppen-Tab
 * zeigt dann gedämpft das Ordner-Symbol).
 */
export function groupStatus(statuses: readonly TabStatus[]): TabStatus {
  return GROUP_STATUS_ORDER.find((status) => statuses.includes(status)) ?? 'idle';
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
