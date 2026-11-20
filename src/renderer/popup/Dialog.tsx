import { useEffect, useId, useLayoutEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { usePopupOpen } from './popups';

/** Was sich in einem Dialog mit Tab erreichen lässt. */
const FOCUSABLE = 'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])';

interface DialogProps {
  title: string;
  /** Breitere Form, z.B. für die Einstellungen. */
  wide?: boolean;
  children: ReactNode;
  /** Knöpfe in der Fusszeile. Den Fokus bekommt der mit `data-autofocus`, sonst der letzte. */
  actions: ReactNode;
  /** Escape, Klick auf den abgedunkelten Hintergrund oder ein Knopf schliesst den Dialog. */
  onClose(): void;
}

/**
 * Dialog wie im Prototyp: deckende Karte über abgedunkeltem Fenster, Titel, Inhalt, Knöpfe unten rechts.
 * Escape schliesst ihn; Tab bleibt im Dialog. Den Fokus gibt danach `onClose` zurück.
 */
export function Dialog({ title, wide = false, children, actions, onClose }: DialogProps) {
  usePopupOpen();
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useLayoutEffect(() => {
    const el = ref.current;
    const target =
      el?.querySelector<HTMLElement>('[data-autofocus]') ?? el?.querySelector<HTMLElement>('.dlg-actions button:last-child');
    target?.focus();
  }, []);

  // In der Capture-Phase, vor den Tastenkürzeln der App und vor xterm.js.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeRef.current();
      } else if (e.key === 'Tab' && ref.current) {
        keepFocusInside(e, ref.current);
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);

  return createPortal(
    <div
      className="overlay"
      onMouseDown={(e) => {
        if (e.target !== e.currentTarget) return;
        e.preventDefault();
        closeRef.current();
      }}
    >
      <div ref={ref} className={wide ? 'dialog wide' : 'dialog'} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="dlg-head" id={titleId}>
          {title}
        </div>
        <div className="dlg-body">{children}</div>
        <div className="dlg-actions">{actions}</div>
      </div>
    </div>,
    document.body,
  );
}

/** Tab und Shift+Tab laufen im Dialog im Kreis, statt ins Terminal dahinter zu springen. */
function keepFocusInside(e: KeyboardEvent, dialog: HTMLElement): void {
  const focusable = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)];
  if (focusable.length === 0) {
    e.preventDefault();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;
  const inside = active instanceof Node && dialog.contains(active);
  if (!inside || (e.shiftKey && active === first) || (!e.shiftKey && active === last)) {
    e.preventDefault();
    (e.shiftKey ? last : first).focus();
  }
}
