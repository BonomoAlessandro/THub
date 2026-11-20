import { describe, expect, it } from 'vitest';
import { WheelSteps } from '../../src/renderer/fontSize';

describe('Ctrl + Mausrad', () => {
  /** Die Schritte zu einer Folge von Bewegungen (deltaY in px). */
  function steps(...deltas: number[]): number[] {
    const wheel = new WheelSteps();
    return deltas.map((delta) => wheel.add(delta));
  }

  it('ein Klick des Mausrads ist ein Schritt: nach oben grösser, nach unten kleiner', () => {
    expect(steps(-100, -100, 100)).toEqual([1, 1, -1]);
  });

  it('auch ein schneller Dreh ergibt höchstens einen Schritt pro Bewegung', () => {
    expect(steps(-400)).toEqual([1]);
  });

  it('kleine Bewegungen eines Touchpads werden gesammelt', () => {
    expect(steps(-20, -20, -20, -20, -20)).toEqual([0, 0, 1, 0, 0]);
  });

  it('ein Richtungswechsel fängt von vorn an', () => {
    expect(steps(-40, 40, 40)).toEqual([0, 0, -1]);
  });

  it('in Zeilen gemessen ist jede Bewegung ein Schritt', () => {
    const wheel = new WheelSteps();

    expect([wheel.add(-1, 1), wheel.add(3, 1), wheel.add(0, 1)]).toEqual([1, -1, 0]);
  });
});
