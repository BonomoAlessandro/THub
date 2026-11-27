// Regel für den Verbrauchsbalken (Ticket 38), die Kern und Oberfläche teilen: wie ein Limit des Kontos zu einem
// Zeitpunkt aussieht. Rein, ohne Uhr: Die Zeit kommt von aussen.

import type { UsageLimit } from './types';

/** Ein Limit, so wie der Balken es zu einem Zeitpunkt zeigt. */
export interface ShownLimit {
  /** Verbraucht in Prozent, 0 bis 100; nach dem Reset 0. */
  percent: number;
  /**
   * Der Reset ist vorbei: Das Limit gilt als zurückgesetzt und wird gedämpft gezeigt, bis Claude einen neuen Stand
   * meldet. Claude selbst lässt ein Fenster nach seinem Reset weg, bis die API es wieder meldet.
   */
  expired: boolean;
}

/** Wie das Limit zum Zeitpunkt `now` (ms seit 1970) aussieht. Ohne Zeitpunkt des Resets gilt der gemeldete Stand. */
export function shownLimit(limit: UsageLimit, now: number): ShownLimit {
  if (limit.resetsAt !== undefined && limit.resetsAt <= now) return { percent: 0, expired: true };
  return { percent: limit.usedPercent, expired: false };
}
