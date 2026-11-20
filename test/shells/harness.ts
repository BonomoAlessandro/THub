// Werkzeuge fuer die Shell-Integrationstests (Teststelle 2): nachgemachtes claude, aufzeichnende
// Testattrappe der lokalen Schnittstelle und echte Shells ueber das echte Terminal-Backend von THub
// (PtyManager: node-pty/ConPTY mit der mitgelieferten Integration), auf Wunsch samt Workspace-Kern und
// echter lokaler Schnittstelle (Ende zu Ende).
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import http from 'node:http';
import type { AddressInfo, Socket } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { HOOK_FILE_NAME, writeHookFile } from '../../src/main/hookFile';
import { LocalApiServer } from '../../src/main/localApi';
import { createProcessProbe } from '../../src/main/processProbe';
import { PtyManager } from '../../src/main/ptyManager';
import { shellEnv } from '../../src/main/shellEnv';
import type { LocalApiInfo } from '../../src/main/workspace/claude';
import type {
  Clock,
  HostSystem,
  ProcessProbe,
  ShellInfo,
  ShellIntegration,
  StartOrder,
  StateStorage,
  TerminalBackend,
} from '../../src/main/workspace/ports';
import type { PersistedClaudeLink, PersistedState } from '../../src/main/workspace/schema';
import { createWorkspace as createCore, type Workspace as Core } from '../../src/main/workspace/workspace';
import { MemoryStorage } from '../support/fakes';

