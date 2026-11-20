import { describe, expect, it } from 'vitest';
import type { TabSnapshot } from '../../src/shared/types';
import { hookEvent, hookPayload, type HookSample } from '../support/apiClient';
import { startWorkspaceWithApi, type TestWorkspace } from '../support/harness';

// Status-Zeilen des Zustandsautomaten (Ticket 13) über die echte lokale Schnittstelle: Hook-Ereignisse in der Form,
// wie sie Claude Code 2.1.328 im Spike geschickt hat (spikes/claude-hooks/samples), Eingaben des Nutzers über
// writeToTab, wie sie der Renderer weitergibt, und eine steuerbare Uhr.

const SID_AFTER_CLEAR = '0f54d6f0-5e3c-45e6-aabf-d76021219bad';
const ESC = '\x1b';
const ESC_QUIET_MS = 1500;

/** Ein Claude-Tab, gestartet über den Starter; Claude Code schickt seine Hooks mit dieser Session-Kennung. */
class ClaudeSession {
  constructor(
    readonly h: TestWorkspace,
    readonly tabId: string,
    readonly sessionId: string,
  ) {}

  /** Claude Code schickt ein Hook-Ereignis aus den Beispielen des Spikes; die Antwort ist ein leerer Erfolg. */
  async send(sample: HookSample, overrides: Record<string, unknown> = {}): Promise<void> {
    await this.sendAs(hookEvent(sample), sample, overrides);
  }

  /** Ein Ereignis, für das es kein eigenes Beispiel gibt, in der Form eines verwandten Beispiels. */
  async sendAs(event: string, sample: HookSample, overrides: Record<string, unknown> = {}): Promise<void> {
    const payload = hookPayload(sample, {
      session_id: this.sessionId,
      cwd: 'C:\\proj',
      hook_event_name: event,
      ...overrides,
    });
    const res = await this.h.api.hook(this.tabId, event, payload);
    expect(res).toMatchObject({ status: 200, body: '' });
  }

  /** Der Nutzer tippt im Terminal des Tabs; der Renderer gibt die Daten so weiter, wie xterm.js sie liefert. */
  type(data: string): void {
    this.h.workspace.writeToTab(this.tabId, data);
  }

  tab(): TabSnapshot {
    return tabOf(this.h, this.tabId);
  }

  status(): TabSnapshot['status'] {
    return this.tab().status;
  }
}

function tabOf(h: TestWorkspace, tabId: string): TabSnapshot {
  const tab = h.tabs().find((t) => t.id === tabId);
  if (!tab) throw new Error(`Kein Tab ${tabId}`);
  return tab;
}

/**
 * Ein laufendes Terminal im Vordergrund-Fenster, darin Claude: Starter gemeldet, SessionStart angekommen.
 * Mit `otherTab` gibt es rechts daneben einen zweiten Tab; aktiv bleibt der Claude-Tab.
 */
async function startClaude(options: { otherTab?: boolean } = {}): Promise<ClaudeSession & { otherTabId: string }> {
  const h = await startWorkspaceWithApi({ homeDir: 'C:\\Users\\anna' });
  const tabId = h.activeTab()!.id;
  const otherTabId = options.otherTab ? h.workspace.createTab() : '';
  h.workspace.activateTab(tabId);
  h.showAllViews();
  // Wie der Renderer beim Laden: Das Fenster hat den Fokus.
  h.workspace.windowForeground(true);
  const res = await h.api.launch({ tabId, case: 'new', cwd: 'C:\\proj' });
  const session = new ClaudeSession(h, tabId, JSON.parse(res.body).sessionId) as ClaudeSession & {
    otherTabId: string;
  };
  session.otherTabId = otherTabId;
  await session.send('SessionStart-startup');
  return session;
}

/** Claude arbeitet an einer Antwort und will einen Befehl ausführen, der eine Berechtigung braucht. */
async function askPermission(c: ClaudeSession): Promise<void> {
  await c.send('UserPromptSubmit');
  await c.send('PreToolUse-Bash');
  await c.send('PermissionRequest-Bash');
}

