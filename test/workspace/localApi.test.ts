import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { findCurl } from '../../src/main/hookFile';
import { ApiClient, hookEvent, hookPayload, type ApiResponse, type HookSample } from '../support/apiClient';
import { expectHookReply, SESSION_START_CONTEXT } from '../support/claudeTab';
import { startWorkspace, startWorkspaceWithApi } from '../support/harness';

// Die lokale Schnittstelle läuft echt auf 127.0.0.1; die Tests schicken echte HTTP-Anfragen.

const SID = 'ec84ffa6-a2f2-4150-983c-65e55fc1ff58';
const SID_AFTER_CLEAR = '0f54d6f0-5e3c-45e6-aabf-d76021219bad';

/** Je ein aufgezeichnetes Beispiel für jedes Ereignis der Hook-Datei, das im Spike vorkam, ausser SessionStart. */
const HOOK_SAMPLES: HookSample[] = [
  'SessionEnd-prompt_input_exit',
  'UserPromptSubmit',
  'PreToolUse-Bash',
  'PermissionRequest-Bash',
  'PostToolUse-Bash',
  'Stop',
  'Notification-permission_prompt',
];

/** „Sofort“: weit unter dem Timeout von 2 Sekunden, den Claude den HTTP-Hooks gibt. */
const IMMEDIATE_MS = 500;

function expectEmptySuccess(res: ApiResponse): void {
  expect(res.status).toBe(200);
  expect(res.body).toBe('');
  expect(res.headers['content-length']).toBe('0');
}

