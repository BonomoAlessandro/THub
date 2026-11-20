import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { menuKey } from './menuKeys';
import { usePopupOpen } from './popups';

/** Ein Eintrag im Menü: Überschrift eines Abschnitts, Trennlinie oder wählbarer Eintrag. */
export type MenuEntry =
  | { kind: 'header'; label: string }
  | { kind: 'separator' }
  | {
      kind: 'item';
      label: string;
      /** Zweite, kleinere Zeile, z.B. der volle Pfad eines Ordners. */
      sub?: string;
      icon?: ReactNode;
      run(): void;
    };

type MenuItem = Extract<MenuEntry, { kind: 'item' }>;

/** Abstand des Menüs zum Fensterrand und zum Element darüber. */
const MARGIN = 6;
const GAP = 4;

interface MenuProps {
  /** Name des Menüs für Screenreader. */
  label: string;
  entries: MenuEntry[];
  /** Element, unter dem das Menü aufgeht. Ein Klick darauf schliesst das Menü nicht; das regelt das Element selbst. */
  anchor: HTMLElement;
  /** Den ersten Eintrag gleich hervorheben, etwa wenn das Menü per Tastatur geöffnet wurde. */
  highlightFirst?: boolean;
  /** Das Menü schliesst sich (Escape, Klick daneben, Fenster verliert den Fokus, Eintrag gewählt). */
  onClose(): void;
}

/**
 * Menü wie im Prototyp, unter einem Element. Bedienung mit der Maus oder mit Pfeiltasten, Enter und Escape.
 * Das Menü hält den Fokus, solange es offen ist; danach gibt `onClose` ihn zurück. Ein gewählter Eintrag
 * läuft erst, nachdem sich das Menü geschlossen hat.
 */
export function Menu({ label, entries, anchor, highlightFirst = false, onClose }: MenuProps) {
  usePopupOpen();
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  const items = entries.filter((e): e is MenuItem => e.kind === 'item');
  const [highlighted, setHighlighted] = useState(highlightFirst && items.length > 0 ? 0 : -1);

  // Für die Handler am Fenster: immer der zuletzt angezeigte Stand.
  const current = useRef({ highlighted, items, onClose });
  current.current = { highlighted, items, onClose };

  const choose = (item: MenuItem) => {
    current.current.onClose();
    item.run();
  };

  // Unter dem Element aufgehen, im Fenster gehalten; dann den Fokus übernehmen, damit Tasten nicht ins Terminal gehen.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const a = anchor.getBoundingClientRect();
    const top = clamp(a.bottom + GAP, MARGIN, window.innerHeight - el.offsetHeight - MARGIN);
    el.style.left = `${clamp(a.left, MARGIN, rightLimit(top) - el.offsetWidth)}px`;
    el.style.top = `${top}px`;
    el.focus({ preventScroll: true });
  }, [anchor]);

  // Tasten in der Capture-Phase, vor xterm.js; Klick daneben, Fokusverlust und Grössenänderung schliessen.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const { highlighted: h, items: list } = current.current;
      const action = menuKey(e.key, h, list.length);
      if (!action) return;
      e.preventDefault();
      e.stopPropagation();
      if (action.type === 'highlight') setHighlighted(action.index);
      else if (action.type === 'choose') choose(list[action.index]);
      else current.current.onClose();
    };
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!ref.current?.contains(target) && !anchor.contains(target)) current.current.onClose();
    };
    const close = () => current.current.onClose();
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('mousedown', onMouseDown, true);
    window.addEventListener('blur', close);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('mousedown', onMouseDown, true);
      window.removeEventListener('blur', close);
      window.removeEventListener('resize', close);
    };
    // `choose` liest nur aus `current` und braucht deshalb keine Abhängigkeit.
  }, [anchor]);

  const itemId = (index: number) => `${id}-${index}`;
  let index = -1;

  return createPortal(
    <div
      ref={ref}
      className="menu"
      role="menu"
      aria-label={label}
      tabIndex={-1}
      aria-activedescendant={highlighted >= 0 ? itemId(highlighted) : undefined}
      // Klicks ins Menü lassen den Fokus beim Menü.
      onMouseDown={(e) => e.preventDefault()}
    >
      {entries.map((entry, i) => {
        if (entry.kind === 'header') {
          return (
            <div key={i} className="menu-h" role="presentation">
              {entry.label}
            </div>
          );
        }
        if (entry.kind === 'separator') return <div key={i} className="menu-sep" role="separator" />;
        const own = ++index;
        return (
          <button
            key={i}
            id={itemId(own)}
            type="button"
            role="menuitem"
            tabIndex={-1}
            className={own === highlighted ? 'mi focus' : 'mi'}
            onMouseMove={() => setHighlighted(own)}
            onClick={() => choose(entry)}
          >
            <span className="mi-ic">{entry.icon}</span>
            <span className="mi-label">
              {entry.label}
              {entry.sub && <small>{entry.sub}</small>}
            </span>
          </button>
        );
      })}
    </div>,
    document.body,
  );
}

/** Die nativen Fensterknöpfe als Overlay über der Seite (Window Controls Overlay), soweit hier gebraucht. */
interface ControlsOverlay {
  visible: boolean;
  /** Die Titelleiste links der Fensterknöpfe. */
  getTitlebarAreaRect(): DOMRect;
}

/**
 * Wie weit rechts das Menü reichen darf. Beginnt es noch in der Höhe der Titelleiste, endet es links der
 * nativen Fensterknöpfe; die lägen sonst über seiner oberen Kante.
 */
function rightLimit(top: number): number {
  const limit = window.innerWidth - MARGIN;
  const overlay = (navigator as Navigator & { windowControlsOverlay?: ControlsOverlay }).windowControlsOverlay;
  if (!overlay?.visible) return limit;
  const area = overlay.getTitlebarAreaRect();
  return top < area.bottom ? Math.min(limit, area.right - MARGIN) : limit;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}
