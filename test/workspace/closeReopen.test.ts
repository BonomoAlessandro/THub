import { describe, expect, it } from 'vitest';
import type { ProcessInfo } from '../../src/main/workspace/ports';
import { hookEvent, hookPayload, type HookSample } from '../support/apiClient';
import { settle, startWorkspace, startWorkspaceWithApi, type TestWorkspace } from '../support/harness';

// Tabs schliessen mit Rückfrage und wieder öffnen (Ticket 15): Rückfrage nach den eigentlichen Merkmalen, Liste der
// zuletzt geschlossenen Tabs, Wiederöffnen wie nach einem Neustart, Einfrieren und das Beenden der Shell samt allen
// Nachfahren über die Prozess-Sonde. Meldungen von Starter und Claude über die echte lokale Schnittstelle, in der Form,
// wie Claude Code 2.1.328 sie im Spike geschickt hat.

const HOME = 'C:\\Users\\anna';
const PROJ = 'C:\\proj';
const WEB = 'C:\\web';
const SUB = 'C:\\proj\\src';
/** Der THub-Hauptprozess; die Shells und ihre Konsolen-Hosts sind seine Kinder. */
const ELECTRON_PID = 29248;
const CLAUDE_PID = 30000;
const ESC = '\x1b';

/** Ordner-Meldung der Shell-Integration (OSC 9;9), wie sie bei jedem Prompt kommt. */
const cwdReport = (dir: string): string => `${ESC}]9;9;${dir}\x07`;

async function setup(): Promise<TestWorkspace> {
  const h = await startWorkspaceWithApi({ homeDir: HOME, directories: [PROJ, WEB, SUB] });
  return h;
}

/** Claude Code schickt ein Hook-Ereignis. */
async function hook(h: TestWorkspace, tabId: string, sample: HookSample, overrides: Record<string, unknown>): Promise<void> {
  const res = await h.api.hook(tabId, hookEvent(sample), hookPayload(sample, overrides));
  expect(res).toMatchObject({ status: 200, body: '' });
}

/** `claude` im Tab: Starter meldet den Fall „neu“ und die Prozess-ID, Claude meldet SessionStart. Liefert die Kennung. */
async function startClaude(h: TestWorkspace, tabId: string, cwd = PROJ): Promise<string> {
  const res = await h.api.launch({ tabId, case: 'new', cwd });
  const id = JSON.parse(res.body).sessionId as string;
  await h.api.started(tabId, CLAUDE_PID);
  await hook(h, tabId, 'SessionStart-startup', { session_id: id, cwd });
  return id;
}

/** Claude mit einem Prompt: ein fortzusetzender Claude-Tab, der gerade arbeitet. */
async function claudeWorking(h: TestWorkspace, tabId: string, cwd = PROJ): Promise<string> {
  const id = await startClaude(h, tabId, cwd);
  await hook(h, tabId, 'UserPromptSubmit', { session_id: id, cwd });
  return id;
}

function tab(h: TestWorkspace, tabId: string) {
  return h.tabs().find((t) => t.id === tabId);
}

