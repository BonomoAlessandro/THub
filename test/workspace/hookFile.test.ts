import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { HOOK_FILE_NAME, HTTP_HOOK_EVENTS, findCurl, hookSettings, writeHookFile } from '../../src/main/hookFile';
import { startWorkspaceWithApi } from '../support/harness';
import { makeTempDir } from '../support/tempDir';

// Die im Spike mit dem echten Claude Code 2.1.328 geprüfte Vorlage, seit Ticket 37 mit SubagentStart und SubagentStop
// (geprüft mit 2.1.332); <PORT> steht für den Port der Schnittstelle.
const TEMPLATE = new URL('../../spikes/claude-hooks/empfohlene-hook-datei.json', import.meta.url);
const CURL = 'C:\\Windows\\System32\\curl.exe';

function template(port: number): { hooks: Record<string, unknown> } {
  return JSON.parse(fs.readFileSync(TEMPLATE, 'utf8').split('<PORT>').join(String(port)));
}

describe('Hook-Datei', () => {
  it('entspricht der im Spike geprüften Vorlage', () => {
    expect(hookSettings('http://127.0.0.1:51234', CURL)).toEqual(template(51234));
  });

  it('registriert die Ereignisse der Spezifikation: SessionStart über curl.exe, alle anderen per HTTP', () => {
    const { hooks } = hookSettings('http://127.0.0.1:51234', CURL);

    expect(Object.keys(hooks)).toEqual([
      'SessionStart',
      'SessionEnd',
      'UserPromptSubmit',
      'PreToolUse',
      'PostToolUse',
      'PostToolUseFailure',
      'PermissionRequest',
      'Stop',
      'StopFailure',
      'Notification',
      'SubagentStart',
      'SubagentStop',
    ]);
    for (const event of HTTP_HOOK_EVENTS) {
      expect(hooks[event]).toEqual([
        {
          hooks: [
            {
              type: 'http',
              url: `http://127.0.0.1:51234/hooks/${event}`,
              timeout: 2,
              headers: { 'X-THub-Tab': '$THUB_TAB_ID', 'X-THub-Token': '$THUB_TOKEN' },
              allowedEnvVars: ['THUB_TAB_ID', 'THUB_TOKEN'],
            },
          ],
        },
      ]);
    }
    expect(hooks.SessionStart).toEqual([
      {
        hooks: [
          expect.objectContaining({
            type: 'command',
            command: CURL,
            args: expect.arrayContaining(['--connect-timeout', '1', '-m', '2', 'http://127.0.0.1:51234/hooks/SessionStart']),
            timeout: 3,
          }),
        ],
      },
    ]);
  });

  it('meldet Start und Ende der Agenten per HTTP, wie im Spike mit Claude Code 2.1.332 gemessen (Ticket 37)', () => {
    const { hooks } = hookSettings('http://127.0.0.1:51234', CURL);

    for (const event of ['SubagentStart', 'SubagentStop']) {
      expect(HTTP_HOOK_EVENTS).toContain(event);
      expect(hooks[event]).toEqual([
        { hooks: [expect.objectContaining({ type: 'http', url: `http://127.0.0.1:51234/hooks/${event}` })] },
      ]);
    }
  });

  it('lässt SessionStart weg, wenn curl.exe fehlt; die HTTP-Hooks bleiben', () => {
    const { SessionStart: _curl, ...httpHooks } = template(51234).hooks;

    expect(hookSettings('http://127.0.0.1:51234', null)).toEqual({ hooks: httpHooks });
  });

  it('überschreibt eine vorhandene Datei mit gültigem JSON und lässt keine Temp-Datei zurück', () => {
    const dir = makeTempDir();
    const file = path.join(dir, HOOK_FILE_NAME);
    fs.writeFileSync(file, 'alt und kaputt', 'utf8');

    writeHookFile(file, 'http://127.0.0.1:4711', CURL);

    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual(template(4711));
    expect(fs.readdirSync(dir)).toEqual([HOOK_FILE_NAME]);
  });

  it('wird bei jedem Start neu in den Datenordner geschrieben, mit Adresse und Port dieses Starts', async () => {
    const h = await startWorkspaceWithApi();
    const first = h.localApi;
    expect(JSON.parse(fs.readFileSync(first.hookFile, 'utf8'))).toEqual(hookSettings(first.url, findCurl()));

    await h.restart();

    expect(h.localApi.hookFile).toBe(first.hookFile);
    expect(JSON.parse(fs.readFileSync(h.localApi.hookFile, 'utf8'))).toEqual(hookSettings(h.localApi.url, findCurl()));
  });
});
