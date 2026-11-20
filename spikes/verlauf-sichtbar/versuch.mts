// Spike zu Ticket 21: Steht der wiederhergestellte Verlauf mit conptyInheritCursor direkt über dem
// neuen Prompt, und bleibt er beim Verkleinern und Vergrössern heil?
//
// Aufbau wie in THub: Ein xterm.js (dasselbe Paket wie im Renderer, ohne Bildschirm) bekommt zuerst den
// Verlauf, danach startet die echte Shell über node-pty/ConPTY. Die Antwort auf die Cursor-Abfrage
// (DSR, ESC[6n) liefert xterm.js über onData, wie im Renderer über den normalen Eingabeweg.
//
// Aufruf: node versuch.mts [pwsh|powershell|cmd|gitbash ...] [--szenario=<Name>]
// Ergebnisse: ergebnisse/<shell>.txt (Bildschirm nach jedem Schritt) und Zusammenfassung auf stdout.
// Die echten Profile des Nutzers werden nie geladen; getippte Befehle landen in keinem Verlauf.

import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { dimmed, restoredHistory, separator } from '../../src/renderer/terminal/history.ts';

const require = createRequire(import.meta.url);
const pty = require('node-pty') as typeof import('node-pty');
const { Terminal } = require('@xterm/xterm') as typeof import('@xterm/xterm');
type Term = InstanceType<typeof Terminal>;

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const OUT = path.join(HERE, 'ergebnisse');
const SYSTEM_ROOT = process.env.SystemRoot ?? 'C:\\Windows';
const SAVED_AT = new Date(2026, 10, 19, 17, 42).getTime();

// ---------------------------------------------------------------------------------------------
// Shells

type ShellId = 'pwsh' | 'powershell' | 'cmd' | 'gitbash';

function findOnPath(name: string): string | null {
  for (const dir of (process.env.PATH ?? '').split(';')) {
    if (!dir) continue;
    const p = path.join(dir, name);
    try {
      lstatSync(p);
      return p;
    } catch {
      // weiter
    }
  }
  return null;
}

const PS_ARGS = ['-NoLogo', '-NoProfile', '-NoExit', '-Command', 'Set-PSReadLineOption -HistorySaveStyle SaveNothing'];

interface ShellDef {
  file: string | null;
  args: string[];
  prompt: RegExp;
}

const SHELLS: Record<ShellId, ShellDef> = {
  pwsh: {
    file: existsSync('C:\\Program Files\\PowerShell\\7\\pwsh.exe')
      ? 'C:\\Program Files\\PowerShell\\7\\pwsh.exe'
      : findOnPath('pwsh.exe'),
    args: PS_ARGS,
    prompt: /PS [^>]*> ?$/,
  },
  powershell: {
    file: path.join(SYSTEM_ROOT, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    args: PS_ARGS,
    prompt: /PS [^>]*> ?$/,
  },
  cmd: { file: path.join(SYSTEM_ROOT, 'System32', 'cmd.exe'), args: [], prompt: /[A-Z]:\\[^>]*>$/ },
  gitbash: {
    file: existsSync('C:\\Program Files\\Git\\bin\\bash.exe') ? 'C:\\Program Files\\Git\\bin\\bash.exe' : null,
    args: ['--login', '-i'],
    prompt: /\$ ?$/,
  },
};

/** Arbeitsordner mit eigenem HOME, damit weder Profil noch Verlauf des Nutzers berührt werden. */
const WORK = mkdtempSync(path.join(os.tmpdir(), 'thub-verlauf-sichtbar-'));
const HOME = path.join(WORK, 'home');
mkdirSync(HOME);
writeFileSync(path.join(HOME, '.bashrc'), 'HISTFILE=/dev/null\n[ -n "$TH_VERLAUF" ] && cat "$TH_VERLAUF"\n');
writeFileSync(path.join(HOME, '.bash_profile'), 'test -f ~/.bashrc && . ~/.bashrc\n');

function shellEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v === undefined || /^(npm_|ELECTRON_|THUB_|TERMHUB_|NODE_)/i.test(k)) continue;
    env[k] = v;
  }
  env.HOME = HOME;
  return env;
}

// ---------------------------------------------------------------------------------------------
// Verlauf

