import { useLayoutEffect, useRef, type ReactNode } from 'react';

/** Abstand des Tooltips zum Fensterrand und zum Element darüber. */
const MARGIN = 8;
const GAP = 6;

interface TooltipProps {
  /** Lage des Elements, unter (bzw. über) dem der Tooltip erscheint. */
  anchor: DOMRect;
  /** Unter dem Element (Standard) oder darüber, etwa beim Verbrauchsbalken am unteren Fensterrand (Ticket 38). */
  placement?: 'below' | 'above';
  children: ReactNode;
}

/** Tooltip unter (oder über) einem Element, waagrecht im Fenster gehalten. */
export function Tooltip({ anchor, placement = 'below', children }: TooltipProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Vor dem Zeichnen platzieren, sobald Breite und Höhe bekannt sind.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const maxLeft = window.innerWidth - el.offsetWidth - MARGIN;
    el.style.left = `${Math.max(MARGIN, Math.min(anchor.left, maxLeft))}px`;
    el.style.top =
      placement === 'above'
        ? `${Math.max(MARGIN, anchor.top - GAP - el.offsetHeight)}px`
        : `${anchor.bottom + GAP}px`;
  });

  return (
    <div ref={ref} className="tip" role="tooltip">
      {children}
    </div>
  );
}
