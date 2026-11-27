// Hook-Datei für Claude Code (Ticket 10). THub schreibt sie bei jedem Start neu in seinen Datenordner;
// der claude-Starter gibt sie Claude mit `--settings` mit. Der Aufbau folgt der im Spike geprüften Vorlage
// spikes/claude-hooks/empfohlene-hook-datei.json (Befunde in docs/spikes/claude-hooks.md):
// - alle Ereignisse ausser SessionStart als HTTP-Hook auf /hooks/<Ereignis>, Tab und Token aus der Umgebung, dazu seit
//   Ticket 37 SubagentStart und SubagentStop (Messung im Abschnitt „Agenten“ des Spikes);
// - SessionStart kennt keine HTTP-Hooks: Ein Befehls-Hook ohne Shell leitet die Nutzdaten mit curl.exe weiter;
// - seit Ticket 38 ein Eintrag `statusLine`: Er leitet das JSON der Statuszeile mit curl.exe an /claude/statusline
//   weiter und gibt nichts aus. So bekommt der Verbrauchsbalken seine Angaben, und Claude zeigt keine eigene
//   Statuszeile (Messung im Abschnitt „Statuszeile (Ticket 38)“ des Spikes).
// Es gibt die Datei zweimal: mit `statusLine` und ohne, für den ausgeschalteten Verbrauchsbalken. Welche ein Start von
// Claude bekommt, entscheidet der Kern beim Start.
// Lädt nie Electron.

import * as fs from 'node:fs';
import * as path from 'node:path';

export const HOOK_FILE_NAME = 'claude-hooks.json';
/** Dieselbe Hook-Datei ohne `statusLine`, für den ausgeschalteten Verbrauchsbalken (Ticket 38). */
export const HOOK_FILE_WITHOUT_STATUS_LINE_NAME = 'claude-hooks-ohne-statuszeile.json';

/**
 * Ereignisse, die Claude per HTTP-Hook meldet, in der Reihenfolge der Vorlage. `SubagentStart` und `SubagentStop`
 * führen die laufenden Agenten (Ticket 37); eine laufende Claude-Session kennt sie erst nach einem neuen Start.
 */
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
  'SubagentStart',
  'SubagentStop',
] as const;

/** Endpunkt der lokalen Schnittstelle für das JSON der Statuszeile (Ticket 38). */
export const STATUS_LINE_PATH = '/claude/statusline';

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

/** Eintrag `statusLine`: Claude kennt dafür nur eine Zeichenkette, die eine Shell ausführt (keine Exec-Form). */
interface StatusLineCommand {
  type: 'command';
  command: string;
}

/** Inhalt der Hook-Datei, so wie ihn Claude Code als Einstellungen liest. */
export interface HookSettings {
  hooks: Record<string, { hooks: (HttpHook | CommandHook)[] }[]>;
  statusLine?: StatusLineCommand;
}

export interface HookSettingsOptions {
  /**
   * Mit dem Eintrag `statusLine` für den Verbrauchsbalken (Ticket 38); Standard ja. Ohne curl.exe gibt es ihn nie: Die
   * Statuszeile des Nutzers bleibt dann, und der Balken bekommt keine Angaben von Claude.
   */
  statusLine?: boolean;
}

/**
 * Inhalt der Hook-Datei für die lokale Schnittstelle unter `apiUrl`.
 * Ohne curl.exe entfallen SessionStart (die Zuordnung übernimmt dann das nächste andere Ereignis) und `statusLine`.
 */
export function hookSettings(
  apiUrl: string,
  curlExe: string | null,
  { statusLine = true }: HookSettingsOptions = {},
): HookSettings {
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
  const settings: HookSettings = { hooks };
  const command = statusLine && curlExe ? statusLineCommand(curlExe, `${apiUrl}${STATUS_LINE_PATH}`) : null;
  if (command) settings.statusLine = { type: 'command', command };
  return settings;
}

