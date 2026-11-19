import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryStorage } from '../support/fakes';
import { startWorkspace, type TestWorkspace } from '../support/harness';

// Verlauf normaler Tabs: Der Renderer liefert den Inhalt auf Anfrage, der Kern sichert ihn pro Tab und
// gibt ihn nach einem Neustart vor dem Start der Shell zurück. Die Oberfläche des Test-Gerüsts zeigt
// den wiederhergestellten Verlauf und die Ausgabe der Shell und antwortet sofort auf Anfragen.

const INTERVAL = 30_000;

/** Lässt ausstehende Promise-Fortsetzungen laufen. */
const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

afterEach(() => {
  vi.restoreAllMocks();
});

/** Zwei laufende Tabs „Terminal 1“ und „Terminal 2“. */
function twoRunningTabs(options?: Parameters<typeof startWorkspace>[0]): { h: TestWorkspace; a: string; b: string } {
  const h = startWorkspace(options);
  const a = h.activeTab()!.id;
  const b = h.workspace.createTab();
  h.showAllViews();
  return { h, a, b };
}

describe('Verlauf', () => {
  describe('Wiederherstellen', () => {
    it('gibt den Verlauf nach einem Neustart dem richtigen Tab zurück, bevor dessen Startauftrag erteilt wird', async () => {
      const { h, a, b } = twoRunningTabs();
      h.terminal.output(a, 'PS C:\\> dir\r\n');
      h.terminal.output(b, 'PS C:\\> git status\r\n');
      h.clock.advance(INTERVAL);
      const savedAt = h.clock.now();

      await h.restart();
      const restored: { tabId: string; content: string; savedAt: number; startsBefore: number }[] = [];
      h.workspace.subscribe((event) => {
        if (event.type !== 'restoreHistory') return;
        const { tabId, content } = event;
        restored.push({ tabId, content, savedAt: event.savedAt, startsBefore: h.terminal.startsFor(tabId).length });
      });

      h.workspace.viewReady(b, 100, 30);
      expect(restored).toEqual([{ tabId: b, content: 'PS C:\\> git status\r\n', savedAt, startsBefore: 0 }]);
      expect(h.terminal.startsFor(b)).toHaveLength(1);

      h.workspace.viewReady(a, 100, 30);
      expect(restored.at(-1)).toEqual({ tabId: a, content: 'PS C:\\> dir\r\n', savedAt, startsBefore: 0 });
    });

    it('steht vor der ersten Ausgabe der Shell', async () => {
      const h = startWorkspace();
      const id = h.activeTab()!.id;
      h.showAllViews();
      h.terminal.output(id, 'vorher\r\n');
      await h.restart();

      h.showAllViews();
      h.terminal.output(id, 'PS C:\\> ');

      expect(h.events.filter((e) => e.type === 'restoreHistory' || e.type === 'output')).toEqual([
        { type: 'restoreHistory', tabId: id, content: 'vorher\r\n', savedAt: expect.any(Number) },
        { type: 'output', tabId: id, data: 'PS C:\\> ' },
      ]);
      expect(h.renderer.screen(id)).toBe('vorher\r\nPS C:\\> ');
    });

    it('gibt den Verlauf nur einmal zurück, nicht beim Neustart einer beendeten Shell', async () => {
      const h = startWorkspace();
      const id = h.activeTab()!.id;
      h.showAllViews();
      h.terminal.output(id, 'vorher\r\n');
      await h.restart();
      h.showAllViews();

      h.terminal.exit(id, 0);
      h.workspace.restartTab(id);
      h.workspace.viewReady(id, 100, 30);

      expect(h.eventsOfType('restoreHistory')).toHaveLength(1);
      expect(h.terminal.startsFor(id)).toHaveLength(2);
    });

    it('gibt neuen Tabs und Tabs ohne gesicherten Verlauf keinen', async () => {
      const h = startWorkspace();
      h.showAllViews();
      await h.restart();

      h.workspace.createTab();
      h.showAllViews();

      expect(h.eventsOfType('restoreHistory')).toEqual([]);
      expect(h.terminal.starts).toHaveLength(2);
    });

    it('übergeht einen leeren Verlauf', async () => {
      const h = startWorkspace();
      const id = h.activeTab()!.id;
      h.showAllViews();
      h.workspace.saveHistory(id, '');

      await h.restart();
      h.showAllViews();

      expect(h.eventsOfType('restoreHistory')).toEqual([]);
    });

    it('behält den Verlauf eines Tabs, dessen Shell nach einem Neustart noch nicht lief', async () => {
      const { h, b } = twoRunningTabs();
      h.terminal.output(b, 'aus der ersten Sitzung\r\n');
      await h.restart();
      h.workspace.viewReady(h.activeTab()!.id, 100, 30);

      await h.restart();
      h.workspace.viewReady(b, 100, 30);

      expect(h.eventsOfType('restoreHistory')).toMatchObject([{ tabId: b, content: 'aus der ersten Sitzung\r\n' }]);
    });

    it('sichert den wiederhergestellten Verlauf zusammen mit der neuen Ausgabe', async () => {
      const h = startWorkspace();
      const id = h.activeTab()!.id;
      h.showAllViews();
      h.terminal.output(id, 'erste Sitzung\r\n');
      await h.restart();
      h.showAllViews();
      h.terminal.output(id, 'zweite Sitzung\r\n');

      await h.restart();
      h.showAllViews();

      expect(h.eventsOfType('restoreHistory')).toMatchObject([
        { tabId: id, content: 'erste Sitzung\r\nzweite Sitzung\r\n' },
      ]);
    });
  });

  describe('periodisch sichern', () => {
    it('sichert alle 30 Sekunden nur die Tabs, deren Inhalt sich geändert hat', () => {
      const { h, a, b } = twoRunningTabs();
      h.terminal.output(a, 'PS C:\\> dir\r\n');

      h.clock.advance(INTERVAL - 1);
      expect(h.eventsOfType('requestHistory')).toEqual([]);
      expect(h.storedHistory(a)).toBeNull();

      h.clock.advance(1);
      expect(h.eventsOfType('requestHistory')).toEqual([{ type: 'requestHistory', tabIds: [a] }]);
      expect(h.storedHistory(a)).toEqual({ content: 'PS C:\\> dir\r\n', savedAt: h.clock.now() });
      expect(h.storedHistory(b)).toBeNull();
    });

    it('sichert einen Tab erst wieder, wenn neue Ausgabe gekommen ist', () => {
      const { h, a, b } = twoRunningTabs();
      h.terminal.output(a, 'eins\r\n');
      h.terminal.output(b, 'zwei\r\n');
      h.clock.advance(INTERVAL);

      h.clock.advance(INTERVAL);
      expect(h.eventsOfType('requestHistory')).toHaveLength(1);

      h.terminal.output(b, 'drei\r\n');
      h.clock.advance(INTERVAL);
      expect(h.eventsOfType('requestHistory').at(-1)).toEqual({ type: 'requestHistory', tabIds: [b] });
      expect(h.storedHistory(a)?.content).toBe('eins\r\n');
      expect(h.storedHistory(b)?.content).toBe('zwei\r\ndrei\r\n');
    });

    it('fordert den Verlauf erneut an, wenn der Renderer nicht geantwortet hat', () => {
      const h = startWorkspace();
      const id = h.activeTab()!.id;
      h.showAllViews();
      h.terminal.output(id, 'Ausgabe\r\n');
      h.renderer.answersHistory = false;
      h.clock.advance(INTERVAL);
      expect(h.storedHistory(id)).toBeNull();

      h.renderer.answersHistory = true;
      h.clock.advance(INTERVAL);

      expect(h.eventsOfType('requestHistory')).toEqual([
        { type: 'requestHistory', tabIds: [id] },
        { type: 'requestHistory', tabIds: [id] },
      ]);
      expect(h.storedHistory(id)?.content).toBe('Ausgabe\r\n');
    });

    it('sichert auch einen Tab, dessen Shell inzwischen beendet ist', () => {
      const h = startWorkspace();
      const id = h.activeTab()!.id;
      h.showAllViews();
      h.terminal.output(id, 'exit\r\n');
      h.terminal.exit(id, 0);

      h.clock.advance(INTERVAL);

      expect(h.storedHistory(id)?.content).toBe('exit\r\n');
    });
  });

  describe('Schliessen', () => {
    it('löscht beim Schliessen den Verlauf des Tabs', async () => {
      const { h, a, b } = twoRunningTabs();
      h.terminal.output(a, 'eins\r\n');
      h.terminal.output(b, 'zwei\r\n');
      h.clock.advance(INTERVAL);

      h.workspace.closeTab(a);

      expect(h.storedHistory(a)).toBeNull();
      expect(h.storedHistory(b)?.content).toBe('zwei\r\n');
      await h.restart();
      h.showAllViews();
      expect(h.eventsOfType('restoreHistory')).toMatchObject([{ tabId: b }]);
    });

    it('sichert für einen geschlossenen Tab nichts mehr, auch wenn sein Verlauf erst danach eintrifft', () => {
      const h = startWorkspace();
      const id = h.activeTab()!.id;
      h.showAllViews();
      h.terminal.output(id, 'Ausgabe\r\n');
      h.renderer.answersHistory = false;
      h.clock.advance(INTERVAL);

      h.workspace.closeTab(id);
      h.workspace.saveHistory(id, 'Ausgabe\r\n');

      expect(h.storedHistory(id)).toBeNull();
    });
  });

  describe('Beenden', () => {
    it('sichert den aktuellen Verlauf und beendet erst danach die Shells', async () => {
      const storage = new MemoryStorage();
      const { h, a } = twoRunningTabs({ storage });
      h.terminal.output(a, 'kurz vor dem Beenden\r\n');
      const terminal = h.terminal;
      const shellsWhenRequested: number[] = [];
      h.workspace.subscribe((event) => {
        if (event.type === 'requestHistory') shellsWhenRequested.push(terminal.killAllCalls);
      });

      await h.workspace.shutdown();

      expect(shellsWhenRequested).toEqual([0]);
      expect(h.storedHistory(a)?.content).toBe('kurz vor dem Beenden\r\n');
      expect(storage.flushes).toBe(1);
      expect(terminal.killAllCalls).toBe(1);
    });

    it('fordert beim Beenden nur die Tabs an, die sich seit der letzten Sicherung geändert haben', async () => {
      const { h, a, b } = twoRunningTabs();
      h.terminal.output(a, 'eins\r\n');
      h.terminal.output(b, 'zwei\r\n');
      h.clock.advance(INTERVAL);
      h.terminal.output(b, 'drei\r\n');

      await h.workspace.shutdown();

      expect(h.eventsOfType('requestHistory').at(-1)).toEqual({ type: 'requestHistory', tabIds: [b] });
      expect(h.storedHistory(b)?.content).toBe('zwei\r\ndrei\r\n');
    });

    it('beendet nach 2 Sekunden trotzdem, wenn der Renderer nicht antwortet', async () => {
      const storage = new MemoryStorage();
      const h = startWorkspace({ storage });
      const id = h.activeTab()!.id;
      h.showAllViews();
      h.terminal.output(id, 'Ausgabe\r\n');
      h.renderer.answersHistory = false;

      let finished = false;
      const done = h.workspace.shutdown().then(() => {
        finished = true;
      });
      h.clock.advance(1999);
      await settle();
      expect(finished).toBe(false);
      expect(h.terminal.killAllCalls).toBe(0);

      h.clock.advance(1);
      await done;
      expect(h.terminal.killAllCalls).toBe(1);
      expect(storage.flushes).toBe(1);
      expect(h.storedHistory(id)).toBeNull();
    });

    it('nimmt nach dem Zeitlimit keinen Verlauf mehr an', async () => {
      const h = startWorkspace();
      const id = h.activeTab()!.id;
      h.showAllViews();
      h.terminal.output(id, 'Ausgabe\r\n');
      h.renderer.answersHistory = false;
      const done = h.workspace.shutdown();
      h.clock.advance(2000);
      await done;

      h.workspace.saveHistory(id, 'zu spät');

      expect(h.storedHistory(id)).toBeNull();
    });

    it('wartet nicht, wenn sich kein Tab geändert hat', async () => {
      const h = startWorkspace();
      h.showAllViews();
      h.renderer.answersHistory = false;

      await h.workspace.shutdown();

      expect(h.eventsOfType('requestHistory')).toEqual([]);
      expect(h.terminal.killAllCalls).toBe(1);
    });

    it('beendet auch, wenn das Sichern des Verlaufs scheitert', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const storage = new MemoryStorage();
      storage.saveHistory = () => {
        throw new Error('Datenträger voll');
      };
      const h = startWorkspace({ storage });
      const id = h.activeTab()!.id;
      h.showAllViews();
      h.terminal.output(id, 'Ausgabe\r\n');

      await h.workspace.shutdown();

      expect(h.terminal.killAllCalls).toBe(1);
      expect(storage.flushes).toBe(1);
    });

    it('sichert nach dem Beenden nicht mehr periodisch', async () => {
      const h = startWorkspace();
      const id = h.activeTab()!.id;
      h.showAllViews();
      await h.workspace.shutdown();

      h.clock.advance(INTERVAL);

      expect(h.eventsOfType('requestHistory')).toEqual([]);
      expect(h.clock.pendingTimers()).toBe(0);
      expect(h.storedHistory(id)).toBeNull();
    });
  });

  describe('Windows-Abmeldung', () => {
    it('schreibt sofort und mit dem zuletzt gesicherten Verlauf, ohne auf den Renderer zu warten', () => {
      const storage = new MemoryStorage();
      const h = startWorkspace({ storage });
      const id = h.activeTab()!.id;
      h.showAllViews();
      h.terminal.output(id, 'gesichert\r\n');
      h.clock.advance(INTERVAL);
      h.renderer.answersHistory = false;
      h.terminal.output(id, 'noch nicht gesichert\r\n');
      const window = { bounds: { x: 100, y: 100, width: 1000, height: 700 }, maximized: false };
      h.workspace.windowChanged(window);
      const requestsBefore = h.eventsOfType('requestHistory').length;

      h.workspace.sessionEnding();

      expect(storage.flushes).toBe(1);
      expect(storage.stored).toMatchObject({ window });
      expect(h.eventsOfType('requestHistory')).toHaveLength(requestsBefore);
      expect(h.storedHistory(id)?.content).toBe('gesichert\r\n');
    });

    it('lässt TermHub weiterlaufen, falls Windows die Abmeldung doch abbricht', () => {
      const h = startWorkspace();
      const id = h.activeTab()!.id;
      h.showAllViews();

      h.workspace.sessionEnding();
      h.terminal.output(id, 'danach\r\n');
      h.clock.advance(INTERVAL);
      h.workspace.renameTab(id, 'Weiter');

      expect(h.storedHistory(id)?.content).toBe('danach\r\n');
      expect(h.activeTab()?.name).toBe('Weiter');
    });
  });
});
