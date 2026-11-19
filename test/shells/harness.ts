// Werkzeuge fuer die Shell-Integrationstests (Teststelle 2): nachgemachtes claude, aufzeichnende
// Testattrappe der lokalen Schnittstelle und echte Shells ueber node-pty (ConPTY).
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo, Socket } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import * as pty from 'node-pty';

export const REPO = path.resolve(__dirname, '..', '..');
const SYSTEM_ROOT = process.env.SystemRoot ?? 'C:\\Windows';
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
  const root = mkdtempSync(path.join(os.tmpdir(), `termhub-shells-${shell}-`));
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
  const hookFile = path.join(hookDir, 'termhub-hooks.json');
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
    env: { ...process.env, TH_KILL_ROOT: root },
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

export class FakeTermHub {
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
        this.requests.push({ path: req.url ?? '', token: req.headers['x-termhub-token'] as string | undefined, body, at: Date.now() });
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

const psMark = (nonce: string) => `Set-Content -LiteralPath $env:TH_MARK -Value ('${nonce} ' + [int]$LASTEXITCODE)`;
const psStart = (args: string) =>
  `& "$env:SystemRoot\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -NoProfile -NoLogo -ExecutionPolicy Bypass -File $env:TERMHUB_STARTER ${args}`;

export const SHELLS: Record<ShellId, ShellDef> = {
  pwsh: {
    id: 'pwsh',
    exe: findPwsh(),
    markSuffix: (n) => `; ${psMark(n)}`,
    markLine: psMark,
    startCommand: psStart,
  },
  powershell: {
    id: 'powershell',
    exe: existsSync(POWERSHELL_EXE) ? POWERSHELL_EXE : null,
    markSuffix: (n) => `; ${psMark(n)}`,
    markLine: psMark,
    startCommand: psStart,
  },
  cmd: {
    id: 'cmd',
    exe: path.join(SYSTEM_ROOT, 'System32', 'cmd.exe'),
    // %^ERRORLEVEL% ueberlebt die erste Auswertung, `call` wertet es nach dem Befehl aus.
    markSuffix: (n) => ` & (call echo ${n} %^ERRORLEVEL%)> "%TH_MARK%"`,
    markLine: (n) => `(call echo ${n} %^ERRORLEVEL%)> "%TH_MARK%"`,
    startCommand: (args) =>
      `"%SystemRoot%\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -NoProfile -NoLogo -ExecutionPolicy Bypass -File "%TERMHUB_STARTER%" ${args}`,
  },
  gitbash: {
    id: 'gitbash',
    exe: findGitBash(),
    markSuffix: (n) => `; echo "${n} $?" > "$TH_MARK"`,
    markLine: (n) => `echo "${n} $?" > "$TH_MARK"`,
    startCommand: (args) => `__termhub_starter ${args}`,
  },
};

// ---------------------------------------------------------------------------------------------
// Start einer Shell mit Integration (Referenz fuer TermHubs Terminal-Backend)

export interface LaunchOptions {
  /** Ordner im PATH vor den Systemordnern (z.B. das nachgemachte claude); null = keiner */
  claudeDir: string | null;
  api: string | null;
  token: string;
  tabId: string;
  /** Startbefehl, bereits fuer die Shell formuliert (SHELLS[x].startCommand) */
  startCommand?: string;
}

export interface Launch {
  file: string;
  args: string[] | string;
  env: Record<string, string>;
}

export function buildLaunch(def: ShellDef, ws: Workspace, opts: LaunchOptions): Launch {
  if (!def.exe) throw new Error(`${def.id} ist nicht installiert`);

  // Umgebung ausdruecklich setzen: geerbte TERMHUB_*-Variablen und npm-/Node-Interna entfernen.
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v === undefined) continue;
    if (/^(TERMHUB_|npm_|NODE_|VITEST|ELECTRON_)/i.test(k)) continue;
    env[k] = v;
  }
  // PATH ohne die Ordner des Nutzers: so wird nie ein echtes claude gefunden.
  const sysPath = [
    path.join(SYSTEM_ROOT, 'System32'),
    SYSTEM_ROOT,
    path.join(SYSTEM_ROOT, 'System32', 'Wbem'),
    path.join(SYSTEM_ROOT, 'System32', 'WindowsPowerShell', 'v1.0'),
  ];
  delete env.Path;
  env.PATH = [...(opts.claudeDir ? [opts.claudeDir] : []), ...sysPath].join(';');
  env.HOME = ws.home;
  env.NO_PROXY = [env.NO_PROXY, '127.0.0.1', 'localhost'].filter(Boolean).join(',');
  env.TERMHUB_TAB_ID = opts.tabId;
  env.TERMHUB_TOKEN = opts.token;
  if (opts.api) env.TERMHUB_API = opts.api;
  env.TERMHUB_STARTER = ws.starter;
  env.STUB_OUT = ws.stubOut;
  env.STUB_CONFIG = ws.stubConfig;
  env.TH_MARK = ws.mark;
  env.TH_PROFILE_LOADED = ws.profileLoaded;

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
        ].join('\r\n'),
      );
      env.TERMHUB_TEST_PROFILE = profile;
      if (opts.startCommand) env.TERMHUB_START_CMD = opts.startCommand;
      const code = readFileSync(path.join(ws.shellDir, 'integration.ps1'), 'utf8');
      const encoded = Buffer.from(code, 'utf16le').toString('base64');
      return { file: def.exe, args: ['-NoLogo', '-NoProfile', '-NoExit', '-EncodedCommand', encoded], env };
    }
    case 'cmd': {
      env.PROMPT = 'TH-PROMPT$G ';
      const init = path.join(ws.shellDir, 'integration.cmd');
      const line = opts.startCommand ? `"${init}" & ${opts.startCommand}` : `"${init}"`;
      return { file: def.exe, args: `/s /k "${line}"`, env };
    }
    case 'gitbash': {
      writeFileSync(
        path.join(ws.home, '.bashrc'),
        ['# Testprofil', 'echo ja > "$TH_PROFILE_LOADED"', "PS1='TH-PROMPT> '", 'HISTFILE=/dev/null', ''].join('\n'),
      );
      writeFileSync(path.join(ws.home, '.bash_profile'), 'test -f ~/.bashrc && . ~/.bashrc\n');
      if (opts.startCommand) env.TERMHUB_START_CMD = opts.startCommand;
      const rc = path.join(ws.shellDir, 'integration.bash').replace(/\\/g, '/');
      return { file: def.exe, args: ['--rcfile', rc, '-i'], env };
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Laufende Shell

export class ShellSession {
  output = '';
  exited = false;
  private counter = 0;

  private constructor(
    readonly def: ShellDef,
    readonly ws: Workspace,
    private readonly proc: pty.IPty,
  ) {
    proc.onData((d) => {
      this.output += d;
    });
    proc.onExit(() => {
      this.exited = true;
    });
  }

  static async start(def: ShellDef, ws: Workspace, opts: LaunchOptions): Promise<ShellSession> {
    const launch = buildLaunch(def, ws, opts);
    const proc = pty.spawn(launch.file, launch.args, {
      name: 'xterm-256color',
      cols: 200,
      rows: 50,
      cwd: ws.root,
      env: launch.env,
      useConpty: true,
    });
    const s = new ShellSession(def, ws, proc);
    // Bereit, sobald eine Markierungszeile ausgefuehrt wurde.
    await s.mark(30000);
    return s;
  }

  get pid(): number {
    return this.proc.pid;
  }

  write(data: string): void {
    this.proc.write(data);
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

  private async waitMark(nonce: string, timeoutMs: number, what: string): Promise<number> {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      if (this.exited) throw new Error(`${this.def.id} hat sich beendet. Ausgabe:\n${this.plainOutput()}`);
      if (existsSync(this.ws.mark)) {
        let text = '';
        try {
          text = readFileSync(this.ws.mark, 'utf8').replace(/^\uFEFF/, '').trim();
        } catch {
          // wird gerade geschrieben
        }
        const m = new RegExp(`^${nonce} (-?\\d+)`).exec(text);
        if (m) return Number(m[1]);
      }
      await sleep(50);
    }
    throw new Error(`Zeitlimit fuer ${what} in ${this.def.id}. Ausgabe:\n${this.plainOutput().slice(-3000)}`);
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

  /** Beendet die Shell zuerst mit `exit`, erst danach hart (node-pty kill). */
  async close(): Promise<void> {
    if (!this.exited) {
      this.write('exit\r');
      const soft = Date.now() + 3000;
      while (!this.exited && Date.now() < soft) await sleep(50);
    }
    if (!this.exited) {
      try {
        this.proc.kill();
      } catch {
        // schon beendet
      }
      const hard = Date.now() + 5000;
      while (!this.exited && Date.now() < hard) await sleep(50);
    }
  }
}

function stripEscapes(s: string): string {
  return s.replace(/\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g, '').replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '');
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