/**
 * Argumente für curl.exe, das die Nutzdaten von stdin an `url` weiterleitet. curl liest Tab und Token selbst aus der
 * Umgebung (`--variable %NAME=`, ab curl 8.3) und nimmt keinen Proxy. curl gibt die Antwort des Empfängers unverändert
 * aus (`-s` ohne Fortschritt, kein `-i`, `-w` oder `--fail`); bei einem Fehler steht nur auf stderr etwas.
 */
function curlArgs(url: string): string[] {
  return [
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
  ];
}

/**
 * Befehls-Hook in Exec-Form (ohne Shell), der die Nutzdaten an `url` weiterleitet. Die Ausgabe dieses Hooks liest
 * Claude: Der Empfänger antwortet leer, ausser er gibt die Anweisung für offene Punkte als JSON mit `additionalContext`
 * mit (Ticket 22).
 */
function curlForward(curlExe: string, url: string): CommandHook {
  return { type: 'command', command: curlExe, args: curlArgs(url), timeout: CURL_HOOK_TIMEOUT_S };
}

/** Zeichen, die in Git Bash und in PowerShell ohne Anführungszeichen für sich selbst stehen. */
const PLAIN_WORD = /^[A-Za-z0-9_%=:/.-]+$/;

/**
 * Befehl der Statuszeile (Ticket 38): dieselbe Weiterleitung als Zeichenkette. Claude Code führt sie unter Windows mit
 * Git Bash aus, ohne Git Bash mit PowerShell; im Spike geprüft in Git Bash, Windows PowerShell und PowerShell 7. Darum
 * steht der Pfad zu curl.exe mit `/` (Git Bash verschluckt `\`) und ohne Anführungszeichen (PowerShell nähme eine
 * Zeichenkette in Anführungszeichen am Anfang als Wert, nicht als Befehl), und jedes andere Argument mit Sonderzeichen
 * steht in einfachen Anführungszeichen, die beide Shells gleich lesen. Liefert `null`, wenn sich der Befehl so nicht
 * schreiben lässt (etwa ein Pfad zu curl.exe mit Leerzeichen); dann gibt es keinen Eintrag `statusLine`.
 */
export function statusLineCommand(curlExe: string, url: string): string | null {
  const exe = curlExe.replaceAll('\\', '/');
  const args = curlArgs(url);
  if (!PLAIN_WORD.test(exe) || args.some((arg) => arg.includes("'"))) return null;
  return [exe, ...args.map((arg) => (PLAIN_WORD.test(arg) ? arg : `'${arg}'`))].join(' ');
}

/** Das curl.exe von Windows (ab Windows 10 1803 dabei); `null`, wenn es fehlt. */
export function findCurl(): string | null {
  const exe = path.win32.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'curl.exe');
  return fs.existsSync(exe) ? exe : null;
}

/** Schreibt die Hook-Datei neu, atomar über eine Temp-Datei. */
export function writeHookFile(
  file: string,
  apiUrl: string,
  curlExe: string | null = findCurl(),
  options: HookSettingsOptions = {},
): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(hookSettings(apiUrl, curlExe, options), null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, file);
}

/** Die beiden Hook-Dateien eines Starts. */
export interface HookFiles {
  /** Mit `statusLine` für den Verbrauchsbalken (ohne curl.exe ohne). */
  hookFile: string;
  /** Ohne `statusLine`, für den ausgeschalteten Verbrauchsbalken. */
  hookFileWithoutStatusLine: string;
}

/** Schreibt beide Hook-Dateien in den Ordner `dir` neu (Ticket 38). */
export function writeHookFiles(dir: string, apiUrl: string, curlExe: string | null = findCurl()): HookFiles {
  const files: HookFiles = {
    hookFile: path.join(dir, HOOK_FILE_NAME),
    hookFileWithoutStatusLine: path.join(dir, HOOK_FILE_WITHOUT_STATUS_LINE_NAME),
  };
  writeHookFile(files.hookFile, apiUrl, curlExe);
  writeHookFile(files.hookFileWithoutStatusLine, apiUrl, curlExe, { statusLine: false });
  return files;
}
