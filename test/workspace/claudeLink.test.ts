import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { StateStore } from '../../src/main/store';
import { MemoryStorage } from '../support/fakes';
import { hookEvent, hookPayload, type HookSample } from '../support/apiClient';
import { expectHookReply } from '../support/claudeTab';
import { startWorkspaceWithApi, type TestWorkspace, type TestWorkspaceOptions } from '../support/harness';
import { makeTempDir } from '../support/tempDir';

// Claude-Zuordnung pro Tab, über die echte lokale Schnittstelle: Meldungen des Starters und Hook-Ereignisse
// in der Form, wie sie Claude Code 2.1.328 im Spike geschickt hat (spikes/claude-hooks/samples).

const SID = 'ec84ffa6-a2f2-4150-983c-65e55fc1ff58';
const SID_AFTER_CLEAR = '0f54d6f0-5e3c-45e6-aabf-d76021219bad';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Ein laufendes Terminal mit lokaler Schnittstelle, wie nach dem Start der App. */
async function setup(options: TestWorkspaceOptions = {}): Promise<{ h: TestWorkspace; tabId: string }> {
  const h = await startWorkspaceWithApi({
    homeDir: 'C:\\Users\\anna.mueller',
    shortPaths: { 'C:\\Users\\ANNA~1': 'C:\\Users\\anna.mueller' },
    ...options,
  });
  h.showAllViews();
  return { h, tabId: h.activeTab()!.id };
}

/** Der Starter meldet den Fall „neu“; liefert die vergebene Kennung. */
async function launchNew(h: TestWorkspace, tabId: string, cwd = 'C:\\proj'): Promise<string> {
  const res = await h.api.launch({ tabId, case: 'new', cwd });
  expect(res.status).toBe(200);
  return JSON.parse(res.body).sessionId;
}

/** Claude Code schickt ein Hook-Ereignis; die Antwort ist ein Erfolg ohne Entscheidungsfelder (`expectHookReply`). */
async function hook(
  h: TestWorkspace,
  tabId: string,
  sample: HookSample,
  overrides: Record<string, unknown>,
): Promise<void> {
  const event = hookEvent(sample);
  expectHookReply(await h.api.hook(tabId, event, hookPayload(sample, overrides)), event);
}

