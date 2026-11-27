/**
 * Lage des Stapels der Hinweise (Tickets 32 und 35): Er bleibt unten rechts, verdeckt aber nie die Eingabe im sichtbaren
 * Tab und nicht, was darunter steht, und seit Ticket 38 auch nicht den Verbrauchsbalken am unteren Fensterrand. Reine
 * Rechnung ohne DOM; die Oberfläche misst Fenster, Terminal, Balken und Stapel und setzt das Ergebnis.
 */
import type { InputRows } from '../terminal/inputArea';

/** Abstand der Karten zur Titelleiste, wie bisher (Innenabstand oben von `.toasts` in app.css). */
export const EDGE_TOP = 10;

/**
 * Wo Claudes Linie über dem Eingabefeld sichtbar beginnt, als Anteil der Zeilenhöhe von der Oberkante ihrer Zeile:
 * Das Zeichen `─` steht etwa in der Mitte seiner Zeile. In der App gemessen (Ticket 35, DOM-Renderer von xterm.js,
 * Cascadia Mono, Schriftgrössen 11 bis 24, Skalierung 100, 150 und 200 %): 0,39 bis 0,46; mit 0,43 liegt die Rechnung
 * höchstens 0,7 px daneben.
 */
export const RULE_TOP = 0.43;

/** So lange muss eine neue Lage unverändert sein, bevor der Stapel dorthin gleitet. */
export const SETTLE_MS = 100;

/** Was die Wahl des Bands braucht, alles in CSS-Pixeln, senkrecht vom oberen Fensterrand gemessen. */
export interface StackMeasures {
  windowHeight: number;
  titlebarHeight: number;
  /**
   * Abstand der Karten zum rechten und zum unteren Fensterrand (`--toast-edge`). Derselbe Abstand bleibt zur Eingabe
   * (Ticket 35).
   */
  edge: number;
  /** Oberkante der obersten sichtbaren Terminalzeile. */
  terminalTop: number;
  rowHeight: number;
  /** Die Eingabe im sichtbaren Tab; null, wenn sie nicht im Bild ist (kein Terminal, nach oben gescrollt). */
  input: InputRows | null;
  /** Höhe aller Karten samt den Abständen dazwischen. */
  stackHeight: number;
  /**
   * Höhe des Verbrauchsbalkens am unteren Fensterrand (Ticket 38); 0 ohne Balken. Der Stapel bleibt darüber, mit dem
   * Abstand `edge` wie sonst zum Fensterrand.
   */
  bottomBar?: number;
}

/**
 * Das Band des Stapels: `free`, wenn keine Eingabe im Bild ist (wie bisher), sonst `below` (zwischen der letzten
 * geschützten Zeile und dem unteren Fensterrand) oder `above` (zwischen der Titelleiste und dem Anfang der Eingabe).
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

/**
 * Der bisherige Platz: von der Titelleiste bis zum unteren Fensterrand, mit Verbrauchsbalken (Ticket 38) bis zu dessen
 * Oberkante.
 * @param bottomBar Höhe des Verbrauchsbalkens; 0 ohne Balken
 */
export function freePlacement(windowHeight: number, titlebarHeight: number, edge: number, bottomBar = 0): StackPlacement {
  return {
    band: 'free',
    areaTop: titlebarHeight + EDGE_TOP,
    areaBottom: windowHeight - bottomBar - edge,
    padTop: EDGE_TOP,
    padBottom: edge,
  };
}

/**
 * Wählt das Band, in dem der Stapel weder die Eingabe noch die Zeilen darunter verdeckt:
 * 0. das Band, in dem er gerade steht (`standing`), solange er dort ganz Platz hat; so springt er nicht hin und her,
 *    wenn sich Claudes Statuszeile oder die Zahl der Hinweise ändert (Ticket 35);
 * 1. sonst unter der Eingabe, wenn der ganze Stapel unter der letzten nicht leeren Zeile Platz hat (der bisherige Platz,
 *    etwa bei einem Prompt weit oben);
 * 2. sonst über der Eingabe, wenn er dort ganz Platz hat (Claude, Prompt in der letzten Zeile);
 * 3. sonst im grösseren der beiden Bänder; dort scrollt die Spalte.
 *
 * Zur Eingabe bleibt derselbe Abstand wie zum rechten Fensterrand (`edge`), gemessen zu ihrer sichtbaren Oberkante: bei
 * Claudes Linie zur Linie selbst, sonst zur Oberkante der ersten Eingabezeile. Unter der Eingabe gilt er zur letzten
 * geschützten Zeile. Zur Titelleiste und zum unteren Fensterrand bleibt es wie bisher. Auf der Seite der Eingabe endet
 * die Spalte genau an ihr, damit gescrollte Karten sie nicht streifen.
 *
 * @param standing Band, in dem der Stapel gerade steht; null, solange keine Karte steht
 */
export function placeStack(m: StackMeasures, standing: StackBand | null = null): StackPlacement {
  const free = freePlacement(m.windowHeight, m.titlebarHeight, m.edge, m.bottomBar ?? 0);
  if (!m.input || !(m.rowHeight > 0)) return free;

  const gap = m.edge;
  const rowTop = (row: number) => m.terminalTop + row * m.rowHeight;
  const inputTop = rowTop(m.input.startRow) + (m.input.startIsRule ? RULE_TOP * m.rowHeight : 0);
  const protectedBottom = rowTop(m.input.endRow + 1);

  const below = { top: protectedBottom + gap, bottom: free.areaBottom };
  const above = { top: free.areaTop, bottom: inputTop - gap };
  const room = (band: { top: number; bottom: number }) => band.bottom - band.top;

  const fitsBelow = m.stackHeight <= room(below);
  const fitsAbove = m.stackHeight <= room(above);
  let band: 'below' | 'above';
  if ((standing === 'below' && fitsBelow) || (standing === 'above' && fitsAbove)) band = standing;
  else if (fitsBelow) band = 'below';
  else if (fitsAbove) band = 'above';
  else band = room(below) >= room(above) ? 'below' : 'above';

  if (band === 'below') {
    return {
      band,
      areaTop: below.top,
      areaBottom: Math.max(below.top, below.bottom),
      padTop: gap,
      padBottom: m.edge,
    };
  }
  return {
    band,
    areaTop: above.top,
    areaBottom: Math.max(above.top, above.bottom),
    padTop: EDGE_TOP,
    padBottom: gap,
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
