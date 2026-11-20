import { describe, expect, it, vi } from 'vitest';
import type { ShellInfo } from '../../src/main/workspace/ports';
import { hookEvent, hookPayload, type HookSample } from '../support/apiClient';
import { startWorkspaceWithApi, TEST_SHELLS, type TestWorkspace, type TestWorkspaceOptions } from '../support/harness';

// Claude-Sessions nach einem Neustart fortsetzen (Ticket 12): simulierte Neustarts auf demselben gespeicherten Zustand,
// Meldungen des Starters und Hook-Ereignisse über die echte lokale Schnittstelle, in der Form, wie Claude Code 2.1.328
// sie im Spike geschickt hat (spikes/claude-hooks/samples).

const PROJ = 'C:\\proj';
const WEB = 'C:\\web';
const START = 'C:\\start';
const DEFAULT = 'D:\\standard';
const INTERVAL = 30_000;
const FAILED = 'Claude-Session konnte nicht fortgesetzt werden';

const GIT_BASH: ShellInfo = {
  id: 'gitbash',
  name: 'Git Bash',
  file: 'C:\\Program Files\\Git\\bin\\bash.exe',
  args: [],
  capturesClaude: true,
  integration: 'bash',
};

/** Startbefehl „Starter mit --resume <Kennung>“ in PowerShell; ohne THUB_STARTER `claude --resume <Kennung>` direkt. */
const psResume = (id: string): string =>
  `if ($env:THUB_STARTER) { & "$env:SystemRoot\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -NoProfile -NoLogo ` +
  `-ExecutionPolicy Bypass -File $env:THUB_STARTER --resume ${id} } else { claude --resume ${id} }`;

/** THub läuft, alle Ansichten sind bereit. */
async function setup(options: TestWorkspaceOptions = {}): Promise<TestWorkspace> {
  const h = await startWorkspaceWithApi({ directories: [PROJ, WEB, START, DEFAULT], ...options });
  h.showAllViews();
  return h;
}

/** Der Starter meldet den Fall „neu“; liefert die vergebene Kennung. */
async function launchNew(h: TestWorkspace, tabId: string, cwd: string): Promise<string> {
  const res = await h.api.launch({ tabId, case: 'new', cwd });
  expect(res.status).toBe(200);
  return JSON.parse(res.body).sessionId;
}

/** Claude Code schickt ein Hook-Ereignis. */
async function hook(h: TestWorkspace, tabId: string, sample: HookSample, overrides: Record<string, unknown>): Promise<void> {
  const res = await h.api.hook(tabId, hookEvent(sample), hookPayload(sample, overrides));
  expect(res).toMatchObject({ status: 200, body: '' });
}

/** `claude` im Tab, mit Hooks und einem Prompt: ein fortzusetzender Claude-Tab. Liefert die Kennung. */
async function claudeWithPrompt(h: TestWorkspace, tabId: string, cwd: string): Promise<string> {
  const id = await launchNew(h, tabId, cwd);
  await hook(h, tabId, 'SessionStart-startup', { session_id: id, cwd });
  await hook(h, tabId, 'UserPromptSubmit', { session_id: id, cwd });
  return id;
}

/** Der Starter des Startbefehls: meldet das Fortsetzen der Session `id` und die Prozess-ID von Claude. */
async function starterResumes(h: TestWorkspace, tabId: string, id: string, cwd = PROJ): Promise<void> {
  const res = await h.api.launch({ tabId, case: 'withId', sessionId: id, cwd });
  expect(res.status).toBe(200);
  await h.api.started(tabId, 4242);
}

function notices(h: TestWorkspace, tabId: string): string[] {
  return h.eventsOfType('notice').filter((n) => n.tabId === tabId).map((n) => n.text);
}