export const REPO = path.resolve(__dirname, '..', '..');
export const SYSTEM_ROOT = process.env.SystemRoot ?? 'C:\\Windows';
const POWERSHELL_EXE = path.join(SYSTEM_ROOT, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const CSC = path.join(SYSTEM_ROOT, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe');

export type ShellId = 'pwsh' | 'powershell' | 'cmd' | 'gitbash';
export type Variant = 'exe' | 'cmd';

// ---------------------------------------------------------------------------------------------
// Arbeitsordner pro Testdatei

export interface Workspace {
  root: string;
  /** Kopie von resources/shell in einem Ordner mit Leerzeichen und Umlauten */
  shellDir: string;
  starter: string;
  stubExeDir: string;
  stubCmdDir: string;
  home: string;
  hookFile: string;
  stubOut: string;
  stubConfig: string;
  mark: string;
  profileLoaded: string;
}

export function createWorkspace(shell: ShellId): Workspace {
  const root = mkdtempSync(path.join(os.tmpdir(), `thub-shells-${shell}-`));
  const shellDir = path.join(root, 'Ordner mit Leerzeichen äöü', 'resources', 'shell');
  mkdirSync(shellDir, { recursive: true });
  cpSync(path.join(REPO, 'resources', 'shell'), shellDir, { recursive: true });

  const stubExeDir = path.join(root, 'stub-exe');
  const stubCmdDir = path.join(root, 'stub-cmd');
  mkdirSync(stubExeDir);
  mkdirSync(stubCmdDir);
  const exe = path.join(stubExeDir, 'claude.exe');
  execFileSync(CSC, ['/nologo', '/optimize', '/target:exe', `/out:${exe}`, path.join(__dirname, 'stub', 'ClaudeStub.cs')], {
    stdio: 'pipe',
  });
  cpSync(exe, path.join(stubCmdDir, 'claude-impl.exe'));
  cpSync(path.join(__dirname, 'stub', 'claude.cmd'), path.join(stubCmdDir, 'claude.cmd'));

  const home = path.join(root, 'home');
  mkdirSync(home);
  const hookDir = path.join(root, 'Hook Ordner');
  mkdirSync(hookDir);
  const hookFile = path.join(hookDir, 'thub-hooks.json');
  writeFileSync(hookFile, '{}');

  return {
    root,
    shellDir,
    starter: path.join(shellDir, 'starter.ps1'),
    stubExeDir,
    stubCmdDir,
    home,
    hookFile,
    stubOut: path.join(root, 'stub-out.jsonl'),
    stubConfig: path.join(root, 'stub-config.txt'),
    mark: path.join(root, 'mark.txt'),
    profileLoaded: path.join(root, 'profile-loaded.txt'),
  };
}

export function removeWorkspace(ws: Workspace): void {
  // Ein gerade beendeter Prozess kann den Ordner noch kurz sperren: einige Sekunden wiederholen.
  for (let i = 0; i < 20; i++) {
    killLeftovers(ws.root);
    try {
      rmSync(ws.root, { recursive: true, force: true });
      return;
    } catch {
      execFileSync(process.execPath, ['-e', 'setTimeout(()=>{},500)']);
    }
  }
}

/** Beendet alle Prozesse, deren Befehlszeile oder Programmpfad den Arbeitsordner enthaelt. */
export function killLeftovers(root: string): string[] {
  const script =
    `$r = $env:TH_KILL_ROOT; Get-CimInstance Win32_Process | ` +
    `Where-Object { ($_.CommandLine -and $_.CommandLine.Contains($r)) -or ($_.ExecutablePath -and $_.ExecutablePath.Contains($r)) } | ` +
    `Where-Object { $_.ProcessId -ne $PID } | ForEach-Object { "$($_.ProcessId) $($_.Name)"; Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;
  const out = execFileSync(POWERSHELL_EXE, ['-NoProfile', '-NonInteractive', '-Command', script], {
    env: windowsPowerShellEnv({ TH_KILL_ROOT: root }),
    encoding: 'utf8',
  });
  return out.split(/\r?\n/).filter(Boolean);
}

// ---------------------------------------------------------------------------------------------
// Nachgemachtes claude

export interface StubRecord {
  pid: number;
  exe: string;
  cwd: string;
  rawCommandLine: string;
  rawArgs: string;
  argv: string[];
  argvCrt2008: string[];
  argvCrtOld: string[];
  env: Record<string, string>;
}

export function configureStub(ws: Workspace, cfg: { exit?: number; wait?: boolean; ctrlcExit?: number } = {}): void {
  const lines = [`exit=${cfg.exit ?? 0}`, `wait=${cfg.wait ? 1 : 0}`, `ctrlcExit=${cfg.ctrlcExit ?? 130}`];
  writeFileSync(ws.stubConfig, lines.join('\n'));
}

export function clearStubRecords(ws: Workspace): void {
  writeFileSync(ws.stubOut, '');
}

export function readStubRecords(ws: Workspace): StubRecord[] {
  if (!existsSync(ws.stubOut)) return [];
  return readFileSync(ws.stubOut, 'utf8')
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => JSON.parse(l) as StubRecord);
}

// ---------------------------------------------------------------------------------------------
// Testattrappe der lokalen Schnittstelle

export interface RecordedRequest {
  path: string;
  token: string | undefined;
  body: any;
  at: number;
}

export interface LaunchResponse {
  tabName: string;
  sessionId: string;
  hookFile: string;
}

export class FakeTHub {
  readonly token = randomUUID();
  readonly requests: RecordedRequest[] = [];
  mode: 'ok' | 'hang' = 'ok';
  private server?: http.Server;
  private sockets = new Set<Socket>();
  port = 0;

  constructor(public launchResponse: LaunchResponse) {}

  get url(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  async start(): Promise<void> {
    this.server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let body: any = text;
        try {
          body = text ? JSON.parse(text) : null;
        } catch {
          // roh behalten
        }
        this.requests.push({ path: req.url ?? '', token: req.headers['x-thub-token'] as string | undefined, body, at: Date.now() });
        if (this.mode === 'hang') return; // nie antworten
        if (req.url === '/claude/launch') {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify(this.launchResponse));
        } else {
          res.writeHead(204);
          res.end();
        }
      });
    });
    this.server.on('connection', (s) => {
      this.sockets.add(s);
      s.on('close', () => this.sockets.delete(s));
    });
    await new Promise<void>((resolve) => this.server!.listen(0, '127.0.0.1', resolve));
    this.port = (this.server!.address() as AddressInfo).port;
  }

  clear(): void {
    this.requests.length = 0;
  }

  paths(): string[] {
    return this.requests.map((r) => r.path);
  }

  async waitFor(pathName: string, timeoutMs = 15000): Promise<RecordedRequest> {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      const r = this.requests.find((x) => x.path === pathName);
      if (r) return r;
      await sleep(50);
    }
    throw new Error(`Keine Anfrage ${pathName} innerhalb von ${timeoutMs} ms; bisher: ${this.paths().join(', ')}`);
  }

  async close(): Promise<void> {
    for (const s of this.sockets) s.destroy();
    if (this.server) await new Promise<void>((resolve) => this.server!.close(() => resolve()));
  }
}

/**
 * Nachgemachter Benutzer-Modulordner von PowerShell 7 (`…\Dokumente\PowerShell\Modules`) mit einem
 * Microsoft.PowerShell.Security, das nur PowerShell 7 laden kann. Steht er in PSModulePath, wie wenn THub aus
 * PowerShell 7 gestartet wurde, findet Windows PowerShell dort Get-ExecutionPolicy und scheitert beim Laden.
 */
export function fakePowerShell7Modules(ws: Workspace): string {
  const modules = path.join(ws.root, 'Dokumente', 'PowerShell', 'Modules');
  const security = path.join(modules, 'Microsoft.PowerShell.Security');
  mkdirSync(security, { recursive: true });
  writeFileSync(
    path.join(security, 'Microsoft.PowerShell.Security.psd1'),
    "@{ ModuleVersion = '7.0.0.0'; PowerShellVersion = '7.0'; CompatiblePSEditions = @('Core'); CmdletsToExport = @('Get-ExecutionPolicy') }\r\n",
  );
  return modules;
}

/** Umgebung fuer eigene Aufrufe von Windows PowerShell im Test: ohne PSModulePath (siehe executionPolicy.ts). */
function windowsPowerShellEnv(extra: Record<string, string> = {}): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined && k.toUpperCase() !== 'PSMODULEPATH') env[k] = v;
  return { ...env, ...extra };
}

/** Ein Port, auf dem sicher niemand lauscht (kurz belegt und wieder freigegeben). */
export async function closedPort(): Promise<number> {
  const s = http.createServer();
  await new Promise<void>((resolve) => s.listen(0, '127.0.0.1', resolve));
  const port = (s.address() as AddressInfo).port;
  await new Promise<void>((resolve) => s.close(() => resolve()));
  return port;
}

// ---------------------------------------------------------------------------------------------
// Shells

export interface ShellDef {
  id: ShellId;
  exe: string | null;
  /** Integration, mit der das Terminal-Backend die Shell startet */
  integration: ShellIntegration;
  /** Anhang an eine getippte Zeile, der "<nonce> <Exit-Code>" in $TH_MARK schreibt */
  markSuffix(nonce: string): string;
  /** Eigenstaendige Zeile, die "<nonce> <Exit-Code>" in $TH_MARK schreibt */
  markLine(nonce: string): string;
  /** Startbefehl: Starter direkt mit den gegebenen (bereits fuer die Shell gequoteten) Argumenten */
  startCommand(args: string): string;
}

/** Wie existsSync, erkennt aber auch App-Ausfuehrungsaliase (WindowsApps), denen stat nicht folgen kann. */
function fileExists(p: string): boolean {
  if (existsSync(p)) return true;
  try {
    lstatSync(p);
    return true;
  } catch {
    return false;
  }
}

function findOnPath(name: string): string | null {
  for (const dir of (process.env.PATH ?? '').split(';')) {
    if (!dir) continue;
    const p = path.join(dir, name);
    if (fileExists(p)) return p;
  }
  return null;
}

function findPwsh(): string | null {
  const fixed = path.join(process.env.ProgramFiles ?? 'C:\\Program Files', 'PowerShell', '7', 'pwsh.exe');
  if (existsSync(fixed)) return fixed;
  return findOnPath('pwsh.exe');
}

function findGitBash(): string | null {
  const candidates = [
    path.join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Git', 'bin', 'bash.exe'),
    path.join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Git', 'bin', 'bash.exe'),
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  try {
    const out = execFileSync('reg', ['query', 'HKLM\\SOFTWARE\\GitForWindows', '/v', 'InstallPath'], { encoding: 'utf8' });
    const m = /InstallPath\s+REG_SZ\s+(.+)/.exec(out);
    if (m) {
      const p = path.join(m[1].trim(), 'bin', 'bash.exe');
      if (existsSync(p)) return p;
    }
  } catch {
    // nicht installiert
  }
  return null;
}

// Liest der Test die Datei gerade, scheitert Set-Content unter Last mit „wird von einem anderen Prozess
// verwendet“: darum einige Male wiederholen. Der Exit-Code wird vorher festgehalten.
const psMark = (nonce: string) =>
  `$__m = [int]$LASTEXITCODE; foreach ($__i in 1..50) { try { Set-Content -LiteralPath $env:TH_MARK -Value ('${nonce} ' + $__m) -ErrorAction Stop; break } catch { Start-Sleep -Milliseconds 20 } }`;
const psStart = (args: string) =>
  `& "$env:SystemRoot\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -NoProfile -NoLogo -ExecutionPolicy Bypass -File $env:THUB_STARTER ${args}`;

export const SHELLS: Record<ShellId, ShellDef> = {
  pwsh: {
    id: 'pwsh',
    exe: findPwsh(),
    integration: 'powershell',
    markSuffix: (n) => `; ${psMark(n)}`,
    markLine: psMark,
    startCommand: psStart,
  },
  powershell: {
    id: 'powershell',
    exe: existsSync(POWERSHELL_EXE) ? POWERSHELL_EXE : null,
    integration: 'powershell',
    markSuffix: (n) => `; ${psMark(n)}`,
    markLine: psMark,
    startCommand: psStart,
  },
  cmd: {
    id: 'cmd',
    exe: path.join(SYSTEM_ROOT, 'System32', 'cmd.exe'),
    integration: 'cmd',
    // %^ERRORLEVEL% ueberlebt die erste Auswertung, `call` wertet es nach dem Befehl aus.
    markSuffix: (n) => ` & (call echo ${n} %^ERRORLEVEL%)> "%TH_MARK%"`,
    markLine: (n) => `(call echo ${n} %^ERRORLEVEL%)> "%TH_MARK%"`,
    startCommand: (args) =>
      `"%SystemRoot%\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -NoProfile -NoLogo -ExecutionPolicy Bypass -File "%THUB_STARTER%" ${args}`,
  },
  gitbash: {
    id: 'gitbash',
    exe: findGitBash(),
    integration: 'bash',
    markSuffix: (n) => `; echo "${n} $?" > "$TH_MARK"`,
    markLine: (n) => `echo "${n} $?" > "$TH_MARK"`,
    startCommand: (args) => `__thub_starter ${args}`,
  },
};

// ---------------------------------------------------------------------------------------------
// Start einer Shell ueber das echte Terminal-Backend

export interface LaunchOptions {
  /** Ordner im PATH vor den Systemordnern (z.B. das nachgemachte claude); null = keiner */
  claudeDir: string | null;
  api: string | null;
  token: string;
  tabId: string;
  /** Startbefehl, bereits fuer die Shell formuliert (SHELLS[x].startCommand) */
  startCommand?: string;
  /** Zusaetzliche Zeilen am Ende des Testprofils (PowerShell, Git Bash) */
  profileExtra?: string[];
  /** Zusaetzliche Variablen der Grundumgebung */
  env?: Record<string, string>;
  /**
   * Variablen, die THub geerbt haette (etwa aus einer PowerShell-7-Sitzung); anders als `env` gehen sie wie
   * im Betrieb durch die Bereinigung des Terminal-Backends (shellEnv).
   */
  inherited?: Record<string, string>;
  /** Wie `PtyManagerOptions.claudeStarter`: ob die Shell den claude-Ersatz bekommt; Standard ja. */
  claudeStarter?: () => boolean;
}

export interface TestStart {
  /**
   * Startauftrag, wie ihn der Kern erteilt; THUB_* der Schnittstelle stehen in `order.env`. THUB_STARTER setzt
   * das Terminal-Backend selbst (Pfad zu starter.ps1 in `ws.shellDir`).
   */
  order: StartOrder;
  /** Ausdruecklich gesetzte Grundumgebung fuer das Terminal-Backend (statt der eigenen des Testlaufs). */
  baseEnv: Record<string, string>;
}

/**
 * Setzt Variablen und ersetzt dabei gleichnamige in anderer Schreibweise. Windows unterscheidet die
 * Schreibweise nicht, und mit zwei Eintraegen gilt der erste: Im Testlauf kommen geerbte Variablen gross
 * geschrieben an (etwa PSEXECUTIONPOLICYPREFERENCE=Bypass aus einer PowerShell mit -ExecutionPolicy Bypass),
 * ein zusaetzliches PSExecutionPolicyPreference=AllSigned bliebe sonst wirkungslos.
 */
function assignEnv(target: Record<string, string>, extra: Record<string, string> | undefined): void {
  for (const [key, value] of Object.entries(extra ?? {})) {
    for (const existing of Object.keys(target)) if (existing.toUpperCase() === key.toUpperCase()) delete target[existing];
    target[key] = value;
  }
}

/**
 * Baut Startauftrag und Grundumgebung fuer eine Shell mit Testprofil. Das Terminal-Backend (`PtyManager`)
 * macht daraus den Start mit Integration (`shellLaunch` in src/main).
 */
export function buildStart(def: ShellDef, ws: Workspace, opts: LaunchOptions): TestStart {
  if (!def.exe) throw new Error(`${def.id} ist nicht installiert`);

  // Umgebung ausdruecklich setzen: npm-/Node-Interna entfernen; geerbte THUB_*- und TERMHUB_*-Variablen
  // entfernt shellEnv aus dem Terminal-Backend, das auch NO_PROXY ergaenzt.
  const inherited: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v === undefined) continue;
    if (/^(NODE_|VITEST)/i.test(k)) continue;
    inherited[k] = v;
  }
  // PATH ohne die Ordner des Nutzers: so wird nie ein echtes claude gefunden.
  const sysPath = [
    path.join(SYSTEM_ROOT, 'System32'),
    SYSTEM_ROOT,
    path.join(SYSTEM_ROOT, 'System32', 'Wbem'),
    path.join(SYSTEM_ROOT, 'System32', 'WindowsPowerShell', 'v1.0'),
  ];
  delete inherited.Path;
  inherited.PATH = [...(opts.claudeDir ? [opts.claudeDir] : []), ...sysPath].join(';');
  inherited.HOME = ws.home;
  assignEnv(inherited, opts.inherited);
  const baseEnv = shellEnv(inherited);
  baseEnv.STUB_OUT = ws.stubOut;
  baseEnv.STUB_CONFIG = ws.stubConfig;
  baseEnv.TH_MARK = ws.mark;
  baseEnv.TH_PROFILE_LOADED = ws.profileLoaded;

  const env: Record<string, string> = { THUB_TAB_ID: opts.tabId, THUB_TOKEN: opts.token };
  if (opts.api) env.THUB_API = opts.api;

  switch (def.id) {
    case 'pwsh':
    case 'powershell': {
      const profile = path.join(ws.home, 'test-profile.ps1');
      writeFileSync(
        profile,
        [
          '# Testprofil: beweist, dass das Profil vor der Integration geladen wird.',
          "Set-Content -LiteralPath $env:TH_PROFILE_LOADED -Value ('ja PSReadLine=' + [bool](Get-Module PSReadLine))",
          '# Getippte Testzeilen nie in den echten PSReadLine-Verlauf schreiben',
          "if (Get-Module PSReadLine) { Set-PSReadLineOption -HistorySaveStyle SaveNothing -HistorySavePath (Join-Path $env:HOME 'history.txt') }",
          "function global:prompt { 'TH-PROMPT> ' }",
          ...(opts.profileExtra ?? []),
        ].join('\r\n'),
      );
      // Nur fuer Tests: ersetzt die Profile des Nutzers. Steht in der Grundumgebung, damit auch ein
      // Kern, der die Umgebung selbst setzt, das Testprofil laedt.
      baseEnv.THUB_TEST_PROFILE = profile;
      break;
    }
    case 'cmd':
      baseEnv.PROMPT = 'TH-PROMPT$G ';
      break;
    case 'gitbash':
      writeFileSync(
        path.join(ws.home, '.bashrc'),
        [
          '# Testprofil',
          'echo ja > "$TH_PROFILE_LOADED"',
          "PS1='TH-PROMPT> '",
          'HISTFILE=/dev/null',
          ...(opts.profileExtra ?? []),
          '',
        ].join('\n'),
      );
      writeFileSync(path.join(ws.home, '.bash_profile'), 'test -f ~/.bashrc && . ~/.bashrc\n');
      break;
  }

  assignEnv(baseEnv, opts.env);

  const order: StartOrder = {
    file: def.exe,
    args: [],
    cwd: ws.root,
    env,
    cols: 200,
    rows: 50,
    integration: def.integration,
  };
  if (opts.startCommand) order.startCommand = opts.startCommand;
  return { order, baseEnv };
}

// ---------------------------------------------------------------------------------------------
// Laufende Shell

const SESSION_TAB = 'tab';

/**
 * Wartet, bis die Markierungszeile mit `nonce` ihren Exit-Code in `ws.mark` geschrieben hat.
 * @param what wofuer gewartet wird, fuer die Fehlermeldung
 * @param output Ausgabe der Shell ohne Escape-Sequenzen, fuer die Fehlermeldung
 */
async function waitForMark(
  ws: Workspace,
  nonce: string,
  timeoutMs: number,
  exited: () => boolean,
  what: () => string,
  output: () => string,
): Promise<number> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (exited()) throw new Error(`Shell hat sich beendet (${what()}). Ausgabe:\n${output()}`);
    if (existsSync(ws.mark)) {
      let text = '';
      try {
        text = readFileSync(ws.mark, 'utf8').replace(/^﻿/, '').trim();
      } catch {
        // wird gerade geschrieben
      }
      const m = new RegExp(`^${nonce} (-?\\d+)`).exec(text);
      if (m) return Number(m[1]);
    }
    await sleep(50);
  }
  throw new Error(`Zeitlimit fuer ${what()}. Ausgabe:\n${output().slice(-3000)}`);
}

