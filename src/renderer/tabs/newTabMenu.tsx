import type { RecentDir, ShellOption } from '../../shared/types';
import { pickFolderForNewTab } from '../commands';
import { FolderIcon, FolderPlusIcon, TerminalIcon } from '../icons';
import type { MenuEntry } from '../popup/Menu';

const api = window.thub;

/**
 * Einträge des Pfeil-Menüs neben `+`, wie im Prototyp: zuerst „Shell“ mit den erkannten Shells (die
 * Standard-Shell mit dem Etikett „Standard“), ein Klick öffnet einen Tab mit dieser Shell im Standardordner;
 * nach einer Trennlinie „Neues Terminal in …“ mit den zuletzt benutzten Ordnern (Name, darunter klein der
 * Pfad) und „Ordner wählen …“.
 */
export function newTabMenuEntries(shells: ShellOption[], defaultShellId: string, recentDirs: RecentDir[]): MenuEntry[] {
  return [
    { kind: 'header', label: 'Shell' },
    ...shells.map(
      (shell): MenuEntry => ({
        kind: 'item',
        label: shell.name,
        icon: <TerminalIcon />,
        badge: shell.id === defaultShellId ? 'Standard' : undefined,
        run: () => api.send({ type: 'createTab', shellId: shell.id }),
      }),
    ),
    { kind: 'separator' },
    { kind: 'header', label: 'Neues Terminal in …' },
    ...recentDirs.map(
      (dir): MenuEntry => ({
        kind: 'item',
        label: dir.name,
        sub: dir.path,
        icon: <FolderIcon />,
        run: () => api.send({ type: 'createTab', cwd: dir.path }),
      }),
    ),
    { kind: 'item', label: 'Ordner wählen …', icon: <FolderPlusIcon />, run: () => void pickFolderForNewTab() },
  ];
}
