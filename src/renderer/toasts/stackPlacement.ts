/**
 * Lage des Stapels der Hinweise (Ticket 32): Er bleibt unten rechts, verdeckt aber nie die Eingabe im sichtbaren Tab.
 * Reine Rechnung ohne DOM; die Oberfläche misst Fenster, Terminal und Stapel und setzt das Ergebnis.
 */
import type { InputRows } from '../terminal/inputArea';

/** Abstand der Karten zur Titelleiste und zum unteren Fensterrand, wie bisher (Innenabstand von `.toasts` in app.css). */
export const EDGE_TOP = 10;
export const EDGE_BOTTOM = 18;

/** So lange muss eine neue Lage unverändert sein, bevor der Stapel dorthin gleitet. */
export const SETTLE_MS = 100;

/** Was die Wahl des Bands braucht, alles in CSS-Pixeln, senkrecht vom oberen Fensterrand gemessen. */
export interface StackMeasures {
  windowHeight: number;
  titlebarHeight: number;
  /** Oberkante der obersten sichtbaren Terminalzeile. */
  terminalTop: number;
  rowHeight: number;
  /** Die Eingabe im sichtbaren Tab; null, wenn sie nicht im Bild ist (kein Terminal, nach oben gescrollt). */
  input: InputRows | null;
  /** Höhe aller Karten samt den Abständen dazwischen. */
  stackHeight: number;
}

/**
 * Das Band des Stapels: `free`, wenn keine Eingabe im Bild ist (wie bisher), sonst `below` (zwischen der Cursorzeile
 * und dem unteren Fensterrand) oder `above` (zwischen der Titelleiste und dem Anfang der Eingabe).
 */
export type StackBand = 'free' | 'below' | 'above';

export interface StackPlacement {
  band: StackBand;
  /** Bereich der Karten: Ober- und Unterkante. Die Karten stehen unten darin, der neueste oben. */
  areaTop: number;
  areaBottom: number;
  /** Innenabstand der Spalte über und unter dem Bereich: Platz für Schatten und Bewegung der Karten. */
  padTop: number;
  padBottom: number;
}

/** Der bisherige Platz: von der Titelleiste bis zum unteren Fensterrand. */
export function freePlacement(windowHeight: number, titlebarHeight: number): StackPlacement {
  return {
    band: 'free',
    areaTop: titlebarHeight + EDGE_TOP,
    areaBottom: windowHeight - EDGE_BOTTOM,
    padTop: EDGE_TOP,
    padBottom: EDGE_BOTTOM,
  };
}

/**
 * Wählt das Band, in dem der Stapel die Eingabe nicht verdeckt:
 * 1. unter der Eingabe, wenn der ganze Stapel dort Platz hat (der bisherige Platz, etwa bei einem Prompt weit oben);
 * 2. sonst über der Eingabe, wenn er dort ganz Platz hat (Claude, Prompt in der letzten Zeile);
 * 3. sonst im grösseren der beiden Bänder; dort scrollt die Spalte.
 *
 * Zur Eingabe bleibt eine halbe Zeile Abstand, zur Titelleiste und zum Fensterrand derselbe wie bisher. Passt der Stapel
 * nicht, endet die Spalte auf der Seite der Eingabe genau an ihr, damit gescrollte Karten sie nicht streifen; sonst
 * bleibt der übliche Innenabstand für den Schatten.
 */
export function placeStack(m: StackMeasures): StackPlacement {
  const free = freePlacement(m.windowHeight, m.titlebarHeight);
  if (!m.input || !(m.rowHeight > 0)) return free;

  const gap = m.rowHeight / 2;
  const startTop = m.terminalTop + m.input.startRow * m.rowHeight;
  const cursorBottom = m.terminalTop + (m.input.cursorRow + 1) * m.rowHeight;

  const below = { top: cursorBottom + gap, bottom: free.areaBottom };
  const above = { top: free.areaTop, bottom: startTop - gap };
  const room = (band: { top: number; bottom: number }) => band.bottom - band.top;

  const fitsBelow = m.stackHeight <= room(below);
  const fitsAbove = m.stackHeight <= room(above);
  const useBelow = fitsBelow || (!fitsAbove && room(below) >= room(above));
  const fits = fitsBelow || fitsAbove;

  if (useBelow) {
    return {
      band: 'below',
      areaTop: below.top,
      areaBottom: Math.max(below.top, below.bottom),
      padTop: fits ? EDGE_TOP : gap,
      padBottom: EDGE_BOTTOM,
    };
  }
  return {
    band: 'above',
    areaTop: above.top,
    areaBottom: Math.max(above.top, above.bottom),
    padTop: EDGE_TOP,
    padBottom: fits ? EDGE_BOTTOM : gap,
  };
}

export function samePlacement(a: StackPlacement, b: StackPlacement): boolean {
  return (
    a.band === b.band &&
    a.areaTop === b.areaTop &&
    a.areaBottom === b.areaBottom &&
    a.padTop === b.padTop &&
    a.padBottom === b.padBottom
  );
}

/**
 * Hält den Stapel ruhig. Claude zeichnet seine Oberfläche laufend neu und setzt den Cursor dabei kurz an andere
 * Stellen; die Lage, die daraus folgt, übernimmt der Stapel erst, wenn sie `delayMs` lang unverändert war. Solange die
 * Maus auf einer Karte steht, bleibt er stehen; danach rückt er nach. Die Zeit kommt von aussen (`now` in ms).
 */
export class SteadyPlacement {
  private current: StackPlacement;
  private pending: StackPlacement | null = null;
  private pendingSince = 0;
  private held = false;

  constructor(
    initial: StackPlacement,
    private readonly delayMs = SETTLE_MS,
  ) {
    this.current = initial;
  }

  /** Die Lage, die der Stapel gerade hat. */
  get shown(): StackPlacement {
    return this.current;
  }

  /** Eine neu ausgewertete Lage. Kehrt sie zur angezeigten zurück, verfällt eine anstehende. */
  propose(target: StackPlacement, now: number): void {
    if (samePlacement(target, this.current)) {
      this.pending = null;
    } else if (!this.pending || !samePlacement(target, this.pending)) {
      this.pending = target;
      this.pendingSince = now;
    }
  }

  /** Übernimmt eine Lage sofort, etwa solange keine Karte steht und sich also nichts sichtbar bewegt. */
  jump(target: StackPlacement): void {
    this.current = target;
    this.pending = null;
  }

  /** Die Maus steht auf einer Karte (oder nicht mehr). */
  hold(on: boolean): void {
    this.held = on;
  }

  /** Übernimmt die anstehende Lage, wenn sie lange genug unverändert war; true, wenn sich die Lage geändert hat. */
  settle(now: number): boolean {
    if (!this.pending || this.held || now - this.pendingSince < this.delayMs) return false;
    this.current = this.pending;
    this.pending = null;
    return true;
  }

  /** Wann `settle` die anstehende Lage frühestens übernimmt; null, wenn nichts ansteht oder die Maus den Stapel hält. */
  dueAt(): number | null {
    return this.pending && !this.held ? this.pendingSince + this.delayMs : null;
  }
}