export class ShellSession {
  output = '';
  exited = false;
  private counter = 0;
  private procPid = 0;

  private constructor(
    readonly def: ShellDef,
    readonly ws: Workspace,
    private readonly backend: PtyManager,
  ) {}

  /** Startet die Shell ueber das echte Terminal-Backend, mit Integration und Testprofil. */
  static async start(def: ShellDef, ws: Workspace, opts: LaunchOptions): Promise<ShellSession> {
    const { order, baseEnv } = buildStart(def, ws, opts);
    const backend = new PtyManager({ shellDir: ws.shellDir, baseEnv: () => baseEnv, claudeStarter: opts.claudeStarter });
    const s = new ShellSession(def, ws, backend);
    s.procPid = backend.start(SESSION_TAB, order, {
      data: (d) => {
        s.output += d;
      },
      exit: () => {
        s.exited = true;
      },
    });
    // Bereit, sobald eine Markierungszeile ausgefuehrt wurde.
    await s.mark(30000);
    return s;
  }

  get pid(): number {
    return this.procPid;
  }

  write(data: string): void {
    this.backend.write(SESSION_TAB, data);
  }

  private nonce(): string {
    this.counter++;
    return `M${this.counter}x${Date.now() % 100000}`;
  }

  /** Tippt eine Zeile mit Markierung und liefert den Exit-Code des letzten Befehls. */
  async run(line: string, timeoutMs = 30000): Promise<number> {
    const nonce = this.nonce();
    this.write(line + this.def.markSuffix(nonce) + '\r');
    return this.waitMark(nonce, timeoutMs, line);
  }