describe('Tabs schliessen mit Rückfrage und wieder öffnen', () => {
  describe('Rückfrage beim Schliessen', () => {
    it('ein ruhender Tab schliesst sofort, ohne Rückfrage', async () => {
      const h = await setup();
      const keep = h.activeTab()!.id;
      const close = h.workspace.createTab();
      h.showAllViews();

      h.workspace.requestClose([close]);

      expect(h.tabs().map((t) => t.id)).toEqual([keep]);
      expect(h.eventsOfType('askClose')).toEqual([]);
    });

    it('ein ruhender Claude-Tab schliesst sofort, ohne Rückfrage', async () => {
      const h = await setup();
      const keep = h.activeTab()!.id;
      const close = h.workspace.createTab();
      h.showAllViews();
      await startClaude(h, close);
      expect(tab(h, close)).toMatchObject({ kind: 'claude', status: 'idle' });

      h.workspace.requestClose([close]);

      expect(h.tabs().map((t) => t.id)).toEqual([keep]);
      expect(h.eventsOfType('askClose')).toEqual([]);
    });

    it('arbeitet Claude, fragt der Kern nach und schliesst nichts; der Tab setzt beim Wiederöffnen fort', async () => {
      const h = await setup();
      const busy = h.activeTab()!.id;
      h.showAllViews();
      await claudeWorking(h, busy);

      h.workspace.requestClose([busy]);

      expect(h.eventsOfType('askClose')).toEqual([
        { type: 'askClose', tabIds: [busy], busy: [{ id: busy, name: 'anna', reason: 'working', resumes: true }] },
      ]);
      expect(h.tabs().map((t) => t.id)).toEqual([busy]);
      await settle();
      expect(h.terminal.kills).toEqual([]);
      expect(h.eventsOfType('requestHistory')).toEqual([]);
    });

    it('wartet Claude auf dich, fragt der Kern nach', async () => {
      const h = await setup();
      const busy = h.activeTab()!.id;
      h.showAllViews();
      const id = await claudeWorking(h, busy);
      await hook(h, busy, 'PermissionRequest-Bash', { session_id: id, cwd: PROJ });

      h.workspace.requestClose([busy]);

      expect(h.eventsOfType('askClose')[0]?.busy).toEqual([{ id: busy, name: 'anna', reason: 'waiting', resumes: true }]);
    });

    it('laufen im Terminal Prozesse, fragt der Kern nach', async () => {
      const h = startWorkspace({ homeDir: HOME });
      const t = terminal(h, 19996);
      const tree = [electron(t), t.proc(19996, ELECTRON_PID, 'pwsh.exe', 100), t.proc(8120, 19996, 'node.exe', 2000)];
      await h.probe(tree);
      await h.probe(tree);
      expect(tab(h, t.tabId)?.status).toBe('processes');

      h.workspace.requestClose([t.tabId]);

      expect(h.eventsOfType('askClose')[0]?.busy).toEqual([
        { id: t.tabId, name: 'anna 2', reason: 'processes', resumes: false },
      ]);
      expect(tab(h, t.tabId)).toBeDefined();
    });

    it('massgeblich ist das Merkmal, nicht das Symbol: ein grüner Claude-Tab mit laufendem Dev-Server fragt nach', async () => {
      const h = await setup();
      const claudeTab = h.activeTab()!.id;
      const other = h.workspace.createTab();
      h.workspace.activateTab(claudeTab);
      h.terminal.usePids(19996);
      const started = h.clock.now();
      h.showAllViews();
      h.workspace.windowForeground(true);
      const id = await claudeWorking(h, claudeTab);
      const promptAt = h.clock.now();
      h.workspace.activateTab(other);
      await hook(h, claudeTab, 'Stop', { session_id: id, cwd: PROJ });
      const tree: ProcessInfo[] = [
        { pid: ELECTRON_PID, ppid: 1200, name: 'electron.exe', startTime: started - 600_000 },
        { pid: 19996, ppid: ELECTRON_PID, name: 'pwsh.exe', startTime: started + 100 },
        { pid: CLAUDE_PID, ppid: 19996, name: 'claude.exe', startTime: started + 200 },
        { pid: 8120, ppid: CLAUDE_PID, name: 'node.exe', startTime: promptAt + 500 },
      ];
      await h.probe(tree);
      await h.probe(tree);
      expect(tab(h, claudeTab)?.status).toBe('finished');

      h.workspace.requestClose([claudeTab]);

      expect(h.eventsOfType('askClose')[0]?.busy).toEqual([
        { id: claudeTab, name: 'anna', reason: 'processes', resumes: true },
      ]);
    });

    it('grün allein (fertig, noch nicht angeschaut) fragt nicht nach', async () => {
      const h = await setup();
      const claudeTab = h.activeTab()!.id;
      const other = h.workspace.createTab();
      h.showAllViews();
      h.workspace.windowForeground(true);
      const id = await claudeWorking(h, claudeTab);
      await hook(h, claudeTab, 'Stop', { session_id: id, cwd: PROJ });
      expect(tab(h, claudeTab)?.status).toBe('finished');

      h.workspace.requestClose([claudeTab]);

      expect(h.tabs().map((t) => t.id)).toEqual([other]);
      expect(h.eventsOfType('askClose')).toEqual([]);
    });

    it('ein pausierter Claude-Tab hat keinen Prozess und schliesst sofort', async () => {
      const h = await setup();
      const normal = h.activeTab()!.id;
      const claudeTab = h.workspace.createTab();
      h.showAllViews();
      await claudeWorking(h, claudeTab);
      h.workspace.activateTab(normal);
      await h.restart();
      expect(tab(h, claudeTab)).toMatchObject({ paused: true });

      h.workspace.requestClose([claudeTab]);

      expect(h.tabs().map((t) => t.id)).toEqual([normal]);
      expect(h.eventsOfType('askClose')).toEqual([]);
    });

    describe('mehrere Tabs („Andere Tabs schliessen“)', () => {
      it('höchstens eine gemeinsame Rückfrage, die die betroffenen Tabs nennt; bestätigt schliessen alle', async () => {
        const h = await setup();
        const keep = h.activeTab()!.id;
        const working = h.workspace.createTab({ cwd: PROJ });
        const idle = h.workspace.createTab({ cwd: WEB });
        const waiting = h.workspace.createTab({ cwd: SUB });
        h.showAllViews();
        await claudeWorking(h, working);
        const id = await claudeWorking(h, waiting, SUB);
        await hook(h, waiting, 'PermissionRequest-Bash', { session_id: id, cwd: SUB });

        h.workspace.closeOtherTabs(keep);

        expect(h.eventsOfType('askClose')).toEqual([
          {
            type: 'askClose',
            tabIds: [working, idle, waiting],
            busy: [
              { id: working, name: 'proj', reason: 'working', resumes: true },
              { id: waiting, name: 'src', reason: 'waiting', resumes: true },
            ],
          },
        ]);
        expect(h.tabs()).toHaveLength(4);

        h.workspace.closeTabs([working, idle, waiting]);

        expect(h.tabs().map((t) => t.id)).toEqual([keep]);
        expect(h.activeTab()?.id).toBe(keep);
        expect(h.workspace.closedTabs().map((t) => t.name)).toEqual(['src', 'web', 'proj']);
      });

      it('ruhen alle anderen, schliessen sie ohne Rückfrage', async () => {
        const h = await setup();
        const keep = h.activeTab()!.id;
        h.workspace.createTab({ cwd: PROJ });
        h.workspace.createTab({ cwd: WEB });
        h.showAllViews();

        h.workspace.closeOtherTabs(keep);

        expect(h.tabs().map((t) => t.id)).toEqual([keep]);
        expect(h.eventsOfType('askClose')).toEqual([]);
      });

      it('zurückgeholt in umgekehrter Reihenfolge, stehen alle wieder an ihren Plätzen', async () => {
        const h = await setup();
        const a = h.activeTab()!.id;
        const b = h.workspace.createTab({ cwd: PROJ });
        const c = h.workspace.createTab({ cwd: WEB });
        const d = h.workspace.createTab({ cwd: SUB });
        h.workspace.activateTab(c);

        h.workspace.closeOtherTabs(c);
        h.workspace.reopenClosedTab();
        h.workspace.reopenClosedTab();
        h.workspace.reopenClosedTab();

        expect(h.tabs().map((t) => t.id)).toEqual([a, b, c, d]);
      });
    });

    it('unbekannte Tabs übergeht der Kern', async () => {
      const h = await setup();
      const before = h.snapshot();

      h.workspace.requestClose(['gibt-es-nicht']);
      h.workspace.closeOtherTabs('gibt-es-nicht');

      expect(h.snapshot()).toEqual(before);
      expect(h.eventsOfType('askClose')).toEqual([]);
    });
  });

  describe('Fenster schliessen bzw. App beenden', () => {
    it('fragt nie nach, auch wenn Claude arbeitet; nach dem Neustart geht es weiter', async () => {
      const h = await setup();
      const claudeTab = h.activeTab()!.id;
      h.showAllViews();
      const id = await claudeWorking(h, claudeTab);

      await h.restart();
      h.showAllViews();

      expect(h.eventsOfType('askClose')).toEqual([]);
      expect(h.terminal.startsFor(claudeTab).at(-1)?.order.startCommand).toContain(`--resume ${id}`);
    });
  });

  describe('zuletzt geschlossene Tabs', () => {
    it('höchstens zehn, die neuesten zuerst, mit Name, Shell, Ordner und Art', async () => {
      const h = await setup();
      for (let i = 1; i <= 12; i++) {
        const id = h.workspace.createTab({ cwd: PROJ, shellId: 'cmd' });
        h.workspace.renameTab(id, `Tab ${i}`);
        h.workspace.closeTab(id);
      }

      const closed = h.workspace.closedTabs();

      expect(closed.map((t) => t.name)).toEqual(['Tab 12', 'Tab 11', 'Tab 10', 'Tab 9', 'Tab 8', 'Tab 7', 'Tab 6', 'Tab 5', 'Tab 4', 'Tab 3']);
      expect(closed[0]).toMatchObject({ kind: 'terminal', shellName: 'cmd', cwd: PROJ, closedAt: h.clock.now() });
    });

    it('übersteht einen Neustart, samt Claude-Zuordnung', async () => {
      const h = await setup();
      const a = h.workspace.createTab({ cwd: WEB });
      const claudeTab = h.workspace.createTab({ cwd: PROJ });
      h.showAllViews();
      await claudeWorking(h, claudeTab);
      h.workspace.closeTab(a);
      h.workspace.closeTab(claudeTab);
      const before = h.workspace.closedTabs();

      await h.restart();

      expect(h.workspace.closedTabs()).toEqual(before);
      expect(before.map((t) => [t.name, t.kind, t.cwd])).toEqual([
        ['proj', 'claude', PROJ],
        ['web', 'terminal', WEB],
      ]);
    });

    it('fällt ein Tab aus der Liste, wird sein Verlauf gelöscht; die anderen behalten ihren', async () => {
      const h = await setup();
      const first = h.workspace.createTab({ cwd: PROJ });
      h.showAllViews();
      h.terminal.output(first, 'erster Tab\r\n');
      h.workspace.closeTab(first);
      expect(h.storedHistory(first)?.content).toBe('erster Tab\r\n');
      const others: string[] = [];
      for (let i = 0; i < 9; i++) {
        const id = h.workspace.createTab();
        h.workspace.viewReady(id, 100, 30);
        h.terminal.output(id, `Tab ${i}\r\n`);
        h.workspace.closeTab(id);
        others.push(id);
      }
      expect(h.storedHistory(first)).not.toBeNull();

      h.workspace.closeTab(h.workspace.createTab());

      expect(h.storedHistory(first)).toBeNull();
      expect(others.every((id) => h.storedHistory(id) !== null)).toBe(true);
    });

    it('ein beschädigter Zustand mit einem Tab, der zugleich offen und geschlossen ist, öffnet ihn nicht doppelt', async () => {
      const h = await setup();
      const a = h.workspace.createTab({ cwd: PROJ });
      h.workspace.closeTab(a);
      const state = h.storedState();
      const reopened = { ...state, tabs: [...state.tabs, state.closedTabs[0].tab] };

      const h2 = startWorkspace({ homeDir: HOME, directories: [PROJ], state: reopened });

      expect(h2.workspace.closedTabs()).toEqual([]);
      expect(h2.workspace.reopenClosedTab()).toBe('');
      expect(h2.tabs().filter((t) => t.id === a)).toHaveLength(1);
    });
  });

  describe('wieder öffnen', () => {
    it('stellt Position, Name, Shell und zuletzt aktiven Ordner her, macht den Tab aktiv und gibt den Verlauf zurück', async () => {
      const h = await setup();
      const a = h.activeTab()!.id;
      const b = h.workspace.createTab({ cwd: PROJ, shellId: 'cmd' });
      const c = h.workspace.createTab({ cwd: WEB });
      h.showAllViews();
      h.workspace.renameTab(b, 'Mein Tab');
      h.terminal.output(b, `C:\\proj> cd src\r\n${cwdReport(SUB)}C:\\proj\\src> dir\r\n`);
      h.workspace.activateTab(a);

      h.workspace.closeTab(b);
      await settle();
      expect(h.tabs().map((t) => t.id)).toEqual([a, c]);
      const reopened = h.workspace.reopenClosedTab();

      expect(reopened).toBe(b);
      expect(h.tabs().map((t) => t.id)).toEqual([a, b, c]);
      expect(h.activeTab()).toMatchObject({ id: b, name: 'Mein Tab', shellId: 'cmd', cwd: SUB, process: 'pending' });
      expect(h.workspace.closedTabs()).toEqual([]);

      h.workspace.viewReady(b, 100, 30);
      const restored = h.eventsOfType('restoreHistory').filter((e) => e.tabId === b);
      expect(restored).toHaveLength(1);
      expect(restored[0].content).toContain('C:\\proj\\src> dir');
      expect(h.terminal.startsFor(b).at(-1)?.order).toMatchObject({ file: 'cmd.exe', cwd: SUB });
      expect(h.terminal.startsFor(b).at(-1)?.order.startCommand).toBeUndefined();
    });

    it('nach einem Neustart: Der Tab aus der Liste kommt mit Verlauf zurück', async () => {
      const h = await setup();
      const a = h.activeTab()!.id;
      const b = h.workspace.createTab({ cwd: PROJ });
      h.showAllViews();
      h.terminal.output(b, 'vor dem Schliessen\r\n');
      h.workspace.closeTab(b);

      await h.restart();
      h.showAllViews();
      h.workspace.reopenClosedTab();
      h.workspace.viewReady(b, 100, 30);

      expect(h.tabs().map((t) => t.id)).toEqual([a, b]);
      expect(h.eventsOfType('restoreHistory')).toMatchObject([{ tabId: b, content: 'vor dem Schliessen\r\n' }]);
      expect(h.terminal.startsFor(b).at(-1)?.order.cwd).toBe(PROJ);
    });

    it('ohne Kennung den zuletzt geschlossenen (Ctrl+Shift+Z), mit Kennung genau diesen (Befehlspalette)', async () => {
      const h = await setup();
      const a = h.workspace.createTab({ cwd: PROJ });
      const b = h.workspace.createTab({ cwd: WEB });
      const c = h.workspace.createTab({ cwd: SUB });
      h.workspace.closeTabs([a, b, c]);

      expect(h.workspace.reopenClosedTab(b)).toBe(b);
      expect(h.workspace.reopenClosedTab()).toBe(c);
      expect(h.workspace.closedTabs().map((t) => t.id)).toEqual([a]);
      expect(h.workspace.reopenClosedTab('gibt-es-nicht')).toBe('');
    });

    it('ohne geschlossene Tabs passiert nichts', async () => {
      const h = await setup();
      const before = h.snapshot();

      expect(h.workspace.reopenClosedTab()).toBe('');
      expect(h.snapshot()).toEqual(before);
    });

    it('ein Claude-Tab setzt seine Session sofort fort: Startauftrag mit --resume <Kennung> im Ordner der Session', async () => {
      const h = await setup();
      const normal = h.activeTab()!.id;
      const claudeTab = h.workspace.createTab({ cwd: WEB });
      h.showAllViews();
      const id = await claudeWorking(h, claudeTab, PROJ);
      h.workspace.activateTab(normal);

      h.workspace.closeTabs([claudeTab]);
      await settle();
      h.workspace.reopenClosedTab();
      expect(h.activeTab()).toMatchObject({ id: claudeTab, kind: 'claude', paused: false });
      h.workspace.viewReady(claudeTab, 100, 30);

      const start = h.terminal.startsFor(claudeTab).at(-1)!;
      expect(start.order.startCommand).toContain(`--resume ${id}`);
      expect(start.order.cwd).toBe(PROJ);
      expect(h.eventsOfType('restoreHistory').filter((e) => e.tabId === claudeTab)).toEqual([]);
    });

    it('Einfrieren: Claude-Tab schliessen, danach SessionEnd, Ende der Shell und Ende-Meldung → Wiederöffnen setzt trotzdem fort', async () => {
      const h = await setup();
      const claudeTab = h.activeTab()!.id;
      h.workspace.createTab();
      h.showAllViews();
      const id = await claudeWorking(h, claudeTab);
      h.processes.hold();

      h.workspace.closeTab(claudeTab);
      await hook(h, claudeTab, 'SessionEnd-other', { session_id: id, cwd: PROJ });
      h.terminal.exit(claudeTab, 1);
      await h.api.exit(claudeTab, id, 1);
      h.processes.release();
      await settle();

      expect(h.storedState().closedTabs[0].tab.claude).toMatchObject({ sessionId: id, hadPrompt: true });
      h.workspace.reopenClosedTab();
      h.workspace.viewReady(claudeTab, 100, 30);
      expect(h.terminal.startsFor(claudeTab).at(-1)?.order.startCommand).toContain(`--resume ${id}`);
    });

    it('ein Claude-Tab, der nicht fortgesetzt wird (nie ein Prompt), kommt als normales Terminal im Ordner der Session', async () => {
      const h = await setup();
      const claudeTab = h.workspace.createTab({ cwd: WEB });
      h.showAllViews();
      await startClaude(h, claudeTab, PROJ);
      h.workspace.closeTab(claudeTab);

      h.workspace.reopenClosedTab();
      h.workspace.viewReady(claudeTab, 100, 30);

      expect(tab(h, claudeTab)).toMatchObject({ kind: 'terminal', cwd: PROJ });
      expect(h.terminal.startsFor(claudeTab).at(-1)?.order).toMatchObject({ cwd: PROJ });
      expect(h.terminal.startsFor(claudeTab).at(-1)?.order.startCommand).toBeUndefined();
      expect(h.storedTab(claudeTab)?.claude).toBeUndefined();
    });

    it('ein pausierter Claude-Tab, geschlossen und wieder geöffnet, setzt sofort fort', async () => {
      const h = await setup();
      const normal = h.activeTab()!.id;
      const claudeTab = h.workspace.createTab();
      h.showAllViews();
      const id = await claudeWorking(h, claudeTab);
      h.workspace.activateTab(normal);
      await h.restart();
      h.showAllViews();
      h.workspace.closeTab(claudeTab);

      h.workspace.reopenClosedTab();
      h.workspace.viewReady(claudeTab, 100, 30);

      expect(tab(h, claudeTab)).toMatchObject({ paused: false });
      expect(h.terminal.startsFor(claudeTab).at(-1)?.order.startCommand).toContain(`--resume ${id}`);
    });

    it('der Hinweis eines geschlossenen Tabs kommt beim Wiederöffnen nicht zurück', async () => {
      const h = await setup();
      const claudeTab = h.activeTab()!.id;
      const other = h.workspace.createTab();
      h.showAllViews();
      h.workspace.windowForeground(true);
      const id = await claudeWorking(h, claudeTab);
      await hook(h, claudeTab, 'Stop', { session_id: id, cwd: PROJ });
      expect(h.snapshot().toasts.map((t) => t.tabId)).toEqual([claudeTab]);

      h.workspace.closeTab(claudeTab);
      h.workspace.reopenClosedTab();

      expect(h.snapshot().toasts).toEqual([]);
      expect(h.activeTab()?.id).toBe(claudeTab);
      expect(h.tabs().map((t) => t.id)).toEqual([claudeTab, other]);
    });
  });

  describe('Shell samt allen Nachfahren beenden', () => {
    it('nach einer Abfrage der Sonde: Shell, Nachfahren in jeder Tiefe und Prozesse mit eigener Konsole', async () => {
      const h = startWorkspace({ homeDir: HOME });
      const t = terminal(h, 19996);
      const other = terminal(h, 10420);
      const tree = [
        electron(t),
        t.proc(4552, ELECTRON_PID, 'conhost.exe', 6),
        t.proc(19996, ELECTRON_PID, 'pwsh.exe', 100),
        t.proc(8120, 19996, 'node.exe', 2000),
        // Start-Process -WindowStyle Hidden: eigene Konsole, überlebt pty.kill().
        t.proc(2508, 19996, 'PING.EXE', 3000),
        t.proc(8900, 2508, 'conhost.exe', 3010),
        t.proc(9100, 8120, 'esbuild.exe', 2500),
        // Wiederverwendete Prozess-ID: älter als die Shell, also kein Nachfahre.
        t.proc(4508, 19996, 'MoNotificationUx.exe', -30_000),
        other.proc(10420, ELECTRON_PID, 'pwsh.exe', 50),
        other.proc(7000, 10420, 'node.exe', 900),
      ];
      h.processes.set(tree);

      h.workspace.closeTab(t.tabId);
      expect(h.terminal.kills).toEqual([]);
      await settle();

      expect(h.terminal.kills).toEqual([t.tabId]);
      expect(h.processes.terminatedPids()).toEqual([19996, 8120, 2508, 9100, 8900]);
      expect(h.terminal.isRunning(other.tabId)).toBe(true);
    });

    it('antwortet die Sonde nicht, endet die Shell nach einer Sekunde trotzdem', async () => {
      const h = startWorkspace({ homeDir: HOME });
      const t = terminal(h, 19996);
      h.processes.set([electron(t), t.proc(19996, ELECTRON_PID, 'pwsh.exe', 100)]);
      h.processes.hold();

      h.workspace.closeTab(t.tabId);
      h.clock.advance(999);
      await settle();
      expect(h.terminal.kills).toEqual([]);
      h.clock.advance(1);
      await settle();

      expect(h.terminal.kills).toEqual([t.tabId]);
      h.processes.release();
      await settle();
      expect(h.processes.terminated).toEqual([]);
    });

    it('sofort wieder geöffnet: Die alte Shell endet gleich, die neue startet und bleibt, der alte Prozessbaum endet danach', async () => {
      const h = startWorkspace({ homeDir: HOME });
      const t = terminal(h, 19996);
      h.processes.set([electron(t), t.proc(19996, ELECTRON_PID, 'pwsh.exe', 100), t.proc(2508, 19996, 'PING.EXE', 3000)]);
      h.processes.hold();

      h.workspace.closeTab(t.tabId);
      h.workspace.reopenClosedTab();
      expect(h.terminal.kills).toEqual([t.tabId]);
      h.terminal.usePids(20000);
      h.workspace.viewReady(t.tabId, 100, 30);
      expect(h.terminal.isRunning(t.tabId)).toBe(true);
      h.processes.release();
      await settle();

      expect(h.terminal.kills).toEqual([t.tabId]);
      expect(h.terminal.isRunning(t.tabId)).toBe(true);
      expect(h.processes.terminatedPids()).toEqual([19996, 2508]);
    });

    it('beim Beenden der App: alle Shells samt Nachfahren, ohne Rückfrage', async () => {
      const h = startWorkspace({ homeDir: HOME });
      const t = terminal(h, 19996);
      const other = terminal(h, 10420);
      h.processes.set([
        electron(t),
        t.proc(19996, ELECTRON_PID, 'pwsh.exe', 100),
        t.proc(2508, 19996, 'PING.EXE', 3000),
        other.proc(10420, ELECTRON_PID, 'pwsh.exe', 50),
        other.proc(7000, 10420, 'node.exe', 900),
      ]);

      await h.workspace.shutdown();

      expect(h.terminal.killAllCalls).toBe(1);
      expect(h.processes.terminatedPids()).toEqual([19996, 2508, 10420, 7000]);
      expect(h.eventsOfType('askClose')).toEqual([]);
    });

    it('ein Tab ohne laufende Shell endet ohne Abfrage', async () => {
      const h = startWorkspace({ homeDir: HOME });
      const pending = h.workspace.createTab();

      h.workspace.closeTab(pending);

      expect(h.terminal.kills).toEqual([pending]);
      expect(h.processes.queries).toBe(0);
    });
  });
});

/** Ein Tab mit laufender Shell; `proc` baut Prozesse mit Startzeiten relativ zum Start der Shell. */
interface Terminal {
  tabId: string;
  proc(pid: number, ppid: number, name: string, startedMs: number): ProcessInfo;
}

/** Startet einen Tab mit PowerShell 7; node-pty meldet `pid`. */
function terminal(h: TestWorkspace, pid: number): Terminal {
  const tabId = h.workspace.createTab();
  h.terminal.usePids(pid);
  const start = h.clock.now();
  h.workspace.viewReady(tabId, 120, 30);
  return { tabId, proc: (p, ppid, name, startedMs) => ({ pid: p, ppid, name, startTime: start + startedMs }) };
}

/** Wie die Sonde den THub-Hauptprozess sieht: lange vor den Shells gestartet. */
function electron(t: Terminal): ProcessInfo {
  return t.proc(ELECTRON_PID, 1200, 'electron.exe', -600_000);
}
