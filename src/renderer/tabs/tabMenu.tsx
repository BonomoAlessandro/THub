import type { GroupSnapshot, TabSnapshot } from '../../shared/types';
import { closeOtherTabs, closeTab, createGroup, removeFromGroup } from '../commands';
import {
  CloseIcon,
  CloseOthersIcon,
  CopyIcon,
  DuplicateIcon,
  FolderInputIcon,
  FolderOpenIcon,
  FolderOutputIcon,
  FolderPlusIcon,
  PencilIcon,
} from '../icons';
import type { MenuEntry } from '../popup/Menu';
import { shortcutHint } from '../shortcuts';

const api = window.thub;

/**
 * Einträge des Rechtsklick-Menüs am Tab, wie im Prototyp. Ordner und Pfad sind der aktuelle Ordner des Tabs, wie im
 * Tooltip. Schliessen und „Andere Tabs schliessen“ wirken wie über Tastenkürzel und Palette; ob sie erst nachfragen,
 * entscheidet der Kern. Kein Claude-Eintrag.
 *
 * Gruppen (Ticket 36): „Neue Gruppe“ bei einem einzelnen Tab, „In Gruppe „…““ für jede andere Gruppe (flach, das Menü
 * kennt keine Untermenüs) und „Aus Gruppe nehmen“ bei einem Tab in einer Gruppe. Dasselbe Menü öffnet ein Rechtsklick
 * auf einen Tab in der Liste einer Gruppe.
 * @param groups alle Gruppen, in der Reihenfolge der Leiste
 * @param onRename startet das Umbenennen des Tabs, wie Doppelklick oder F2
 */
export function tabMenuEntries(tab: TabSnapshot, groups: readonly GroupSnapshot[], onRename: () => void): MenuEntry[] {
  return [
    { kind: 'item', label: 'Umbenennen', icon: <PencilIcon />, kbd: shortcutHint('renameTab'), run: onRename },
    {
      kind: 'item',
      label: 'Duplizieren',
      icon: <DuplicateIcon />,
      run: () => api.send({ type: 'duplicateTab', tabId: tab.id }),
    },
    { kind: 'separator' },
    ...groupEntries(tab, groups),
    { kind: 'separator' },
    {
      kind: 'item',
      label: 'Ordner im Explorer öffnen',
      icon: <FolderOpenIcon />,
      run: () => void api.openTabFolder(tab.id),
    },
    { kind: 'item', label: 'Pfad kopieren', icon: <CopyIcon />, run: () => void api.writeClipboard(tab.cwd) },
    { kind: 'separator' },
    {
      kind: 'item',
      label: 'Schliessen',
      icon: <CloseIcon />,
      kbd: shortcutHint('closeTab'),
      run: () => closeTab(tab.id),
    },
    {
      kind: 'item',
      label: 'Andere Tabs schliessen',
      icon: <CloseOthersIcon />,
      run: () => closeOtherTabs(tab.id),
    },
  ];
}

/** Die Einträge zu Gruppen: neue Gruppe, in eine andere Gruppe, aus der Gruppe. */
function groupEntries(tab: TabSnapshot, groups: readonly GroupSnapshot[]): MenuEntry[] {
  const entries: MenuEntry[] = [];
  // Gruppen in Gruppen gibt es nicht: Eine neue Gruppe entsteht nur aus einem einzelnen Tab.
  if (tab.groupId === undefined) {
    entries.push({ kind: 'item', label: 'Neue Gruppe', icon: <FolderPlusIcon />, run: () => createGroup(tab.id) });
  }
  for (const group of groups) {
    if (group.id === tab.groupId) continue;
    entries.push({
      kind: 'item',
      label: `In Gruppe „${group.name}“`,
      icon: <FolderInputIcon />,
      run: () => api.send({ type: 'moveTabToGroup', tabId: tab.id, groupId: group.id }),
    });
  }
  if (tab.groupId !== undefined) {
    entries.push({
      kind: 'item',
      label: 'Aus Gruppe nehmen',
      icon: <FolderOutputIcon />,
      run: () => removeFromGroup(tab.id),
    });
  }
  return entries;
}