describe('Lokale Schnittstelle', () => {
  it('läuft nur auf 127.0.0.1, auf einem zufälligen Port', async () => {
    const h = await startWorkspaceWithApi();

    expect(h.localApi.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(h.localApi.url).not.toBe('http://127.0.0.1:0');
  });

  describe('Token', () => {
    it.each([
      ['ohne Token', null],
      ['mit falschem Token', 'falsch'],
    ])('weist Anfragen %s mit 403 ab und ändert nichts', async (_label, token) => {
      const h = await startWorkspaceWithApi();
      const tabId = h.activeTab()!.id;
      const client = h.api.withToken(token);
      const before = h.storedState();

      const responses = [
        await client.launch({ tabId, case: 'new', cwd: 'C:\\proj' }),
        await client.started(tabId, 4242),
        await client.exit(tabId, SID, 0),
        await client.hook(tabId, 'SessionStart', hookPayload('SessionStart-startup', { session_id: SID })),
        await client.hook(tabId, 'UserPromptSubmit', hookPayload('UserPromptSubmit', { session_id: SID })),
        await client.post('/gibt/es/nicht', {}),
      ];

      expect(responses.map((r) => r.status)).toEqual([403, 403, 403, 403, 403, 403]);
      expect(responses.every((r) => r.body === '')).toBe(true);
      expect(h.storedState()).toEqual(before);
    });

    it('ist pro App-Start neu: das Token eines früheren Starts gilt nicht mehr', async () => {
      const h = await startWorkspaceWithApi();
      const oldToken = h.localApi.token;

      await h.restart();
      const tabId = h.activeTab()!.id;

      expect(h.localApi.token).not.toBe(oldToken);
      expect(h.localApi.token).toMatch(/^[0-9a-f]{64}$/);
      expect((await h.api.withToken(oldToken).launch({ tabId, case: 'new' })).status).toBe(403);
      expect((await h.api.launch({ tabId, case: 'new' })).status).toBe(200);
    });
  });

  describe('Hook-Antworten', () => {
    it.each(HOOK_SAMPLES)('%s: sofort ein leerer Erfolg ohne Entscheidungsfelder', async (sample) => {
      const h = await startWorkspaceWithApi();
      const tabId = h.activeTab()!.id;

      const res = await h.api.hook(tabId, hookEvent(sample), hookPayload(sample));

      expectEmptySuccess(res);
      expect(res.headers['content-type']).toBeUndefined();
      expect(res.ms).toBeLessThan(IMMEDIATE_MS);
    });

    it('SessionStart: sofort die Anweisung für offene Punkte als zusätzlicher Kontext, als JSON nur aus ASCII-Zeichen', async () => {
      const h = await startWorkspaceWithApi();
      const tabId = h.activeTab()!.id;

      const res = await h.api.hook(tabId, 'SessionStart', hookPayload('SessionStart-startup'));

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('application/json; charset=utf-8');
      expect(JSON.parse(res.body)).toEqual(SESSION_START_CONTEXT);
      // Umlaute und Anführungszeichen der Anweisung als \uXXXX: Die Ausgabe von curl.exe kommt so unabhängig von jeder
      // Zeichenkodierung bei Claude an.
      expect(res.body).toMatch(/^[\x20-\x7e]+$/);
      expect(res.body).toContain('\\u00e4');
      expect(res.headers['content-length']).toBe(String(res.body.length));
      expect(res.ms).toBeLessThan(IMMEDIATE_MS);
    });

    it.each(['SessionStart-resume', 'SessionStart-clear'] as const)(
      '%s: dieselbe Anweisung, damit sie in jeder Session gilt',
      async (sample) => {
        const h = await startWorkspaceWithApi();
        const tabId = h.activeTab()!.id;

        const res = await h.api.hook(tabId, 'SessionStart', hookPayload(sample));

        expectHookReply(res, 'SessionStart');
      },
    );

    it('SessionStart bei ausgeschalteter Einstellung „Offene Punkte“: leer; wieder eingeschaltet kommt die Anweisung wieder', async () => {
      const h = await startWorkspaceWithApi();
      const tabId = h.activeTab()!.id;
      h.workspace.updateSettings({ openPoints: false });

      const off = await h.api.hook(tabId, 'SessionStart', hookPayload('SessionStart-startup'));
      h.workspace.updateSettings({ openPoints: true });
      const on = await h.api.hook(tabId, 'SessionStart', hookPayload('SessionStart-clear'));

      expectEmptySuccess(off);
      expect(off.headers['content-type']).toBeUndefined();
      expectHookReply(on, 'SessionStart');
    });

    it('auch bei unbekanntem Tab, ohne Tab-Kopfzeile und mit kaputtem Inhalt; der Zustand bleibt, wie er ist', async () => {
      const h = await startWorkspaceWithApi();
      const tabId = h.activeTab()!.id;
      const before = h.storedState();

      const responses = [
        await h.api.hook('gibt-es-nicht', 'SessionStart', hookPayload('SessionStart-startup', { session_id: SID })),
        await h.api.hook('', 'SessionStart', hookPayload('SessionStart-startup', { session_id: SID })),
        await h.api.post('/hooks/SessionStart', hookPayload('SessionStart-startup', { session_id: SID })),
        await h.api.hook('', 'UserPromptSubmit', hookPayload('UserPromptSubmit', { session_id: SID })),
        await h.api.post('/hooks/UserPromptSubmit', hookPayload('UserPromptSubmit', { session_id: SID })),
        await h.api.hook(tabId, 'UserPromptSubmit', '{ kaputt'),
        await h.api.hook(tabId, 'Stop', ''),
        // Ein Ereignis, das die Hook-Datei gar nicht registriert.
        await h.api.hook('gibt-es-nicht', 'PermissionDenied', hookPayload('Stop', { session_id: SID })),
      ];

      for (const res of responses) expectEmptySuccess(res);
      expect(h.storedState()).toEqual(before);
    });

    it('kommen sofort, auch während ein früheres Ereignis noch unterwegs ist; verarbeitet wird in der Reihenfolge des Eintreffens', async () => {
      const h = await startWorkspaceWithApi();
      const tabId = h.activeTab()!.id;
      const launch = await h.api.launch({ tabId, case: 'withId', sessionId: SID, cwd: 'C:\\proj' });
      expect(launch.status).toBe(200);

      // UserPromptSubmit trifft zuerst ein, sein Inhalt wird aber erst nach dem folgenden SessionStart fertig.
      const first = h.api.slowHook(tabId, 'UserPromptSubmit', hookPayload('UserPromptSubmit', { session_id: SID }));
      await first.arrived;
      const second = await h.api.hook(tabId, 'SessionStart', hookPayload('SessionStart-clear', { session_id: SID_AFTER_CLEAR, cwd: 'C:\\proj' }));
      expectHookReply(second, 'SessionStart');
      expectEmptySuccess(await first.finish());

      // In dieser Reihenfolge gehört der Prompt zur alten Session; die neue hatte noch keinen.
      expect(h.storedTab(tabId)?.claude).toEqual({
        sessionId: SID_AFTER_CLEAR,
        cwd: 'C:\\proj',
        confirmed: true,
        hadPrompt: false,
      });
    });
  });

  describe('Meldungen des Starters', () => {
    it('launch zu einem unbekannten Tab: 404, damit der Starter claude unverändert startet', async () => {
      const h = await startWorkspaceWithApi();
      const before = h.storedState();

      const res = await h.api.launch({ tabId: 'gibt-es-nicht', case: 'new', cwd: 'C:\\proj' });

      expect(res).toMatchObject({ status: 404, body: '' });
      expect(h.storedState()).toEqual(before);
    });

    it('started und exit zu einem unbekannten Tab werden ignoriert', async () => {
      const h = await startWorkspaceWithApi();
      const before = h.storedState();

      expectEmptySuccess(await h.api.started('gibt-es-nicht', 4242));
      expectEmptySuccess(await h.api.exit('gibt-es-nicht', SID, 0));

      expect(h.storedState()).toEqual(before);
    });

    it.each([
      ['kein JSON', '/claude/launch', '{ kaputt'],
      ['ohne Tab', '/claude/launch', { case: 'new', cwd: 'C:\\proj' }],
      ['unbekannter Fall', '/claude/launch', { tabId: 'TAB', case: 'resume', cwd: 'C:\\proj' }],
      ['„mit Kennung“ ohne Kennung', '/claude/launch', { tabId: 'TAB', case: 'withId', cwd: 'C:\\proj' }],
      ['started ohne Prozess-ID', '/claude/started', { tabId: 'TAB' }],
      ['started mit Text als Prozess-ID', '/claude/started', { tabId: 'TAB', pid: '4242' }],
      ['exit ohne Exit-Code', '/claude/exit', { tabId: 'TAB', sessionId: SID }],
    ])('weist ungültige Meldungen mit 400 ab (%s)', async (_label, path, body) => {
      const h = await startWorkspaceWithApi();
      const tabId = h.activeTab()!.id;
      const before = h.storedState();
      const withTab = typeof body === 'string' ? body : JSON.parse(JSON.stringify(body).replace('"TAB"', JSON.stringify(tabId)));

      const res = await h.api.post(path, withTab);

      expect(res).toMatchObject({ status: 400, body: '' });
      expect(h.storedState()).toEqual(before);
    });

    it('liest den Inhalt als UTF-8, auch mit BOM', async () => {
      const h = await startWorkspaceWithApi({ directories: ['C:\\Projekte\\Grüezi'] });
      const tabId = h.activeTab()!.id;

      const res = await h.api.post('/claude/launch', `\uFEFF${JSON.stringify({ tabId, case: 'new', cwd: 'C:\\Projekte\\Grüezi' })}`);

      expect(res.status).toBe(200);
      expect(h.storedTab(tabId)?.claude?.cwd).toBe('C:\\Projekte\\Grüezi');
    });
  });

  it('kennt nur POST auf den dokumentierten Endpunkten', async () => {
    const h = await startWorkspaceWithApi();
    const tabId = h.activeTab()!.id;

    expect((await h.api.get('/claude/launch')).status).toBe(405);
    expect((await h.api.post('/claude/unbekannt', { tabId })).status).toBe(404);
    expect((await h.api.post('/hooks/', {})).status).toBe(404);
    expect((await h.api.post('/hooks/Session-Start', {})).status).toBe(404);
  });

  describe('Umgebung der Terminals', () => {
    it('jedes Terminal bekommt Tab-Kennung, Adresse und Token der Schnittstelle', async () => {
      const h = await startWorkspaceWithApi();
      h.workspace.createTab();

      h.showAllViews();

      expect(h.terminal.starts.map((s) => s.order.env)).toEqual(
        h.tabs().map((t) => ({ THUB_TAB_ID: t.id, THUB_API: h.localApi.url, THUB_TOKEN: h.localApi.token })),
      );
    });

    it('nach einem Neustart mit Adresse und Token dieses Starts', async () => {
      const h = await startWorkspaceWithApi();
      const before = h.localApi;

      await h.restart();
      h.showAllViews();

      expect(h.localApi.token).not.toBe(before.token);
      expect(h.terminal.starts[0].order.env).toMatchObject({
        THUB_API: h.localApi.url,
        THUB_TOKEN: h.localApi.token,
      });
    });

    it('ohne lokale Schnittstelle nur die Tab-Kennung', () => {
      const h = startWorkspace();

      h.showAllViews();

      expect(h.terminal.starts[0].order.env).toEqual({ THUB_TAB_ID: h.activeTab()!.id });
    });

    it('mit dieser Umgebung erreicht ein Programm im Terminal seinen Tab', async () => {
      const h = await startWorkspaceWithApi();
      const second = h.workspace.createTab();
      h.showAllViews();
      const { env } = h.terminal.startsFor(second)[0].order;

      const client = new ApiClient(env.THUB_API, env.THUB_TOKEN);
      const res = await client.launch({ tabId: env.THUB_TAB_ID, case: 'new', cwd: 'C:\\proj' });

      expect(res.status).toBe(200);
      expect(h.storedTab(second)?.claude).toMatchObject({ sessionId: JSON.parse(res.body).sessionId });
    });
  });

  describe.skipIf(findCurl() === null)('der SessionStart-Hook der Hook-Datei (curl.exe)', () => {
    /** Wie Claude Code: Exec-Form ohne Shell, Nutzdaten auf stdin, nur die nötige Umgebung. */
    async function runSessionStartHook(h: Awaited<ReturnType<typeof startWorkspaceWithApi>>, tabId: string) {
      const settings = JSON.parse(fs.readFileSync(h.localApi.hookFile, 'utf8'));
      const { command, args } = settings.hooks.SessionStart[0].hooks[0];
      const payload = hookPayload('SessionStart-startup', { session_id: SID, cwd: 'C:\\proj' });
      return run(command, args, JSON.stringify(payload), {
        SystemRoot: process.env.SystemRoot ?? 'C:\\Windows',
        THUB_TAB_ID: tabId,
        THUB_TOKEN: h.localApi.token,
      });
    }

    it('leitet weiter und gibt die Antwort Byte für Byte aus: Claude liest daraus den zusätzlichen Kontext', async () => {
      const h = await startWorkspaceWithApi();
      const tabId = h.activeTab()!.id;
      const direct = await h.api.hook(h.workspace.createTab(), 'SessionStart', hookPayload('SessionStart-startup'));

      const result = await runSessionStartHook(h, tabId);

      expect(result).toEqual({ code: 0, stdout: direct.body, stderr: '' });
      expect(JSON.parse(result.stdout)).toEqual(SESSION_START_CONTEXT);
      expect(h.storedTab(tabId)?.claude).toEqual({ sessionId: SID, cwd: 'C:\\proj', confirmed: true, hadPrompt: false });
    });

    it('gibt bei ausgeschalteter Einstellung „Offene Punkte“ nichts aus', async () => {
      const h = await startWorkspaceWithApi();
      const tabId = h.activeTab()!.id;
      h.workspace.updateSettings({ openPoints: false });

      const result = await runSessionStartHook(h, tabId);

      expect(result).toEqual({ code: 0, stdout: '', stderr: '' });
      expect(h.storedTab(tabId)?.claude).toMatchObject({ sessionId: SID, confirmed: true });
    });
  });
});

function run(
  command: string,
  args: string[],
  stdin: string,
  env: Record<string, string>,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c: Buffer) => (stdout += c.toString('utf8')));
    child.stderr.on('data', (c: Buffer) => (stderr += c.toString('utf8')));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(stdin);
  });
}
