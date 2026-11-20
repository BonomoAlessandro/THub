import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { autoScrollStep, dropSlot, dropTarget, markLeft, overStrip, startsDrag, type Point } from './tabDrag';

/** Was die Tab-Leiste vom Ziehen anzeigt. */
export interface TabDragState {
  /** Der gezogene Tab, solange gezogen wird; er steht blass an seinem Platz. */
  draggingId: string | null;
  /** Wo die Einfügemarke beginnt, in px ab dem Anfang des Inhalts der Leiste; `null` ausserhalb der Leiste. */
  markLeft: number | null;
}

const IDLE: TabDragState = { draggingId: null, markLeft: null };

/**
 * Umsortieren per Ziehen in der Tab-Leiste. Ab einigen Pixeln Bewegung mit gedrückter linker Taste wird ein Tab gezogen:
 * Ein Abbild folgt der Maus, der Tab selbst bleibt blass stehen, und über der Leiste zeigt eine Marke, wo er landet. Am
 * Rand einer überlaufenden Leiste scrollt sie von selbst weiter, das Mausrad scrollt sie auch. Losgelassen über der
 * Leiste, verschiebt der Kern den Tab (`onMove`); losgelassen anderswo (Fensterknöpfe, freie Fläche, Terminal, ausserhalb
 * des Fensters), mit Escape oder wenn das Fenster den Fokus verliert, bricht das Ziehen ab, ohne etwas zu ändern.
 *
 * Bewusst ohne HTML5 Drag and Drop: Chromium beginnt es nur, wenn das mousedown nicht abgefangen wird, und dann verlöre
 * das Terminal bei jedem Klick auf einen Tab den Fokus (samt Fokus-Meldungen an Programme wie Claude). Ausserdem liesse
 * sich der Tab damit auf andere Programme oder ins Terminal fallen lassen.
 *
 * @param onMove der Tab soll an Position `index` der Leiste
 * @param onStart das Ziehen beginnt (etwa um den Tooltip zu schliessen)
 */
