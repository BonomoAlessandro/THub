// Hook-Datei für Claude Code (Ticket 10). THub schreibt sie bei jedem Start neu in seinen Datenordner;
// der claude-Starter gibt sie Claude mit `--settings` mit. Der Aufbau folgt der im Spike geprüften Vorlage
// spikes/claude-hooks/empfohlene-hook-datei.json (Befunde in docs/spikes/claude-hooks.md):
// - alle Ereignisse ausser SessionStart als HTTP-Hook auf /hooks/<Ereignis>, Tab und Token aus der Umgebung;
// - SessionStart kennt keine HTTP-Hooks: Ein Befehls-Hook ohne Shell leitet die Nutzdaten mit curl.exe weiter.
// Lädt nie Electron.

import * as fs from 'node:fs';
import * as path from 'node:path';

export const HOOK_FILE_NAME = 'claude-hooks.json';

/** Ereignisse, die Claude per HTTP-Hook meldet, in der Reihenfolge der Vorlage. */
export const HTTP_HOOK_EVENTS = [
  'SessionEnd',
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'PermissionRequest',
  'Stop',
  'StopFailure',
  'Notification',
] as const;

/** Zeitlimit der HTTP-Hooks in Sekunden. Hängt der Empfänger, wartet Claude bei jedem Ereignis so lange. */
const HTTP_TIMEOUT_S = 2;
/** Zeitlimit des curl-Hooks; curl selbst gibt nach 1 s Verbindungsaufbau bzw. 2 s insgesamt auf. */
const CURL_HOOK_TIMEOUT_S = 3;
/** Umgebungsvariablen, die Claude in die Kopfzeilen der HTTP-Hooks einsetzen darf. */
const ALLOWED_ENV_VARS = ['THUB_TAB_ID', 'THUB_TOKEN'];

interface HttpHook {
  type: 'http';
  url: string;
  timeout: number;
  headers: Record<string, string>;
  allowedEnvVars: string[];
}

interface CommandHook {
  type: 'command';
  command: string;
  args: string[];
  timeout: number;
}

/** Inhalt der Hook-Datei, so wie ihn Claude Code als Einstellungen liest. */
export interface HookSettings {
  hooks: Record<string, { hooks: (HttpHook | CommandHook)[] }[]>;
}

/**
 * Inhalt der Hook-Datei für die lokale Schnittstelle unter `apiUrl`.
 * Ohne curl.exe entfällt SessionStart; die Zuordnung übernimmt dann das nächste andere Ereignis.
 */
export function hookSettings(apiUrl: string, curlExe: string | null): HookSettings {
  const hooks: HookSettings['hooks'] = {};
  if (curlExe) hooks.SessionStart = [{ hooks: [curlForward(curlExe, `${apiUrl}/hooks/SessionStart`)] }];
  for (const event of HTTP_HOOK_EVENTS) {
    hooks[event] = [
      {
        hooks: [
          {
            type: 'http',
            url: `${apiUrl}/hooks/${event}`,
            timeout: HTTP_TIMEOUT_S,
            headers: { 'X-THub-Tab': '$THUB_TAB_ID', 'X-THub-Token': '$THUB_TOKEN' },
            allowedEnvVars: [...ALLOWED_ENV_VARS],
          },
        ],
      },
    ];
  }
  return { hooks };
}

/**
 * Befehls-Hook in Exec-Form (ohne Shell), der die Nutzdaten von stdin an `url` weiterleitet. curl liest Tab
 * und Token selbst aus der Umgebung (`--variable %NAME=`, ab curl 8.3) und nimmt keinen Proxy. curl gibt die
 * Antwort des Empfängers unverändert aus (`-s` ohne Fortschritt, kein `-i`, `-w` oder `--fail`), und diese Ausgabe
 * liest Claude: Der Empfänger antwortet leer, ausser er gibt die Anweisung für offene Punkte als JSON mit
 * `additionalContext` mit (Ticket 22).
 */
function curlForward(curlExe: string, url: string): CommandHook {
  return {
    type: 'command',
    command: curlExe,
    args: [
      '-s',
      '-S',
      '--connect-timeout',
      '1',
      '-m',
      '2',
      '--noproxy',
      '*',
      '--variable',
      '%THUB_TAB_ID=',
      '--variable',
      '%THUB_TOKEN=',
      '--expand-header',
      'X-THub-Tab: {{THUB_TAB_ID}}',
      '--expand-header',
      'X-THub-Token: {{THUB_TOKEN}}',
      '-H',
      'Content-Type: application/json',
      '--data-binary',
      '@-',
      url,
    ],
    timeout: CURL_HOOK_TIMEOUT_S,
  };
}

/** Das curl.exe von Windows (ab Windows 10 1803 dabei); `null`, wenn es fehlt. */
export function findCurl(): string | null {
  const exe = path.win32.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'curl.exe');
  return fs.existsSync(exe) ? exe : null;
}

/** Schreibt die Hook-Datei neu, atomar über eine Temp-Datei. */
export function writeHookFile(file: string, apiUrl: string, curlExe: string | null = findCurl()): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(hookSettings(apiUrl, curlExe), null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, file);
}
