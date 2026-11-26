import { describe, expect, it } from 'vitest';
import {
  AUTO_SCROLL_EDGE_PX,
  AUTO_SCROLL_MAX_STEP_PX,
  autoScrollStep,
  dropPoint,
  dropSlot,
  dropTarget,
  INTO_GROUP_EDGE,
  markLeft,
  overStrip,
  startsDrag,
} from '../../src/renderer/tabs/tabDrag';

// Umsortieren per Ziehen: Einfügestelle, Zielposition für den Kern, Lage der Einfügemarke und Scrollen am Rand.

/** Drei Tabs à 200 px mit 5 px Abstand, die Leiste beginnt bei x = 10 (1 px Innenabstand). */
const TABS = [
  { left: 11, right: 211 },
  { left: 216, right: 416 },
  { left: 421, right: 621 },
];

describe('Umsortieren per Ziehen', () => {
  it('wird erst ab einigen Pixeln Bewegung zum Ziehen, damit Klick und Doppelklick bleiben', () => {
    expect(startsDrag({ x: 100, y: 20 }, { x: 102, y: 21 })).toBe(false);
    expect(startsDrag({ x: 100, y: 20 }, { x: 104, y: 20 })).toBe(true);
    expect(startsDrag({ x: 100, y: 20 }, { x: 100, y: 25 })).toBe(true);
  });

  it('ablegen lässt sich nur über der Leiste, nicht über Fensterknöpfen, freier Fläche oder ausserhalb des Fensters', () => {
    const strip = { left: 10, right: 622, top: 0, bottom: 44 };

    expect(overStrip({ x: 300, y: 22 }, strip)).toBe(true);
    expect(overStrip({ x: 10, y: 0 }, strip)).toBe(true);
    expect(overStrip({ x: 700, y: 22 }, strip)).toBe(false);
    expect(overStrip({ x: 300, y: 60 }, strip)).toBe(false);
    expect(overStrip({ x: 300, y: -5 }, strip)).toBe(false);
    expect(overStrip({ x: -40, y: 22 }, strip)).toBe(false);
  });

  describe('Einfügestelle', () => {
    it('vor dem ersten Tab, dessen Mitte die Maus noch nicht erreicht hat', () => {
      expect(dropSlot(0, TABS)).toBe(0);
      expect(dropSlot(110, TABS)).toBe(0);
      expect(dropSlot(111, TABS)).toBe(1);
      expect(dropSlot(300, TABS)).toBe(1);
      expect(dropSlot(520, TABS)).toBe(2);
    });

    it('hinter dem letzten Tab ab dessen Mitte', () => {
      expect(dropSlot(521, TABS)).toBe(3);
      expect(dropSlot(900, TABS)).toBe(3);
    });
  });

  describe('Zielposition für den Kern', () => {
    it('nach rechts: eine Stelle weniger, weil der Tab vorher herausgenommen wird', () => {
      expect(dropTarget(3, 0)).toBe(2);
      expect(dropTarget(2, 0)).toBe(1);
    });

    it('nach links: die Einfügestelle selbst', () => {
      expect(dropTarget(0, 2)).toBe(0);
      expect(dropTarget(1, 2)).toBe(1);
    });

    it('direkt vor oder hinter sich abgelegt bleibt der Tab, wo er ist', () => {
      expect(dropTarget(1, 1)).toBeNull();
      expect(dropTarget(2, 1)).toBeNull();
    });
  });

  describe('Ziehen auf einen Gruppen-Tab (Ticket 36)', () => {
    /** Der mittlere Eintrag ist eine Gruppe; seine Mitte (25 % vom Rand) reicht von 266 bis 366. */
    const GROUP_IN_MIDDLE = [false, true, false];

    it('ein Tab über der Mitte des Gruppen-Tabs kommt in die Gruppe', () => {
      expect(dropPoint(266, TABS, GROUP_IN_MIDDLE)).toEqual({ kind: 'group', index: 1 });
      expect(dropPoint(316, TABS, GROUP_IN_MIDDLE)).toEqual({ kind: 'group', index: 1 });
      expect(dropPoint(366, TABS, GROUP_IN_MIDDLE)).toEqual({ kind: 'group', index: 1 });
    });

    it('nahe am Rand des Gruppen-Tabs und zwischen zwei Einträgen wird wie bisher umsortiert', () => {
      expect(dropPoint(240, TABS, GROUP_IN_MIDDLE)).toEqual({ kind: 'slot', slot: 1 });
      expect(dropPoint(390, TABS, GROUP_IN_MIDDLE)).toEqual({ kind: 'slot', slot: 2 });
      expect(dropPoint(213, TABS, GROUP_IN_MIDDLE)).toEqual({ kind: 'slot', slot: 1 });
    });

    it('über einem einzelnen Tab entsteht keine Gruppe', () => {
      expect(dropPoint(111, TABS, GROUP_IN_MIDDLE)).toEqual({ kind: 'slot', slot: 1 });
      expect(dropPoint(521, TABS, GROUP_IN_MIDDLE)).toEqual({ kind: 'slot', slot: 3 });
    });

    it('eine gezogene Gruppe kommt in keine andere Gruppe, sie wird nur umsortiert', () => {
      expect(dropPoint(316, TABS, null)).toEqual({ kind: 'slot', slot: 2 });
      expect(dropPoint(300, TABS, null)).toEqual({ kind: 'slot', slot: 1 });
    });

    it('die Mitte ist die Hälfte der Breite', () => {
      expect(INTO_GROUP_EDGE).toBe(0.25);
    });
  });

  describe('Einfügemarke', () => {
    it('steht mitten in der Lücke zwischen zwei Tabs, auch bei gescrollter Leiste', () => {
      // Lücke 211 … 216, Mitte 213,5; die Marke ist 2 px breit. Der Inhalt beginnt bei x = 10.
      expect(markLeft(1, TABS, 10, 613)).toBe(202.5);
      // 150 px gescrollt: Die Tabs stehen weiter links, der Anfang des Inhalts liegt bei 10 - 150.
      const scrolled = TABS.map((t) => ({ left: t.left - 150, right: t.right - 150 }));
      expect(markLeft(1, scrolled, -140, 613)).toBe(202.5);
    });

    it('an den Enden knapp neben dem ersten bzw. letzten Tab, aber nie abgeschnitten', () => {
      expect(markLeft(0, TABS, 10, 613)).toBe(0);
      expect(markLeft(3, TABS, 10, 613)).toBe(611);
      expect(markLeft(3, TABS, 10, 700)).toBe(612.5);
    });
  });

  describe('Scrollen am Rand einer überlaufenden Leiste', () => {
    const strip = { left: 10, right: 610 };

    it('nach links am linken, nach rechts am rechten Rand, schneller je näher am Rand', () => {
      expect(autoScrollStep(10, strip)).toBe(-AUTO_SCROLL_MAX_STEP_PX);
      expect(autoScrollStep(10 + AUTO_SCROLL_EDGE_PX / 2, strip)).toBe(-AUTO_SCROLL_MAX_STEP_PX / 2);
      expect(autoScrollStep(610, strip)).toBe(AUTO_SCROLL_MAX_STEP_PX);
      expect(autoScrollStep(610 - AUTO_SCROLL_EDGE_PX / 2, strip)).toBe(AUTO_SCROLL_MAX_STEP_PX / 2);
    });

    it('in der Mitte nicht', () => {
      expect(autoScrollStep(10 + AUTO_SCROLL_EDGE_PX, strip)).toBe(0);
      expect(autoScrollStep(300, strip)).toBe(0);
      expect(autoScrollStep(610 - AUTO_SCROLL_EDGE_PX, strip)).toBe(0);
    });
  });
});