const SHORT_HISTORY = [
  'PS C:\\Projekte\\demo> git status',
  'On branch main',
  "Your branch is up to date with 'origin/main'.",
  '\x1b[32mnothing to commit, working tree clean\x1b[0m',
  'PS C:\\Projekte\\demo> echo "eine lange Zeile, die bei 60 Spalten umbrechen muss, damit man das Umbrechen sieht"',
  'eine lange Zeile, die bei 60 Spalten umbrechen muss, damit man das Umbrechen sieht',
  'PS C:\\Projekte\\demo> ',
];

const LONG_HISTORY = Array.from({ length: 80 }, (_, i) => `Verlaufszeile ${String(i + 1).padStart(2, '0')} \x1b[33mgelb\x1b[0m Ende`);

function plain(line: string): string {
  return line.replace(/\x1b\[[0-9;]*m/g, '').trimEnd();
}

/** Heute: Verlauf, Trennlinie und so viele Leerzeilen, dass alles im Scrollback liegt. */
function legacyPreface(history: string[], cols: number, rows: number): string {
  return restoredHistory(history.join('\r\n'), SAVED_AT, cols, rows);
}

/** Neu: Verlauf und Trennlinie im sichtbaren Bereich, der Cursor am Anfang der Zeile darunter. */
function inheritPreface(history: string[], cols: number): string {
  return `${dimmed(history.join('\r\n'))}\r\n${separator(SAVED_AT, cols)}\r\n`;
}

/**
 * Gegenprobe: Die Shell gibt den Verlauf beim Start selbst aus (ohne inheritCursor, ohne Leerzeilen).
 * Dann kennt ConPTY die Zeilen und zeichnet sie beim Ändern der Grösse selbst neu.
 */
function printingLaunch(shell: ShellId, history: string[], cols: number): Launch {
  const file = path.join(WORK, `verlauf-${shell}.txt`);
  writeFileSync(file, inheritPreface(history, cols), 'utf8');
  const env = { TH_VERLAUF: file };
  switch (shell) {
    case 'pwsh':
    case 'powershell':
      return {
        args: [
          ...PS_ARGS.slice(0, -1),
          `${PS_ARGS.at(-1)}; $e = [Console]::OutputEncoding; [Console]::OutputEncoding = [Text.Encoding]::UTF8; ` +
            `[Console]::Write([IO.File]::ReadAllText($env:TH_VERLAUF)); [Console]::OutputEncoding = $e`,
        ],
        env,
      };
    case 'cmd':
      return { args: '/k chcp 65001 >nul & type "%TH_VERLAUF%"', env };
    case 'gitbash':
      return { args: SHELLS.gitbash.args, env };
  }
}

// ---------------------------------------------------------------------------------------------
// Terminal-Abbild und Shell

type DsrMode = 'answer' | 'never' | number;

interface Launch {
  args: string[] | string;
  env?: Record<string, string>;
}

interface Snapshot {
  label: string;
  cols: number;
  rows: number;
  baseY: number;
  cursorX: number;
  cursorY: number;
  /** Alle Zeilen des Puffers (Scrollback + sichtbar), wie angezeigt */
  lines: string[];
  /** Pro Pufferzeile: erstes sichtbares Zeichen ausgegraut (SGR 2)? */
  dim: boolean[];
  /** Logische Zeilen: umgebrochene Zeilen zusammengesetzt, mit Index der ersten Pufferzeile */
  logical: { text: string; row: number }[];
}

function write(term: Term, data: string): Promise<void> {
  return new Promise((resolve) => term.write(data, resolve));
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

class Session {
  readonly term: Term;
  proc!: import('node-pty').IPty;
  raw = '';
  spawnAt = 0;
  dsrRequests: number[] = [];
  dsrAnswers: { at: number; answer: string }[] = [];
  lastOutputAt = 0;
  exited = false;
  log: string[] = [];

  readonly shellId: ShellId;
  readonly cols: number;
  readonly rows: number;

  constructor(shellId: ShellId, cols: number, rows: number, reflow = true) {
    this.shellId = shellId;
    this.cols = cols;
    this.rows = rows;
    this.term = new Terminal({
      cols,
      rows,
      scrollback: 5000,
      // Wie im Renderer. Mit einer Build-Nummer unter 21376 schaltet xterm.js das Umbrechen beim
      // Ändern der Breite (Reflow) ab, wie für alte ConPTY-Versionen.
      windowsPty: reflow ? { backend: 'conpty' } : { backend: 'conpty', buildNumber: 19041 },
      allowProposedApi: true,
    });
  }

  async start(preface: string, inherit: boolean, dsr: DsrMode, launch?: Launch): Promise<void> {
    await write(this.term, preface);
    this.term.onData((data) => {
      const isCpr = /^\x1b\[\d+;\d+R$/.test(data);
      if (isCpr) {
        if (dsr === 'never') return;
        const send = () => {
          this.dsrAnswers.push({ at: Date.now() - this.spawnAt, answer: JSON.stringify(data) });
          this.proc.write(data);
        };
        if (typeof dsr === 'number') setTimeout(send, dsr);
        else send();
        return;
      }
      this.proc.write(data);
    });
    const def = SHELLS[this.shellId];
    this.spawnAt = Date.now();
    this.proc = pty.spawn(def.file!, launch?.args ?? def.args, {
      name: 'xterm-256color',
      cols: this.cols,
      rows: this.rows,
      cwd: WORK,
      env: { ...shellEnv(), ...launch?.env },
      useConpty: true,
      conptyInheritCursor: inherit,
    });
    this.proc.onData((d) => {
      const at = Date.now() - this.spawnAt;
      if (d.includes('\x1b[6n')) this.dsrRequests.push(at);
      this.raw += d;
      this.lastOutputAt = Date.now();
      this.log.push(`+${at}ms ${JSON.stringify(d).slice(0, 400)}`);
      this.term.write(d);
    });
    this.proc.onExit(() => {
      this.exited = true;
    });
  }

  /** Wartet, bis die Shell so lange nichts mehr ausgegeben hat (und xterm.js alles verarbeitet hat). */
  async settle(quietMs = 1200, maxMs = 30000): Promise<void> {
    const end = Date.now() + maxMs;
    await sleep(100);
    while (Date.now() < end) {
      if (this.lastOutputAt && Date.now() - this.lastOutputAt >= quietMs) break;
      await sleep(50);
    }
    await write(this.term, '');
  }

  /** Zeit ab dem Start, bis die Cursorzeile wie ein Prompt aussieht. */
  async waitForPrompt(maxMs = 30000): Promise<number | null> {
    const def = SHELLS[this.shellId];
    const end = Date.now() + maxMs;
    while (Date.now() < end) {
      await write(this.term, '');
      const b = this.term.buffer.active;
      const line = b.getLine(b.baseY + b.cursorY)?.translateToString(true) ?? '';
      if (def.prompt.test(line)) return Date.now() - this.spawnAt;
      await sleep(25);
    }
    return null;
  }

  async resize(cols: number, rows: number): Promise<void> {
    // Wie im Renderer: zuerst xterm.js (fit), dann über onResize die Shell.
    this.term.resize(cols, rows);
    this.proc.resize(cols, rows);
    await this.settle(900, 10000);
  }

  async type(text: string): Promise<void> {
    this.proc.write(text);
    await this.settle(1200, 15000);
  }

  snapshot(label: string): Snapshot {
    const b = this.term.buffer.normal;
    const lines: string[] = [];
    const dim: boolean[] = [];
    const logical: { text: string; row: number }[] = [];
    for (let i = 0; i < b.length; i++) {
      const line = b.getLine(i)!;
      const text = line.translateToString(true);
      lines.push(text);
      let firstDim = false;
      for (let x = 0; x < line.length; x++) {
        const cell = line.getCell(x);
        if (cell && cell.getChars().trim()) {
          firstDim = cell.isDim() !== 0;
          break;
        }
      }
      dim.push(firstDim);
      if (line.isWrapped && logical.length > 0) logical[logical.length - 1].text += text;
      else logical.push({ text, row: i });
    }
    return {
      label,
      cols: this.term.cols,
      rows: this.term.rows,
      baseY: b.baseY,
      cursorX: b.cursorX,
      cursorY: b.cursorY,
      lines,
      dim,
      logical,
    };
  }

  async close(): Promise<void> {
    // Zuerst sanft, sonst meldet node-pty beim harten Beenden "AttachConsole failed".
    this.proc.write('exit\r');
    const soft = Date.now() + 3000;
    while (!this.exited && Date.now() < soft) await sleep(50);
    try {
      if (!this.exited) this.proc.kill();
    } catch {
      // schon weg
    }
    const end = Date.now() + 5000;
    while (!this.exited && Date.now() < end) await sleep(50);
    this.term.dispose();
  }
}

// ---------------------------------------------------------------------------------------------
// Auswertung

interface Check {
  label: string;
  /** Jede Verlaufszeile kommt genau einmal vor, in der richtigen Reihenfolge */
  historyIntact: boolean;
  missing: string[];
  duplicated: string[];
  separators: number;
  /** Trennlinie im sichtbaren Bereich */
  separatorVisible: boolean;
  /** Letzte Verlaufszeile im sichtbaren Bereich */
  lastHistoryVisible: boolean;
  /** Zeilen zwischen Trennlinie und Cursorzeile (0 = Prompt direkt darunter) */
  gapToCursor: number | null;
  cursorLine: string;
  /** Alle Verlaufszeilen vor der Trennlinie ausgegraut */
  dimmed: boolean;
  /** Wie oft die getippte Befehlszeile bzw. ihre Ausgabe im Puffer steht (nach dem Befehl je 1) */
  commandLines: number;
  outputLines: number;
}

function check(s: Snapshot, history: string[]): Check {
  const texts = s.logical.map((l) => l.text.trimEnd());
  const wanted = history.map(plain).filter((t) => t.trim() !== '');
  const missing: string[] = [];
  const duplicated: string[] = [];
  let pos = -1;
  let ordered = true;
  // Prompt-Zeilen ("PS ...> ") können auch in der neuen Ausgabe stehen: nur vor der Trennlinie zählen.
  const sepIndex = texts.findIndex((t) => t.includes('Wiederhergestellt'));
  const before = sepIndex >= 0 ? texts.slice(0, sepIndex) : texts;
  for (const w of wanted) {
    const hits = before.flatMap((t, i) => (t === w ? [i] : []));
    if (hits.length === 0) missing.push(w);
    // Gleiche Zeilen im Verlauf selbst (z.B. zweimal derselbe Prompt) sind keine Doppelten.
    const expected = wanted.filter((x) => x === w).length;
    if (hits.length > expected && !duplicated.includes(w)) duplicated.push(w);
    const next = hits.find((h) => h > pos);
    if (next === undefined) ordered = false;
    else pos = next;
  }
  const separators = texts.filter((t) => t.includes('Wiederhergestellt')).length;
  const sepRow = sepIndex >= 0 ? s.logical[sepIndex].row : -1;
  const viewTop = s.baseY;
  const cursorRow = s.baseY + s.cursorY;
  const lastWanted = wanted[wanted.length - 1];
  const lastIdx = before.lastIndexOf(lastWanted);
  const lastRow = lastIdx >= 0 ? s.logical[lastIdx].row : -1;
  // Zeilen nach der Trennlinie (auch umgebrochene) bis zur Cursorzeile
  let sepEnd = sepRow;
  while (sepEnd >= 0 && sepEnd + 1 < s.lines.length && sepIndex + 1 < s.logical.length && sepEnd + 1 < s.logical[sepIndex + 1].row) sepEnd++;
  return {
    label: s.label,
    historyIntact: missing.length === 0 && duplicated.length === 0 && ordered,
    missing,
    duplicated,
    separators,
    separatorVisible: sepRow >= viewTop,
    lastHistoryVisible: lastRow >= viewTop,
    gapToCursor: sepRow >= 0 ? cursorRow - sepEnd - 1 : null,
    cursorLine: s.lines[cursorRow] ?? '',
    dimmed: before.every((t, i) => !wanted.includes(t) || s.dim[s.logical[i].row]),
    commandLines: texts.filter((t) => t.endsWith('echo hallo-nach-resize')).length,
    outputLines: texts.filter((t) => t === 'hallo-nach-resize').length,
  };
}

function render(s: Snapshot): string {
  const out: string[] = [];
  out.push(`=== ${s.label}  (${s.cols}x${s.rows}, baseY=${s.baseY}, Cursor ${s.cursorX},${s.cursorY}, Pufferzeilen ${s.lines.length})`);
  const from = Math.max(0, s.baseY - 3);
  for (let i = from; i < s.baseY + s.rows && i < s.lines.length; i++) {
    const mark = i === s.baseY + s.cursorY ? '>' : i < s.baseY ? '^' : ' ';
    out.push(`${mark}${String(i - s.baseY).padStart(3)}|${s.lines[i]}`);
  }
  return out.join('\n');
}

// ---------------------------------------------------------------------------------------------
// Szenarien

const RESIZES: [number, number][] = [
  [60, 24], // schmaler
  [100, 24], // wieder breit
  [100, 12], // niedriger
  [100, 24], // wieder hoch
  [140, 40], // grösser in beide Richtungen
  [50, 10], // viel kleiner
  [100, 24], // zurück
  [70, 30], // schmaler und höher
  [100, 24], // zurück
];

interface Result {
  shell: ShellId;
  scenario: string;
  promptMs: number | null;
  dsrRequests: number[];
  dsrAnswers: { at: number; answer: string }[];
  checks: Check[];
}

const report: string[] = [];

function record(s: Session, label: string, history: string[], checks: Check[]): void {
  const snap = s.snapshot(label);
  checks.push(check(snap, history));
  report.push(render(snap));
}

async function scenario(
  shell: ShellId,
  name: string,
  opts: { inherit: boolean; history: string[]; dsr?: DsrMode; resizes?: boolean; cols?: number; rows?: number; reflow?: boolean; printing?: boolean },
): Promise<Result> {
  const cols = opts.cols ?? 100;
  const rows = opts.rows ?? 24;
  const s = new Session(shell, cols, rows, opts.reflow ?? true);
  const checks: Check[] = [];
  report.push(`\n\n########## ${shell} · ${name}`);
  const preface = opts.printing ? '' : opts.inherit ? inheritPreface(opts.history, cols) : legacyPreface(opts.history, cols, rows);
  const launch = opts.printing ? printingLaunch(shell, opts.history, cols) : undefined;
  await s.start(preface, opts.inherit, opts.dsr ?? 'answer', launch);
  const promptMs = await s.waitForPrompt(opts.dsr === 'never' ? 60000 : 30000);
  await s.settle();
  record(s, 'nach dem Start', opts.history, checks);
  if (opts.resizes) {
    for (const [c, r] of RESIZES) {
      await s.resize(c, r);
      record(s, `nach Grösse ${c}x${r}`, opts.history, checks);
    }
    await s.type('echo hallo-nach-resize\r');
    record(s, 'nach einem Befehl', opts.history, checks);
    await s.resize(60, 12);
    await s.resize(100, 24);
    record(s, 'Befehl, dann 60x12 und zurück', opts.history, checks);
  }
  report.push(`--- Rohausgabe (Anfang)\n${s.log.join('\n')}`);
  await s.close();
  return { shell, scenario: name, promptMs, dsrRequests: s.dsrRequests, dsrAnswers: s.dsrAnswers, checks };
}

function summarize(r: Result): string {
  const lines = [`${r.shell} · ${r.scenario}: Prompt nach ${r.promptMs ?? 'nie'} ms, DSR-Anfragen ${JSON.stringify(r.dsrRequests)}, Antworten ${JSON.stringify(r.dsrAnswers)}`];
  for (const c of r.checks) {
    const flags = [
      c.historyIntact ? 'Verlauf heil' : `Verlauf KAPUTT (fehlt ${c.missing.length}, doppelt ${c.duplicated.length})`,
      `Trennlinien ${c.separators}`,
      c.separatorVisible ? 'Trennlinie sichtbar' : 'Trennlinie im Scrollback',
      c.lastHistoryVisible ? 'Verlaufsende sichtbar' : 'Verlaufsende im Scrollback',
      `Abstand Trennlinie→Cursor ${c.gapToCursor}`,
      `Cursorzeile ${JSON.stringify(c.cursorLine.slice(0, 40))}`,
      c.dimmed ? 'grau' : 'NICHT grau',
      `Befehl ${c.commandLines}x, Ausgabe ${c.outputLines}x`,
    ];
    lines.push(`   ${c.label.padEnd(30)} ${flags.join(' | ')}`);
    if (c.missing.length) lines.push(`      fehlt: ${c.missing.slice(0, 3).map((m) => JSON.stringify(m.slice(0, 50))).join(', ')}`);
    if (c.duplicated.length) lines.push(`      doppelt: ${c.duplicated.slice(0, 3).map((m) => JSON.stringify(m.slice(0, 50))).join(', ')}`);
  }
  return lines.join('\n');
}

const SCENARIOS: Record<string, (shell: ShellId) => Promise<Result>> = {
  'heute-kurz': (sh) => scenario(sh, 'heute (Leerzeilen, ohne inheritCursor), kurzer Verlauf', { inherit: false, history: SHORT_HISTORY, resizes: true }),
  'neu-kurz': (sh) => scenario(sh, 'inheritCursor, kurzer Verlauf', { inherit: true, history: SHORT_HISTORY, resizes: true }),
  'neu-lang': (sh) => scenario(sh, 'inheritCursor, langer Verlauf (80 Zeilen)', { inherit: true, history: LONG_HISTORY, resizes: true }),
  'neu-kurz-ohne-reflow': (sh) => scenario(sh, 'inheritCursor ohne Reflow in xterm.js, kurzer Verlauf', { inherit: true, history: SHORT_HISTORY, resizes: true, reflow: false }),
  'neu-lang-ohne-reflow': (sh) => scenario(sh, 'inheritCursor ohne Reflow in xterm.js, langer Verlauf', { inherit: true, history: LONG_HISTORY, resizes: true, reflow: false }),
  'shell-gibt-aus': (sh) => scenario(sh, 'Gegenprobe: Shell gibt den Verlauf selbst aus (ohne inheritCursor)', { inherit: false, history: SHORT_HISTORY, resizes: true, printing: true }),
  'neu-dsr-spaet': (sh) => scenario(sh, 'inheritCursor, Antwort 1500 ms zu spät', { inherit: true, history: SHORT_HISTORY, dsr: 1500 }),
  'neu-dsr-nie': (sh) => scenario(sh, 'inheritCursor, Antwort bleibt aus', { inherit: true, history: SHORT_HISTORY, dsr: 'never' }),
};

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const only = args.find((a) => a.startsWith('--szenario='))?.slice('--szenario='.length);
  const shells = (args.filter((a) => !a.startsWith('--')) as ShellId[]).filter((s) => s in SHELLS);
  const selected = shells.length ? shells : (Object.keys(SHELLS) as ShellId[]);
  mkdirSync(OUT, { recursive: true });
  const windows = execFileSync(path.join(SYSTEM_ROOT, 'System32', 'cmd.exe'), ['/c', 'ver'], { encoding: 'utf8' }).trim();
  console.log(`${windows}, node-pty ${require('node-pty/package.json').version}, xterm.js ${require('@xterm/xterm/package.json').version}`);
  for (const shell of selected) {
    if (!SHELLS[shell].file) {
      console.log(`${shell}: nicht installiert, übersprungen`);
      continue;
    }
    report.length = 0;
    const results: Result[] = [];
    for (const [key, run] of Object.entries(SCENARIOS)) {
      if (only && key !== only) continue;
      results.push(await run(shell));
    }
    const summary = anonymize(results.map(summarize).join('\n'));
    console.log(summary);
    const file = path.join(OUT, `${shell}${only ? `-${only}` : ''}.txt`);
    writeFileSync(file, `${summary}\n${anonymize(report.join('\n'))}\n`);
  }
}

/** Benutzer- und Rechnername (auch als 8.3-Kurzname des Benutzerordners) kommen nicht in die Ergebnisse. */
function anonymize(text: string): string {
  const names: [string | undefined, string][] = [
    [os.userInfo().username, '<Benutzer>'],
    [/\\Users\\([^\\]+)\\/i.exec(os.tmpdir())?.[1], '<Benutzer>'],
    [os.hostname(), '<Rechner>'],
  ];
  let out = text;
  for (const [name, placeholder] of names) {
    if (name) out = out.replace(new RegExp(name.replace(/[.*+?^${}()|[\]\\~]/g, '\\$&'), 'gi'), placeholder);
  }
  return out;
}

try {
  await main();
} finally {
  for (let i = 0; i < 10; i++) {
    try {
      rmSync(WORK, { recursive: true, force: true });
      break;
    } catch {
      await sleep(500);
    }
  }
  // Eine Shell, die noch auf die Antwort zur Cursor-Abfrage wartet, hält node-pty offen.
  process.exit(0);
}