  /** Tippt nur eine Markierungszeile. */
  async mark(timeoutMs = 30000): Promise<number> {
    const nonce = this.nonce();
    this.write(this.def.markLine(nonce) + '\r');
    return this.waitMark(nonce, timeoutMs, '(Markierung)');
  }

  private waitMark(nonce: string, timeoutMs: number, what: string): Promise<number> {
    return waitForMark(this.ws, nonce, timeoutMs, () => this.exited, () => `${what} in ${this.def.id}`, () => this.plainOutput());
  }

  async waitForOutput(re: RegExp, timeoutMs = 15000): Promise<void> {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      if (re.test(this.plainOutput())) return;
      await sleep(50);
    }
    throw new Error(`Ausgabe ${re} kam nicht in ${this.def.id}. Ausgabe:\n${this.plainOutput().slice(-3000)}`);
  }

  /** Wartet auf Ausgabe, die erst nach der Stelle `offset` der rohen Ausgabe erscheint. */
  async waitForOutputAfter(offset: number, re: RegExp, timeoutMs = 15000): Promise<void> {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      if (re.test(stripEscapes(this.output.slice(offset)))) return;
      await sleep(50);
    }
    throw new Error(`Ausgabe ${re} kam nicht in ${this.def.id}. Ausgabe:\n${this.plainOutput().slice(-3000)}`);
  }

  /** Ausgabe ohne Escape-Sequenzen */
  plainOutput(): string {
    return stripEscapes(this.output);
  }

  /** Beendet die Shell zuerst mit `exit`, erst danach hart (Terminal-Backend, node-pty kill). */
  async close(): Promise<void> {
    if (!this.exited) {
      this.write('exit\r');
      const soft = Date.now() + 3000;
      while (!this.exited && Date.now() < soft) await sleep(50);
    }
    if (!this.exited) {
      this.backend.kill(SESSION_TAB);
      const hard = Date.now() + 5000;
      while (!this.exited && Date.now() < hard) await sleep(50);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Workspace-Kern mit echtem Terminal-Backend

const realClock: Clock = {
  now: () => Date.now(),
  schedule(ms, callback) {
    const timer = setTimeout(callback, ms);
    return () => clearTimeout(timer);
  },
};

/** Echtes Dateisystem; der Benutzerordner ist der Arbeitsordner des Tests. */
function testSystem(home: string): HostSystem {
  return {
    directoryExists(dir) {
      try {
        return statSync(dir).isDirectory();
      } catch {
        return false;
      }
    },
    homeDir: () => home,
    userName: () => 'tester',
    displays: () => [
      { bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1040 }, primary: true },
    ],
    longPath(p) {
      if (!p.includes('~')) return p;
      try {
        return realpathSync.native(p);
      } catch {
        return p;
      }
    },
  };
}

/** Anpassungen fuer einen Kern mit echter Shell. */
export interface CoreShellOptions extends Pick<LaunchOptions, 'profileExtra' | 'env' | 'claudeStarter'> {
  /** Ordner im PATH vor den Systemordnern, etwa das nachgemachte claude; Standard: keiner. */
  claudeDir?: string | null;
  /**
   * Mit der echten Prozess-Sonde für Kern und Terminal-Backend, wie main.ts: Status, Beenden samt Nachfahren und
   * Aufräumen des Konsolen-Hosts. Standard: eine Sonde ohne Prozesse, die nichts beendet.
   */
  realProcesses?: boolean;
  /** Frist fuer die Start-Meldung nach einem Fortsetzen (Ticket 23), verkuerzt; Standard wie im Betrieb 30 s. */
  resumeLaunchGraceMs?: number;
}

/** Eine laufende echte lokale Schnittstelle samt Hook-Datei, so wie main.ts sie beim Start oeffnet. */
interface RunningLocalApi {
  server: LocalApiServer;
  info: LocalApiInfo;
}

/**
 * Ein Workspace-Kern, wie THub ihn startet, mit dem echten Terminal-Backend und einer echten Shell mit
 * Integration, auf Wunsch mit der echten lokalen Schnittstelle (`startWithApi`). Nachgemacht sind nur
 * Speicher (im Arbeitsspeicher) und Oberflaeche; die Umgebung der Shell ist ausdruecklich gesetzt. Der Kern
 * hat genau einen Tab im Arbeitsordner des Tests.
 */
export class CoreShell {
  /** Rohe Ausgabe der Shell, so wie sie der Kern an die Oberflaeche gibt. */
  output = '';
  /** Angezeigter Ordner des Tabs nach jeder Aenderung, ohne direkte Wiederholungen. */
  readonly shownCwds: string[] = [];
  private exited = false;
  private counter = 0;
  private apiClosed = false;
  private stopped = false;

  private constructor(
    readonly def: ShellDef,
    readonly ws: Workspace,
    readonly storage: MemoryStorage,
    readonly core: Core,
    /** Startauftraege, die der Kern dem Terminal-Backend erteilt hat. */
    readonly orders: StartOrder[],
    /**
     * Claude-Zuordnung des Tabs, wie sie gespeichert wurde, nach jeder Aenderung; `undefined` heisst normales
     * Terminal. Bleibt leer, solange der Tab ein normales Terminal bleibt.
     */
    readonly claudeLinks: (PersistedClaudeLink | undefined)[],
    private readonly api: RunningLocalApi | null,
  ) {}

  /**
   * Startet THub wie main.ts: echte lokale Schnittstelle auf 127.0.0.1 mit eigenem Token, Hook-Datei in einem
   * Datenordner des Tests, Kern, Terminal-Backend. Die Shell erreicht nur diese Schnittstelle.
   */
  static async startWithApi(
    def: ShellDef,
    ws: Workspace,
    extra: CoreShellOptions = {},
    storage = new MemoryStorage(),
  ): Promise<CoreShell> {
    const server = await LocalApiServer.start();
    try {
      const hookFile = path.join(ws.root, 'Daten äöü', HOOK_FILE_NAME);
      writeHookFile(hookFile, server.url);
      return CoreShell.start(def, ws, storage, extra, { server, info: { url: server.url, token: server.token, hookFile } });
    } catch (err) {
      await server.close();
      throw err;
    }
  }

  /**
   * Startet den Kern; mit `storage` auf dem gespeicherten Zustand eines frueheren Kerns (Neustart), mit
   * `extra` mit angepasstem Testprofil, zusaetzlicher Umgebung oder nachgemachtem claude im PATH.
   */
  static start(
    def: ShellDef,
    ws: Workspace,
    storage = new MemoryStorage(),
    extra: CoreShellOptions = {},
    api: RunningLocalApi | null = null,
  ): CoreShell {
    if (!def.exe) throw new Error(`${def.id} ist nicht installiert`);
    const { baseEnv } = buildStart(def, ws, {
      api: null,
      token: '',
      tabId: '',
      profileExtra: extra.profileExtra,
      env: extra.env,
      claudeDir: extra.claudeDir ?? null,
    });
    const processes: ProcessProbe = extra.realProcesses
      ? createProcessProbe()
      : { snapshot: () => Promise.resolve([]), consoleHost: () => null, terminate: () => {} };
    const backend = new PtyManager({
      shellDir: ws.shellDir,
      baseEnv: () => baseEnv,
      claudeStarter: extra.claudeStarter,
      processes: extra.realProcesses ? processes : undefined,
    });
    const orders: StartOrder[] = [];
    const recording: TerminalBackend = {
      start: (tabId, order, listener) => {
        orders.push(structuredClone(order));
        return backend.start(tabId, order, listener);
      },
      write: (tabId, data) => backend.write(tabId, data),
      resize: (tabId, cols, rows) => backend.resize(tabId, cols, rows),
      kill: (tabId) => backend.kill(tabId),
      killAll: (timeoutMs) => backend.killAll(timeoutMs),
    };
    const shell: ShellInfo = {
      id: def.id,
      name: def.id,
      file: def.exe,
      args: [],
      capturesClaude: true,
      integration: def.integration,
    };
    // Haelt jede Aenderung der Claude-Zuordnung fest, so wie der Kern sie speichert.
    const savedLinks: (PersistedClaudeLink | undefined)[] = [];
    const recordingStorage: StateStorage = {
      loadState: () => storage.loadState(),
      saveState: (state) => {
        storage.saveState(state);
        const link = state.tabs[0]?.claude;
        if (JSON.stringify(link) !== JSON.stringify(savedLinks.at(-1))) savedLinks.push(structuredClone(link));
      },
      flush: () => storage.flush(),
      loadHistory: (tabId) => storage.loadHistory(tabId),
      saveHistory: (tabId, history) => storage.saveHistory(tabId, history),
      deleteHistory: (tabId) => storage.deleteHistory(tabId),
    };
    const core = createCore(
      {
        terminal: recording,
        storage: recordingStorage,
        clock: realClock,
        processes,
        system: testSystem(ws.root),
      },
      { shells: [shell], localApi: api?.info, resumeLaunchGraceMs: extra.resumeLaunchGraceMs },
    );
    const s = new CoreShell(def, ws, storage, core, orders, savedLinks, api);
    // Wie main.ts: Erst wenn der Kern laeuft, gehen die Anfragen an ihn.
    api?.server.connect(core);
    core.subscribe((event) => {
      if (event.type === 'output') s.output += event.data;
      if (event.type === 'exit') s.exited = true;
      if (event.type === 'requestHistory') for (const id of event.tabIds) core.saveHistory(id, '');
      if (event.type === 'tabs' && event.tabs[0] && event.tabs[0].cwd !== s.shownCwds.at(-1)) {
        s.shownCwds.push(event.tabs[0].cwd);
      }
    });
    // Wie die Oberflaeche: Die Ansicht meldet „bereit“, erst dann startet der Kern die Shell.
    core.viewReady(s.tabId, 200, 50);
    return s;
  }

  get tabId(): string {
    return this.core.snapshot().tabs[0].id;
  }

  /** Die lokale Schnittstelle dieses Kerns: Adresse, Token, Hook-Datei. */
  get localApi(): LocalApiInfo {
    if (!this.api) throw new Error('Dieser Kern laeuft ohne lokale Schnittstelle (startWithApi)');
    return this.api.info;
  }

  /** Zuletzt aktiver Ordner des Tabs, so wie er gespeichert ist. */
  lastCwd(): string | undefined {
    return (this.storage.stored as PersistedState | null)?.tabs[0]?.lastCwd;
  }

  /** Die gespeicherte Claude-Zuordnung des Tabs; `undefined` heisst normales Terminal. */
  claudeLink(): PersistedClaudeLink | undefined {
    return (this.storage.stored as PersistedState | null)?.tabs[0]?.claude;
  }

  /** Tippt eine Zeile mit Markierung und liefert den Exit-Code des letzten Befehls. */
  async run(line: string, timeoutMs = 30000): Promise<number> {
    const nonce = this.nonce();
    this.write(line + this.def.markSuffix(nonce) + '\r');
    return this.waitMark(nonce, timeoutMs, line);
  }

  /** Tippt nur eine Markierungszeile. */
  async mark(timeoutMs = 30000): Promise<number> {
    const nonce = this.nonce();
    this.write(this.def.markLine(nonce) + '\r');
    return this.waitMark(nonce, timeoutMs, '(Markierung)');
  }

  private nonce(): string {
    this.counter++;
    return `K${this.counter}x${Date.now() % 100000}`;
  }

  private waitMark(nonce: string, timeoutMs: number, what: string): Promise<number> {
    return waitForMark(this.ws, nonce, timeoutMs, () => this.exited, () => `${what} in ${this.def.id}`, () =>
      visibleText(this.output),
    );
  }

  /** Wartet, bis die gespeicherte Claude-Zuordnung die Bedingung erfuellt. */
  async waitForClaudeLink(
    ok: (link: PersistedClaudeLink | undefined) => boolean,
    timeoutMs = 20000,
  ): Promise<PersistedClaudeLink | undefined> {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      const link = this.claudeLink();
      if (ok(link)) return link;
      await sleep(50);
    }
    throw new Error(
      `Claude-Zuordnung kam nicht wie erwartet in ${this.def.id}; zuletzt: ${JSON.stringify(this.claudeLink())}. Ausgabe:\n` +
        visibleText(this.output).slice(-3000),
    );
  }

  write(data: string): void {
    this.core.writeToTab(this.tabId, data);
  }

  /** Wartet, bis der gespeicherte zuletzt aktive Ordner `dir` ist. */
  async waitForCwd(dir: string, timeoutMs = 20000): Promise<void> {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      if (this.lastCwd() === dir) return;
      if (this.exited) break;
      await sleep(50);
    }
    throw new Error(
      `Ordner ${dir} wurde nicht gemeldet in ${this.def.id}; zuletzt: ${this.lastCwd()}. Ausgabe:\n` +
        visibleText(this.output).slice(-3000),
    );
  }

  /**
   * Wartet auf sichtbaren Text. ConPTY reicht die Ordner-Meldung sofort durch, den Text des Prompts
   * zeichnet es oft erst etwas spaeter.
   */
  async waitForVisible(re: RegExp, timeoutMs = 15000): Promise<void> {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      if (re.test(visibleText(this.output))) return;
      await sleep(50);
    }
    throw new Error(`Ausgabe ${re} kam nicht in ${this.def.id}. Ausgabe:\n${visibleText(this.output).slice(-3000)}`);
  }

  /** Wie `waitForVisible`, aber nur fuer Ausgabe nach der Stelle `offset` der rohen Ausgabe. */
  async waitForVisibleAfter(offset: number, re: RegExp, timeoutMs = 15000): Promise<void> {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      if (re.test(visibleText(this.output.slice(offset)))) return;
      await sleep(50);
    }
    throw new Error(`Ausgabe ${re} kam nicht in ${this.def.id}. Ausgabe:\n${visibleText(this.output).slice(-3000)}`);
  }

  /**
   * Beendet die Shell mit `exit` und den Kern geordnet, wie beim Beenden von THub, danach die lokale
   * Schnittstelle. Mit `typeExit = false` wird nichts getippt (etwa wenn das Testprofil den PSReadLine-Verlauf
   * nicht abschalten konnte); das Terminal-Backend beendet die Shell dann hart.
   */
  async shutdown(typeExit = true): Promise<void> {
    // Schon beendet (etwa in einem Test vor dem Neustart): Nach dem Beenden meldet der Kern kein Ende der Shell mehr.
    if (this.stopped) return;
    this.stopped = true;
    if (!this.exited && typeExit) {
      this.write('exit\r');
      const soft = Date.now() + 5000;
      while (!this.exited && Date.now() < soft) await sleep(50);
    }
    await this.core.shutdown();
    if (this.api && !this.apiClosed) {
      this.apiClosed = true;
      await this.api.server.close();
    }
  }
}

