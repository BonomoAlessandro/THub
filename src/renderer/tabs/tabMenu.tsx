import type { TabSnapshot } from '../../shared/types';
import { closeOtherTabs, closeTab } from '../commands';
import { CloseIcon, CloseOthersIcon, CopyIcon, DuplicateIcon, FolderOpenIcon, PencilIcon } from '../icons';
import type { MenuEntry } from '../popup/Menu';
import { shortcutHint } from '../shortcuts';

const api = window.thub;

/**
 * Einträge des Rechtsklick-Menüs am Tab, wie im Prototyp. Ordner und Pfad sind der aktuelle Ordner des Tabs, wie im
 * Tooltip. Schliessen und „Andere Tabs schliessen“ wirken wie über Tastenkürzel und Palette; ob sie erst nachfragen,
 * entscheidet der Kern. Kein Claude-Eintrag.
 * @param onRename startet das Umbenennen des Tabs, wie Doppelklick oder F2
 */
export function tabMenuEntries(tab: TabSnapshot, onRename: () => void): MenuEntry[] {
  return [
    { kind: 'item', label: 'Umbenennen', icon: <PencilIcon />, kbd: shortcutHint('renameTab'), run: onRename },
    {
      kind: 'item',
      label: 'Duplizieren',
      icon: <DuplicateIcon />,
      run: () => api.send({ type: 'duplicateTab', tabId: tab.id }),
    },
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
