// Umsortieren per Ziehen in der Tab-Leiste: reine Rechnungen ohne DOM, damit sie sich prüfen lassen. Die Reihenfolge
// selbst ändert der Kern (`moveTab`, `moveGroup`, `moveTabToGroup`). Gezogen werden die Einträge der Leiste: einzelne
// Tabs und Gruppen-Tabs (Ticket 36).

/** Ab so vielen Pixeln Bewegung mit gedrückter Taste wird aus einem Klick ein Ziehen. */
export const DRAG_THRESHOLD_PX = 4;
/** Breite der Ränder der Leiste, an denen sie beim Ziehen von selbst weiterscrollt (wie ihre weichen Kanten). */
export const AUTO_SCROLL_EDGE_PX = 28;
/** Grösster Scroll-Schritt pro Bild, ganz am Rand. */
export const AUTO_SCROLL_MAX_STEP_PX = 14;
/** Breite der Einfügemarke. */
const MARK_WIDTH_PX = 2;
/** Halber Abstand zwischen zwei Tabs (`gap` der Leiste). */
const HALF_GAP_PX = 2.5;

/** Ein Punkt im Fenster. */
export interface Point {
  x: number;
  y: number;
}

/** Waagrechte Lage eines Tabs im Fenster, wie aus `getBoundingClientRect`. */
export interface Span {
  left: number;
  right: number;
}

/** Ein Rechteck im Fenster, wie aus `getBoundingClientRect`. */
export interface Box extends Span {
  top: number;
  bottom: number;
}

/** Ob aus der Bewegung von `start` nach `now` mit gedrückter Taste ein Ziehen wird. */
export function startsDrag(start: Point, now: Point): boolean {
  return Math.hypot(now.x - start.x, now.y - start.y) >= DRAG_THRESHOLD_PX;
}

/**
 * Ob die Maus über der Tab-Leiste steht; nur dort lässt sich ein Tab ablegen. Über den Fensterknöpfen, der freien
 * Fläche, der Terminal-Fläche oder ausserhalb des Fensters bricht das Loslassen das Ziehen ab.
 */
export function overStrip(p: Point, strip: Box): boolean {
  return p.x >= strip.left && p.x <= strip.right && p.y >= strip.top && p.y <= strip.bottom;
}

/**
 * Die Einfügestelle für die Maus an `x`: 0 vor dem ersten Tab, `tabs.length` hinter dem letzten. Die Maus gehört vor
 * den ersten Tab, dessen Mitte sie noch nicht erreicht hat.
 */
export function dropSlot(x: number, tabs: Span[]): number {
  const index = tabs.findIndex((t) => x < (t.left + t.right) / 2);
  return index < 0 ? tabs.length : index;
}

/**
 * Ein Gruppen-Tab nimmt einen gezogenen Tab auf, wenn die Maus über seiner Mitte steht (Ticket 36): mindestens diesen
 * Anteil seiner Breite von beiden Rändern entfernt. Näher am Rand gilt die Einfügestelle davor bzw. dahinter.
 */
export const INTO_GROUP_EDGE = 0.25;

/** Wohin ein gezogener Eintrag fällt: an eine Einfügestelle zwischen zwei Einträgen oder in den Eintrag `index`, eine Gruppe. */
export type DropPoint = { kind: 'slot'; slot: number } | { kind: 'group'; index: number };

/**
 * Wohin der gezogene Eintrag beim Loslassen an `x` fällt. Ein einzelner Tab über der Mitte eines Gruppen-Tabs kommt ans
 * Ende dieser Gruppe; sonst, und für eine gezogene Gruppe immer (Gruppen in Gruppen gibt es nicht), wird umsortiert.
 * Ein Tab über einem einzelnen Tab bildet keine Gruppe.
 * @param groups pro Eintrag, ob er eine Gruppe ist; `null`, wenn der gezogene Eintrag in keine Gruppe kommen kann
 */
export function dropPoint(x: number, entries: Span[], groups: readonly boolean[] | null): DropPoint {
  if (groups) {
    const index = entries.findIndex((entry, i) => groups[i] === true && overMiddle(x, entry));
    if (index >= 0) return { kind: 'group', index };
  }
  return { kind: 'slot', slot: dropSlot(x, entries) };
}

function overMiddle(x: number, span: Span): boolean {
  const edge = (span.right - span.left) * INTO_GROUP_EDGE;
  return x >= span.left + edge && x <= span.right - edge;
}

/**
 * Die Position, an die der Eintrag von Position `from` beim Ablegen an der Einfügestelle `slot` kommt, wie sie der Kern
 * erwartet (`moveTab`, `moveGroup`; gezählt werden die Einträge der Leiste); `null`, wenn er an seinem Platz bliebe
 * (direkt vor oder hinter sich abgelegt).
 */
export function dropTarget(slot: number, from: number): number | null {
  const to = slot > from ? slot - 1 : slot;
  return to === from ? null : to;
}

/**
 * Wo die Einfügemarke für die Einfügestelle `slot` beginnt, in px ab dem Anfang des Inhalts der Leiste: mitten in der
 * Lücke zwischen zwei Tabs, an den Enden knapp neben dem ersten bzw. letzten Tab, aber immer im Inhalt, damit sie nicht
 * abgeschnitten wird.
 * @param origin wo der Anfang des Inhalts im Fenster liegt (linker Rand der Leiste minus Scroll-Position)
 * @param contentWidth Breite des ganzen Inhalts (`scrollWidth`)
 */
export function markLeft(slot: number, tabs: Span[], origin: number, contentWidth: number): number {
  let center: number;
  if (tabs.length === 0) center = origin;
  else if (slot <= 0) center = tabs[0].left - HALF_GAP_PX;
  else if (slot >= tabs.length) center = tabs[tabs.length - 1].right + HALF_GAP_PX;
  else center = (tabs[slot - 1].right + tabs[slot].left) / 2;
  const left = center - origin - MARK_WIDTH_PX / 2;
  return Math.max(0, Math.min(left, contentWidth - MARK_WIDTH_PX));
}

/**
 * Wie weit die Leiste beim Ziehen in diesem Bild von selbst scrollt: negativ nach links, positiv nach rechts, 0 ausserhalb
 * der Ränder. Je näher die Maus am Rand, desto schneller. Ob es in diese Richtung noch etwas zu scrollen gibt, weiss die
 * Leiste selbst.
 */
export function autoScrollStep(x: number, strip: Span): number {
  const intoLeft = strip.left + AUTO_SCROLL_EDGE_PX - x;
  if (intoLeft > 0) return -scrollSpeed(intoLeft);
  const intoRight = x - (strip.right - AUTO_SCROLL_EDGE_PX);
  if (intoRight > 0) return scrollSpeed(intoRight);
  return 0;
}

function scrollSpeed(depth: number): number {
  return Math.ceil(AUTO_SCROLL_MAX_STEP_PX * Math.min(1, depth / AUTO_SCROLL_EDGE_PX));
}