/**
 * Ob eine Gruppenrichtlinie die Execution Policy festlegt (MachinePolicy oder UserPolicy). Dann wirkt eine
 * Richtlinie im Prozessbereich (PSExecutionPolicyPreference) nicht. Ohne PSModulePath: Laeuft der Test aus
 * PowerShell 7, stehen dort dessen Module, und Windows PowerShell koennte Get-ExecutionPolicy nicht laden.
 */
export function executionPolicyFromGroupPolicy(): boolean {
  const out = execFileSync(
    POWERSHELL_EXE,
    ['-NoProfile', '-NonInteractive', '-Command', 'Get-ExecutionPolicy -Scope MachinePolicy; Get-ExecutionPolicy -Scope UserPolicy'],
    { encoding: 'utf8', env: windowsPowerShellEnv() },
  );
  return out.split(/\r?\n/).some((line) => line.trim() !== '' && line.trim() !== 'Undefined');
}

/**
 * Der sichtbare Text einer rohen Ausgabe: vollstaendige Escape-Sequenzen (OSC mit BEL oder ESC \, CSI,
 * kurze ESC-Sequenzen) entfernt. Bleibt dabei ein ESC oder BEL uebrig, waere eine Sequenz kaputt und als
 * Text sichtbar.
 */
export function visibleText(raw: string): string {
  return raw
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b[ -/]*[0-~]/g, '');
}

function stripEscapes(s: string): string {
  return s.replace(/\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g, '').replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '');
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
