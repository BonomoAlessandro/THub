// Einträge der Tab-Leiste (Ticket 36): einzelne Tabs und Gruppen. Eine Gruppe ist ein einziger Eintrag an der Stelle
// ihres ersten Tabs. Kern und Oberfläche leiten die Einträge auf dieselbe Weise aus der geordneten Liste der Tabs ab.

/** Ein Eintrag der Leiste: ein einzelner Tab oder eine Gruppe mit ihren Tabs in ihrer Reihenfolge. */
export type BarEntry<T> = { kind: 'tab'; tab: T } | { kind: 'group'; groupId: string; tabs: T[] };

/**
 * Die Einträge der Leiste in ihrer Reihenfolge. Die Tabs einer Gruppe stehen in der Liste zusammen; stünden sie doch
 * verstreut, gehören alle zum Eintrag an der Stelle des ersten.
 */
export function barEntries<T extends { groupId?: string }>(tabs: readonly T[]): BarEntry<T>[] {
  const entries: BarEntry<T>[] = [];
  const groups = new Map<string, T[]>();
  for (const tab of tabs) {
    if (!tab.groupId) {
      entries.push({ kind: 'tab', tab });
      continue;
    }
    const members = groups.get(tab.groupId);
    if (members) {
      members.push(tab);
      continue;
    }
    const first = [tab];
    groups.set(tab.groupId, first);
    entries.push({ kind: 'group', groupId: tab.groupId, tabs: first });
  }
  return entries;
}

/** Die Tabs eines Eintrags: der einzelne Tab bzw. die Tabs der Gruppe. */
export function entryTabs<T>(entry: BarEntry<T>): T[] {
  return entry.kind === 'tab' ? [entry.tab] : entry.tabs;
}