describe('Claude-Status am Tab', () => {
  describe('Art des Tabs', () => {
    it('ein normales Terminal hat Art „terminal“ und keinen Status; mit dem Start von Claude wird es ein Claude-Tab, der ruht', async () => {
      const h = await startWorkspaceWithApi();
      const tabId = h.activeTab()!.id;
      h.showAllViews();
      expect(tabOf(h, tabId)).toMatchObject({ kind: 'terminal', status: 'idle' });

      await h.api.launch({ tabId, case: 'new', cwd: 'C:\\proj' });

      expect(tabOf(h, tabId)).toMatchObject({ kind: 'claude', status: 'idle' });
      expect(h.events.at(-1)).toMatchObject({ type: 'tabs', tabs: [{ id: tabId, kind: 'claude', status: 'idle' }] });
    });

    it('meldet jede Änderung von Art oder Status mit einem tabs-Ereignis, ein Ereignis ohne Änderung nicht', async () => {
      const c = await startClaude();
      const before = c.h.eventsOfType('tabs').length;

      await c.send('UserPromptSubmit');
      await c.send('PreToolUse-Bash');
      await c.send('PostToolUse-Bash');

      const tabsEvents = c.h.eventsOfType('tabs').slice(before);
      expect(tabsEvents).toHaveLength(1);
      expect(tabsEvents[0].tabs[0]).toMatchObject({ kind: 'claude', status: 'working' });
    });
  });

  describe('arbeitet und wartet', () => {
    it('Prompt → arbeitet; PreToolUse, dann PermissionRequest → wartet; Eingabe des Nutzers → arbeitet; PostToolUse → arbeitet', async () => {
      const c = await startClaude();

      await c.send('UserPromptSubmit');
      expect(c.status()).toBe('working');
      await c.send('PreToolUse-Bash');
      expect(c.status()).toBe('working');
      await c.send('PermissionRequest-Bash');
      expect(c.status()).toBe('waiting');

      // Bestätigen: bis PostToolUse kommt kein Ereignis, ein langer Befehl bliebe sonst orange.
      c.type('1');
      expect(c.status()).toBe('working');
      await c.send('PostToolUse-Bash');
      expect(c.status()).toBe('working');
      await c.send('Stop');
      expect(c.status()).toBe('idle');
    });

    it('Rückfragen von AskUserQuestion melden sich als PermissionRequest → wartet', async () => {
      const c = await startClaude();
      await c.send('UserPromptSubmit');

      await c.send('PreToolUse-AskUserQuestion');
      await c.send('PermissionRequest-AskUserQuestion');

      expect(c.status()).toBe('waiting');
    });

    it('PostToolUseFailure → arbeitet und beendet auch „wartet“', async () => {
      const c = await startClaude();
      await askPermission(c);

      await c.sendAs('PostToolUseFailure', 'PostToolUse-Bash', { error: 'Exit code 1' });

      expect(c.status()).toBe('working');
    });

    it('verarbeitet Ereignisse in der Reihenfolge ihres Eintreffens: PreToolUse vor PermissionRequest', async () => {
      const c = await startClaude();
      await c.send('UserPromptSubmit');

      // PreToolUse trifft zuerst ein, sein Inhalt wird aber erst nach dem folgenden PermissionRequest fertig.
      const pre = c.h.api.slowHook(
        c.tabId,
        'PreToolUse',
        hookPayload('PreToolUse-Bash', { session_id: c.sessionId, cwd: 'C:\\proj' }),
      );
      await pre.arrived;
      await c.send('PermissionRequest-Bash');
      expect((await pre.finish()).status).toBe(200);

      expect(c.status()).toBe('waiting');
    });

    it('Eingabe in einem wartenden Tab → arbeitet; Antworten des Terminals wie Fokus-Meldungen zählen nicht als Eingabe', async () => {
      const c = await startClaude();
      await askPermission(c);

      // Claude Code schaltet Fokus-Meldungen ein; xterm.js schickt sie, sobald der Tab den Fokus bekommt.
      c.type('\x1b[I');
      c.type('\x1b[O');
      expect(c.status()).toBe('waiting');

      c.type('\r');
      expect(c.status()).toBe('working');
    });

    it('Eingaben in einem arbeitenden oder ruhenden Claude-Tab und in normalen Tabs ändern nichts', async () => {
      const c = await startClaude({ otherTab: true });

      c.type('hallo\r');
      expect(c.status()).toBe('idle');
      await c.send('UserPromptSubmit');
      c.type('x');
      expect(c.status()).toBe('working');
      c.h.workspace.writeToTab(c.otherTabId, 'dir\r');
      expect(tabOf(c.h, c.otherTabId)).toMatchObject({ kind: 'terminal', status: 'idle' });
    });

    it('die Eingabe geht trotzdem an die Shell', async () => {
      const c = await startClaude();
      await askPermission(c);

      c.type('1');
      c.type(ESC);

      expect(c.h.terminal.writes).toEqual([
        { tabId: c.tabId, data: '1' },
        { tabId: c.tabId, data: ESC },
      ]);
    });
  });

  describe('Esc', () => {
    it('Esc während „arbeitet“, danach kein Ereignis: nach 1,5 Sekunden ruht Claude, ohne grün', async () => {
      const c = await startClaude();
      await c.send('UserPromptSubmit');

      c.type(ESC);
      c.h.clock.advance(ESC_QUIET_MS - 1);
      expect(c.status()).toBe('working');
      // Auch wenn der Tab inzwischen nicht mehr sichtbar ist: Wer unterbricht, braucht kein „fertig“.
      c.h.workspace.windowForeground(false);
      c.h.clock.advance(1);

      expect(c.status()).toBe('idle');
    });

    it('Esc während „wartet“ (abgelehnte Rückfrage), danach kein Ereignis: nach 1,5 Sekunden ruht Claude', async () => {
      const c = await startClaude();
      await askPermission(c);

      c.type(ESC);
      c.h.clock.advance(ESC_QUIET_MS);

      expect(c.status()).toBe('idle');
    });

    it('Esc mit folgendem Stop: normal über Stop, also grün, wenn der Tab dann nicht sichtbar ist', async () => {
      const c = await startClaude({ otherTab: true });
      await c.send('UserPromptSubmit');

      c.type(ESC);
      c.h.workspace.activateTab(c.otherTabId);
      await c.send('Stop');
      expect(c.status()).toBe('finished');
      c.h.clock.advance(ESC_QUIET_MS);

      expect(c.status()).toBe('finished');
    });

    it('Esc, danach arbeitet Claude weiter (PreToolUse): bleibt bei „arbeitet“', async () => {
      const c = await startClaude();
      await c.send('UserPromptSubmit');

      c.type(ESC);
      await c.send('PreToolUse-Read');
      c.h.clock.advance(ESC_QUIET_MS);

      expect(c.status()).toBe('working');
    });

    it('eine verspätete Benachrichtigung nach Esc zeigt nicht, dass Claude weitermacht', async () => {
      const c = await startClaude();
      await askPermission(c);

      c.type(ESC);
      c.h.clock.advance(500);
      // Etwa 6 Sekunden nach der Rückfrage, die gerade abgelehnt wurde.
      await c.send('Notification-permission_prompt');
      c.h.clock.advance(ESC_QUIET_MS - 500);

      expect(c.status()).toBe('idle');
    });

    it('ein zweites Esc beginnt die Wartezeit von vorn', async () => {
      const c = await startClaude();
      await c.send('UserPromptSubmit');

      c.type(ESC);
      c.h.clock.advance(1000);
      c.type(ESC);
      c.h.clock.advance(1000);
      expect(c.status()).toBe('working');
      c.h.clock.advance(ESC_QUIET_MS - 1000);

      expect(c.status()).toBe('idle');
    });

    it('nach Esc in einer Rückfrage und neuer Eingabe innerhalb der Wartezeit ruht Claude trotzdem', async () => {
      // Esc lehnt ab; Claude fragt „What should Claude do instead?“, der Nutzer beginnt zu tippen.
      const c = await startClaude();
      await askPermission(c);

      c.type(ESC);
      c.type('mach');
      expect(c.status()).toBe('working');
      c.h.clock.advance(ESC_QUIET_MS);

      expect(c.status()).toBe('idle');
    });

    it('Esc in einem ruhenden Claude-Tab oder in einem normalen Tab startet keine Wartezeit', async () => {
      const c = await startClaude({ otherTab: true });
      const timers = c.h.clock.pendingTimers();

      c.type(ESC);
      c.h.workspace.writeToTab(c.otherTabId, ESC);

      expect(c.h.clock.pendingTimers()).toBe(timers);
      expect(c.status()).toBe('idle');
    });

    it('Pfeiltasten und andere Folgen mit Esc am Anfang sind kein Esc', async () => {
      const c = await startClaude();
      await c.send('UserPromptSubmit');

      c.type('\x1b[A');
      c.h.clock.advance(ESC_QUIET_MS);

      expect(c.status()).toBe('working');
    });
  });

  describe('Benachrichtigungen', () => {
    it('idle_prompt ändert nichts, weder bei „arbeitet“ noch bei „wartet“ oder „ruht“', async () => {
      const c = await startClaude();

      await c.send('Notification-idle_prompt');
      expect(c.status()).toBe('idle');
      await c.send('UserPromptSubmit');
      await c.send('Notification-idle_prompt');
      expect(c.status()).toBe('working');
      await c.send('PreToolUse-Bash');
      await c.send('PermissionRequest-Bash');
      await c.send('Notification-idle_prompt');
      expect(c.status()).toBe('waiting');
    });

    it('verspätetes permission_prompt nach PostToolUse setzt nicht wieder auf „wartet“, weder bei „arbeitet“ noch bei „ruht“', async () => {
      const c = await startClaude();
      await askPermission(c);
      c.type('1');
      await c.send('PostToolUse-Bash');

      await c.send('Notification-permission_prompt');
      expect(c.status()).toBe('working');
      await c.send('Stop');
      await c.send('Notification-permission_prompt');
      expect(c.status()).toBe('idle');
    });

    it('permission_prompt nach einer bestätigten Rückfrage, während der Befehl noch läuft, ändert nichts', async () => {
      const c = await startClaude();
      await askPermission(c);
      c.type('1');

      await c.send('Notification-permission_prompt');

      expect(c.status()).toBe('working');
    });

    it.each(['permission_prompt', 'elicitation_dialog'])(
      'Rückfallebene: %s ohne vorheriges PermissionRequest seit PreToolUse → wartet',
      async (type) => {
        const c = await startClaude();
        await c.send('UserPromptSubmit');
        await c.send('PreToolUse-Bash');

        await c.send('Notification-permission_prompt', { notification_type: type });

        expect(c.status()).toBe('waiting');
      },
    );

    it('Rückfallebene greift nicht ohne vorheriges PreToolUse', async () => {
      const c = await startClaude();
      await c.send('UserPromptSubmit');

      await c.send('Notification-permission_prompt');

      expect(c.status()).toBe('working');
    });
  });

  describe('ruht und fertig', () => {
    it('Stop im sichtbaren Tab → ruht, kein grün', async () => {
      const c = await startClaude();
      await c.send('UserPromptSubmit');

      await c.send('Stop');

      expect(c.tab()).toMatchObject({ kind: 'claude', status: 'idle' });
    });

    it('Stop in einem nicht aktiven Tab → grün, bis der Tab angezeigt wird', async () => {
      const c = await startClaude({ otherTab: true });
      await c.send('UserPromptSubmit');
      c.h.workspace.activateTab(c.otherTabId);

      await c.send('Stop');
      expect(c.status()).toBe('finished');
      c.h.clock.advance(60_000);
      expect(c.status()).toBe('finished');

      c.h.workspace.activateTab(c.tabId);
      expect(c.status()).toBe('idle');
      c.h.workspace.activateTab(c.otherTabId);
      expect(c.status()).toBe('idle');
    });

    it('Stop bei Fenster im Hintergrund → grün, bis das Fenster mit diesem Tab in den Vordergrund kommt', async () => {
      const c = await startClaude();
      await c.send('UserPromptSubmit');
      c.h.workspace.windowForeground(false);

      await c.send('Stop');
      expect(c.status()).toBe('finished');

      c.h.workspace.windowForeground(true);
      expect(c.status()).toBe('idle');
      expect(c.h.events.at(-1)).toMatchObject({ type: 'tabs', tabs: [{ id: c.tabId, status: 'idle' }] });
    });

    it('kommt das Fenster mit einem anderen Tab nach vorne, bleibt es grün', async () => {
      const c = await startClaude({ otherTab: true });
      await c.send('UserPromptSubmit');
      c.h.workspace.activateTab(c.otherTabId);
      c.h.workspace.windowForeground(false);
      await c.send('Stop');

      c.h.workspace.windowForeground(true);
      expect(c.status()).toBe('finished');

      // Ein Wechsel im Hintergrund zeigt den Tab noch nicht an; erst das Fenster im Vordergrund.
      c.h.workspace.windowForeground(false);
      c.h.workspace.activateTab(c.tabId);
      expect(c.status()).toBe('finished');
      c.h.workspace.windowForeground(true);
      expect(c.status()).toBe('idle');
    });

    it('wird der aktive Tab geschlossen, ist der Nachbar angezeigt: Sein grün verschwindet', async () => {
      const c = await startClaude({ otherTab: true });
      await c.send('UserPromptSubmit');
      c.h.workspace.activateTab(c.otherTabId);
      await c.send('Stop');

      c.h.workspace.closeTab(c.otherTabId);

      expect(c.h.activeTab()?.id).toBe(c.tabId);
      expect(c.status()).toBe('idle');
    });

    it('StopFailure wirkt wie Stop', async () => {
      const c = await startClaude({ otherTab: true });
      await c.send('UserPromptSubmit');
      c.h.workspace.activateTab(c.otherTabId);

      await c.sendAs('StopFailure', 'Stop', { error: 'rate_limit' });

      expect(c.status()).toBe('finished');
    });

    it('Ende einer Hintergrund-Aufgabe: UserPromptSubmit mit <task-notification> und Stop → kurz arbeitet, dann grün', async () => {
      const c = await startClaude({ otherTab: true });
      await c.send('UserPromptSubmit');
      await c.send('Stop-mit-background_tasks');
      expect(c.status()).toBe('idle');
      c.h.workspace.activateTab(c.otherTabId);

      await c.send('UserPromptSubmit-task-notification');
      expect(c.status()).toBe('working');
      await c.send('Stop');
      expect(c.status()).toBe('finished');
    });

    it('arbeitet und wartet haben Vorrang vor grün', async () => {
      const c = await startClaude({ otherTab: true });
      await c.send('UserPromptSubmit');
      c.h.workspace.activateTab(c.otherTabId);
      await c.send('Stop');

      await c.send('UserPromptSubmit-task-notification');
      expect(c.status()).toBe('working');
      await c.send('PreToolUse-Bash');
      await c.send('PermissionRequest-Bash');
      expect(c.status()).toBe('waiting');
    });

    it('pausiert (nach einem Neustart noch nicht fortgesetzt) hat Vorrang; nach dem Anzeigen ruht der Tab', async () => {
      const link = { sessionId: SID_AFTER_CLEAR, cwd: 'C:\\Users\\anna', confirmed: true, hadPrompt: true };
      const tab = (id: string) => ({ id, name: id, nameIsManual: true, shellId: 'pwsh', startCwd: 'C:\\Users\\anna', claude: link });
      const h = await startWorkspaceWithApi({
        homeDir: 'C:\\Users\\anna',
        state: { version: 2, tabs: [tab('t1'), tab('t2')], activeTabId: 't1' },
      });
      h.showAllViews();
      h.workspace.windowForeground(true);

      expect(tabOf(h, 't2')).toMatchObject({ kind: 'claude', status: 'paused', paused: true });
      await h.probe([]);
      expect(tabOf(h, 't2').status).toBe('paused');

      h.workspace.activateTab('t2');
      expect(tabOf(h, 't2')).toMatchObject({ kind: 'claude', status: 'idle', paused: false });
    });

    it('bis zur ersten Meldung des Renderers gilt das Fenster als im Hintergrund', async () => {
      const h = await startWorkspaceWithApi();
      const tabId = h.activeTab()!.id;
      h.showAllViews();
      const res = await h.api.launch({ tabId, case: 'new', cwd: 'C:\\proj' });
      const c = new ClaudeSession(h, tabId, JSON.parse(res.body).sessionId);
      await c.send('UserPromptSubmit');

      await c.send('Stop');
      expect(c.status()).toBe('finished');
      h.workspace.windowForeground(true);
      expect(c.status()).toBe('idle');
    });
  });

  describe('Session', () => {
    it('SessionStart (etwa nach /clear) setzt auf „ruht“', async () => {
      const c = await startClaude();
      await c.send('UserPromptSubmit');

      await c.send('SessionEnd-clear');
      expect(c.status()).toBe('working');
      await c.send('SessionStart-clear', { session_id: SID_AFTER_CLEAR });

      expect(c.status()).toBe('idle');
    });

    it('Ersatzregel: ein Ereignis mit neuer Kennung beginnt die Session und wird danach angewendet', async () => {
      const c = await startClaude();
      await askPermission(c);

      await c.send('UserPromptSubmit', { session_id: SID_AFTER_CLEAR });

      expect(c.status()).toBe('working');
      expect(c.h.storedTab(c.tabId)?.claude?.sessionId).toBe(SID_AFTER_CLEAR);
    });

    it('SessionEnd mit Grund prompt_input_exit: normales Terminal ohne Status', async () => {
      const c = await startClaude();
      await c.send('UserPromptSubmit');

      await c.send('SessionEnd-prompt_input_exit');

      expect(c.tab()).toMatchObject({ kind: 'terminal', status: 'idle' });
    });

    it('Ende-Meldung des Starters in einem grünen Tab: normales Terminal ohne Status', async () => {
      const c = await startClaude({ otherTab: true });
      await c.send('UserPromptSubmit');
      c.h.workspace.activateTab(c.otherTabId);
      await c.send('Stop');

      await c.h.api.exit(c.tabId, c.sessionId, 0);

      expect(c.tab()).toMatchObject({ kind: 'terminal', status: 'idle' });
    });

    it('Ende der Shell während Esc-Wartezeit: normales Terminal, die Wartezeit läuft ins Leere', async () => {
      const c = await startClaude();
      await c.send('UserPromptSubmit');
      c.type(ESC);

      c.h.terminal.exit(c.tabId, 0);
      c.h.clock.advance(ESC_QUIET_MS);

      expect(c.tab()).toMatchObject({ kind: 'terminal', status: 'idle', process: 'exited' });
    });

    it('ein neuer Start ohne vorige Ende-Meldung (etwa nach einem Absturz des Starters) beginnt bei „ruht“', async () => {
      const c = await startClaude();
      await askPermission(c);
      c.type(ESC);

      await c.h.api.launch({ tabId: c.tabId, case: 'new', cwd: 'C:\\proj' });
      expect(c.tab()).toMatchObject({ kind: 'claude', status: 'idle' });
      c.h.clock.advance(ESC_QUIET_MS);

      expect(c.status()).toBe('idle');
    });

    it('nach einem neuen Start von Claude im selben Tab beginnt der Status bei „ruht“', async () => {
      const c = await startClaude();
      await askPermission(c);
      await c.h.api.exit(c.tabId, c.sessionId, 0);

      await c.h.api.launch({ tabId: c.tabId, case: 'new', cwd: 'C:\\proj' });

      expect(c.tab()).toMatchObject({ kind: 'claude', status: 'idle' });
    });
  });
});
