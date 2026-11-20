// Schriftgrösse der Terminals (Ticket 18): Schritte per Stepper, Tastenkürzel und Ctrl + Mausrad.
// Rein rechnerisch, ohne DOM; die Grösse selbst speichert der Kern und meldet sie allen Terminals.

import { FONT_SIZE } from '../shared/types';

/** Die Schriftgrösse einen Schritt weiter, innerhalb der Grenzen (8 bis 32). */
export function stepFontSize(size: number, step: number): number {
  return Math.min(FONT_SIZE.max, Math.max(FONT_SIZE.min, Math.round(size + step)));
}

/**
 * So viel Bewegung von Ctrl + Mausrad ergibt einen Schritt. Ein Klick des Mausrads liefert unter Windows
 * meist 100 px und ist damit genau ein Schritt; die vielen kleinen Bewegungen eines Touchpads werden
 * gesammelt.
 */
const WHEEL_STEP_PX = 50;

/** Macht aus den Bewegungen von Ctrl + Mausrad Schritte der Schriftgrösse, höchstens einen pro Bewegung. */
export class WheelSteps {
  private sum = 0;

  /**
   * Nimmt eine Bewegung entgegen (`WheelEvent.deltaY`, `deltaMode`). Liefert 1 (grösser, Rad nach oben),
   * -1 (kleiner, Rad nach unten) oder 0, solange die Bewegung noch keinen Schritt ergibt.
   */
  add(deltaY: number, deltaMode = 0): 1 | -1 | 0 {
    if (deltaY === 0) return 0;
    // In Zeilen oder Seiten gemessen (deltaMode 1 oder 2) ist jede Bewegung ein ganzer Schritt.
    const px = deltaMode === 0 ? deltaY : Math.sign(deltaY) * WHEEL_STEP_PX;
    // Ein Richtungswechsel fängt von vorn an.
    if (Math.sign(px) !== Math.sign(this.sum)) this.sum = 0;
    this.sum += px;
    if (Math.abs(this.sum) < WHEEL_STEP_PX) return 0;
    this.sum = 0;
    return px < 0 ? 1 : -1;
  }
}