export function useTabDrag(
  stripRef: RefObject<HTMLDivElement | null>,
  onMove: (tabId: string, index: number) => void,
  onStart: () => void,
): { state: TabDragState; startDrag(e: ReactPointerEvent<HTMLElement>, tabId: string): void } {
  const [state, setState] = useState<TabDragState>(IDLE);
  /** Bricht ein laufendes (oder mögliches) Ziehen ab; `null`, wenn keines läuft. */
  const cancelRef = useRef<(() => void) | null>(null);
  const callbacks = useRef({ onMove, onStart });
  callbacks.current = { onMove, onStart };

  useEffect(() => () => cancelRef.current?.(), []);

  const startDrag = useCallback(
    (e: ReactPointerEvent<HTMLElement>, tabId: string) => {
      const strip = stripRef.current;
      // Nur mit der linken Taste und nicht auf dem × oder im Eingabefeld beim Umbenennen.
      if (!strip || cancelRef.current || e.button !== 0 || !e.isPrimary) return;
      if ((e.target as Element).closest('button, input')) return;

      const tabEl = e.currentTarget;
      const { pointerId } = e;
      const start: Point = { x: e.clientX, y: e.clientY };
      let pointer = start;
      let dragging = false;
      let ghost: HTMLElement | null = null;
      let grab: Point = { x: 0, y: 0 };
      let frame = 0;

      const tabEls = () => [...strip.querySelectorAll<HTMLElement>(':scope > .tab')];
      const setMark = (left: number | null) =>
        setState((prev) => (prev.markLeft === left ? prev : { ...prev, markLeft: left }));

      // Marke nachführen: nach jeder Bewegung und jedem Scrollen der Leiste.
      const update = () => {
        const box = strip.getBoundingClientRect();
        if (!overStrip(pointer, box)) {
          setMark(null);
          return;
        }
        const spans = tabEls().map((el) => el.getBoundingClientRect());
        setMark(markLeft(dropSlot(pointer.x, spans), spans, box.left - strip.scrollLeft, strip.scrollWidth));
      };

      // Am Rand der Leiste von selbst weiterscrollen, solange die Maus dort steht und es weitergeht.
      const scrollFrame = () => {
        frame = 0;
        const box = strip.getBoundingClientRect();
        if (!overStrip(pointer, box)) return;
        const step = autoScrollStep(pointer.x, box);
        const before = strip.scrollLeft;
        if (step !== 0) strip.scrollLeft += step;
        if (strip.scrollLeft !== before) frame = requestAnimationFrame(scrollFrame);
      };

      const begin = () => {
        dragging = true;
        // Ab jetzt gehören alle Bewegungen bis zum Loslassen diesem Tab, auch ausserhalb des Fensters.
        try {
          tabEl.setPointerCapture(pointerId);
        } catch {
          // Die Taste ist schon losgelassen; das pointerup kommt gleich.
        }
        const rect = tabEl.getBoundingClientRect();
        grab = { x: start.x - rect.left, y: start.y - rect.top };
        ghost = createGhost(tabEl, rect);
        setState({ draggingId: tabId, markLeft: null });
        callbacks.current.onStart();
      };

      const onPointerMove = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        pointer = { x: ev.clientX, y: ev.clientY };
        if (!dragging) {
          if (!startsDrag(start, pointer)) return;
          begin();
        }
        if (ghost) ghost.style.transform = `translate(${pointer.x - grab.x}px, ${pointer.y - grab.y}px)`;
        update();
        if (!frame) frame = requestAnimationFrame(scrollFrame);
      };
      const onPointerUp = (ev: PointerEvent) => {
        if (ev.pointerId === pointerId) finish(true);
      };
      const onPointerCancel = (ev: PointerEvent) => {
        if (ev.pointerId === pointerId) finish(false);
      };
      const onLostCapture = () => finish(false);
      // Escape bricht ab und geht nicht ans Terminal.
      const onKeyDown = (ev: KeyboardEvent) => {
        if (!dragging || ev.key !== 'Escape') return;
        ev.preventDefault();
        ev.stopPropagation();
        finish(false);
      };
      const onBlur = () => finish(false);
      const onScroll = () => {
        if (dragging) update();
      };

      const finish = (drop: boolean) => {
        window.removeEventListener('pointermove', onPointerMove, true);
        window.removeEventListener('pointerup', onPointerUp, true);
        window.removeEventListener('pointercancel', onPointerCancel, true);
        window.removeEventListener('keydown', onKeyDown, true);
        window.removeEventListener('blur', onBlur);
        strip.removeEventListener('scroll', onScroll);
        tabEl.removeEventListener('lostpointercapture', onLostCapture);
        cancelAnimationFrame(frame);
        ghost?.remove();
        if (tabEl.hasPointerCapture(pointerId)) tabEl.releasePointerCapture(pointerId);
        cancelRef.current = null;
        if (!dragging) return;
        setState(IDLE);
        swallowNextClick();
        if (!drop || !overStrip(pointer, strip.getBoundingClientRect())) return;
        const tabs = tabEls();
        const from = tabs.indexOf(tabEl);
        const target = dropTarget(
          dropSlot(
            pointer.x,
            tabs.map((el) => el.getBoundingClientRect()),
          ),
          from,
        );
        if (from >= 0 && target !== null) callbacks.current.onMove(tabId, target);
      };

      window.addEventListener('pointermove', onPointerMove, true);
      window.addEventListener('pointerup', onPointerUp, true);
      window.addEventListener('pointercancel', onPointerCancel, true);
      window.addEventListener('keydown', onKeyDown, true);
      window.addEventListener('blur', onBlur);
      strip.addEventListener('scroll', onScroll);
      tabEl.addEventListener('lostpointercapture', onLostCapture);
      cancelRef.current = () => finish(false);
    },
    [stripRef],
  );

  return { state, startDrag };
}

/** Ein Abbild des Tabs, das beim Ziehen der Maus folgt, wie das Ziehbild im Prototyp. */
function createGhost(tabEl: HTMLElement, rect: DOMRect): HTMLElement {
  const ghost = tabEl.cloneNode(true) as HTMLElement;
  for (const attr of ['data-tab-id', 'role', 'aria-selected']) ghost.removeAttribute(attr);
  ghost.setAttribute('aria-hidden', 'true');
  ghost.inert = true;
  ghost.classList.add('tab-ghost');
  ghost.style.width = `${rect.width}px`;
  ghost.style.transform = `translate(${rect.left}px, ${rect.top}px)`;
  document.body.appendChild(ghost);
  return ghost;
}

/**
 * Der Klick, den der Browser nach dem Loslassen noch schickt, gehört zum Ziehen: Er aktiviert den Tab nicht. Er kommt
 * gleich nach dem pointerup, noch vor dem nächsten Zeitgeber.
 */
function swallowNextClick(): void {
  const swallow = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };
  window.addEventListener('click', swallow, { capture: true, once: true });
  window.setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);
}
