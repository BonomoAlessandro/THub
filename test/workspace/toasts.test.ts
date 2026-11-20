import { describe, expect, it } from 'vitest';
import type { ToastSnapshot } from '../../src/shared/types';
import { ClaudeTab, startScene, type Scene } from '../support/claudeTab';
import type { TestWorkspace } from '../support/harness';

// Hinweise im Fenster (Ticket 14) über die echte lokale Schnittstelle: Hook-Ereignisse in der Form, wie sie Claude
// Code im Spike geschickt hat (spikes/claude-hooks/samples), Befehle der Oberfläche direkt am Kern und eine
// steuerbare Uhr für den Countdown der „fertig“-Hinweise.

const FINISHED_MS = 6000;
const ESC_QUIET_MS = 1500;

function toasts(h: TestWorkspace): ToastSnapshot[] {
  return h.snapshot().toasts;
}

describe('Hinweise im Fenster', () => {
  describe('Auslöser', () => {
    it('kein Hinweis für den sichtbaren Tab, weder bei „wartet“ noch bei „fertig“', async () => {
      const { h, a } = await startScene();
      h.workspace.activateTab(a.id);

      await a.askPermission();
      expect(a.status()).toBe('waiting');
      a.h.workspace.writeToTab(a.id, '1');
      await a.send('PostToolUse-Bash');
      await a.send('Stop');

      expect(toasts(h)).toEqual([]);
      expect(h.eventsOfType('toasts')).toEqual([]);
    });

    it('ein nicht sichtbarer Tab wechselt in „wartet“ → Hinweis „wartet“, gemeldet mit einem toasts-Ereignis', async () => {
      const { h, a } = await startScene();

      await a.askPermission();

      expect(toasts(h)).toEqual([{ id: expect.any(String), tabId: a.id, kind: 'waiting' }]);
      expect(h.eventsOfType('toasts').at(-1)).toEqual({ type: 'toasts', toasts: toasts(h) });
    });

    it('ein nicht sichtbarer Tab wird fertig → Hinweis „fertig“ mit einem Countdown von 6 Sekunden', async () => {
      const { h, a } = await startScene();

      await a.answer();

      expect(toasts(h)).toEqual([
        {
          id: expect.any(String),
          tabId: a.id,
          kind: 'finished',
          countdown: { totalMs: FINISHED_MS, remainingMs: FINISHED_MS, running: true },
        },
      ]);
      expect(a.status()).toBe('finished');
    });

    it('Rückfrage ohne PermissionRequest (Rückfallebene über die Benachrichtigung) → Hinweis „wartet“', async () => {
      const { a } = await startScene();
      await a.send('UserPromptSubmit');
      await a.send('PreToolUse-Bash');

      await a.send('Notification-permission_prompt');

      expect(a.toast()).toMatchObject({ kind: 'waiting' });
    });

    it('auch der aktive Tab bekommt einen Hinweis, solange das Fenster im Hintergrund ist', async () => {
      const { h, a } = await startScene();
      h.workspace.activateTab(a.id);
      h.workspace.windowForeground(false);

      await a.answer();

      expect(a.toast()).toMatchObject({ kind: 'finished', countdown: { running: false } });
    });

    it('ohne Wechsel in „wartet“ kein neuer Hinweis: die verspätete Benachrichtigung zur selben Rückfrage ändert nichts', async () => {
      const { h, a } = await startScene();
      await a.askPermission();
      const first = a.toast();
      const events = h.eventsOfType('toasts').length;

      await a.send('Notification-permission_prompt');

      expect(a.toast()).toEqual(first);
      expect(h.eventsOfType('toasts')).toHaveLength(events);
    });

    it('wer selbst unterbricht (Esc ohne folgendes Ereignis), bekommt keinen „fertig“-Hinweis', async () => {
      const { h, a } = await startScene();
      h.workspace.activateTab(a.id);
      await a.send('UserPromptSubmit');

      h.workspace.writeToTab(a.id, '\x1b');
      h.workspace.activateTab(h.tabs()[0].id);
      h.clock.advance(ESC_QUIET_MS);

      expect(a.status()).toBe('idle');
      expect(toasts(h)).toEqual([]);
    });
  });

  describe('höchstens ein Hinweis pro Tab', () => {
    it('ein neuer Hinweis ersetzt den alten des Tabs, mit neuer Kennung: „wartet“ → „fertig“ → „wartet“', async () => {
      const { h, a } = await startScene();
      await a.askPermission();
      const waiting = a.toast()!;

      // Die Rückfrage endet ohne Antwort im Tab, Claude wird fertig.
      await a.send('Stop');
      const finished = a.toast()!;
      expect(finished).toMatchObject({ kind: 'finished' });
      expect(finished.id).not.toBe(waiting.id);

      // Eine Hintergrund-Aufgabe endet, Claude fragt erneut nach.
      await a.send('UserPromptSubmit-task-notification');
      await a.send('PreToolUse-Bash');
      await a.send('PermissionRequest-Bash');
      expect(a.toast()).toMatchObject({ kind: 'waiting' });
      expect(a.toast()!.id).not.toBe(finished.id);
      expect(toasts(h)).toHaveLength(1);
    });

    it('wird der Tab noch einmal fertig, ersetzt der neue „fertig“-Hinweis den alten, und der Countdown beginnt von vorn', async () => {
      const { h, a } = await startScene();
      await a.answer();
      const first = a.toast()!;
      h.clock.advance(4000);

      await a.answerAgain();

      const second = a.toast()!;
      expect(second.id).not.toBe(first.id);
      expect(second).toMatchObject({ kind: 'finished', countdown: { remainingMs: FINISHED_MS } });
      h.clock.advance(4000);
      expect(a.toast()?.id).toBe(second.id);
      h.clock.advance(FINISHED_MS - 4000);
      expect(a.toast()).toBeUndefined();
    });

    it('Hinweise mehrerer Tabs stehen gleichzeitig, in der Reihenfolge ihres Erscheinens', async () => {
      const { h, a, b } = await startScene();

      await b.askPermission();
      await a.answer();

      expect(toasts(h).map((t) => [t.tabId, t.kind])).toEqual([
        [b.id, 'waiting'],
        [a.id, 'finished'],
      ]);
    });
  });

  describe('Tab angezeigt: nur dessen Hinweis verschwindet', () => {
    it.each([
      ['Klick auf den Hinweis oder auf den Tab', (s: Scene) => s.h.workspace.activateTab(s.a.id)],
      ['Ctrl+Tab', (s: Scene) => s.h.workspace.activateRelativeTab(1)],
      ['Ctrl+Shift+Tab', (s: Scene) => s.h.workspace.activateRelativeTab(-2)],
      ['Ctrl+2', (s: Scene) => s.h.workspace.activateTabAt(1)],
    ])('per %s', async (_way, show) => {
      const s = await startScene();
      await s.a.askPermission();
      await s.b.answer();

      show(s);

      expect(s.h.activeTab()?.id).toBe(s.a.id);
      expect(s.a.toast()).toBeUndefined();
      expect(s.b.toast()).toMatchObject({ kind: 'finished' });
      expect(s.h.eventsOfType('toasts').at(-1)?.toasts.map((t) => t.tabId)).toEqual([s.b.id]);
    });

    it('„fertig“ verschwindet beim Anzeigen sofort, mit dem grünen Punkt', async () => {
      const { h, a } = await startScene();
      await a.answer();

      h.workspace.activateTab(a.id);

      expect(a.toast()).toBeUndefined();
      expect(a.status()).toBe('idle');
    });

    it('wird der aktive Tab geschlossen, ist der Nachbar angezeigt: sein Hinweis verschwindet, der des anderen bleibt', async () => {
      const { h, shownId, a, b } = await startScene();
      await a.askPermission();
      await b.askPermission();

      h.workspace.closeTab(shownId);

      expect(h.activeTab()?.id).toBe(a.id);
      expect(toasts(h).map((t) => t.tabId)).toEqual([b.id]);
    });

    it('kommt das Fenster mit dem Tab in den Vordergrund, verschwindet sein Hinweis; ein Wechsel im Hintergrund genügt nicht', async () => {
      const { h, a, b } = await startScene();
      h.workspace.windowForeground(false);
      await a.askPermission();
      await b.askPermission();

      h.workspace.activateTab(a.id);
      expect(a.toast()).toMatchObject({ kind: 'waiting' });

      h.workspace.windowForeground(true);
      expect(a.toast()).toBeUndefined();
      expect(b.toast()).toMatchObject({ kind: 'waiting' });
    });

    it('ein geschlossener Tab nimmt seinen Hinweis mit', async () => {
      const { h, a, b } = await startScene();
      await a.askPermission();
      await b.answer();

      h.workspace.closeTab(a.id);

      expect(toasts(h).map((t) => t.tabId)).toEqual([b.id]);
    });
  });

  describe('„fertig“ verschwindet nach 6 Sekunden Vordergrundzeit', () => {
    it('nach 6 Sekunden im Vordergrund ist er weg, der grüne Punkt bleibt', async () => {
      const { h, a } = await startScene();
      await a.answer();

      h.clock.advance(FINISHED_MS - 1);
      expect(a.toast()).toMatchObject({ countdown: { remainingMs: 1, running: true } });
      h.clock.advance(1);

      expect(a.toast()).toBeUndefined();
      expect(h.eventsOfType('toasts').at(-1)).toEqual({ type: 'toasts', toasts: [] });
      expect(a.status()).toBe('finished');
    });

    it('im Hintergrund hält der Countdown an und läuft im Vordergrund weiter', async () => {
      const { h, a } = await startScene();
      h.workspace.windowForeground(false);
      await a.answer();

      h.clock.advance(60_000);
      expect(a.toast()).toMatchObject({ countdown: { remainingMs: FINISHED_MS, running: false } });

      h.workspace.windowForeground(true);
      expect(h.eventsOfType('toasts').at(-1)?.toasts[0]).toMatchObject({ countdown: { running: true } });
      h.clock.advance(2000);
      h.workspace.windowForeground(false);
      expect(a.toast()).toMatchObject({ countdown: { remainingMs: 4000, running: false } });
      h.clock.advance(60_000);

      h.workspace.windowForeground(true);
      h.clock.advance(3999);
      expect(a.toast()).toMatchObject({ countdown: { remainingMs: 1 } });
      h.clock.advance(1);
      expect(a.toast()).toBeUndefined();
    });

    it('solange die Maus auf dem Hinweis steht, hält er an', async () => {
      const { h, a } = await startScene();
      await a.answer();
      const { id } = a.toast()!;
      h.clock.advance(1000);

      h.workspace.holdToast(id, true);
      expect(a.toast()).toMatchObject({ countdown: { remainingMs: 5000, running: false } });
      h.clock.advance(30_000);
      expect(a.toast()?.id).toBe(id);

      h.workspace.holdToast(id, false);
      h.clock.advance(4999);
      expect(a.toast()?.id).toBe(id);
      h.clock.advance(1);
      expect(a.toast()).toBeUndefined();
    });

    it('Maus auf dem Hinweis und Fenster im Hintergrund: er läuft erst weiter, wenn beides vorbei ist', async () => {
      const { h, a } = await startScene();
      await a.answer();
      const { id } = a.toast()!;

      h.workspace.holdToast(id, true);
      h.workspace.windowForeground(false);
      h.workspace.holdToast(id, false);
      h.clock.advance(10_000);
      expect(a.toast()).toMatchObject({ countdown: { remainingMs: FINISHED_MS, running: false } });

      h.workspace.windowForeground(true);
      h.clock.advance(FINISHED_MS);
      expect(a.toast()).toBeUndefined();
    });

    it('× nimmt ihn sofort weg', async () => {
      const { h, a, b } = await startScene();
      await a.answer();
      await b.answer();

      h.workspace.dismissToast(a.toast()!.id);

      expect(toasts(h).map((t) => t.tabId)).toEqual([b.id]);
      expect(a.status()).toBe('finished');
      h.clock.advance(FINISHED_MS);
      expect(toasts(h)).toEqual([]);
    });
  });

  describe('„wartet“ bleibt, bis der Tab angezeigt wird oder wieder arbeitet', () => {
    it('bleibt im Vordergrund beliebig lange stehen', async () => {
      const { h, a } = await startScene();
      await a.askPermission();
      const { id } = a.toast()!;

      h.clock.advance(10 * 60_000);
      h.workspace.holdToast(id, true);
      h.workspace.holdToast(id, false);

      expect(a.toast()).toEqual({ id, tabId: a.id, kind: 'waiting' });
    });

    it.each([
      ['PostToolUse', 'PostToolUse-Bash'],
      ['PreToolUse', 'PreToolUse-Read'],
      ['UserPromptSubmit', 'UserPromptSubmit-task-notification'],
    ] as const)('verschwindet, wenn der Tab wieder arbeitet (%s)', async (_label, sample) => {
      const { a, b } = await startScene();
      await a.askPermission();
      await b.askPermission();

      await a.send(sample);

      expect(a.status()).toBe('working');
      expect(a.toast()).toBeUndefined();
      expect(b.toast()).toMatchObject({ kind: 'waiting' });
    });

    it('verschwindet, wenn Claude im Tab endet (SessionEnd, Ende-Meldung des Starters oder Ende der Shell)', async () => {
      const { h, shownId, a, b } = await startScene();
      const c = await ClaudeTab.launch(h, h.workspace.createTab());
      h.showAllViews();
      h.workspace.activateTab(shownId);
      await a.askPermission();
      await b.askPermission();
      await c.askPermission();

      await a.send('SessionEnd-prompt_input_exit');
      await h.api.exit(b.id, b.sessionId, 0);
      h.terminal.exit(c.id, 0);

      expect(toasts(h)).toEqual([]);
    });

    it('wurde der Tab einmal angezeigt, kommt beim Wegwechseln kein neuer Hinweis, solange Claude weiter wartet', async () => {
      const { h, shownId, a } = await startScene();
      await a.askPermission();

      h.workspace.activateTab(a.id);
      h.workspace.activateTab(shownId);

      expect(a.status()).toBe('waiting');
      expect(toasts(h)).toEqual([]);
    });

    it('× nimmt ihn weg; der Tab wartet weiter', async () => {
      const { h, a } = await startScene();
      await a.askPermission();

      h.workspace.dismissToast(a.toast()!.id);

      expect(toasts(h)).toEqual([]);
      expect(a.status()).toBe('waiting');
    });
  });

  describe('Einstellung „Hinweise im Fenster“', () => {
    it('ist ohne Einstellung an', async () => {
      const { h } = await startScene();

      expect(h.snapshot().settings.notifications).toBe(true);
    });

    it('ausgeschaltet gibt es keine Hinweise; die Status-Symbole bleiben', async () => {
      const { h, a, b } = await startScene();

      h.workspace.updateSettings({ notifications: false });
      await a.askPermission();
      await b.answer();

      expect(toasts(h)).toEqual([]);
      expect(h.eventsOfType('toasts')).toEqual([]);
      expect([a.status(), b.status()]).toEqual(['waiting', 'finished']);
    });

    it('beim Ausschalten verschwinden auch die Hinweise, die gerade stehen; wieder eingeschaltet kommen neue', async () => {
      const { h, a, b } = await startScene();
      await a.askPermission();
      await b.answer();

      h.workspace.updateSettings({ notifications: false });
      expect(toasts(h)).toEqual([]);

      h.workspace.updateSettings({ notifications: true });
      await b.answerAgain();
      expect(toasts(h).map((t) => [t.tabId, t.kind])).toEqual([[b.id, 'finished']]);
    });

    it('übersteht einen Neustart, und auch danach gibt es keine Hinweise', async () => {
      const { h, shownId } = await startScene();
      h.workspace.updateSettings({ notifications: false });

      await h.restart();
      expect(h.snapshot().settings.notifications).toBe(false);
      expect(h.storedState().settings.notifications).toBe(false);

      h.showAllViews();
      h.workspace.windowForeground(true);
      h.workspace.activateTab(shownId);
      const c = await ClaudeTab.launch(h, h.tabs().find((t) => t.id !== shownId)!.id);
      await c.askPermission();
      expect(c.status()).toBe('waiting');
      expect(toasts(h)).toEqual([]);
    });
  });
});