describe('Claude-Zuordnung', () => {
  describe('Start gemeldet (launch)', () => {
    it('Fall „neu“: Tab-Name, neue Kennung und Hook-Datei; der Tab ist ein unbestätigter Claude-Tab', async () => {
      const { h, tabId } = await setup();

      const res = await h.api.launch({ tabId, case: 'new', cwd: 'C:\\proj' });

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('application/json; charset=utf-8');
      const body = JSON.parse(res.body);
      expect(body).toEqual({
        tabName: 'anna.mueller',
        sessionId: expect.stringMatching(UUID),
        hookFile: h.localApi.hookFile,
      });
      expect(JSON.parse(fs.readFileSync(body.hookFile, 'utf8'))).toHaveProperty('hooks.SessionEnd');
      expect(h.storedTab(tabId)?.claude).toEqual({
        sessionId: body.sessionId,
        cwd: 'C:\\proj',
        confirmed: false,
        hadPrompt: false,
      });
    });

    it('liefert den aktuellen Tab-Namen, auch nach dem Umbenennen und mit Umlauten', async () => {
      const { h, tabId } = await setup();
      h.workspace.renameTab(tabId, 'Prüfung Ä');

      const res = await h.api.launch({ tabId, case: 'new', cwd: 'C:\\proj' });

      expect(JSON.parse(res.body).tabName).toBe('Prüfung Ä');
    });

    it('vergibt bei jedem Aufruf eine neue Kennung', async () => {
      const { h, tabId } = await setup();

      const ids = [await launchNew(h, tabId), await launchNew(h, tabId), await launchNew(h, tabId)];

      expect(new Set(ids).size).toBe(3);
      expect(h.storedTab(tabId)?.claude?.sessionId).toBe(ids[2]);
    });

    it('Fall „mit Kennung“ übernimmt die angegebene Kennung und vergibt keine neue', async () => {
      const { h, tabId } = await setup();

      const res = await h.api.launch({ tabId, case: 'withId', sessionId: SID, cwd: 'C:\\proj' });

      expect(JSON.parse(res.body)).toEqual({ tabName: 'anna.mueller', hookFile: h.localApi.hookFile });
      expect(h.storedTab(tabId)?.claude).toEqual({ sessionId: SID, cwd: 'C:\\proj', confirmed: false, hadPrompt: false });
    });

    it('Fall „ohne Kennung“ setzt keine Kennung', async () => {
      const { h, tabId } = await setup();

      const res = await h.api.launch({ tabId, case: 'withoutId', cwd: 'C:\\proj' });

      expect(JSON.parse(res.body)).toEqual({ tabName: 'anna.mueller', hookFile: h.localApi.hookFile });
      expect(h.storedTab(tabId)?.claude).toEqual({ cwd: 'C:\\proj', confirmed: false, hadPrompt: false });
    });

    it('normalisiert den gemeldeten Ordner: Schrägstriche, abschliessender Trenner, 8.3-Kurzpfad', async () => {
      const { h, tabId } = await setup();

      await launchNew(h, tabId, 'C:/Users/ANNA~1/Projekt Ä/');

      expect(h.storedTab(tabId)?.claude?.cwd).toBe('C:\\Users\\anna.mueller\\Projekt Ä');
    });

    it('nimmt ohne gemeldeten Ordner den Ordner des Tabs', async () => {
      const { h, tabId } = await setup();

      await h.api.launch({ tabId, case: 'new' });

      expect(h.storedTab(tabId)?.claude?.cwd).toBe('C:\\Users\\anna.mueller');
    });

    it('behält „hatte Prompt“, wenn dieselbe Session erneut gestartet wird, bei einer anderen nicht', async () => {
      // Etwa wenn THub eine Session nach einem Neustart mit `--resume <Kennung>` fortsetzt (Ticket 12).
      const tab = {
        id: 't1',
        name: 'Claude',
        nameIsManual: true,
        shellId: 'pwsh',
        startCwd: 'C:\\proj',
        claude: { sessionId: SID, cwd: 'C:\\proj', confirmed: true, hadPrompt: true },
      };
      const { h } = await setup({ state: { version: 2, tabs: [tab], activeTabId: 't1' } });

      await h.api.launch({ tabId: 't1', case: 'withId', sessionId: SID, cwd: 'C:\\proj' });
      expect(h.storedTab('t1')?.claude).toEqual({ sessionId: SID, cwd: 'C:\\proj', confirmed: false, hadPrompt: true });

      await h.api.launch({ tabId: 't1', case: 'withId', sessionId: SID_AFTER_CLEAR, cwd: 'C:\\proj' });
      expect(h.storedTab('t1')?.claude?.hadPrompt).toBe(false);
    });
  });

  describe('SessionStart', () => {
    it('bestätigt und übernimmt Kennung und cwd, auch als 8.3-Kurzpfad', async () => {
      const { h, tabId } = await setup();
      const id = await launchNew(h, tabId);

      await hook(h, tabId, 'SessionStart-startup', { session_id: id, cwd: 'C:\\Users\\ANNA~1\\proj' });

      expect(h.storedTab(tabId)?.claude).toEqual({
        sessionId: id,
        cwd: 'C:\\Users\\anna.mueller\\proj',
        confirmed: true,
        hadPrompt: false,
      });
    });

    it('liefert nach dem Fall „ohne Kennung“ die Kennung', async () => {
      const { h, tabId } = await setup();
      await h.api.launch({ tabId, case: 'withoutId', cwd: 'C:\\proj' });

      await hook(h, tabId, 'SessionStart-resume', { session_id: SID, cwd: 'C:\\proj' });

      expect(h.storedTab(tabId)?.claude).toEqual({ sessionId: SID, cwd: 'C:\\proj', confirmed: true, hadPrompt: false });
    });

    it('macht auch ohne Meldung des Starters einen Claude-Tab daraus', async () => {
      const { h, tabId } = await setup();

      await hook(h, tabId, 'SessionStart-startup', { session_id: SID, cwd: 'C:\\proj' });

      expect(h.storedTab(tabId)?.claude).toEqual({ sessionId: SID, cwd: 'C:\\proj', confirmed: true, hadPrompt: false });
    });
  });

  describe('Ersatzregel, falls SessionStart fehlt', () => {
    it('/hooks/SessionStart antwortet ohne Entscheidungsfelder; ein Ereignis mit neuer session_id ohne SessionStart übernimmt die Kennung', async () => {
      const { h, tabId } = await setup();
      const sessionStart = await h.api.hook(tabId, 'SessionStart', hookPayload('SessionStart-startup', { cwd: 'C:\\x' }));
      expectHookReply(sessionStart, 'SessionStart');

      const { h: other, tabId: otherTab } = await setup();
      const id = await launchNew(other, otherTab);
      await hook(other, otherTab, 'PreToolUse-Bash', { session_id: SID, cwd: 'C:\\Users\\ANNA~1\\neu' });

      expect(id).not.toBe(SID);
      expect(other.storedTab(otherTab)?.claude).toEqual({
        sessionId: SID,
        cwd: 'C:\\Users\\anna.mueller\\neu',
        confirmed: true,
        hadPrompt: false,
      });
    });

    it('macht auch ohne Meldung des Starters einen bestätigten Claude-Tab mit Prompt daraus', async () => {
      const { h, tabId } = await setup();

      await hook(h, tabId, 'UserPromptSubmit', { session_id: SID, cwd: 'C:\\proj' });

      expect(h.storedTab(tabId)?.claude).toEqual({ sessionId: SID, cwd: 'C:\\proj', confirmed: true, hadPrompt: true });
    });

    it('/clear ohne SessionStart: das erste Ereignis der neuen Session ersetzt die Kennung', async () => {
      const { h, tabId } = await setup();
      const id = await launchNew(h, tabId);
      await hook(h, tabId, 'UserPromptSubmit', { session_id: id, cwd: 'C:\\proj' });

      await hook(h, tabId, 'SessionEnd-clear', { session_id: id, cwd: 'C:\\proj' });
      await hook(h, tabId, 'UserPromptSubmit', { session_id: SID_AFTER_CLEAR, cwd: 'C:\\proj' });

      expect(h.storedTab(tabId)?.claude).toEqual({
        sessionId: SID_AFTER_CLEAR,
        cwd: 'C:\\proj',
        confirmed: true,
        hadPrompt: true,
      });
    });

    it('ein Ereignis mit der gespeicherten Kennung ändert die Zuordnung nicht', async () => {
      const { h, tabId } = await setup();
      const id = await launchNew(h, tabId);
      const before = h.storedTab(tabId)?.claude;

      await hook(h, tabId, 'Stop', { session_id: id, cwd: 'C:\\anderswo' });
      await hook(h, tabId, 'Notification-idle_prompt', { session_id: id, cwd: 'C:\\anderswo' });

      expect(h.storedTab(tabId)?.claude).toEqual(before);
    });
  });

  describe('hatte Prompt', () => {
    it('UserPromptSubmit setzt „hatte Prompt“', async () => {
      const { h, tabId } = await setup();
      const id = await launchNew(h, tabId);
      await hook(h, tabId, 'SessionStart-startup', { session_id: id, cwd: 'C:\\proj' });

      await hook(h, tabId, 'UserPromptSubmit', { session_id: id, cwd: 'C:\\proj' });

      expect(h.storedTab(tabId)?.claude).toEqual({ sessionId: id, cwd: 'C:\\proj', confirmed: true, hadPrompt: true });
    });

    it('/clear (SessionEnd clear, dann SessionStart mit neuer Kennung) ersetzt die Kennung und setzt es zurück', async () => {
      const { h, tabId } = await setup();
      const id = await launchNew(h, tabId);
      await hook(h, tabId, 'SessionStart-startup', { session_id: id, cwd: 'C:\\proj' });
      await hook(h, tabId, 'UserPromptSubmit', { session_id: id, cwd: 'C:\\proj' });

      await hook(h, tabId, 'SessionEnd-clear', { session_id: id, cwd: 'C:\\proj' });
      expect(h.storedTab(tabId)?.claude).toEqual({ sessionId: id, cwd: 'C:\\proj', confirmed: true, hadPrompt: true });

      await hook(h, tabId, 'SessionStart-clear', { session_id: SID_AFTER_CLEAR, cwd: 'C:\\proj' });
      expect(h.storedTab(tabId)?.claude).toEqual({
        sessionId: SID_AFTER_CLEAR,
        cwd: 'C:\\proj',
        confirmed: true,
        hadPrompt: false,
      });
    });

    it('SessionStart mit derselben Kennung (resume) behält es', async () => {
      const { h, tabId } = await setup();
      await hook(h, tabId, 'SessionStart-startup', { session_id: SID, cwd: 'C:\\proj' });
      await hook(h, tabId, 'UserPromptSubmit', { session_id: SID, cwd: 'C:\\proj' });

      await hook(h, tabId, 'SessionStart-resume', { session_id: SID, cwd: 'C:\\proj' });

      expect(h.storedTab(tabId)?.claude?.hadPrompt).toBe(true);
    });
  });

  describe('Ende', () => {
    it.each(['prompt_input_exit', 'other', 'logout'])('SessionEnd mit Grund %s macht den Tab normal', async (reason) => {
      const { h, tabId } = await setup();
      const id = await launchNew(h, tabId);
      await hook(h, tabId, 'SessionStart-startup', { session_id: id, cwd: 'C:\\proj' });

      await hook(h, tabId, 'SessionEnd-prompt_input_exit', { session_id: id, cwd: 'C:\\proj', reason });

      expect(h.storedTab(tabId)).toBeDefined();
      expect(h.storedTab(tabId)?.claude).toBeUndefined();
    });

    it('SessionEnd mit Grund resume ändert nichts', async () => {
      const { h, tabId } = await setup();
      const id = await launchNew(h, tabId);
      const before = h.storedTab(tabId)?.claude;

      await hook(h, tabId, 'SessionEnd-clear', { session_id: id, cwd: 'C:\\proj', reason: 'resume' });

      expect(h.storedTab(tabId)?.claude).toEqual(before);
    });

    it('die Ende-Meldung des Starters macht den Tab ohne jedes Hook-Ereignis normal', async () => {
      const { h, tabId } = await setup();
      const id = await launchNew(h, tabId);
      expect(await h.api.started(tabId, 4242)).toMatchObject({ status: 200, body: '' });

      const res = await h.api.exit(tabId, id, 0);

      expect(res).toMatchObject({ status: 200, body: '' });
      expect(h.storedTab(tabId)?.claude).toBeUndefined();
    });

    it('die Ende-Meldung zählt auch mit Exit-Code ≠ 0 und ohne Session-Kennung', async () => {
      const { h, tabId } = await setup();
      await h.api.launch({ tabId, case: 'withoutId', cwd: 'C:\\proj' });

      await h.api.exit(tabId, undefined, 1);

      expect(h.storedTab(tabId)?.claude).toBeUndefined();
    });

    it('das Ende der Shell macht den Tab normal', async () => {
      const { h, tabId } = await setup();
      const id = await launchNew(h, tabId);
      await hook(h, tabId, 'SessionStart-startup', { session_id: id, cwd: 'C:\\proj' });

      h.terminal.exit(tabId, 0);

      expect(h.storedTab(tabId)?.claude).toBeUndefined();
    });
  });

  describe('Prozess-ID (started)', () => {
    it('wird nicht gespeichert: Laufzeit-Angaben gehören nicht in den Zustand', async () => {
      const { h, tabId } = await setup();
      await launchNew(h, tabId);
      const before = h.storedState();

      const res = await h.api.started(tabId, 4242);

      expect(res).toMatchObject({ status: 200, body: '' });
      expect(h.storedState()).toEqual(before);
    });
  });

  describe('Sicherheitsnetz', () => {
    it('nach launch „neu“ ohne jedes Hook-Ereignis ist die Kennung gespeichert und übersteht einen Neustart', async () => {
      const { h, tabId } = await setup();
      const id = await launchNew(h, tabId);

      await h.restart();
      h.workspace.renameTab(tabId, 'Nach dem Neustart');

      expect(h.storedTab(tabId)).toMatchObject({
        name: 'Nach dem Neustart',
        claude: { sessionId: id, cwd: 'C:\\proj', confirmed: false, hadPrompt: false },
      });
    });

    it('steht nach dem Beenden in state.json', async () => {
      const file = path.join(makeTempDir(), 'state.json');
      const { h, tabId } = await setup({ storage: new StateStore(file) });
      const id = await launchNew(h, tabId);

      await h.restart();

      const written = JSON.parse(fs.readFileSync(file, 'utf8'));
      expect(written.tabs).toMatchObject([
        { id: tabId, claude: { sessionId: id, cwd: 'C:\\proj', confirmed: false, hadPrompt: false } },
      ]);
      await h.workspace.shutdown();
    });
  });

  describe('Einfrieren', () => {
    it('App beenden: danach Ende der Shell, SessionEnd other und Ende-Meldung ändern die Zuordnung nicht', async () => {
      const { h, tabId } = await setup();
      const id = await launchNew(h, tabId);
      await hook(h, tabId, 'SessionStart-startup', { session_id: id, cwd: 'C:\\proj' });
      await hook(h, tabId, 'UserPromptSubmit', { session_id: id, cwd: 'C:\\proj' });
      const frozen = h.storedTab(tabId)?.claude;

      // Beenden holt erst den Verlauf und beendet dann die Shells; ihr Ende kommt, während THub noch
      // Meldungen annimmt. Eingefroren ist ab dem Aufruf von shutdown().
      const shutdown = h.workspace.shutdown();
      await vi.waitFor(() => expect(h.terminal.isRunning(tabId)).toBe(false));
      await hook(h, tabId, 'SessionEnd-other', { session_id: id, cwd: 'C:\\proj' });
      expect(await h.api.exit(tabId, id, 0)).toMatchObject({ status: 200, body: '' });
      await shutdown;

      expect(h.storedTab(tabId)?.claude).toEqual(frozen);
      await h.restart();
      expect(h.storedTab(tabId)?.claude).toEqual(frozen);
    });

    it('Tab schliessen: danach Ende der Shell, SessionEnd other und Ende-Meldung ändern den Zustand nicht', async () => {
      const { h, tabId: first } = await setup();
      const tabId = h.workspace.createTab();
      h.showAllViews();
      const id = await launchNew(h, tabId);
      await hook(h, tabId, 'SessionStart-startup', { session_id: id, cwd: 'C:\\proj' });

      h.workspace.closeTab(tabId);
      const afterClose = h.storedState();
      const saves = (h.storage as MemoryStorage).saves;
      h.terminal.exit(tabId, 0);
      await hook(h, tabId, 'SessionEnd-other', { session_id: id, cwd: 'C:\\proj' });
      await h.api.exit(tabId, id, 0);

      expect(h.storedState()).toEqual(afterClose);
      expect((h.storage as MemoryStorage).saves).toBe(saves);
      expect(h.tabs().map((t) => t.id)).toEqual([first]);
    });

    it('Windows-Abmeldung: freeze schreibt sofort; danach ändern Ereignisse und das Ende der Shell nichts', async () => {
      const { h, tabId } = await setup();
      const id = await launchNew(h, tabId);
      await hook(h, tabId, 'SessionStart-startup', { session_id: id, cwd: 'C:\\proj' });
      await hook(h, tabId, 'UserPromptSubmit', { session_id: id, cwd: 'C:\\proj' });
      const frozen = h.storedTab(tabId)?.claude;
      const storage = h.storage as MemoryStorage;
      const flushes = storage.flushes;

      h.workspace.freeze();

      expect(storage.flushes).toBe(flushes + 1);
      await hook(h, tabId, 'SessionEnd-other', { session_id: id, cwd: 'C:\\proj' });
      await h.api.exit(tabId, id, 1);
      h.terminal.exit(tabId, 1);
      await hook(h, tabId, 'SessionStart-clear', { session_id: SID_AFTER_CLEAR, cwd: 'C:\\proj' });
      expect((await h.api.launch({ tabId, case: 'new', cwd: 'C:\\proj' })).status).toBe(404);
      expect(h.storedTab(tabId)?.claude).toEqual(frozen);
    });
  });

  describe('Gespeicherte Zuordnung', () => {
    const claudeTab = (id: string, claude: unknown) => ({
      id,
      name: id,
      nameIsManual: true,
      shellId: 'pwsh',
      startCwd: 'C:\\proj',
      claude,
    });

    it('wird aus einer Datei der Version 2 gelesen und bleibt über einen Neustart erhalten, auch bei geschlossenen Tabs', async () => {
      const link = { sessionId: SID, cwd: 'C:\\proj', confirmed: true, hadPrompt: true };
      const state = {
        version: 2,
        tabs: [claudeTab('t1', link), { id: 't2', name: 'Normal', shellId: 'cmd', startCwd: 'C:\\' }],
        activeTabId: 't1',
        closedTabs: [{ tab: claudeTab('t3', { ...link, hadPrompt: false }), index: 1, closedAt: 1 }],
      };
      const { h } = await setup({ state });

      await h.restart();
      h.workspace.renameTab('t2', 'Speichern auslösen');

      expect(h.storedTab('t1')?.claude).toEqual(link);
      expect(h.storedTab('t2')).not.toHaveProperty('claude');
      expect(h.storedState().closedTabs[0].tab.claude).toEqual({ ...link, hadPrompt: false });
    });

    it('übernimmt unbrauchbare Felder mit Standardwerten und verwirft eine unbrauchbare Zuordnung', async () => {
      // Unbestätigt und mit Kennung: Der Tab bleibt ein Claude-Tab (fortzusetzen, Ticket 12).
      const state = {
        version: 2,
        tabs: [
          claudeTab('t1', { sessionId: SID, cwd: 7, confirmed: 'ja', hadPrompt: 1 }),
          claudeTab('t2', 'kaputt'),
          claudeTab('t3', { sessionId: 42, confirmed: false }),
        ],
        activeTabId: 't1',
      };
      const { h } = await setup({ state });

      h.workspace.renameTab('t1', 'Speichern auslösen');

      expect(h.storedTab('t1')?.claude).toEqual({ sessionId: SID, cwd: '', confirmed: false, hadPrompt: false });
      expect(h.storedTab('t2')).not.toHaveProperty('claude');
      // Ohne brauchbare Kennung lässt sich nichts fortsetzen: normales Terminal.
      expect(h.storedTab('t3')).not.toHaveProperty('claude');
    });
  });
});
