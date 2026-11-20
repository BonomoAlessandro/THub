import type { RecentDir } from '../../shared/types';
import { FolderIcon, FolderPlusIcon } from '../icons';
import type { MenuEntry } from '../popup/Menu';

const api = window.thub;

/**
 * Einträge des Pfeil-Menüs neben `+`, wie im Prototyp: „Neues Terminal in …“ mit den zuletzt benutzten
 * Ordnern (Name, darunter klein der Pfad) und „Ordner wählen …“. Der Abschnitt „Shell“ mit den erkannten
 * Shells kommt mit Ticket 06 davor, gefolgt von einer Trennlinie.
 */
export function newTabMenuEntries(recentDirs: RecentDir[]): MenuEntry[] {
  return [
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

/** Öffnet den Ordner-Dialog von Windows; der gewählte Ordner bekommt ein neues Terminal. */
async function pickFolderForNewTab(): Promise<void> {
  const dir = await api.pickDirectory('newTab');
  if (dir) api.send({ type: 'createTab', cwd: dir });
}
