import { describe, expect, it } from 'vitest';
import type { ToastSnapshot } from '../../src/shared/types';
import { hookPayload } from '../support/apiClient';
import { ClaudeTab, startScene } from '../support/claudeTab';
import { startWorkspaceWithApi, type TestWorkspace } from '../support/harness';

// Offene Punkte aus Claudes Antworten als Hinweis (Ticket 22) über die echte lokale Schnittstelle: `Stop` in der Form
// aus dem Spike (spikes/claude-hooks/samples/Stop.json) mit einer eigenen `last_assistant_message`, Befehle der
// Oberfläche direkt am Kern.

const FINISHED_MS = 6000;

/** Eine Antwort, wie Claude sie mit der Anweisung von THub schreibt. */
const WITH_SECTION = [
  'Ich habe die Anmeldung auf OAuth umgestellt; alle Tests laufen.',
  '',
  '## Offene Punkte',
  '',
  '- Soll der alte Login bis Ende Jahr parallel weiterlaufen?',
  '- Die Client-ID für die Produktion fehlt noch.',
].join('\n');
const SECTION_POINTS = [
  'Soll der alte Login bis Ende Jahr parallel weiterlaufen?',
  'Die Client-ID für die Produktion fehlt noch.',
];

/** Eine Antwort ohne Abschnitt, die mit einer Frage endet. */
const WITH_QUESTION = 'Der Fix ist drin und getestet. Soll ich auch die alten Einträge korrigieren?';

/** Eine Antwort ohne offene Punkte. */
const WITHOUT_POINTS = 'Erledigt: Die Tests laufen wieder, die Ursache war eine fehlende Zeitzone.';

function toasts(h: TestWorkspace): ToastSnapshot[] {
  return h.snapshot().toasts;
}

