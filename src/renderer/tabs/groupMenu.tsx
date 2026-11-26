import type { GroupSnapshot, TabSnapshot } from '../../shared/types';
import { dissolveGroup, newTabInGroup, showTab } from '../commands';
import { CloseIcon, PencilIcon, PlusIcon, UngroupIcon } from '../icons';
import type { MenuEntry, MenuPoint } from '../popup/Menu';
import { TabIcon } from './TabIcon';

const api = window.thub;

/**
 * Die Liste einer Gruppe (Ticket 36), ein Menü unter dem Gruppen-Tab: pro Tab ein Eintrag in der Reihenfolge der Gruppe
 * mit Status- oder Typ-Symbol wie am Tab, Name und einem Haken beim gewählten Tab; darunter „Neues Terminal“. Ein Klick
 * zeigt den Tab an, und er wird der gewählte Tab der Gruppe. Ein Rechtsklick öffnet das Menü dieses Tabs.
 * @param onTabMenu öffnet das Rechtsklick-Menü des Tabs an dieser Stelle
 */
export function groupListEntries(
  group: GroupSnapshot,
  tabs: readonly TabSnapshot[],
  activeTabId: string | null,
  onTabMenu: (tabId: string, at: MenuPoint) => void,
): MenuEntry[] {
  const members = group.tabIds
    .map((id) => tabs.find((t) => t.id === id))
    .filter((tab): tab is TabSnapshot => tab !== undefined);
  return [
    ...members.map(
      (tab): MenuEntry => ({
        kind: 'item',
        label: tab.name,
        icon: <TabIcon kind={tab.kind} status={tab.status} />,
        checked: tab.id === group.selectedTabId,
        run: () => showTab(tab.id, activeTabId),
        context: (at) => onTabMenu(tab.id, at),
      }),
    ),
    { kind: 'separator' },
    { kind: 'item', label: 'Neues Terminal', icon: <PlusIcon />, run: () => newTabInGroup(group.id) },
  ];
}

/**
 * Rechtsklick-Menü am Gruppen-Tab (Ticket 36): umbenennen, neues Terminal in der Gruppe, auflösen und schliessen. Ob
 * „Gruppe schliessen“ erst nachfragt, entscheidet der Kern, wie bei „Andere Tabs schliessen“.
 * @param onRename startet das Umbenennen der Gruppe, wie ein Doppelklick auf den Gruppen-Tab
 */
export function groupMenuEntries(group: GroupSnapshot, onRename: () => void): MenuEntry[] {
  return [
    { kind: 'item', label: 'Gruppe umbenennen', icon: <PencilIcon />, run: onRename },
    { kind: 'item', label: 'Neues Terminal in der Gruppe', icon: <PlusIcon />, run: () => newTabInGroup(group.id) },
    { kind: 'separator' },
    { kind: 'item', label: 'Gruppe auflösen', icon: <UngroupIcon />, run: () => dissolveGroup(group.id) },
    {
      kind: 'item',
      label: 'Gruppe schliessen',
      icon: <CloseIcon />,
      run: () => api.send({ type: 'closeGroup', groupId: group.id }),
    },
  ];
}
