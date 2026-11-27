import { describe, expect, it } from 'vitest';
import type { GroupSnapshot, TabSnapshot } from '../../src/shared/types';
import { hookEvent, hookPayload, type HookSample } from '../support/apiClient';
import { expectHookReply } from '../support/claudeTab';
import { startWorkspaceWithApi, type TestWorkspace } from '../support/harness';

// „Arbeitet“, solange Agenten rechnen (Ticket 37), über die echte lokale Schnittstelle: Hook-Ereignisse in der Form, wie
// sie Claude Code 2.1.332 in der Messung geschickt hat (spikes/claude-hooks/samples, docs/spikes/claude-hooks.md,
// „Agenten“), Eingaben des Nutzers über writeToTab und eine steuerbare Uhr.

const ESC = '\x1b';
const ESC_QUIET_MS = 1500;
/** Frist nach dem Ende der Agenten, solange noch eine Meldung über einen Agenten aussteht. */
const AGENT_REPORT_QUIET_MS = 3000;
const SID_AFTER_CLEAR = '0f54d6f0-5e3c-45e6-aabf-d76021219bad';
const A = 'a56a3830eb09f52f0';
const B = 'a139445c0b1d2e3f4';

/** Ein laufender Agent im Hintergrund, wie ihn `background_tasks` aufführt. */
const running = (id: string) => ({
  id,
  type: 'subagent',
  status: 'running',
  description: 'Ping-Wartebefehl ausführen',
  agent_type: 'general-purpose',
});

/** Ein Claude-Tab, gestartet über den Starter; Claude Code schickt seine Hooks mit dieser Session-Kennung. */
class Session {
  constructor(
    readonly h: TestWorkspace,
    readonly tabId: string,
    readonly sessionId: string,
  ) {}

  async send(sample: HookSample, overrides: Record<string, unknown> = {}): Promise<void> {
    const event = hookEvent(sample);
    const payload = hookPayload(sample, { session_id: this.sessionId, cwd: 'C:\\proj', ...overrides });
    expectHookReply(await this.h.api.hook(this.tabId, event, payload), event);
  }

  /** Claude startet einen Agenten (Agent-Werkzeug); im Hintergrund kommt `PostToolUse` sofort. */
  async startAgent(id: string): Promise<void> {
    await this.send('PreToolUse-Agent');
    await this.send('SubagentStart', { agent_id: id });
    await this.send('PostToolUse-Agent');
  }

  /** Claude beendet seine Antwort; `background_tasks` nennt die Agenten, die noch laufen. */
  async stop(stillRunning: string[] = []): Promise<void> {
    await this.send('Stop-mit-agent', { background_tasks: stillRunning.map(running) });
  }

  /** Ein Werkzeug des Agenten: `PreToolUse`, dann `PostToolUse`. */
  async agentTool(id: string): Promise<void> {
    await this.send('PreToolUse-Bash-aus-agent', { agent_id: id });
    await this.send('PostToolUse-Bash-aus-agent', { agent_id: id });
  }

  /**
   * Ein Agent im Hintergrund endet, wie gemessen: Er übergibt seinen Bericht, Claude bekommt ihn als Prompt
   * (`<agent-message>`) und arbeitet damit; dann `SubagentStop`, bei dem der Agent noch in `background_tasks` steht.
   */
  async agentEnds(id: string, alsoRunning: string[] = []): Promise<void> {
    await this.send('UserPromptSubmit-agent-message', { prompt: agentMessage(id) });
    await this.endAgent(id, alsoRunning);
  }

  /** Nur `SubagentStop` eines Agenten im Hintergrund. */
  async endAgent(id: string, alsoRunning: string[] = []): Promise<void> {
    await this.send('SubagentStop', { agent_id: id, background_tasks: [id, ...alsoRunning].map(running) });
  }

  /** Claude Code meldet Claude, dass ein Agent geendet hat oder gestoppt wurde (`<task-notification>`). */
  async notifyEnd(id: string, status = 'completed'): Promise<void> {
    await this.send('UserPromptSubmit-task-notification-agent', { prompt: taskNotification(id, status) });
  }

