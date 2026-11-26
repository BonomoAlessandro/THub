// Wie die Oberfläche einen Tab nennt, der in einer Gruppe steht (Ticket 36). Ohne DOM, damit es sich prüfen lässt.

import type { GroupSnapshot, TabSnapshot } from '../../shared/types';

/** Name eines Tabs mit seiner Gruppe davor: „Gruppenname › Tabname“; ohne Gruppe nur der Name. */
export function groupedName(groupName: string | undefined, tabName: string): string {
  return groupName ? `${groupName} › ${tabName}` : tabName;
}

/**
 * Wie Befehlspalette und Hinweise einen Tab nennen: in einer Gruppe „Gruppenname › Tabname“, sonst sein Name. So trifft
 * die Suche der Palette auch den Namen der Gruppe.
 */
export function tabLabel(
  tab: Pick<TabSnapshot, 'name' | 'groupId'>,
  groups: readonly Pick<GroupSnapshot, 'id' | 'name'>[],
): string {
  const group = tab.groupId === undefined ? undefined : groups.find((g) => g.id === tab.groupId);
  return groupedName(group?.name, tab.name);
}
