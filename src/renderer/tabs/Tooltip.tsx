import { useLayoutEffect, useRef, type ReactNode } from 'react';

/** Abstand des Tooltips zum Fensterrand und zum Element darüber. */
const MARGIN = 8;
const GAP = 6;

interface TooltipProps {
  /** Lage des Elements, unter dem der Tooltip erscheint. */
  anchor: DOMRect;
  children: ReactNode;
}

/** Tooltip unter einem Element, waagrecht im Fenster gehalten. */
export function Tooltip({ anchor, children }: TooltipProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Vor dem Zeichnen platzieren, sobald die Breite bekannt ist.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const maxLeft = window.innerWidth - el.offsetWidth - MARGIN;
    el.style.left = `${Math.max(MARGIN, Math.min(anchor.left, maxLeft))}px`;
    el.style.top = `${anchor.bottom + GAP}px`;
  });

  return (
    <div ref={ref} className="tip" role="tooltip">
      {children}
    </div>
  );
}