  type(data: string): void {
    this.h.workspace.writeToTab(this.tabId, data);
  }

  tab(): TabSnapshot {
    const tab = this.h.tabs().find((t) => t.id === this.tabId);
    if (!tab) throw new Error(`Kein Tab ${this.tabId}`);
    return tab;
  }

  status(): TabSnapshot['status'] {
    return this.tab().status;
  }

  /** Wie oft der Tab seit `from` (Index der Ereignisse) gemeldet wurde, mit diesem Status. */
  reported(status: TabSnapshot['status'], from = 0): number {
    return this.h.events
      .slice(from)
      .filter((e) => e.type === 'tabs' && e.tabs.some((t) => t.id === this.tabId && t.status === status)).length;
  }

  /** Die verschiedenen Hinweise „fertig“, die seit `from` für diesen Tab erschienen sind. */
  finishedToasts(from = 0): string[] {
    const ids = new Set<string>();
    for (const e of this.h.events.slice(from)) {
      if (e.type !== 'toasts') continue;
      for (const t of e.toasts) if (t.kind === 'finished' && t.tabId === this.tabId) ids.add(t.id);
    }
    return [...ids];
  }

  /** Der Hinweis „wartet“ oder „fertig“ dieses Tabs, der gerade steht. */
  toast(): string | undefined {
    return this.h.snapshot().toasts.find((t) => t.kind !== 'keepAwakeError' && t.tabId === this.tabId)?.kind;
  }
}

function agentMessage(id: string): string {
  return `<agent-message from="${id}">\n[Subagent hand-back] The report follows:\n  <redigiert>\n</agent-message>`;
}

function taskNotification(id: string, status: string): string {
  return (
    `<task-notification>\n<task-id>${id}</task-id>\n<tool-use-id>toolu_01HsvJL952CPxNEhNeqwDz9t</tool-use-id>\n` +
    `<status>${status}</status>\n<summary>Agent "Ping-Wartebefehl ausführen" …</summary>\n</task-notification>`
  );
}

/**
 * Ein laufendes Terminal im Vordergrund-Fenster, darin Claude: Starter gemeldet, SessionStart angekommen. Mit
 * `hidden` ist ein zweiter Tab aktiv, der Claude-Tab also nicht sichtbar.
 */
async function startClaude({ hidden = false } = {}): Promise<Session & { otherTabId: string }> {
  const h = await startWorkspaceWithApi({ homeDir: 'C:\\Users\\anna' });
  const tabId = h.activeTab()!.id;
  const otherTabId = h.workspace.createTab();
  h.workspace.activateTab(hidden ? otherTabId : tabId);
  h.showAllViews();
  h.workspace.windowForeground(true);
  h.workspace.windowVisible(true);
  const res = await h.api.launch({ tabId, case: 'new', cwd: 'C:\\proj' });
  const session = new Session(h, tabId, JSON.parse(res.body).sessionId) as Session & { otherTabId: string };
  session.otherTabId = otherTabId;
  await session.send('SessionStart-startup');
  return session;
}

/** Claude startet einen Agenten im Hintergrund und beendet seine Antwort, während der Agent läuft. */
async function agentInBackground(c: Session, id = A): Promise<void> {
  await c.send('UserPromptSubmit');
  await c.startAgent(id);
  await c.stop([id]);
}