describe('Claude-Sessions fortsetzen', () => {
  describe('zuletzt aktiver Claude-Tab', () => {
    it('startet nach „Ansicht bereit“ im Ordner der Session mit „Starter mit --resume <Kennung>“, ohne Verlauf', async () => {
      const h = await setup();
      const tab = h.activeTab()!.id;
      const id = await claudeWithPrompt(h, tab, PROJ);
      h.terminal.output(tab, 'Claude antwortet\r\n');

      await h.restart();
      expect(h.terminal.starts).toEqual([]);
      expect(h.activeTab()).toMatchObject({ id: tab, paused: false, process: 'pending' });

      h.showAllViews(100, 30);

      expect(h.terminal.startsFor(tab)).toHaveLength(1);
      expect(h.terminal.startsFor(tab)[0].order).toMatchObject({
        cwd: PROJ,
        startCommand: psResume(id),
        integration: 'powershell',
        cols: 100,
        rows: 30,
      });
      expect(h.eventsOfType('restoreHistory')).toEqual([]);
      expect(h.activeTab()).toMatchObject({ process: 'running', paused: false });
    });

    it.each([
      ['powershell', psResume('SID')],
      [
        'cmd',
        'if defined THUB_STARTER ("%SystemRoot%\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -NoProfile -NoLogo ' +
          '-ExecutionPolicy Bypass -File "%THUB_STARTER%" --resume SID) else claude --resume SID',
      ],
      ['gitbash', 'if [ -n "$THUB_STARTER" ]; then __thub_starter --resume SID; else claude --resume SID; fi'],
    ])('Startbefehl in der Sprache der Shell: %s', async (shellId, expected) => {
      const h = await setup({ shells: [...TEST_SHELLS, GIT_BASH] });
      const tab = h.workspace.createTab({ shellId });
      h.showAllViews();
      const id = await claudeWithPrompt(h, tab, PROJ);

      await h.restart();
      h.showAllViews();

      expect(h.terminal.startsFor(tab)[0].order.startCommand).toBe(expected.replaceAll('SID', id));
    });

    it('fehlt der Ordner der Session, greift die Rückfallkette: Startordner, Standardordner, Benutzerordner', async () => {
      const h = await setup();
      const tab = h.workspace.createTab({ cwd: START });
      h.showAllViews();
      const id = await claudeWithPrompt(h, tab, PROJ);
      h.workspace.updateSettings({ defaultCwd: DEFAULT });

      h.system.removeDirectory(PROJ);
      await h.restart();
      h.showAllViews();
      expect(h.terminal.startsFor(tab)[0].order).toMatchObject({ cwd: START, startCommand: psResume(id) });

      h.system.removeDirectory(START);
      await h.restart();
      h.showAllViews();
      expect(h.terminal.startsFor(tab)[0].order).toMatchObject({ cwd: DEFAULT, startCommand: psResume(id) });

      h.system.removeDirectory(DEFAULT);
      await h.restart();
      h.showAllViews();
      expect(h.terminal.startsFor(tab)[0].order).toMatchObject({ cwd: 'C:\\Users\\tester', startCommand: psResume(id) });
    });

    it('der Startbefehl läuft nur beim ersten Start, nicht beim Neustart der beendeten Shell', async () => {
      const h = await setup();
      const tab = h.activeTab()!.id;
      await claudeWithPrompt(h, tab, PROJ);
      await h.restart();
      h.showAllViews();

      h.terminal.exit(tab, 0);
      h.workspace.restartTab(tab);

      expect(h.terminal.startsFor(tab).map((s) => s.order.startCommand)).toEqual([expect.any(String), undefined]);
    });
  });

  describe('andere fortzusetzende Claude-Tabs sind pausiert', () => {
    it('ohne Startauftrag, starten beim Anzeigen und bleiben über einen weiteren Neustart pausiert', async () => {
      const h = await setup();
      const a = h.activeTab()!.id;
      const b = h.workspace.createTab({ cwd: WEB });
      h.showAllViews();
      await claudeWithPrompt(h, a, PROJ);
      const idB = await claudeWithPrompt(h, b, WEB);
      h.workspace.activateTab(a);
      const linkB = h.storedTab(b)?.claude;

      await h.restart();
      h.showAllViews();
      expect(h.tabs().map((t) => ({ id: t.id, paused: t.paused }))).toEqual([
        { id: a, paused: false },
        { id: b, paused: true },
      ]);
      expect(h.terminal.starts.map((s) => s.tabId)).toEqual([a]);

      // Nicht angezeigt: übersteht den nächsten Neustart unverändert.
      await h.restart();
      h.showAllViews();
      expect(h.tabs().find((t) => t.id === b)).toMatchObject({ paused: true, process: 'pending' });
      expect(h.terminal.startsFor(b)).toEqual([]);
      expect(h.storedTab(b)?.claude).toEqual(linkB);

      h.workspace.activateTab(b);

      expect(h.terminal.startsFor(b)).toHaveLength(1);
      expect(h.terminal.startsFor(b)[0].order).toMatchObject({ cwd: WEB, startCommand: psResume(idB) });
      expect(h.tabs().find((t) => t.id === b)).toMatchObject({ paused: false, process: 'running' });
      expect(h.eventsOfType('restoreHistory')).toEqual([]);
    });

    it('ein normaler Tab als letzter aktiver: kein sofortiger Claude-Start, alle Claude-Tabs pausiert', async () => {
      const h = await setup();
      const normal = h.activeTab()!.id;
      const c1 = h.workspace.createTab({ cwd: PROJ });
      const c2 = h.workspace.createTab({ cwd: WEB });
      h.showAllViews();
      await claudeWithPrompt(h, c1, PROJ);
      await claudeWithPrompt(h, c2, WEB);
      h.workspace.activateTab(normal);

      await h.restart();
      h.showAllViews();

      expect(h.terminal.starts.map((s) => s.tabId)).toEqual([normal]);
      expect(h.terminal.starts[0].order.startCommand).toBeUndefined();
      expect(h.tabs().map((t) => t.paused)).toEqual([false, true, true]);
    });

    it('startet auch, wenn er auf anderem Weg angezeigt wird: Schliessen des aktiven Tabs, Ctrl+Tab, Ctrl+<Zahl>', async () => {
      const h = await setup();
      const normal = h.activeTab()!.id;
      const c1 = h.workspace.createTab({ cwd: PROJ });
      const c2 = h.workspace.createTab({ cwd: WEB });
      const c3 = h.workspace.createTab({ cwd: START });
      h.showAllViews();
      for (const [tab, cwd] of [
        [c1, PROJ],
        [c2, WEB],
        [c3, START],
      ]) {
        await claudeWithPrompt(h, tab, cwd);
      }
      h.workspace.activateTab(normal);
      await h.restart();
      h.showAllViews();

      h.workspace.closeTab(normal);
      expect(h.terminal.starts.map((s) => s.tabId)).toEqual([normal, c1]);

      h.workspace.activateRelativeTab(1);
      expect(h.terminal.starts.map((s) => s.tabId)).toEqual([normal, c1, c2]);

      h.workspace.activateTabAt(2);
      expect(h.terminal.starts.map((s) => s.tabId)).toEqual([normal, c1, c2, c3]);
      expect(h.terminal.starts.slice(1).every((s) => s.order.startCommand?.includes('--resume'))).toBe(true);
    });

    it('legt der Renderer die Ansicht erst beim Anzeigen an, startet der Tab mit „Ansicht bereit“', async () => {
      const h = await setup();
      const a = h.activeTab()!.id;
      const b = h.workspace.createTab({ cwd: WEB });
      h.showAllViews();
      await claudeWithPrompt(h, a, PROJ);
      const idB = await claudeWithPrompt(h, b, WEB);
      h.workspace.activateTab(a);
      await h.restart();
      h.workspace.viewReady(a, 120, 30);

      h.workspace.activateTab(b);
      expect(h.terminal.startsFor(b)).toEqual([]);
      expect(h.tabs().find((t) => t.id === b)?.paused).toBe(false);

      h.workspace.viewReady(b, 90, 25);
      expect(h.terminal.startsFor(b)[0].order).toMatchObject({ cols: 90, rows: 25, startCommand: psResume(idB) });
    });
  });

  describe('welche Claude-Tabs fortgesetzt werden', () => {
    it('eine bestätigte Session ohne Prompt kommt als normales Terminal im Ordner der Session zurück, ohne Verlauf', async () => {
      const h = await setup();
      const tab = h.activeTab()!.id;
      h.terminal.output(tab, 'vor Claude\r\n');
      h.clock.advance(INTERVAL);
      expect(h.storedHistory(tab)?.content).toBe('vor Claude\r\n');
      const id = await launchNew(h, tab, PROJ);
      await hook(h, tab, 'SessionStart-startup', { session_id: id, cwd: PROJ });

      await h.restart();
      h.showAllViews();

      expect(h.storedTab(tab)).not.toHaveProperty('claude');
      expect(h.tabs()[0]).toMatchObject({ cwd: PROJ, paused: false });
      expect(h.terminal.startsFor(tab)[0].order.cwd).toBe(PROJ);
      expect(h.terminal.startsFor(tab)[0].order.startCommand).toBeUndefined();
      expect(h.eventsOfType('restoreHistory')).toEqual([]);
    });

    it('ein Tab ohne Kennung (claude -c, ohne SessionStart) wird nicht fortgesetzt, auch wenn er nicht aktiv war', async () => {
      const h = await setup();
      const active = h.activeTab()!.id;
      const tab = h.workspace.createTab();
      h.showAllViews();
      await h.api.launch({ tabId: tab, case: 'withoutId', cwd: WEB });
      h.workspace.activateTab(active);

      await h.restart();
      h.showAllViews();

      expect(h.storedTab(tab)).not.toHaveProperty('claude');
      expect(h.tabs().find((t) => t.id === tab)?.paused).toBe(false);
      expect(h.terminal.startsFor(tab)[0].order).toMatchObject({ cwd: WEB });
      expect(h.terminal.startsFor(tab)[0].order.startCommand).toBeUndefined();
    });

    it('eine unbestätigte Session (keine Hooks) wird fortgesetzt: Sicherheitsnetz', async () => {
      const h = await setup();
      const tab = h.activeTab()!.id;
      const id = await launchNew(h, tab, PROJ);

      await h.restart();
      h.showAllViews();

      expect(h.terminal.startsFor(tab)[0].order).toMatchObject({ cwd: PROJ, startCommand: psResume(id) });
    });

    it('nach dem Fortsetzen ohne Prompt bleibt die Session fortzusetzen: „hatte Prompt“ gehört zur Session', async () => {
      const h = await setup();
      const tab = h.activeTab()!.id;
      const id = await claudeWithPrompt(h, tab, PROJ);
      await h.restart();
      h.showAllViews();
      await starterResumes(h, tab, id);
      await hook(h, tab, 'SessionStart-resume', { session_id: id, cwd: PROJ });

      await h.restart();
      h.showAllViews();

      expect(h.storedTab(tab)?.claude).toEqual({ sessionId: id, cwd: PROJ, confirmed: true, hadPrompt: true });
      expect(h.terminal.startsFor(tab)[0].order.startCommand).toBe(psResume(id));
    });

    it('kann die Shell keinen Startbefehl ausführen (nur WSL vorhanden), kommt der Tab normal im Ordner der Session zurück', async () => {
      const h = await setup();
      const tab = h.activeTab()!.id;
      await claudeWithPrompt(h, tab, PROJ);
      const wsl: ShellInfo = {
        id: 'wsl:Ubuntu',
        name: 'Ubuntu (WSL)',
        file: 'wsl.exe',
        args: ['-d', 'Ubuntu'],
        capturesClaude: false,
      };

      await h.restart({ shells: [wsl] });
      h.showAllViews();

      expect(h.terminal.startsFor(tab)[0].order).toMatchObject({ file: 'wsl.exe', cwd: PROJ });
      expect(h.terminal.startsFor(tab)[0].order.startCommand).toBeUndefined();
      expect(h.storedTab(tab)).not.toHaveProperty('claude');
    });

    it('eine Kennung, die keine Session-Kennung sein kann, kommt nie in einen Startbefehl', async () => {
      const h = await setup();
      const tab = h.activeTab()!.id;
      // Etwa `claude --resume "x & calc"` (Suchbegriff statt Kennung), beendet, bevor Claude etwas gemeldet hat.
      await h.api.launch({ tabId: tab, case: 'withId', sessionId: 'x & calc', cwd: PROJ });

      await h.restart();
      h.showAllViews();

      expect(h.storedTab(tab)).not.toHaveProperty('claude');
      expect(h.terminal.startsFor(tab)[0].order.startCommand).toBeUndefined();
    });
  });

  describe('Fortsetzen schlägt fehl', () => {
    /** Nach einem Neustart läuft der Startbefehl im zuletzt aktiven Tab; der Starter hat das Fortsetzen gemeldet. */
    async function resumed(): Promise<{ h: TestWorkspace; tab: string; id: string }> {
      const h = await setup();
      const tab = h.activeTab()!.id;
      const id = await claudeWithPrompt(h, tab, PROJ);
      await h.restart();
      h.showAllViews();
      await starterResumes(h, tab, id);
      return { h, tab, id };
    }

    it('erst SessionEnd (other), dann Ende-Meldung mit Exit-Code 1: Hinweis, der Tab wird normal und bleibt offen', async () => {
      const { h, tab, id } = await resumed();

      await hook(h, tab, 'SessionEnd-other', { session_id: id, cwd: PROJ });
      expect(h.storedTab(tab)?.claude).toMatchObject({ sessionId: id });
      expect(notices(h, tab)).toEqual([]);

      expect(await h.api.exit(tab, id, 1)).toMatchObject({ status: 200, body: '' });

      expect(h.storedTab(tab)).not.toHaveProperty('claude');
      expect(h.eventsOfType('notice')).toEqual([{ type: 'notice', tabId: tab, level: 'error', text: FAILED }]);
      expect(h.terminal.isRunning(tab)).toBe(true);
      expect(h.tabs().map((t) => t.id)).toEqual([tab]);
      // Ein normales Terminal: Sein Inhalt wird ab jetzt wieder gesichert.
      h.terminal.output(tab, 'No conversation found\r\nPS C:\\proj> ');
      h.clock.advance(INTERVAL);
      expect(h.storedHistory(tab)?.content).toBe('No conversation found\r\nPS C:\\proj> ');
    });

    it('auch ohne SessionEnd, etwa nach abgelehntem Vertrauensdialog (keine Hooks)', async () => {
      const { h, tab, id } = await resumed();

      await h.api.exit(tab, id, 1);

      expect(h.storedTab(tab)).not.toHaveProperty('claude');
      expect(notices(h, tab)).toEqual([FAILED]);
    });

    it('Ende mit Exit-Code 0 ohne Hooks gibt keinen Hinweis', async () => {
      const { h, tab, id } = await resumed();

      await h.api.exit(tab, id, 0);

      expect(h.storedTab(tab)).not.toHaveProperty('claude');
      expect(notices(h, tab)).toEqual([]);
    });

    it('nach SessionStart ist das Fortsetzen gelungen: SessionEnd macht den Tab sofort normal, ein Fehler-Ende gibt keinen Hinweis', async () => {
      const { h, tab, id } = await resumed();
      await hook(h, tab, 'SessionStart-resume', { session_id: id, cwd: PROJ });

      await hook(h, tab, 'SessionEnd-other', { session_id: id, cwd: PROJ });
      expect(h.storedTab(tab)).not.toHaveProperty('claude');

      await h.api.exit(tab, id, 1);
      expect(notices(h, tab)).toEqual([]);
    });

    it('ohne SessionStart, aber mit einem anderen Ereignis (etwa ohne curl.exe) ist das Fortsetzen ebenfalls gelungen', async () => {
      const { h, tab, id } = await resumed();
      await hook(h, tab, 'UserPromptSubmit', { session_id: id, cwd: PROJ });

      await h.api.exit(tab, id, 1);

      expect(h.storedTab(tab)).not.toHaveProperty('claude');
      expect(notices(h, tab)).toEqual([]);
    });

    it('ein späterer, eigener Start von Claude in derselben Shell gilt nicht als Fortsetzen', async () => {
      const h = await setup();
      const tab = h.activeTab()!.id;
      await claudeWithPrompt(h, tab, PROJ);
      await h.restart();
      h.showAllViews();
      // Der Starter des Startbefehls erreichte THub nicht; danach tippt der Nutzer selbst `claude`.

      const id = await launchNew(h, tab, PROJ);
      await h.api.exit(tab, id, 1);

      expect(notices(h, tab)).toEqual([]);
    });

    it('ein Fehler-Ende in einem Tab, den THub nicht fortgesetzt hat, gibt keinen Hinweis', async () => {
      const h = await setup();
      const tab = h.activeTab()!.id;
      const id = await launchNew(h, tab, PROJ);

      await h.api.exit(tab, id, 1);

      expect(h.storedTab(tab)).not.toHaveProperty('claude');
      expect(notices(h, tab)).toEqual([]);
    });

    it('das Ende der Shell während des Fortsetzens macht den Tab normal, ohne Hinweis', async () => {
      const { h, tab } = await resumed();

      h.terminal.exit(tab, 1);

      expect(h.storedTab(tab)).not.toHaveProperty('claude');
      expect(notices(h, tab)).toEqual([]);
    });
  });

  describe('kein Verlauf für Claude-Tabs', () => {
    it('wird weder periodisch noch beim Beenden gesichert; der frühere Verlauf des Tabs fällt weg', async () => {
      const h = await setup();
      const tab = h.activeTab()!.id;
      h.terminal.output(tab, 'vor Claude\r\n');
      h.clock.advance(INTERVAL);
      expect(h.storedHistory(tab)).not.toBeNull();

      await claudeWithPrompt(h, tab, PROJ);
      expect(h.storedHistory(tab)).toBeNull();
      h.terminal.output(tab, 'Claude antwortet\r\n');
      h.clock.advance(INTERVAL);
      await h.workspace.shutdown();

      expect(h.eventsOfType('requestHistory')).toEqual([{ type: 'requestHistory', tabIds: [tab] }]);
      expect(h.storedHistory(tab)).toBeNull();
    });

    it('auch nicht aus einer Antwort des Renderers, die erst nach dem Start von Claude eintrifft', async () => {
      const h = await setup();
      const tab = h.activeTab()!.id;
      h.renderer.answersHistory = false;
      h.terminal.output(tab, 'vor Claude\r\n');
      h.clock.advance(INTERVAL);

      await launchNew(h, tab, PROJ);
      h.workspace.saveHistory(tab, 'vor Claude\r\nClaude startet\r\n');

      expect(h.storedHistory(tab)).toBeNull();
    });

    it('wird der Tab wieder normal (/exit), wird sein Inhalt wieder gesichert und nach dem Neustart wiederhergestellt', async () => {
      const h = await setup();
      const tab = h.activeTab()!.id;
      const id = await claudeWithPrompt(h, tab, PROJ);
      h.terminal.output(tab, 'Claude antwortet\r\n');

      await hook(h, tab, 'SessionEnd-prompt_input_exit', { session_id: id, cwd: PROJ });
      await h.api.exit(tab, id, 0);
      h.terminal.output(tab, 'PS C:\\proj> ');
      await h.restart();
      h.showAllViews();

      expect(h.terminal.startsFor(tab)[0].order.startCommand).toBeUndefined();
      expect(h.eventsOfType('restoreHistory')).toMatchObject([
        { tabId: tab, content: 'Claude antwortet\r\nPS C:\\proj> ' },
      ]);
    });
  });

  describe('Einfrieren', () => {
    it('App beenden, danach SessionEnd (other) und Ende der Shell: nach dem Neustart wird trotzdem fortgesetzt', async () => {
      const h = await setup();
      const tab = h.activeTab()!.id;
      const id = await claudeWithPrompt(h, tab, PROJ);

      const shutdown = h.workspace.shutdown();
      await vi.waitFor(() => expect(h.terminal.isRunning(tab)).toBe(false));
      await hook(h, tab, 'SessionEnd-other', { session_id: id, cwd: PROJ });
      await h.api.exit(tab, id, 0);
      await shutdown;
      await h.restart();
      h.showAllViews();

      expect(h.terminal.startsFor(tab)[0].order).toMatchObject({ cwd: PROJ, startCommand: psResume(id) });
    });

    it('Windows-Abmeldung während des Fortsetzens: nach dem Neustart wird wieder fortgesetzt', async () => {
      const h = await setup();
      const tab = h.activeTab()!.id;
      const id = await claudeWithPrompt(h, tab, PROJ);
      await h.restart();
      h.showAllViews();
      await starterResumes(h, tab, id);

      h.workspace.sessionEnding();
      await hook(h, tab, 'SessionEnd-other', { session_id: id, cwd: PROJ });
      await h.api.exit(tab, id, 1);
      h.terminal.exit(tab, 1);
      expect(notices(h, tab)).toEqual([]);
      await h.restart();
      h.showAllViews();

      expect(h.terminal.startsFor(tab)[0].order.startCommand).toBe(psResume(id));
    });
  });
});
