import { describe, expect, it } from 'vitest';
import type { DisplayInfo } from '../../src/main/workspace/ports';
import { MemoryStorage, PRIMARY_DISPLAY } from '../support/fakes';
import { startWorkspace } from '../support/harness';

// Hauptbildschirm aus den Fakes: 1920 × 1080, Arbeitsbereich 1920 × 1040 (Taskleiste unten).

/** Zweiter Bildschirm rechts vom Hauptbildschirm. */
const RIGHT_DISPLAY: DisplayInfo = {
  bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
  workArea: { x: 1920, y: 0, width: 2560, height: 1400 },
  primary: false,
};

/** Zweiter Bildschirm links vom Hauptbildschirm, vom System zuerst gemeldet. */
const LEFT_DISPLAY: DisplayInfo = {
  bounds: { x: -1920, y: 0, width: 1920, height: 1080 },
  workArea: { x: -1920, y: 0, width: 1920, height: 1040 },
  primary: false,
};

/** Hauptbildschirm mit der Taskleiste oben. */
const PRIMARY_TASKBAR_TOP: DisplayInfo = {
  bounds: { x: 0, y: 0, width: 1920, height: 1080 },
  workArea: { x: 0, y: 48, width: 1920, height: 1032 },
  primary: true,
};

const NORMAL = { x: 200, y: 100, width: 1000, height: 700 };