describe('Hintergrund-Agenten (Ticket 37)', () => {
  describe('arbeitet bis zum Schluss', () => {
    it('SubagentStart, dann Stop: „arbeitet“, weder grün noch ein Hinweis, auch im nicht sichtbaren Tab', async () => {
      const c = await startClaude({ hidden: true });

      await agentInBackground(c);
      // Der Agent rechnet; auch wenn sich der Tab eine Weile nicht meldet, bleibt er violett.
      c.h.clock.advance(60_000);

      expect(c.status()).toBe('working');
      expect(c.toast()).toBeUndefined();
      expect(c.reported('finished')).toBe(0);
    });

    it('der Agent endet, Claude verarbeitet seinen Bericht: genau einmal grün und ein Hinweis „fertig“, erst am Schluss', async () => {
      const c = await startClaude({ hidden: true });
      await agentInBackground(c);
      const from = c.h.events.length;

      await c.agentTool(A);
      await c.agentEnds(A);
      expect(c.status()).toBe('working');
      await c.stop([]);
      // Steht noch eine Meldung über den Agenten aus, wartet der Tab die Frist ab: Erst dann ist alles fertig.
      expect(c.status()).toBe('working');
      c.h.clock.advance(AGENT_REPORT_QUIET_MS);

      expect(c.status()).toBe('finished');
      expect(c.toast()).toBe('finished');
      expect(c.reported('finished', from)).toBe(1);
      expect(c.finishedToasts(from)).toHaveLength(1);
    });

    it('SubagentStop und innerhalb der Frist UserPromptSubmit und Stop: genau einmal grün und höchstens ein Hinweis', async () => {
      const c = await startClaude({ hidden: true });
      await agentInBackground(c);
      const from = c.h.events.length;

      // Wie in der Messung: Der Agent hinterlässt eigene Hintergrund-Arbeit; nach Claudes Stop kommt noch eine Meldung.
      await c.agentEnds(A);
      await c.stop([]);
      c.h.clock.advance(600);
      await c.notifyEnd(A);
      expect(c.status()).toBe('working');
      await c.send('Stop');
      expect(c.status()).toBe('finished');
      c.h.clock.advance(AGENT_REPORT_QUIET_MS);

      expect(c.status()).toBe('finished');
      expect(c.reported('finished', from)).toBe(1);
      expect(c.finishedToasts(from)).toHaveLength(1);
    });

    it('SubagentStop, während Claude ruht, ohne folgendes UserPromptSubmit: nach der Frist grün mit Hinweis', async () => {
      const c = await startClaude({ hidden: true });
      await agentInBackground(c);

      await c.endAgent(A);
      c.h.clock.advance(AGENT_REPORT_QUIET_MS - 1);
      expect(c.status()).toBe('working');
      expect(c.toast()).toBeUndefined();
      c.h.clock.advance(1);

      expect(c.status()).toBe('finished');
      expect(c.toast()).toBe('finished');
    });

    it('dasselbe im sichtbaren Tab: nach der Frist „ruht“, ohne grün und ohne Hinweis', async () => {
      const c = await startClaude();
      await agentInBackground(c);

      await c.endAgent(A);
      c.h.clock.advance(AGENT_REPORT_QUIET_MS);

      expect(c.status()).toBe('idle');
      expect(c.toast()).toBeUndefined();
    });

    it('zwei Agenten: „arbeitet“, bis beide geendet haben', async () => {
      const c = await startClaude({ hidden: true });
      await c.send('UserPromptSubmit');
      await c.startAgent(A);
      await c.startAgent(B);
      await c.stop([A, B]);
      const from = c.h.events.length;

      // A endet zuerst; Claude verarbeitet seinen Bericht und ruht wieder, B rechnet noch.
      await c.agentEnds(A, [B]);
      await c.stop([B]);
      c.h.clock.advance(10 * AGENT_REPORT_QUIET_MS);
      expect(c.status()).toBe('working');
      expect(c.toast()).toBeUndefined();

      await c.agentEnds(B);
      await c.stop([]);
      c.h.clock.advance(AGENT_REPORT_QUIET_MS);

      expect(c.status()).toBe('finished');
      expect(c.finishedToasts(from)).toHaveLength(1);
    });

    it('PreToolUse und PostToolUse eines Agenten, nachdem Claude fertig ist: Endet der Agent, bleibt nichts hängen', async () => {
      const c = await startClaude();
      await agentInBackground(c);

      await c.agentTool(A);
      await c.send('PreToolUse-Bash-aus-agent', { agent_id: A });
      expect(c.status()).toBe('working');
      await c.endAgent(A);
      c.h.clock.advance(AGENT_REPORT_QUIET_MS);

      expect(c.status()).toBe('idle');
    });

    it('ein Agent im Vordergrund: violett bis zum Ende der Antwort, danach sofort fertig wie bisher', async () => {
      const c = await startClaude({ hidden: true });
      await c.send('UserPromptSubmit');
      await c.send('PreToolUse-Agent', { tool_input: { run_in_background: false } });
      await c.send('SubagentStart', { agent_id: A });
      await c.agentTool(A);
      // Im Vordergrund steht der Agent nicht in background_tasks.
      await c.send('SubagentStop', { agent_id: A, background_tasks: [] });
      await c.send('PostToolUse-Agent');
      expect(c.status()).toBe('working');

      await c.stop([]);

      expect(c.status()).toBe('finished');
      expect(c.toast()).toBe('finished');
    });

    it('Hilfs-Agenten von Claude Code (SubagentStop ohne SubagentStart, nach jedem Stop) ändern nichts', async () => {
      const c = await startClaude({ hidden: true });
      await c.send('UserPromptSubmit');
      await c.send('Stop');
      expect(c.status()).toBe('finished');

      await c.send('SubagentStop-helfer');
      c.h.clock.advance(AGENT_REPORT_QUIET_MS);

      expect(c.status()).toBe('finished');
      expect(c.finishedToasts()).toHaveLength(1);
    });
  });

  describe('Rückfragen aus einem Agenten', () => {
    it('PermissionRequest aus einem Agenten: „wartet“ mit Hinweis, danach wieder „arbeitet“', async () => {
      const c = await startClaude({ hidden: true });
      await agentInBackground(c);

      await c.send('PreToolUse-Bash-aus-agent', { agent_id: A });
      await c.send('PermissionRequest-aus-agent', { agent_id: A });
      expect(c.status()).toBe('waiting');
      expect(c.toast()).toBe('waiting');

      await c.send('PostToolUse-Bash-aus-agent', { agent_id: A });
      expect(c.status()).toBe('working');
      expect(c.toast()).toBeUndefined();
    });

    it('die verspätete Benachrichtigung zur Rückfrage des Agenten setzt den Tab nicht wieder auf „wartet“', async () => {
      const c = await startClaude();
      await c.send('UserPromptSubmit');
      await c.send('PreToolUse-Agent', { tool_input: { run_in_background: false } });
      await c.send('SubagentStart', { agent_id: A });
      await c.send('PreToolUse-Bash-aus-agent', { agent_id: A });
      await c.send('PermissionRequest-aus-agent', { agent_id: A });

      c.type('1');
      expect(c.status()).toBe('working');
      await c.send('Notification-permission_prompt');

      expect(c.status()).toBe('working');
    });

    it('die Antwort auf die Rückfrage eines Agenten (Enter oder Ziffer) beendet das Warten; der Agent rechnet weiter', async () => {
      const c = await startClaude();
      await agentInBackground(c);
      await c.send('PermissionRequest-aus-agent', { agent_id: A });

      c.type('\r');
      expect(c.status()).toBe('working');
      c.h.clock.advance(10_000);

      expect(c.status()).toBe('working');
    });
  });

  describe('Esc', () => {
    it('Esc, während nur noch Agenten laufen: bleibt „arbeitet“, ohne Wartezeit', async () => {
      const c = await startClaude();
      await agentInBackground(c);
      const timers = c.h.clock.pendingTimers();

      c.type(ESC);
      expect(c.h.clock.pendingTimers()).toBe(timers);
      c.h.clock.advance(ESC_QUIET_MS);

      expect(c.status()).toBe('working');
    });

    it('Esc unterbricht Claude, der Agent rechnet weiter: „arbeitet“, bis er endet; danach ohne grün', async () => {
      const c = await startClaude({ hidden: true });
      await c.send('UserPromptSubmit');
      await c.startAgent(A);
      await c.send('PreToolUse-Bash');

      c.type(ESC);
      // Ereignisse aus dem Agenten zeigen nicht, dass Claude selbst weitermacht.
      await c.send('PreToolUse-Bash-aus-agent', { agent_id: A });
      c.h.clock.advance(ESC_QUIET_MS);
      expect(c.status()).toBe('working');

      await c.send('PostToolUse-Bash-aus-agent', { agent_id: A });
      await c.endAgent(A);
      c.h.clock.advance(AGENT_REPORT_QUIET_MS);

      // Wer unterbricht, braucht kein „fertig“.
      expect(c.status()).toBe('idle');
      expect(c.toast()).toBeUndefined();
    });

    it('nach Esc verarbeitet Claude den Bericht des Agenten: danach grün wie nach jeder Antwort', async () => {
      const c = await startClaude({ hidden: true });
      await c.send('UserPromptSubmit');
      await c.startAgent(A);
      c.type(ESC);
      c.h.clock.advance(ESC_QUIET_MS);

      await c.agentEnds(A);
      await c.stop([]);
      c.h.clock.advance(AGENT_REPORT_QUIET_MS);

      expect(c.status()).toBe('finished');
    });

    it('Esc auf die Rückfrage eines Agenten: Nach der Wartezeit wartet der Tab nicht mehr; der Agent rechnet weiter', async () => {
      const c = await startClaude();
      await agentInBackground(c);
      await c.send('PermissionRequest-aus-agent', { agent_id: A });

      c.type(ESC);
      c.h.clock.advance(ESC_QUIET_MS);

      expect(c.status()).toBe('working');
    });
  });

  describe('gestoppte Agenten', () => {
    it('von Claude gestoppt (TaskStop): ohne SubagentStop; die Meldung mit Status killed und Stop räumen ihn ab', async () => {
      const c = await startClaude({ hidden: true });
      await agentInBackground(c);

      await c.send('UserPromptSubmit');
      await c.notifyEnd(A, 'killed');
      await c.stop([]);

      expect(c.status()).toBe('finished');
    });

    it('fehlt ein Agent in background_tasks von Stop, läuft er nicht mehr', async () => {
      const c = await startClaude({ hidden: true });
      await agentInBackground(c);

      await c.send('UserPromptSubmit');
      await c.stop([]);

      expect(c.status()).toBe('finished');
    });

    it('steht ein unbekannter Agent in background_tasks von Stop, läuft er (etwa wenn SubagentStart nicht ankam)', async () => {
      const c = await startClaude({ hidden: true });
      await c.send('UserPromptSubmit');

      await c.stop([A]);
      expect(c.status()).toBe('working');
      await c.endAgent(A);
      c.h.clock.advance(AGENT_REPORT_QUIET_MS);

      expect(c.status()).toBe('finished');
    });
  });

  describe('/clear und nichts bleibt hängen', () => {
    it('/clear: Die Agenten rechnen weiter und melden sich in der neuen Session; violett bis zum Schluss, dann einmal grün', async () => {
      const c = await startClaude({ hidden: true });
      await agentInBackground(c);
      const from = c.h.events.length;

      await c.send('SessionEnd-clear');
      await c.send('SessionStart-clear', { session_id: SID_AFTER_CLEAR });
      expect(c.status()).toBe('working');
      // Wie gemessen: Alles danach kommt mit der Kennung der neuen Session.
      const after = { session_id: SID_AFTER_CLEAR };
      await c.send('PostToolUse-Bash-aus-agent', { ...after, agent_id: A });
      await c.send('UserPromptSubmit-agent-message', { ...after, prompt: agentMessage(A) });
      await c.send('SubagentStop', { ...after, agent_id: A, background_tasks: [running(A)] });
      await c.send('Stop-mit-agent', { ...after, background_tasks: [] });
      expect(c.status()).toBe('working');
      c.h.clock.advance(AGENT_REPORT_QUIET_MS);

      expect(c.status()).toBe('finished');
      expect(c.finishedToasts(from)).toHaveLength(1);
      expect(c.h.storedTab(c.tabId)?.claude?.sessionId).toBe(SID_AFTER_CLEAR);
    });

    it('ein neuer Start von Claude (SessionStart mit Quelle startup) beginnt ohne Agenten', async () => {
      const c = await startClaude();
      await agentInBackground(c);

      await c.send('SessionStart-startup');

      expect(c.status()).toBe('idle');
    });

    it('SessionEnd, mit dem Claude endet: normales Terminal; ein neuer Start ruht, ohne Agenten', async () => {
      const c = await startClaude();
      await agentInBackground(c);

      await c.send('SessionEnd-prompt_input_exit');
      expect(c.tab()).toMatchObject({ kind: 'terminal', status: 'idle' });
      await c.h.api.launch({ tabId: c.tabId, case: 'new', cwd: 'C:\\proj' });

      expect(c.tab()).toMatchObject({ kind: 'claude', status: 'idle' });
    });

    it('das Ende von Claude (Ende-Meldung des Starters) leert die Liste', async () => {
      const c = await startClaude();
      await agentInBackground(c);

      await c.h.api.exit(c.tabId, c.sessionId, 0);
      expect(c.tab()).toMatchObject({ kind: 'terminal', status: 'idle' });
      await c.h.api.launch({ tabId: c.tabId, case: 'new', cwd: 'C:\\proj' });

      expect(c.tab()).toMatchObject({ kind: 'claude', status: 'idle' });
    });

    it('das Ende der Shell leert die Liste, auch während der Frist', async () => {
      const c = await startClaude();
      await agentInBackground(c);
      await c.endAgent(A);

      c.h.terminal.exit(c.tabId, 0);
      c.h.clock.advance(AGENT_REPORT_QUIET_MS);

      expect(c.tab()).toMatchObject({ kind: 'terminal', status: 'idle', process: 'exited' });
    });

    it('nach einem Neustart läuft kein Agent mehr: Die Liste wird nicht gespeichert', async () => {
      const c = await startClaude();
      await agentInBackground(c);
      expect(c.h.storedTab(c.tabId)?.claude).not.toHaveProperty('agents');

      await c.h.restart();
      c.h.showAllViews();

      expect(c.tab()).toMatchObject({ kind: 'claude', status: 'idle' });
    });
  });

  describe('Claude-Zuordnung', () => {
    it('ein Ereignis mit agent_id ändert die Zuordnung nicht, auch mit eigener session_id', async () => {
      const c = await startClaude();
      await agentInBackground(c);
      const before = c.h.storedTab(c.tabId)?.claude;

      await c.send('PreToolUse-Bash-aus-agent', { agent_id: A, session_id: SID_AFTER_CLEAR });
      await c.send('SubagentStop', { agent_id: A, session_id: SID_AFTER_CLEAR, background_tasks: [running(A)] });

      expect(c.h.storedTab(c.tabId)?.claude).toEqual(before);
      expect(c.h.storedTab(c.tabId)?.claude?.sessionId).toBe(c.sessionId);
    });
  });

  describe('Schliessen und Gruppen', () => {
    it('ein Tab, in dem nur noch ein Agent rechnet, fragt vor dem Schliessen nach („arbeitet“)', async () => {
      const c = await startClaude();
      await agentInBackground(c);

      c.h.workspace.requestClose([c.tabId]);

      expect(c.h.eventsOfType('askClose').at(-1)?.busy).toEqual([
        expect.objectContaining({ id: c.tabId, reason: 'working' }),
      ]);
    });

    it('der Gruppen-Tab zeigt „arbeitet“, wenn ein Tab der Gruppe nur wegen eines Agenten arbeitet', async () => {
      const c = await startClaude();
      const group = c.h.workspace.createGroup(c.tabId);
      c.h.workspace.moveTabToGroup(c.otherTabId, group);
      c.h.workspace.activateTab(c.otherTabId);

      await agentInBackground(c);

      expect(groupOf(c.h, group).status).toBe('working');
      await c.endAgent(A);
      c.h.clock.advance(AGENT_REPORT_QUIET_MS);
      expect(groupOf(c.h, group).status).toBe('finished');
    });
  });
});

function groupOf(h: TestWorkspace, groupId: string): GroupSnapshot {
  const found = h.snapshot().groups.find((g) => g.id === groupId);
  if (!found) throw new Error(`Keine Gruppe ${groupId}`);
  return found;
}
