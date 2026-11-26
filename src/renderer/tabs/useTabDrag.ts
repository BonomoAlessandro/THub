import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import {
  autoScrollStep,
  dropPoint,
  dropTarget,
  markLeft,
  overStrip,
  startsDrag,
  type DropPoint,
  type Point,
} from './tabDrag';

/** Ein Eintrag der Leiste, der gezogen wird: ein einzelner Tab oder eine Gruppe (Ticket 36). */
export interface DragEntry {
  kind: 'tab' | 'group';
  /** Kennung des Tabs bzw. der Gruppe. */
  id: string;
}

/** Was die Tab-Leiste vom Ziehen anzeigt. */
export interface TabDragState {
  /** Der gezogene Eintrag (Tab oder Gruppe), solange gezogen wird; er steht blass an seinem Platz. */
  draggingId: string | null;
  /** Wo die Einfügemarke beginnt, in px ab dem Anfang des Inhalts der Leiste; `null` ausserhalb der Leiste. */
  markLeft: number | null;
  /** Die Gruppe, in die der gezogene Tab beim Loslassen käme (Ticket 36); sie ist als Ziel hervorgehoben. */
  intoGroupId: string | null;
}

/** Was mit einem abgelegten Eintrag geschieht; die Reihenfolge ändert der Kern. */
export interface TabDragHandlers {
  /** Der Eintrag soll an Position `index` der Leiste (Einträge, ab 0). */
  onMove(entry: DragEntry, index: number): void;
  /** Der einzelne Tab wurde auf die Mitte eines Gruppen-Tabs gezogen: ans Ende dieser Gruppe (Ticket 36). */
  onDropIntoGroup(tabId: string, groupId: string): void;
  /** Das Ziehen beginnt (etwa um den Tooltip zu schliessen). */
  onStart(): void;
}

const IDLE: TabDragState = { draggingId: null, markLeft: null, intoGroupId: null };

/**
 * Umsortieren per Ziehen in der Tab-Leiste. Ab einigen Pixeln Bewegung mit gedrückter linker Taste wird ein Eintrag (ein
 * Tab oder ein Gruppen-Tab) gezogen: Ein Abbild folgt der Maus, der Eintrag selbst bleibt blass stehen, und über der
 * Leiste zeigt eine Marke, wo er landet. Ein einzelner Tab über der Mitte eines Gruppen-Tabs kommt beim Loslassen in
 * diese Gruppe; der Gruppen-Tab ist dann als Ziel hervorgehoben, eine Marke gibt es nicht. Am Rand einer überlaufenden
 * Leiste scrollt sie von selbst weiter, das Mausrad scrollt sie auch. Losgelassen über der Leiste, verschiebt der Kern
 * den Eintrag; losgelassen anderswo (Fensterknöpfe, freie Fläche, Terminal, ausserhalb des Fensters), mit Escape oder
 * wenn das Fenster den Fokus verliert, bricht das Ziehen ab, ohne etwas zu ändern.
 *
 * Bewusst ohne HTML5 Drag and Drop: Chromium beginnt es nur, wenn das mousedown nicht abgefangen wird, und dann verlöre
 * das Terminal bei jedem Klick auf einen Tab den Fokus (samt Fokus-Meldungen an Programme wie Claude). Ausserdem liesse
 * sich der Tab damit auf andere Programme oder ins Terminal fallen lassen.
 */
export function useTabDrag(
  stripRef: RefObject<HTMLDivElement | null>,
  handlers: TabDragHandlers,
): { state: TabDragState; startDrag(e: ReactPointerEvent<HTMLElement>, entry: DragEntry): void } {
  const [state, setState] = useState<TabDragState>(IDLE);
  /** Bricht ein laufendes (oder mögliches) Ziehen ab; `null`, wenn keines läuft. */
  const cancelRef = useRef<(() => void) | null>(null);
  const callbacks = useRef(handlers);
  callbacks.current = handlers;

  useEffect(() => () => cancelRef.current?.(), []);

  const startDrag = useCallback(
    (e: ReactPointerEvent<HTMLElement>, entry: DragEntry) => {
      const strip = stripRef.current;
      // Nur mit der linken Taste und nicht auf einem Knopf (×, Pfeil der Gruppe) oder im Eingabefeld beim Umbenennen.
      if (!strip || e.button !== 0 || !e.isPrimary) return;
      if ((e.target as Element).closest('button, input')) return;
      // Ein neuer Druck beendet ein liegengebliebenes Ziehen, etwa wenn sein Loslassen nie ankam.
      cancelRef.current?.();

      const tabEl = e.currentTarget;
      const { pointerId } = e;
      const start: Point = { x: e.clientX, y: e.clientY };
      let pointer = start;
      let dragging = false;
      let ghost: HTMLElement | null = null;
      let grab: Point = { x: 0, y: 0 };
      let frame = 0;

      const tabEls = () => [...strip.querySelectorAll<HTMLElement>(':scope > .tab')];
      // Wohin der Eintrag an der Stelle der Maus fiele; nur ein einzelner Tab kann in eine Gruppe.
      const dropAt = (els: HTMLElement[]): DropPoint =>
        dropPoint(
          pointer.x,
          els.map((el) => el.getBoundingClientRect()),
          entry.kind === 'tab' ? els.map((el) => el.dataset.groupId !== undefined) : null,
        );
      const show = (mark: number | null, intoGroupId: string | null) =>
        setState((prev) =>
          prev.markLeft === mark && prev.intoGroupId === intoGroupId ? prev : { ...prev, markLeft: mark, intoGroupId },
        );

      // Marke bzw. Ziel nachführen: nach jeder Bewegung und jedem Scrollen der Leiste.
      const update = () => {
        const box = strip.getBoundingClientRect();
        if (!overStrip(pointer, box)) {
          show(null, null);
          return;
        }
        const els = tabEls();
        const drop = dropAt(els);
        if (drop.kind === 'group') {
          show(null, els[drop.index].dataset.groupId ?? null);
          return;
        }
        const spans = els.map((el) => el.getBoundingClientRect());
        show(markLeft(drop.slot, spans, box.left - strip.scrollLeft, strip.scrollWidth), null);
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
        // Ab jetzt gehören alle Bewegungen bis zum Loslassen diesem Eintrag, auch ausserhalb des Fensters.
        try {
          tabEl.setPointerCapture(pointerId);
        } catch {
          // Die Taste ist schon losgelassen; das pointerup kommt gleich.
        }
        const rect = tabEl.getBoundingClientRect();
        grab = { x: start.x - rect.left, y: start.y - rect.top };
        ghost = createGhost(tabEl, rect);
        setState({ draggingId: entry.id, markLeft: null, intoGroupId: null });
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
        const els = tabEls();
        const target = dropAt(els);
        if (target.kind === 'group') {
          const groupId = els[target.index].dataset.groupId;
          if (groupId !== undefined) callbacks.current.onDropIntoGroup(entry.id, groupId);
          return;
        }
        const from = els.indexOf(tabEl);
        const to = dropTarget(target.slot, from);
        if (from >= 0 && to !== null) callbacks.current.onMove(entry, to);
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

/** Ein Abbild des Eintrags, das beim Ziehen der Maus folgt, wie das Ziehbild im Prototyp. */
function createGhost(tabEl: HTMLElement, rect: DOMRect): HTMLElement {
  const ghost = tabEl.cloneNode(true) as HTMLElement;
  for (const attr of ['data-tab-id', 'data-group-id', 'data-entry-id', 'role', 'aria-selected']) {
    ghost.removeAttribute(attr);
  }
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