describe('Fenster', () => {
  describe('ohne gespeicherte Angaben', () => {
    it('öffnet maximiert auf dem Hauptbildschirm, darunter 1200 × 760 zentriert', () => {
      const h = startWorkspace();

      expect(h.workspace.windowState()).toEqual({
        bounds: { x: 360, y: 140, width: 1200, height: 760 },
        maximized: true,
      });
    });

    it('nimmt dafür den Hauptbildschirm, auch wenn er nicht zuerst gemeldet wird, und lässt die Taskleiste frei', () => {
      const h = startWorkspace({ displays: [LEFT_DISPLAY, PRIMARY_TASKBAR_TOP] });

      expect(h.workspace.windowState()).toEqual({
        bounds: { x: 360, y: 184, width: 1200, height: 760 },
        maximized: true,
      });
    });

    it('verkleinert die normale Grösse auf einem kleinen Bildschirm auf den Arbeitsbereich', () => {
      const small: DisplayInfo = {
        bounds: { x: 0, y: 0, width: 1024, height: 768 },
        workArea: { x: 0, y: 0, width: 1024, height: 728 },
        primary: true,
      };
      const h = startWorkspace({ displays: [small] });

      expect(h.workspace.windowState()).toEqual({
        bounds: { x: 0, y: 0, width: 1024, height: 728 },
        maximized: true,
      });
    });

    it.each([
      ['Breite 0', { bounds: { x: 10, y: 10, width: 0, height: 700 }, maximized: false }],
      ['Text statt Zahl', { bounds: { x: '10', y: 10, width: 1000, height: 700 }, maximized: false }],
      ['ohne Grösse', { maximized: false }],
    ])('öffnet auch bei unbrauchbaren gespeicherten Angaben maximiert (%s)', (_label, window) => {
      const h = startWorkspace({ state: { version: 2, tabs: [], window } });

      expect(h.workspace.windowState()).toEqual({
        bounds: { x: 360, y: 140, width: 1200, height: 760 },
        maximized: true,
      });
    });
  });

  describe('nach einem Neustart', () => {
    it('öffnet mit gespeicherter Grösse und Position', async () => {
      const h = startWorkspace();
      h.workspace.windowChanged({ bounds: NORMAL, maximized: false });

      await h.restart();

      expect(h.workspace.windowState()).toEqual({ bounds: NORMAL, maximized: false });
    });

    it('öffnet maximiert und behält darunter die normale Grösse für „Wiederherstellen“', async () => {
      const h = startWorkspace();
      h.workspace.windowChanged({ bounds: NORMAL, maximized: false });
      h.workspace.windowChanged({ bounds: NORMAL, maximized: true });

      await h.restart();

      expect(h.workspace.windowState()).toEqual({ bounds: NORMAL, maximized: true });
    });

    it('öffnet nicht mehr maximiert, wenn der Nutzer das Fenster nach dem ersten Start wiederhergestellt hat', async () => {
      const h = startWorkspace();
      const firstStart = h.workspace.windowState();
      h.workspace.windowChanged({ bounds: firstStart.bounds, maximized: false });

      await h.restart();

      expect(h.workspace.windowState()).toEqual({ bounds: firstStart.bounds, maximized: false });
    });

    it('behält die Position auf einem zweiten Bildschirm, solange er angeschlossen ist', async () => {
      const onRight = { x: 2400, y: 200, width: 1600, height: 900 };
      const h = startWorkspace({ displays: [PRIMARY_DISPLAY, RIGHT_DISPLAY] });
      h.workspace.windowChanged({ bounds: onRight, maximized: false });

      await h.restart();

      expect(h.workspace.windowState()).toEqual({ bounds: onRight, maximized: false });
    });
  });

  describe('ausserhalb aller Bildschirme', () => {
    it('zentriert das Fenster eines abgezogenen Bildschirms auf dem Hauptbildschirm, in seiner Grösse', async () => {
      const h = startWorkspace({ displays: [PRIMARY_DISPLAY, RIGHT_DISPLAY] });
      h.workspace.windowChanged({ bounds: { x: 2400, y: 200, width: 1000, height: 700 }, maximized: false });

      h.system.setDisplays([PRIMARY_DISPLAY]);
      await h.restart();

      expect(h.workspace.windowState()).toEqual({
        bounds: { x: 460, y: 170, width: 1000, height: 700 },
        maximized: false,
      });
    });

    it('bleibt dabei maximiert, wenn es maximiert war', async () => {
      const h = startWorkspace({ displays: [PRIMARY_DISPLAY, RIGHT_DISPLAY] });
      h.workspace.windowChanged({ bounds: { x: 2400, y: 200, width: 1000, height: 700 }, maximized: true });

      h.system.setDisplays([PRIMARY_DISPLAY]);
      await h.restart();

      expect(h.workspace.windowState()).toEqual({
        bounds: { x: 460, y: 170, width: 1000, height: 700 },
        maximized: true,
      });
    });

    it('verkleinert ein Fenster, das grösser ist als der Hauptbildschirm, auf dessen Arbeitsbereich', async () => {
      const h = startWorkspace({ displays: [PRIMARY_DISPLAY, RIGHT_DISPLAY] });
      h.workspace.windowChanged({ bounds: { x: 2000, y: 50, width: 2400, height: 1300 }, maximized: false });

      h.system.setDisplays([PRIMARY_DISPLAY]);
      await h.restart();

      expect(h.workspace.windowState()).toEqual({
        bounds: { x: 0, y: 0, width: 1920, height: 1040 },
        maximized: false,
      });
    });

    it('lässt ein Fenster stehen, das nur teilweise auf dem Bildschirm liegt, solange die Titelleiste greifbar ist', async () => {
      const partly = { x: 1700, y: 600, width: 1000, height: 700 };
      const h = startWorkspace();
      h.workspace.windowChanged({ bounds: partly, maximized: false });

      await h.restart();

      expect(h.workspace.windowState()).toEqual({ bounds: partly, maximized: false });
    });

    it.each([
      ['über dem oberen Rand', { x: 200, y: -100, width: 1000, height: 700 }],
      ['nur ein schmaler Streifen am rechten Rand', { x: 1880, y: 200, width: 1000, height: 700 }],
      ['unter der Taskleiste', { x: 200, y: 1030, width: 1000, height: 700 }],
    ])('zentriert ein Fenster, dessen Titelleiste nicht greifbar ist (%s)', async (_label, bounds) => {
      const h = startWorkspace();
      h.workspace.windowChanged({ bounds, maximized: false });

      await h.restart();

      expect(h.workspace.windowState()).toEqual({
        bounds: { x: 460, y: 170, width: 1000, height: 700 },
        maximized: false,
      });
    });
  });

  describe('Speichern', () => {
    it('speichert entprellt: einmal, sobald das Fenster eine halbe Sekunde lang ruht', () => {
      const storage = new MemoryStorage();
      const h = startWorkspace({ storage });
      const savesBefore = storage.saves;

      h.workspace.windowChanged({ bounds: { ...NORMAL, x: 210 }, maximized: false });
      h.clock.advance(100);
      h.workspace.windowChanged({ bounds: { ...NORMAL, x: 220 }, maximized: false });
      h.clock.advance(100);
      h.workspace.windowChanged({ bounds: { ...NORMAL, x: 230 }, maximized: false });
      h.clock.advance(499);
      expect(storage.saves).toBe(savesBefore);

      h.clock.advance(1);
      expect(storage.saves).toBe(savesBefore + 1);
      expect(storage.stored).toMatchObject({ window: { bounds: { ...NORMAL, x: 230 }, maximized: false } });
    });

    it('speichert nichts, wenn sich die Angaben nicht geändert haben', () => {
      const storage = new MemoryStorage();
      const h = startWorkspace({ storage });
      h.workspace.windowChanged({ bounds: NORMAL, maximized: false });
      h.clock.advance(500);
      const savesBefore = storage.saves;

      h.workspace.windowChanged({ bounds: NORMAL, maximized: false });
      h.clock.advance(500);

      expect(storage.saves).toBe(savesBefore);
    });

    it('sichert die letzten Angaben beim Beenden, auch innerhalb der Entprellzeit', async () => {
      const h = startWorkspace();
      h.workspace.windowChanged({ bounds: NORMAL, maximized: false });
      h.clock.advance(100);
      h.workspace.windowChanged({ bounds: NORMAL, maximized: true });

      await h.restart();

      expect(h.workspace.windowState()).toEqual({ bounds: NORMAL, maximized: true });
    });

    it('nimmt nach dem Beenden keine Fensterangaben mehr an', async () => {
      const storage = new MemoryStorage();
      const h = startWorkspace({ storage });
      await h.workspace.shutdown();
      const before = h.workspace.windowState();
      const savesBefore = storage.saves;

      h.workspace.windowChanged({ bounds: NORMAL, maximized: false });
      h.clock.advance(500);

      expect(h.workspace.windowState()).toEqual(before);
      expect(storage.saves).toBe(savesBefore);
    });
  });
});
