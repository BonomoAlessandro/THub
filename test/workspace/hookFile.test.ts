import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  HOOK_FILE_NAME,
  HOOK_FILE_WITHOUT_STATUS_LINE_NAME,
  HTTP_HOOK_EVENTS,
  STATUS_LINE_PATH,
  findCurl,
  hookSettings,
  statusLineCommand,
  writeHookFile,
  writeHookFiles,
} from '../../src/main/hookFile';
import { startWorkspaceWithApi } from '../support/harness';
import { makeTempDir } from '../support/tempDir';

// Die im Spike mit dem echten Claude Code 2.1.328 geprüfte Vorlage, seit Ticket 37 mit SubagentStart und SubagentStop
// und seit Ticket 38 mit statusLine (beides geprüft mit 2.1.332); <PORT> steht für den Port der Schnittstelle.
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

  it('lässt SessionStart und statusLine weg, wenn curl.exe fehlt; die HTTP-Hooks bleiben', () => {
    const { SessionStart: _curl, ...httpHooks } = template(51234).hooks;

    expect(hookSettings('http://127.0.0.1:51234', null)).toEqual({ hooks: httpHooks });
  });

  describe('statusLine für den Verbrauchsbalken (Ticket 38)', () => {
    it('leitet das JSON der Statuszeile mit curl.exe an /claude/statusline weiter, als Zeichenkette für Git Bash und PowerShell', () => {
      const { statusLine } = hookSettings('http://127.0.0.1:51234', CURL);

      expect(statusLine).toEqual({
        type: 'command',
        command:
          "C:/Windows/System32/curl.exe -s -S --connect-timeout 1 -m 2 --noproxy '*' " +
          '--variable %THUB_TAB_ID= --variable %THUB_TOKEN= ' +
          "--expand-header 'X-THub-Tab: {{THUB_TAB_ID}}' --expand-header 'X-THub-Token: {{THUB_TOKEN}}' " +
          "-H 'Content-Type: application/json' --data-binary '@-' http://127.0.0.1:51234/claude/statusline",
      });
      expect(STATUS_LINE_PATH).toBe('/claude/statusline');
    });

    it('fehlt ohne curl.exe und bei ausgeschaltetem Verbrauchsbalken; die Hooks bleiben gleich', () => {
      const withBar = hookSettings('http://127.0.0.1:51234', CURL);

      expect(hookSettings('http://127.0.0.1:51234', null)).not.toHaveProperty('statusLine');
      expect(hookSettings('http://127.0.0.1:51234', CURL, { statusLine: false })).toEqual({ hooks: withBar.hooks });
    });

    it('fehlt, wenn sich der Pfad zu curl.exe nicht ohne Anführungszeichen schreiben lässt', () => {
      expect(statusLineCommand('C:\\Win dows\\System32\\curl.exe', 'http://127.0.0.1:1/claude/statusline')).toBeNull();
      expect(hookSettings('http://127.0.0.1:1', 'C:\\Win dows\\System32\\curl.exe')).not.toHaveProperty('statusLine');
    });

    it('steht in der einen Datei, in der anderen nicht', () => {
      const dir = makeTempDir();

      const files = writeHookFiles(dir, 'http://127.0.0.1:4711', CURL);

      expect(files).toEqual({
        hookFile: path.join(dir, HOOK_FILE_NAME),
        hookFileWithoutStatusLine: path.join(dir, HOOK_FILE_WITHOUT_STATUS_LINE_NAME),
      });
      expect(JSON.parse(fs.readFileSync(files.hookFile, 'utf8'))).toEqual(template(4711));
      const { statusLine: _bar, ...withoutBar } = template(4711) as { hooks: unknown; statusLine?: unknown };
      expect(JSON.parse(fs.readFileSync(files.hookFileWithoutStatusLine, 'utf8'))).toEqual(withoutBar);
      expect(fs.readdirSync(dir).sort()).toEqual([HOOK_FILE_WITHOUT_STATUS_LINE_NAME, HOOK_FILE_NAME].sort());
    });
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
    expect(h.localApi.hookFileWithoutStatusLine).toBe(first.hookFileWithoutStatusLine);
    expect(JSON.parse(fs.readFileSync(h.localApi.hookFile, 'utf8'))).toEqual(hookSettings(h.localApi.url, findCurl()));
    expect(JSON.parse(fs.readFileSync(h.localApi.hookFileWithoutStatusLine, 'utf8'))).toEqual(
      hookSettings(h.localApi.url, findCurl(), { statusLine: false }),
    );
  });
});
