// Wo und wie das Fenster beim Start öffnet (Ticket 09). Reine Rechnung auf den Bildschirmen, die der
// Port „System“ liefert; der Kern ruft sie auf, Electron kennt sie nicht.

import type { DisplayInfo, Rect } from './ports';
import type { WindowState } from './schema';

/** Normale Grösse beim ersten Start; das Fenster öffnet dann maximiert darüber. */
const DEFAULT_SIZE = { width: 1200, height: 760 };
/** Oberster Streifen des Fensters, an dem es sich greifen und verschieben lässt (Titelleiste). */
const TITLE_BAR_HEIGHT = 32;
/** So viel der Titelleiste muss im Arbeitsbereich eines Bildschirms liegen, damit das Fenster als sichtbar gilt. */
const MIN_VISIBLE_TITLE_BAR = { width: 100, height: 16 };

/**
 * Fensterangaben für den Start:
 * - Ohne gespeicherte Angaben maximiert auf dem Hauptbildschirm; darunter liegt die Standardgrösse
 *   zentriert, damit „Wiederherstellen“ eine sinnvolle Grösse hat.
 * - Gespeicherte Angaben gelten unverändert, solange die Titelleiste auf einem Bildschirm greifbar ist.
 * - Sonst (etwa nach dem Abziehen eines Monitors) zentriert auf dem Hauptbildschirm, in der gespeicherten
 *   Grösse, höchstens aber so gross wie dessen Arbeitsbereich. Der Maximiert-Zustand bleibt.
 */
export function placeWindow(saved: WindowState | undefined, displays: DisplayInfo[]): WindowState {
  if (saved && displays.some((d) => titleBarVisible(saved.bounds, d.workArea))) return structuredClone(saved);

  const primary = displays.find((d) => d.primary) ?? displays[0];
  const size = saved ? { width: saved.bounds.width, height: saved.bounds.height } : DEFAULT_SIZE;
  return {
    bounds: primary ? centreIn(primary.workArea, size) : { x: 0, y: 0, ...size },
    maximized: saved ? saved.maximized : true,
  };
}

/** Ob ein greifbares Stück der Titelleiste im Bereich liegt. */
function titleBarVisible(window: Rect, area: Rect): boolean {
  const titleBar: Rect = { ...window, height: Math.min(TITLE_BAR_HEIGHT, window.height) };
  const overlapWidth =
    Math.min(titleBar.x + titleBar.width, area.x + area.width) - Math.max(titleBar.x, area.x);
  const overlapHeight =
    Math.min(titleBar.y + titleBar.height, area.y + area.height) - Math.max(titleBar.y, area.y);
  return overlapWidth >= MIN_VISIBLE_TITLE_BAR.width && overlapHeight >= MIN_VISIBLE_TITLE_BAR.height;
}

/** Zentriert eine Grösse im Bereich; was grösser ist als der Bereich, wird auf ihn verkleinert. */
function centreIn(area: Rect, size: { width: number; height: number }): Rect {
  const width = Math.min(size.width, area.width);
  const height = Math.min(size.height, area.height);
  return {
    x: area.x + Math.floor((area.width - width) / 2),
    y: area.y + Math.floor((area.height - height) / 2),
    width,
    height,
  };
}
