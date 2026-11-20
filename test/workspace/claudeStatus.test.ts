import { describe, expect, it } from 'vitest';
import type { ProcessInfo } from '../../src/main/workspace/ports';
import type { TabSnapshot } from '../../src/shared/types';
import { hookEvent, hookPayload, type HookSample } from '../support/apiClient';
import { expectHookReply } from '../support/claudeTab';
import { settle, startWorkspaceWithApi, type TestWorkspace } from '../support/harness';

// Status-Zeilen des Zustandsautomaten (Ticket 13) über die echte lokale Schnittstelle: Hook-Ereignisse in der Form,
// wie sie Claude Code 2.1.328 im Spike geschickt hat (spikes/claude-hooks/samples), Eingaben des Nutzers über
// writeToTab, wie sie der Renderer weitergibt, und eine steuerbare Uhr.

const SID_AFTER_CLEAR = '0f54d6f0-5e3c-45e6-aabf-d76021219bad';
const ESC = '\x1b';
const ESC_QUIET_MS = 1500;
const ANSWER_QUIET_MS = 3000;
const CLAUDE_PID = 30000;

/** Ein Claude-Tab, gestartet über den Starter; Claude Code schickt seine Hooks mit dieser Session-Kennung. */
class ClaudeSession {
  constructor(
    readonly h: TestWorkspace,
    readonly tabId: string,
    readonly sessionId: string,
  ) {}

  /** Claude Code schickt ein Hook-Ereignis aus den Beispielen des Spikes; die Antwort zeigt `expectHookReply`. */
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
    expectHookReply(await this.h.api.hook(this.tabId, event, payload), event);
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
      expect(c.status()).toBe('waiting');
      c.type('\r');
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