describe('Offene Punkte aus Claudes Antworten', () => {
  describe('Erkennung beim Ende einer Antwort (Stop)', () => {
    it.each([
      ['Markdown-Überschrift', '## Offene Punkte'],
      ['fette Zeile', '**Offene Punkte**'],
      ['Zeile mit Doppelpunkt', 'Offene Punkte:'],
      ['englisch', '### Open questions'],
    ])('Abschnitt als %s → Hinweis mit genau diesen Punkten', async (_label, heading) => {
      const { a } = await startScene();

      await a.answer(`Fertig.\n\n${heading}\n- Erster Punkt\n- Zweiter Punkt?`);

      expect(a.pointsToast()).toEqual({
        id: expect.any(String),
        tabId: a.id,
        kind: 'openPoints',
        points: ['Erster Punkt', 'Zweiter Punkt?'],
      });
    });

    it('mit Frage im letzten Absatz → Hinweis mit dieser Frage', async () => {
      const { a } = await startScene();

      await a.answer(WITH_QUESTION);

      expect(a.pointsToast()?.points).toEqual(['Soll ich auch die alten Einträge korrigieren?']);
    });

    it('ohne Abschnitt und ohne Frage → kein Hinweis mit offenen Punkten, nur „fertig“ wie bisher', async () => {
      const { h, a } = await startScene();

      await a.answer(WITHOUT_POINTS);

      expect(a.pointsToast()).toBeUndefined();
      expect(toasts(h).map((t) => [t.tabId, t.kind])).toEqual([[a.id, 'finished']]);
    });

    it('ein Code-Block mit Überschrift und Aufzählung ergibt keinen Hinweis', async () => {
      const { a } = await startScene();

      await a.answer('Die Vorlage:\n\n```md\n## Offene Punkte\n- Platzhalter\n```');

      expect(a.pointsToast()).toBeUndefined();
    });

    it('alle Punkte stehen im Hinweis, auch mehr als vier (die Oberfläche zeigt davon vier)', async () => {
      const { a } = await startScene();
      const points = ['Eins', 'Zwei', 'Drei', 'Vier', 'Fünf', 'Sechs'];

      await a.answer(`## Offene Fragen\n${points.map((p) => `1. ${p}`).join('\n')}`);

      expect(a.pointsToast()?.points).toEqual(points);
    });

    it('nur bei Stop: StopFailure und andere Ereignisse ergeben keinen Hinweis', async () => {
      const { a } = await startScene();
      await a.send('UserPromptSubmit', { prompt: WITH_QUESTION });

      const res = await a.h.api.hook(
        a.id,
        'StopFailure',
        hookPayload('Stop', { session_id: a.sessionId, hook_event_name: 'StopFailure', last_assistant_message: WITH_SECTION }),
      );

      expect(res.status).toBe(200);
      expect(a.pointsToast()).toBeUndefined();
    });

    it('nur in Claude-Tabs: Stop zu einem unbekannten Tab ändert nichts', async () => {
      const { h } = await startScene();

      await h.api.hook('gibt-es-nicht', 'Stop', hookPayload('Stop', { last_assistant_message: WITH_SECTION }));

      expect(toasts(h)).toEqual([]);
    });
  });

  describe('der Hinweis bleibt, bis er mit × geschlossen wird', () => {
    it('erscheint auch für den sichtbaren Tab; der Tab ist dann nicht „fertig“', async () => {
      const { h, a } = await startScene();
      h.workspace.activateTab(a.id);

      await a.answer(WITH_SECTION);

      expect(a.pointsToast()?.points).toEqual(SECTION_POINTS);
      expect(a.toast()).toBeUndefined();
      expect(a.status()).toBe('idle');
    });

    it('erscheint auch, wenn das Fenster im Hintergrund ist', async () => {
      const { h, a } = await startScene();
      h.workspace.windowForeground(false);

      await a.answer(WITH_SECTION);

      expect(a.pointsToast()?.points).toEqual(SECTION_POINTS);
    });

    it('bleibt beim Anzeigen des Tabs, auf jedem Weg, und beim Wechsel des Fensters in den Vordergrund', async () => {
      const { h, shownId, a } = await startScene();
      await a.answer(WITH_SECTION);
      const { id } = a.pointsToast()!;

      h.workspace.activateTab(a.id);
      h.workspace.activateTab(shownId);
      h.workspace.activateTabAt(1);
      h.workspace.activateRelativeTab(1);
      h.workspace.activateRelativeTab(-1);
      h.workspace.windowForeground(false);
      h.workspace.windowForeground(true);

      expect(h.activeTab()?.id).toBe(a.id);
      expect(a.pointsToast()?.id).toBe(id);
    });

    it('hat keinen Countdown: steht im Vordergrund beliebig lange, auch nach Überfahren mit der Maus', async () => {
      const { h, a } = await startScene();
      await a.answer(WITH_SECTION);
      const toast = a.pointsToast()!;

      h.workspace.holdToast(toast.id, true);
      h.workspace.holdToast(toast.id, false);
      h.clock.advance(60 * 60_000);

      expect(a.pointsToast()).toEqual(toast);
      expect(toast).not.toHaveProperty('countdown');
    });

    it('× nimmt ihn weg, auch im gespeicherten Zustand; andere Hinweise bleiben', async () => {
      const { h, a, b } = await startScene();
      await a.answer(WITH_SECTION);
      await b.answer(WITH_QUESTION);
      expect(h.storedTab(a.id)?.openPoints).toEqual(SECTION_POINTS);

      h.workspace.dismissToast(a.pointsToast()!.id);

      expect(a.pointsToast()).toBeUndefined();
      expect(b.pointsToast()).toBeDefined();
      expect(h.storedTab(a.id)).not.toHaveProperty('openPoints');
    });

    it('bleibt, wenn Claude im Tab endet', async () => {
      const { a } = await startScene();
      await a.answer(WITH_SECTION);

      await a.send('SessionEnd-prompt_input_exit');

      expect(a.pointsToast()?.points).toEqual(SECTION_POINTS);
    });

    it('ein geschlossener Tab nimmt ihn mit, auch in die Liste der geschlossenen Tabs; wieder geöffnet kommt er nicht zurück', async () => {
      const { h, a, b } = await startScene();
      await a.answer(WITH_SECTION);
      await b.answer(WITH_QUESTION);

      h.workspace.closeTab(a.id);

      expect(toasts(h).map((t) => t.tabId)).toEqual([b.id]);
      expect(h.storedState().tabs.some((t) => t.id === a.id)).toBe(false);
      expect(h.storedState().closedTabs[0].tab).toMatchObject({ id: a.id });
      expect(h.storedState().closedTabs[0].tab).not.toHaveProperty('openPoints');

      expect(h.workspace.reopenClosedTab()).toBe(a.id);
      expect(a.pointsToast()).toBeUndefined();
      await h.restart();
      expect(toasts(h).map((t) => t.tabId)).toEqual([b.id]);
    });
  });

  describe('höchstens einer pro Tab', () => {
    it('eine neue Antwort mit offenen Punkten ersetzt ihn, mit neuer Kennung und den neuen Punkten', async () => {
      const { h, a } = await startScene();
      await a.answer(WITH_SECTION);
      const first = a.pointsToast()!;

      await a.answerAgain(WITH_QUESTION);

      const second = a.pointsToast()!;
      expect(second.id).not.toBe(first.id);
      expect(second.points).toEqual(['Soll ich auch die alten Einträge korrigieren?']);
      expect(h.storedTab(a.id)?.openPoints).toEqual(second.points);
    });

    it('eine Antwort ohne offene Punkte lässt ihn stehen; „fertig“ kommt dazu wie bisher', async () => {
      const { h, a } = await startScene();
      await a.answer(WITH_SECTION);
      const toast = a.pointsToast()!;

      await a.answerAgain(WITHOUT_POINTS);

      expect(a.pointsToast()).toEqual(toast);
      expect(a.toast()).toMatchObject({ kind: 'finished' });
      expect(h.storedTab(a.id)?.openPoints).toEqual(SECTION_POINTS);
    });

    it('ersetzt den „fertig“-Hinweis desselben Tabs; der grüne Punkt am Tab bleibt', async () => {
      const { h, a, b } = await startScene();
      await b.answer(WITHOUT_POINTS);

      await a.answer(WITH_SECTION);

      expect(a.toasts().map((t) => t.kind)).toEqual(['openPoints']);
      expect(a.status()).toBe('finished');
      expect(b.toast()).toMatchObject({ kind: 'finished' });

      // Ein „fertig“ aus einer früheren Antwort verschwindet ebenso.
      await b.answerAgain(WITH_QUESTION);
      expect(b.toasts().map((t) => t.kind)).toEqual(['openPoints']);
      h.clock.advance(FINISHED_MS);
      expect(toasts(h).map((t) => t.kind)).toEqual(['openPoints', 'openPoints']);
    });

    it('steht neben „wartet“ desselben Tabs; das Anzeigen des Tabs nimmt nur „wartet“ weg', async () => {
      const { h, a } = await startScene();
      await a.answer(WITH_SECTION);

      await a.askPermission();
      expect(a.toasts().map((t) => t.kind)).toEqual(['openPoints', 'waiting']);

      h.workspace.activateTab(a.id);
      expect(a.toasts().map((t) => t.kind)).toEqual(['openPoints']);
    });
  });

  describe('übersteht einen Neustart', () => {
    it('der nicht geschlossene Hinweis ist nach dem Neustart wieder da, mit denselben Punkten', async () => {
      const { h, a, b } = await startScene();
      await a.answer(WITH_SECTION);
      await b.answer(WITH_QUESTION);
      h.workspace.dismissToast(b.pointsToast()!.id);

      await h.restart();

      expect(toasts(h)).toEqual([{ id: expect.any(String), tabId: a.id, kind: 'openPoints', points: SECTION_POINTS }]);
    });

    it('× nach dem Neustart: Er ist auch beim nächsten Start weg', async () => {
      const { h, a } = await startScene();
      await a.answer(WITH_SECTION);
      await h.restart();

      h.workspace.dismissToast(toasts(h)[0].id);
      await h.restart();

      expect(toasts(h)).toEqual([]);
      expect(h.storedTab(a.id)).not.toHaveProperty('openPoints');
    });

    it('nach dem Neustart bleibt er beim Anzeigen des Tabs stehen; eine neue Antwort mit Punkten ersetzt ihn', async () => {
      const { h, a } = await startScene();
      await a.answer(WITH_SECTION);
      await h.restart();
      h.showAllViews();
      h.workspace.windowForeground(true);

      h.workspace.activateTab(a.id);
      expect(toasts(h).map((t) => t.kind)).toEqual(['openPoints']);

      const resumed = await ClaudeTab.launch(h, a.id);
      await resumed.answer(WITH_QUESTION);
      expect(toasts(h)).toEqual([
        { id: expect.any(String), tabId: a.id, kind: 'openPoints', points: ['Soll ich auch die alten Einträge korrigieren?'] },
      ]);
    });

    it('gespeicherte Punkte werden beim Laden geprüft: nur Texte, ohne Punkte kein Hinweis', async () => {
      const tab = (id: string, openPoints: unknown) => ({
        id,
        name: id,
        nameIsManual: true,
        shellId: 'pwsh',
        startCwd: 'C:\\Users\\anna',
        openPoints,
      });
      const h = await startWorkspaceWithApi({
        homeDir: 'C:\\Users\\anna',
        state: {
          version: 2,
          tabs: [tab('a', ['Eins', 42, '', 'Zwei']), tab('b', []), tab('c', 'kaputt')],
          activeTabId: 'a',
        },
      });

      expect(toasts(h)).toEqual([{ id: expect.any(String), tabId: 'a', kind: 'openPoints', points: ['Eins', 'Zwei'] }]);
    });
  });

  describe('Einstellung „Offene Punkte aus Claudes Antworten anzeigen“', () => {
    it('ist ohne Einstellung an', async () => {
      const { h } = await startScene();

      expect(h.snapshot().settings.openPoints).toBe(true);
    });

    it('ausgeschaltet gibt es keinen Hinweis und keine Anweisung an Claude; „fertig“ kommt wie bisher', async () => {
      const { h, a } = await startScene();
      h.workspace.updateSettings({ openPoints: false });

      const sessionStart = await a.send('SessionStart-clear');
      await a.answer(WITH_SECTION);

      expect(sessionStart.body).toBe('');
      expect(toasts(h).map((t) => [t.tabId, t.kind])).toEqual([[a.id, 'finished']]);
      expect(h.storedTab(a.id)).not.toHaveProperty('openPoints');
    });

    it('beim Ausschalten verschwinden auch die stehenden, gespeichert und im Fenster; „wartet“ und „fertig“ bleiben', async () => {
      const { h, a, b } = await startScene();
      await a.answer(WITH_SECTION);
      await b.answer(WITHOUT_POINTS);

      h.workspace.updateSettings({ openPoints: false });

      expect(toasts(h).map((t) => [t.tabId, t.kind])).toEqual([[b.id, 'finished']]);
      expect(h.storedTab(a.id)).not.toHaveProperty('openPoints');

      // Wieder eingeschaltet kommen nur neue.
      h.workspace.updateSettings({ openPoints: true });
      expect(a.pointsToast()).toBeUndefined();
      await a.answerAgain(WITH_QUESTION);
      expect(a.pointsToast()).toBeDefined();
    });

    it('übersteht einen Neustart, und auch danach gibt es keine', async () => {
      const { h, a } = await startScene();
      h.workspace.updateSettings({ openPoints: false });

      await h.restart();
      h.showAllViews();
      h.workspace.windowForeground(true);
      const again = await ClaudeTab.launch(h, a.id);
      await again.answer(WITH_SECTION);

      expect(h.storedState().settings.openPoints).toBe(false);
      expect(again.pointsToast()).toBeUndefined();
    });

    it('ausgeschaltet beim Laden: gespeicherte Punkte fallen weg', async () => {
      const h = await startWorkspaceWithApi({
        state: {
          version: 2,
          settings: { openPoints: false },
          tabs: [{ id: 'a', name: 'a', nameIsManual: true, shellId: 'pwsh', startCwd: '', openPoints: ['Eins'] }],
          activeTabId: 'a',
        },
      });

      expect(toasts(h)).toEqual([]);
      expect(h.storedTab('a')).not.toHaveProperty('openPoints');
    });

    it('ist unabhängig von „Hinweise im Fenster“: ausgeschaltete Hinweise lassen offene Punkte stehen und kommen', async () => {
      const { h, a, b } = await startScene();
      await a.answer(WITH_SECTION);

      h.workspace.updateSettings({ notifications: false });
      await b.answer(WITH_QUESTION);

      expect(toasts(h).map((t) => [t.tabId, t.kind])).toEqual([
        [a.id, 'openPoints'],
        [b.id, 'openPoints'],
      ]);
    });
  });
});
