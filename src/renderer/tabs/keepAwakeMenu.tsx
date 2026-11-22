import type { KeepAwakeMode } from '../../shared/types';
import { keepAwake } from '../commands';
import { CoffeeIcon, MonitorIcon } from '../icons';
import type { MenuEntry } from '../popup/Menu';

/** Die beiden Stufen beim Wachhalten (Ticket 28), in der Reihenfolge des Pfeil-Menüs und der Befehlspalette. */
export const KEEP_AWAKE_MODES: readonly { mode: KeepAwakeMode; label: string }[] = [
  { mode: 'system', label: 'Nur Rechner wach halten' },
  { mode: 'display', label: 'Rechner und Bildschirm wach halten' },
];

/** Symbol einer Stufe: Kaffeetasse für „nur Rechner“, Bildschirm für „Rechner und Bildschirm“. */
export function KeepAwakeModeIcon({ mode }: { mode: KeepAwakeMode }) {
  return mode === 'display' ? <MonitorIcon /> : <CoffeeIcon />;
}

/**
 * Einträge des Pfeil-Menüs neben dem Schalter: die beiden Stufen, je mit Symbol; die gewählte hat ein Häkchen, auch
 * ausgeschaltet. Eine Wahl setzt die Stufe und schaltet ein; die schon laufende noch einmal zu wählen, ändert nichts.
 */
export function keepAwakeMenuEntries(mode: KeepAwakeMode): MenuEntry[] {
  return KEEP_AWAKE_MODES.map(
    (entry): MenuEntry => ({
      kind: 'item',
      label: entry.label,
      icon: <KeepAwakeModeIcon mode={entry.mode} />,
      checked: entry.mode === mode,
      run: () => keepAwake(entry.mode),
    }),
  );
}

/** Tooltip des Schalters: ob er an ist und mit welcher Stufe. */
export function keepAwakeTooltip(on: boolean, mode: KeepAwakeMode): string {
  if (!on) return 'Rechner wach halten: aus';
  return mode === 'display' ? 'Rechner und Bildschirm wach halten: an' : 'Rechner wach halten: an';
}