  describe('Antwort auf eine Rückfrage', () => {
    it.each([
      ['Enter', '\r'],
      ['Ziffer 1', '1'],
      ['Ziffer 2', '2'],
      ['Ziffer 3', '3'],
    ])('%s in einem wartenden Tab → arbeitet', async (_label, key) => {
      const c = await startClaude();
      await askPermission(c);

      c.type(key);

      expect(c.status()).toBe('working');
    });

    it('Pfeil- und andere Navigationstasten (Pos1, Ende, Bild auf/ab, Tab) und Text ändern nichts', async () => {
      const c = await startClaude();
      await askPermission(c);

      for (const key of ['\x1b[B', '\x1b[A', '\x1bOB', '\x1b[H', '\x1b[F', '\x1b[1~', '\x1b[4~', '\x1b[5~', '\x1b[6~', '\t', 'y', 'nein']) {
        c.type(key);
      }

      expect(c.status()).toBe('waiting');
      c.type('\r');
      expect(c.status()).toBe('working');
    });

    it('Ablehnung mit „No“ und Enter: kein Hook, kein neuer Prozess → nach etwa 3 s ruht Claude, ohne grün', async () => {
      const c = await startClaude();
      const tree = await claudeProcess(c);
      c.h.processes.set(tree);
      await askPermission(c);
      await elapse(c.h, 700);

      c.type('\x1b[B');
      c.type('\x1b[B');
      c.type('\r');
      expect(c.status()).toBe('working');
      await elapse(c.h, ANSWER_QUIET_MS - 200);
      expect(c.status()).toBe('working');
      // Auch wenn der Tab inzwischen nicht mehr sichtbar ist: Wer selbst ablehnt, braucht kein „fertig“.
      c.h.workspace.windowForeground(false);
      await elapse(c.h, 300);

      expect(c.status()).toBe('idle');
    });

    it('Ablehnung mit der Ziffer 3 wirkt genauso', async () => {
      const c = await startClaude();
      c.h.processes.set(await claudeProcess(c));
      await askPermission(c);

      c.type('3');
      await elapse(c.h, ANSWER_QUIET_MS + 100);

      expect(c.status()).toBe('idle');
    });

    it('ein bestätigter langer Befehl hält „arbeitet“: Claude startet nach der Antwort einen Prozess', async () => {
      const c = await startClaude();
      const tree = await claudeProcess(c);
      c.h.processes.set(tree);
      await askPermission(c);
      await elapse(c.h, 700);

      c.type('1');
      const answeredAt = c.h.clock.now();
      // Claude führt den bestätigten Befehl über die Shell des Bash-Werkzeugs aus, mit eigener Konsole.
      c.h.processes.set([
        ...tree,
        { pid: 30100, ppid: CLAUDE_PID, name: 'bash.exe', startTime: answeredAt + 150 },
        { pid: 30104, ppid: 30100, name: 'conhost.exe', startTime: answeredAt + 160 },
        { pid: 30108, ppid: 30100, name: 'npm.cmd', startTime: answeredAt + 400 },
      ]);
      await elapse(c.h, 3 * ANSWER_QUIET_MS);
      expect(c.status()).toBe('working');

      await c.send('PostToolUse-Bash');
      await c.send('Stop');
      expect(c.status()).toBe('idle');
    });

    it('ein einmal gesehener neuer Prozess genügt, auch wenn er bei der nächsten Abfrage schon beendet ist', async () => {
      const c = await startClaude();
      const tree = await claudeProcess(c);
      c.h.processes.set(tree);
      await askPermission(c);
      await elapse(c.h, 700);

      c.type('1');
      c.h.processes.set([...tree, { pid: 30100, ppid: CLAUDE_PID, name: 'git.exe', startTime: c.h.clock.now() + 100 }]);
      // Bis zum nächsten Takt der Sonde (alle 1,5 s), dann ist der Befehl vorbei.
      await elapse(c.h, 900);
      c.h.processes.set(tree);
      await elapse(c.h, 2 * ANSWER_QUIET_MS);

      expect(c.status()).toBe('working');
    });

    it('nur ein Konsolen-Host als neues Kind zeigt nicht, dass Claude weiterarbeitet', async () => {
      const c = await startClaude();
      const tree = await claudeProcess(c);
      await askPermission(c);
      await elapse(c.h, 700);

      c.type('\r');
      c.h.processes.set([...tree, { pid: 30104, ppid: CLAUDE_PID, name: 'conhost.exe', startTime: c.h.clock.now() + 50 }]);
      await elapse(c.h, ANSWER_QUIET_MS + 100);

      expect(c.status()).toBe('idle');
    });

    it('Prozesse, die vor der Antwort gestartet sind (MCP-Server), zählen nicht', async () => {
      const c = await startClaude();
      const tree = await claudeProcess(c);
      const mcp = { pid: 30008, ppid: CLAUDE_PID, name: 'uv.exe', startTime: c.h.clock.now() + 400 };
      await elapse(c.h, 1000);
      c.h.processes.set([...tree, mcp]);
      await askPermission(c);

      c.type('\r');
      await elapse(c.h, ANSWER_QUIET_MS + 100);

      expect(c.status()).toBe('idle');
    });

    it('ein Hook innerhalb der Wartezeit entscheidet wie sonst, auch ohne neuen Prozess', async () => {
      const c = await startClaude();
      c.h.processes.set(await claudeProcess(c));
      await askPermission(c);

      c.type('1');
      await elapse(c.h, 1000);
      // Ein bestätigtes Lesen braucht keinen Prozess; PostToolUse kommt gleich.
      await c.send('PostToolUse-Read');
      await elapse(c.h, 2 * ANSWER_QUIET_MS);

      expect(c.status()).toBe('working');
    });

    it('eine verspätete Benachrichtigung zählt nicht als Hook', async () => {
      const c = await startClaude();
      c.h.processes.set(await claudeProcess(c));
      await askPermission(c);

      c.type('\r');
      await elapse(c.h, 1000);
      await c.send('Notification-permission_prompt');
      await elapse(c.h, ANSWER_QUIET_MS);

      expect(c.status()).toBe('idle');
    });

    it('ohne brauchbare Sonde (Claude-Prozess nicht zu finden) bleibt es bei „arbeitet“, bis ein Hook kommt', async () => {
      const c = await startClaude();
      // Die Sonde liefert nichts, wie auf einem System ohne koffi.
      c.h.processes.set([]);
      await askPermission(c);

      c.type('\r');
      await elapse(c.h, 3 * ANSWER_QUIET_MS);
      expect(c.status()).toBe('working');

      await c.send('Stop');
      expect(c.status()).toBe('idle');
    });

    it('ohne gemeldete Prozess-ID von Claude bleibt es ebenfalls bei „arbeitet“', async () => {
      const c = await startClaude();
      const shellPid = c.h.terminal.startsFor(c.tabId)[0].pid;
      const now = c.h.clock.now();
      c.h.processes.set([
        { pid: shellPid, ppid: 29248, name: 'pwsh.exe', startTime: now + 50 },
        { pid: CLAUDE_PID, ppid: shellPid, name: 'claude.exe', startTime: now + 300 },
      ]);
      await askPermission(c);

      c.type('\r');
      await elapse(c.h, 3 * ANSWER_QUIET_MS);

      expect(c.status()).toBe('working');
    });

    it('die Prüfung endet mit dem Ende von Claude', async () => {
      const c = await startClaude();
      const tree = await claudeProcess(c);
      c.h.processes.set(tree);
      await askPermission(c);

      c.type('\r');
      await c.h.api.exit(c.tabId, c.sessionId, 0);
      // Claude ist beendet; die Sonde sieht nur noch die Shell.
      c.h.processes.set(tree.filter((p) => p.pid !== CLAUDE_PID && p.ppid !== CLAUDE_PID));
      await elapse(c.h, ANSWER_QUIET_MS + 100);

      expect(c.tab()).toMatchObject({ kind: 'terminal', status: 'idle' });
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

/**
 * Claude läuft als Prozess 30000 unter der Shell des Tabs; der Starter hat die Prozess-ID gemeldet. Liefert den
 * Prozessbaum, wie ihn die Sonde sieht.
 */
async function claudeProcess(c: ClaudeSession): Promise<ProcessInfo[]> {
  await c.h.api.started(c.tabId, CLAUDE_PID);
  const shellPid = c.h.terminal.startsFor(c.tabId)[0].pid;
  // Die Shell startete zum Zeitpunkt, an dem die Uhr noch steht.
  const start = c.h.clock.now();
  return [
    { pid: 29248, ppid: 1200, name: 'electron.exe', startTime: start - 600_000 },
    { pid: shellPid, ppid: 29248, name: 'pwsh.exe', startTime: start + 50 },
    { pid: CLAUDE_PID, ppid: shellPid, name: 'claude.exe', startTime: start + 300 },
    { pid: 30004, ppid: CLAUDE_PID, name: 'conhost.exe', startTime: start + 310 },
  ];
}

/** Die Zeit läuft in kleinen Schritten, damit Antworten der Sonde dazwischen ausgewertet werden, wie im Betrieb. */
async function elapse(h: TestWorkspace, ms: number): Promise<void> {
  for (let done = 0; done < ms; done += 100) {
    h.clock.advance(Math.min(100, ms - done));
    await settle();
  }
}
