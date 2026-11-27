// Messung zu Ticket 38: Statuszeile von Claude Code (Befehl `statusLine`) mit dem installierten Claude Code.
// Aufruf: node statuszeile.mjs <szenario> [form]
//   form <form>        Start ohne Prompt: Kommt das JSON der Statuszeile über curl.exe an? Ersetzt der Eintrag aus
//                      --settings die Statuszeile des Projekts? (0 Prompts)
//                      <form>: exec  = Exec-Form wie beim curl-Hook (command + args)
//                              bash  = eine Zeichenkette, wie sie Claude unter Windows über Git Bash ausführt
//                              ps    = dieselbe Zeichenkette mit "shell": "powershell"
//   haupt <form>       ein Prompt; Takt beim Start, nach der Antwort und im Leerlauf, Felder vor und nach der ersten
//                      Antwort (1 Prompt)
//   fortsetzen <form>  --resume der Session aus `haupt`: Kosten beim Start, nach einem Prompt und nach /clear
//                      (1 Prompt)
//   intervall <form>   refreshInterval 2 s, im Leerlauf (0 Prompts)
//   groesse            neue Grösse des Terminals: Schickt Claude die Statuszeile neu? (0 Prompts)
//   shells             ohne Claude: die Zeichenkette in Git Bash, Windows PowerShell und PowerShell 7
//   ohne               --settings ohne statusLine, Statuszeile des Projekts aktiv: Vergleich der Fläche unter dem
//                      Eingabefeld (0 Prompts)
//   nutzer             --settings ohne statusLine, ohne Projekteinstellungen: die Statuszeile des Nutzers erscheint
//                      (0 Prompts)
//   samples            redigiertes Beispiel und Zeitachsen aus den Rohdaten schreiben (ohne Claude)
//
// Aufbau wie die Messungen zu den Tickets 10 bis 13 und 37 (docs/spikes/claude-hooks.md): eigener HTTP-Empfänger auf
// 127.0.0.1, eigene Datei per --settings, claude in node-pty in einem Temp-Ordner, ohne die geerbten CLAUDE*- und
// THUB_*-Variablen, --model haiku. Die Einstellungen des Nutzers bleiben unverändert; die Statuszeile des Projekts
// steht in .claude/settings.local.json des Arbeitsordners (Temp). Jeder Lauf hat eine harte Zeitgrenze: Danach beendet
// das Skript den Prozessbaum des selbst gestarteten claude (taskkill /T über die eigene Prozess-ID) und sich selbst.
//
// Rohdaten (Zeitachsen, Terminalausgabe, Debug-Log) landen unter SPIKE_DIR (Standard: %TEMP%\thub-spike-statuszeile)
// und werden nicht eingecheckt; `samples` schreibt redigierte Beispiele nach samples/ und befunde-statuszeile.json.

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SPIKE_DIR = process.env.SPIKE_DIR || path.join(os.tmpdir(), 'thub-spike-statuszeile');
const RAW_DIR = path.join(SPIKE_DIR, 'raw');
/** Derselbe Arbeitsordner für alle Läufe: Claude fragt nur beim ersten Mal, ob es dem Ordner vertraut. */
const WS_DIR = path.join(SPIKE_DIR, 'ws');
const LIMIT_MS = Number(process.env.SPIKE_LIMIT_MS || 180_000);
const CURL = 'C:\\Windows\\System32\\curl.exe';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Zeitachse und Empfänger ----------

class Timeline {
  constructor(file) {
    this.t0 = Date.now();
    this.file = file;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '');
  }
  now() {
    return Date.now() - this.t0;
  }
  add(entry) {
    const e = { t: this.now(), ...entry };
    fs.appendFileSync(this.file, JSON.stringify(e) + '\n');
    return e;
  }
  step(msg) {
    console.log(`[${(this.now() / 1000).toFixed(1)}s] ${msg}`);
    return this.add({ kind: 'step', msg });
  }
}

function short(e) {
  const b = e.body;
  if (e.path.startsWith('/statusline')) {
    if (!b || b._unparsed !== undefined) return `statusline ${e.path} (kein JSON: ${String(b?._unparsed).slice(0, 60)})`;
    const rl = b.rate_limits;
    const lim = rl
      ? Object.entries(rl)
          .map(([k, v]) => `${k}=${v?.used_percentage ?? v?.utilization}%`)
          .join(',')
      : 'keine';
    return `statusline ${e.path} model=${b.model?.display_name} cost=${b.cost?.total_cost_usd} limits=${lim} sid=${String(b.session_id ?? '-').slice(0, 8)}`;
  }
  return `${b?.hook_event_name ?? e.path} sid=${String(b?.session_id ?? '-').slice(0, 8)}${b?.source ? ` source=${b.source}` : ''}`;
}

function startServer(tl) {
  const events = [];
  const waiters = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      let json = null;
      try {
        json = body ? JSON.parse(body) : null;
      } catch {
        json = { _unparsed: body };
      }
      const e = tl.add({ kind: req.url.startsWith('/statusline') ? 'statusline' : 'hook', path: req.url, headers: req.headers, body: json });
      events.push(e);
      console.log(`[${(e.t / 1000).toFixed(1)}s]   <- ${short(e)}`);
      for (const w of [...waiters]) {
        if (w.pred(e)) {
          waiters.splice(waiters.indexOf(w), 1);
          w.resolve(e);
        }
      }
      // Leer wie THub: Claude zeigt dann keine Statuszeile.
      res.writeHead(200, { 'content-length': '0' });
      res.end();
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        base: `http://127.0.0.1:${port}`,
        events,
        waitFor(pred, timeoutMs, from = 0) {
          const hit = events.slice(from).find(pred);
          if (hit) return Promise.resolve(hit);
          return new Promise((res) => {
            const w = { pred, resolve: res };
            waiters.push(w);
            setTimeout(() => {
              const i = waiters.indexOf(w);
              if (i >= 0) {
                waiters.splice(i, 1);
                res(null);
              }
            }, timeoutMs);
          });
        },
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

const isHook = (name) => (e) => e.kind === 'hook' && e.body?.hook_event_name === name;
const isStatus = (e) => e.kind === 'statusline';

/** Argumente für curl.exe wie im curl-Hook von THub (`curlForward` in src/main/hookFile.ts). */
function curlArgs(url) {
  return [
    '-s', '-S', '--connect-timeout', '1', '-m', '2', '--noproxy', '*',
    '--variable', '%SPIKE_TAB_ID=', '--variable', '%SPIKE_TOKEN=',
    '--expand-header', 'X-Spike-Tab: {{SPIKE_TAB_ID}}',
    '--expand-header', 'X-Spike-Token: {{SPIKE_TOKEN}}',
    '-H', 'Content-Type: application/json',
    '--data-binary', '@-',
    url,
  ];
}

/** Dieselben Argumente als Zeichenkette für eine Shell (bash und PowerShell): einfache Anführungszeichen. */
function curlString(url) {
  const quote = (a) => (/^[A-Za-z0-9_%=:/.-]+$/.test(a) ? a : `'${a}'`);
  return ['C:/Windows/System32/curl.exe', ...curlArgs(url)].map(quote).join(' ');
}

function statusLineFor(form, base, extra = {}) {
  const url = `${base}/statusline/${form}`;
  if (form === 'exec') return { type: 'command', command: CURL, args: curlArgs(url), ...extra };
  if (form === 'bash') return { type: 'command', command: curlString(url), ...extra };
  if (form === 'ps') return { type: 'command', command: curlString(url), shell: 'powershell', ...extra };
  throw new Error('unbekannte Form ' + form);
}

function hookSettings(base, statusLine) {
  const headers = { 'X-Spike-Tab': '$SPIKE_TAB_ID', 'X-Spike-Token': '$SPIKE_TOKEN' };
  const http = (ev) => [{ hooks: [{ type: 'http', url: `${base}/hooks/${ev}`, timeout: 2, headers, allowedEnvVars: ['SPIKE_TAB_ID', 'SPIKE_TOKEN'] }] }];
  const settings = {
    hooks: {
      SessionStart: [{ hooks: [{ type: 'command', command: CURL, args: curlArgs(`${base}/hooks/SessionStart`), timeout: 3 }] }],
      SessionEnd: http('SessionEnd'),
      UserPromptSubmit: http('UserPromptSubmit'),
      Stop: http('Stop'),
    },
  };
  if (statusLine) settings.statusLine = statusLine;
  return settings;
}

// ---------- Claude in node-pty ----------

function findClaudeExe() {
  const out = execFileSync('where.exe', ['claude'], { encoding: 'utf8' });
  const lines = out.split(/\r?\n/).filter(Boolean);
  return lines.find((l) => l.toLowerCase().endsWith('claude.exe')) || lines[0];
}

/** Umgebung ohne die Variablen der umgebenden Claude-Session und ohne THUB_* der installierten App. */
function cleanEnv(extra) {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (/^CLAUDE/i.test(k) || k === 'AI_AGENT' || /^THUB_/i.test(k) || /^TERMHUB_/i.test(k)) continue;
    env[k] = v;
  }
  env.NO_PROXY = [env.NO_PROXY, '127.0.0.1,localhost'].filter(Boolean).join(',');
  return { ...env, ...extra };
}

function runClaude(tl, { args, cwd, env, rawFile, cols = 120, rows = 40 }) {
  const pty = require('node-pty');
  const screen = new Screen(cols, rows);
  const proc = pty.spawn(findClaudeExe(), args, { name: 'xterm-256color', cols, rows, cwd, env, useConpty: true });
  tl.add({ kind: 'spawn', args, pid: proc.pid });
  proc.onData((d) => {
    screen.write(d);
    fs.appendFileSync(rawFile, d);
  });
  let done = false;
  const exited = new Promise((resolve) => {
    proc.onExit(({ exitCode }) => {
      done = true;
      tl.add({ kind: 'exit', exitCode });
      console.log(`[${(tl.now() / 1000).toFixed(1)}s] claude beendet, exitCode=${exitCode}`);
      resolve({ exitCode });
      if (!exitExpected) {
        tl.step('claude unerwartet beendet');
        setTimeout(() => finish(1), 3000);
      }
    });
  });
  return {
    exited,
    get done() {
      return done;
    },
    text: () => screen.text(),
    snap(label) {
      const text = screen.text();
      tl.add({ kind: 'screen', label, text });
      console.log(`----- Bildschirm: ${label} -----\n${text}\n-----`);
      return text;
    },
    write(data, label) {
      tl.add({ kind: 'key', label: label || JSON.stringify(data) });
      proc.write(data);
    },
    resize(c, r) {
      tl.add({ kind: 'key', label: `Grösse ${c}x${r}` });
      screen.resize(c, r);
      proc.resize(c, r);
    },
    async type(text) {
      tl.add({ kind: 'key', label: `tippe: ${text}` });
      for (const ch of text) {
        proc.write(ch);
        await sleep(12);
      }
      await sleep(300);
      this.write('\r', 'Enter');
    },
    async waitScreen(re, timeoutMs) {
      const end = Date.now() + timeoutMs;
      while (Date.now() < end) {
        if (re.test(screen.text())) return true;
        if (done) return false;
        await sleep(200);
      }
      return false;
    },
    killTree() {
      if (done) return;
      try {
        execFileSync('taskkill.exe', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore' });
      } catch {}
      try {
        proc.kill();
      } catch {}
    },
  };
}

// ---------- Ablauf ----------

const [scenario, formArg] = process.argv.slice(2);
if (!scenario) throw new Error('Szenario fehlt');

if (scenario === 'samples') {
  writeSamples();
  process.exit(0);
}

if (scenario === 'shells') {
  await shells();
  process.exit(0);
}

/**
 * Ohne Claude: Dieselbe Zeichenkette wie in `bash`, ausgeführt wie Claude Code einen Befehl ausführt, über Git Bash
 * (`bash -c`) und über PowerShell (`-NoProfile -NonInteractive -ExecutionPolicy Bypass -Command`), mit einem JSON auf
 * stdin. Kommt es unverändert an, mit Tab und Token, und bleibt die Ausgabe leer?
 */
async function shells() {
  const outDir = path.join(RAW_DIR, 'shells');
  fs.rmSync(outDir, { recursive: true, force: true });
  const tl = new Timeline(path.join(outDir, 'timeline.jsonl'));
  const srv = await startServer(tl);
  const json = JSON.stringify({ model: { id: 'claude-x', display_name: 'Grüezi «Modell»' }, cost: { total_cost_usd: 1.5 } });
  const env = cleanEnv({ SPIKE_TAB_ID: 'tab-123', SPIKE_TOKEN: 'tok-456' });
  const candidates = [
    ['bash', 'C:\\Program Files\\Git\\bin\\bash.exe', (c) => ['-c', c]],
    ['powershell', 'powershell.exe', (c) => ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', c]],
    ['pwsh', 'pwsh.exe', (c) => ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', c]],
  ];
  const report = {};
  for (const [name, exe, argsFor] of candidates) {
    const command = curlString(`${srv.base}/statusline/${name}`);
    const from = srv.events.length;
    let stdout = '';
    let error = null;
    // Asynchron: Der Empfänger läuft im selben Prozess.
    await new Promise((resolve) => {
      const child = execFile(exe, argsFor(command), { env, encoding: 'utf8', timeout: 20000, windowsHide: true }, (err, out) => {
        stdout = out ?? '';
        if (err) error = String(err.message).slice(0, 200);
        resolve();
      });
      child.stdin.end(json);
    });
    const got = srv.events.slice(from).find(isStatus);
    report[name] = {
      angekommen: !!got,
      gleich: got ? JSON.stringify(got.body) === json : false,
      tab: got?.headers['x-spike-tab'],
      token: got?.headers['x-spike-token'] === 'tok-456',
      ausgabe: stdout,
      fehler: error,
    };
    console.log(name, JSON.stringify(report[name]));
  }
  report.befehl = curlString('http://127.0.0.1:<PORT>/statusline');
  fs.writeFileSync(path.join(outDir, 'result.json'), JSON.stringify(report, null, 2));
  await srv.close();
}

const form = formArg || 'exec';
const runName = ['form', 'haupt', 'fortsetzen', 'intervall'].includes(scenario) ? `${scenario}-${form}` : scenario;
const outDir = path.join(RAW_DIR, runName);
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(WS_DIR, { recursive: true });
const tl = new Timeline(path.join(outDir, 'timeline.jsonl'));
const tab = 'tab-' + crypto.randomUUID();
const token = crypto.randomBytes(16).toString('hex');
const result = { scenario: runName, tab, token, prompts: 0, checks: {} };
let claude = null;
let srv = null;
let exitExpected = false;

const watchdog = setTimeout(() => {
  tl.step(`ZEITGRENZE ${LIMIT_MS} ms erreicht: beende den eigenen Prozessbaum`);
  claude?.killTree();
  finish(2);
}, LIMIT_MS);

async function finish(code = 0) {
  clearTimeout(watchdog);
  claude?.killTree();
  if (srv) {
    result.events = srv.events.map((e) => ({ t: e.t, kind: e.kind, path: e.path, headers: e.headers, body: e.body }));
    await srv.close();
  }
  fs.writeFileSync(path.join(outDir, 'result.json'), JSON.stringify(result, null, 2));
  console.log(`Ergebnis: ${path.join(outDir, 'result.json')}`);
  process.exit(code);
}

/** Statuszeile des Projekts im Arbeitsordner: gibt eine erkennbare Zeile aus. */
function projectSettings(present) {
  const file = path.join(WS_DIR, '.claude', 'settings.local.json');
  if (!present) {
    fs.rmSync(file, { force: true });
    return;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ statusLine: { type: 'command', command: 'echo PROJEKT-STATUSZEILE' } }, null, 2));
}

async function start({ statusLine, project = true, extraArgs = [] }) {
  srv = await startServer(tl);
  projectSettings(project);
  const settingsFile = path.join(outDir, 'settings.json');
  const sl = typeof statusLine === 'function' ? statusLine(srv.base) : statusLine;
  fs.writeFileSync(settingsFile, JSON.stringify(hookSettings(srv.base, sl), null, 2));
  const args = ['--model', 'haiku', '--settings', settingsFile, '--debug-file', path.join(outDir, 'debug.log'), ...extraArgs];
  tl.step(`Start claude ${args.join(' ')}`);
  claude = runClaude(tl, { args, cwd: WS_DIR, env: cleanEnv({ SPIKE_TAB_ID: tab, SPIKE_TOKEN: token }), rawFile: path.join(outDir, 'raw.txt') });
  // Vertrauensdialog nur beim ersten Lauf im Arbeitsordner; vorausgewählt ist „No, exit“.
  if (await claude.waitScreen(/trust this folder/i, 8000)) {
    claude.snap('vertrauen');
    await sleep(500);
    for (let i = 0; i < 3 && !/❯\s*Yes, I trust/.test(claude.text()); i++) {
      claude.write('\x1b[B', 'Pfeil runter');
      await sleep(400);
    }
    if (!/❯\s*Yes, I trust/.test(claude.text())) throw new Error('„Yes, I trust this folder“ nicht auswählbar');
    claude.write('\r', 'Enter (Yes, I trust this folder)');
  }
  const ss = await srv.waitFor(isHook('SessionStart'), 30000);
  tl.step(`SessionStart: ${ss ? ss.body.session_id : 'NEIN'}`);
  result.sessionId = ss?.body?.session_id;
  return ss;
}

async function prompt(text) {
  result.prompts++;
  const m = srv.events.length;
  await claude.type(text);
  const up = await srv.waitFor(isHook('UserPromptSubmit'), 20000, m);
  tl.step(`UserPromptSubmit: ${up ? 'ja' : 'NEIN'}`);
  return m;
}

async function exitClaude() {
  if (claude.done) return;
  exitExpected = true;
  await claude.type('/exit');
  const ex = await Promise.race([claude.exited, sleep(20000).then(() => null)]);
  if (!ex) {
    claude.snap('nach-exit');
    claude.write('\r', 'Enter');
    await Promise.race([claude.exited, sleep(10000)]);
  }
}

/** Zählt die Aufrufe der Statuszeile ab Index `from` und schreibt sie in die Zeitachse. */
function countStatus(label, from = 0) {
  const n = srv.events.slice(from).filter(isStatus).length;
  tl.step(`${label}: ${n} Aufrufe der Statuszeile`);
  result.checks[label] = n;
  return n;
}

/** Die untersten Zeilen des Bildschirms, für den Vergleich der Fläche unter dem Eingabefeld. */
function bottom(label, lines = 10) {
  const text = claude.snap(label);
  const rows = text.split('\n');
  result.checks[`unten-${label}`] = rows.slice(-lines);
}

async function runScenario() {
  try {
    if (scenario === 'form') {
      await start({ statusLine: (base) => statusLineFor(form, base) });
      await sleep(12000);
      countStatus('nach-start');
      bottom('leerlauf');
      result.checks.projektSichtbar = /PROJEKT-STATUSZEILE/.test(claude.text());
      await exitClaude();
    } else if (scenario === 'haupt') {
      await start({ statusLine: (base) => statusLineFor(form, base) });
      await sleep(8000);
      countStatus('vor-prompt');
      bottom('vor-prompt');
      const m = await prompt('Reply with only the word OK.');
      const stop = await srv.waitFor(isHook('Stop'), 60000, m);
      tl.step(`Stop: ${stop ? 'ja' : 'NEIN'}`);
      const s = srv.events.length;
      await sleep(5000);
      countStatus('prompt-bis-stop+5s', m);
      // Leerlauf: Kommt ohne Eingabe noch etwas?
      await sleep(40000);
      countStatus('leerlauf-40s', s + 0);
      bottom('nach-antwort');
      fs.writeFileSync(path.join(RAW_DIR, 'haupt-session.txt'), result.sessionId ?? '');
      await exitClaude();
    } else if (scenario === 'fortsetzen') {
      const sid = fs.readFileSync(path.join(RAW_DIR, 'haupt-session.txt'), 'utf8').trim();
      if (!sid) throw new Error('keine Session aus haupt');
      await start({ statusLine: (base) => statusLineFor(form, base), extraArgs: ['--resume', sid] });
      await sleep(8000);
      countStatus('nach-resume');
      const m = await prompt('Reply with only the word OK.');
      const stop = await srv.waitFor(isHook('Stop'), 60000, m);
      tl.step(`Stop: ${stop ? 'ja' : 'NEIN'}`);
      await sleep(6000);
      countStatus('nach-prompt', m);
      const c = srv.events.length;
      await claude.type('/clear');
      await srv.waitFor(isHook('SessionStart'), 15000, c);
      await sleep(6000);
      countStatus('nach-clear', c);
      bottom('nach-clear');
      await exitClaude();
    } else if (scenario === 'intervall') {
      await start({ statusLine: (base) => statusLineFor(form, base, { refreshInterval: 2 }) });
      await sleep(5000);
      const s = srv.events.length;
      await sleep(15000);
      countStatus('leerlauf-15s', s);
      await exitClaude();
    } else if (scenario === 'groesse') {
      // Schickt Claude bei einer neuen Grösse des Terminals die Statuszeile neu, mit den Limits aus der letzten Antwort?
      await start({ statusLine: (base) => statusLineFor('bash', base) });
      await sleep(10000);
      const s = srv.events.length;
      claude.resize(100, 34);
      await sleep(5000);
      countStatus('nach-groesse', s);
      const s2 = srv.events.length;
      claude.resize(120, 40);
      await sleep(5000);
      countStatus('nach-groesse-zurueck', s2);
      await exitClaude();
    } else if (scenario === 'ohne') {
      await start({ statusLine: null, project: true });
      await sleep(12000);
      bottom('leerlauf');
      result.checks.projektSichtbar = /PROJEKT-STATUSZEILE/.test(claude.text());
      await exitClaude();
    } else if (scenario === 'nutzer') {
      await start({ statusLine: null, project: false });
      await sleep(12000);
      bottom('leerlauf');
      await exitClaude();
    } else {
      throw new Error('unbekanntes Szenario ' + scenario);
    }
    await sleep(2000);
    await finish(0);
  } catch (err) {
    tl.step('FEHLER ' + (err?.stack || err));
    await finish(1);
  }
}

// ---------- redigierte Beispiele und Zeitachsen ----------

function writeSamples() {
  const user = process.env.USERNAME || '';
  const shortUser = user ? user.slice(0, 6).toUpperCase() + '~1' : null;
  const runs = fs.existsSync(RAW_DIR) ? fs.readdirSync(RAW_DIR).filter((d) => fs.existsSync(path.join(RAW_DIR, d, 'timeline.jsonl'))) : [];
  const befunde = {};
  let sample = null;
  for (const name of runs.sort()) {
    const lines = fs.readFileSync(path.join(RAW_DIR, name, 'timeline.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    const sids = new Map();
    const label = (id) => {
      if (!id) return undefined;
      if (!sids.has(id)) sids.set(id, `S${sids.size + 1}`);
      return sids.get(id);
    };
    befunde[name] = lines
      .filter((e) => e.kind === 'hook' || e.kind === 'statusline' || e.kind === 'key' || e.kind === 'exit')
      .map((e) => {
        const t = +(e.t / 1000).toFixed(2);
        if (e.kind === 'key') return { t, taste: /^tippe: (?!\/)/.test(e.label) ? 'tippe: <Prompt>' : e.label };
        if (e.kind === 'exit') return { t, ende: e.exitCode };
        const b = e.body ?? {};
        if (e.kind === 'hook') return { t, ereignis: b.hook_event_name, session: label(b.session_id), ...(b.source ? { source: b.source } : {}) };
        const entry = { t, statuszeile: e.path.replace('/statusline/', ''), session: label(b.session_id) };
        if (b._unparsed !== undefined) return { ...entry, kein_json: true };
        entry.modell = b.model?.id;
        entry.kosten = b.cost?.total_cost_usd;
        entry.limits = b.rate_limits ? Object.fromEntries(Object.entries(b.rate_limits).map(([k, v]) => [k, Object.keys(v ?? {})])) : null;
        entry.tab_kopfzeile = e.headers?.['x-spike-tab'] ? 'ja' : 'nein';
        return entry;
      });
    // Beispiel: der erste Aufruf nach einer Antwort (Kosten über 0) mit Limits aus einer Session von Claude.
    if (name === 'shells') continue;
    const calls = lines.filter((e) => e.kind === 'statusline' && e.body?.session_id);
    const best = calls.find((e) => e.body.rate_limits && e.body.cost?.total_cost_usd > 0);
    if (!sample?.body.rate_limits || !(sample.body.cost?.total_cost_usd > 0)) sample = best ?? sample ?? calls[0];
  }
  if (sample) {
    const anon = (s) => {
      if (typeof s !== 'string') return s;
      let r = s;
      if (user) r = r.split(user).join('<user>');
      if (shortUser) r = r.split(shortUser).join('<USER~1>');
      return r;
    };
    const b = JSON.parse(JSON.stringify(sample.body));
    const walk = (o) => {
      for (const k of Object.keys(o)) {
        if (typeof o[k] === 'string') o[k] = anon(o[k]);
        else if (o[k] && typeof o[k] === 'object') walk(o[k]);
      }
    };
    walk(b);
    // Pfade, Kennungen und Kontoangaben redigieren; Aufbau und Zahlen bleiben.
    if (b.scratchpad_dir) b.scratchpad_dir = '<scratchpad-dir>';
    if (b.session_id) b.session_id = '<session-id>';
    if (b.session_name) b.session_name = '<session-name>';
    if (b.prompt_id) b.prompt_id = '<prompt-id>';
    if (b.transcript_path) b.transcript_path = '<transcript-path>';
    if (b.cwd) b.cwd = '<cwd>';
    if (b.workspace) {
      b.workspace.current_dir = '<cwd>';
      b.workspace.project_dir = '<cwd>';
    }
    const out = { szenario: 'statuszeile', pfad: '/statusline', kopfzeilen: { 'X-Spike-Tab': '<tab-id>', 'X-Spike-Token': '<token>' }, nutzdaten: b };
    fs.writeFileSync(path.join(HERE, 'samples', 'StatusLine.json'), JSON.stringify(out, null, 2) + '\n');
    console.log('Beispiel aus', sample.path);
  }
  fs.writeFileSync(path.join(HERE, 'befunde-statuszeile.json'), JSON.stringify(befunde, null, 2) + '\n');
}

// ---------- kleiner Nachbau des Bildschirms (wie in agenten.mjs) ----------
/**
 * Genug VT100 für Claudes Oberfläche: Cursorbewegungen, Löschen, Bildlauf im Bereich, alternativer Bildschirm.
 * Farben und Modi werden übergangen; Zeichen ausserhalb der BMP zählen doppelt breit.
 */
class Screen {
  constructor(cols, rows) {
    this.cols = cols;
    this.rows = rows;
    this.x = 0;
    this.y = 0;
    this.top = 0;
    this.bottom = rows - 1;
    this.saved = [0, 0];
    this.pending = '';
    this.lines = this.blank();
  }
  blank() {
    return Array.from({ length: this.rows }, () => Array(this.cols).fill(' '));
  }
  resize(cols, rows) {
    this.cols = cols;
    this.rows = rows;
    this.top = 0;
    this.bottom = rows - 1;
    this.lines = this.blank();
    this.x = 0;
    this.y = 0;
  }
  text() {
    return this.lines.map((l) => l.join('').replace(/\s+$/, '')).join('\n').replace(/\n+$/, '');
  }
  scrollUp(n = 1) {
    for (let i = 0; i < n; i++) {
      this.lines.splice(this.top, 1);
      this.lines.splice(this.bottom, 0, Array(this.cols).fill(' '));
    }
  }
  scrollDown(n = 1) {
    for (let i = 0; i < n; i++) {
      this.lines.splice(this.bottom, 1);
      this.lines.splice(this.top, 0, Array(this.cols).fill(' '));
    }
  }
  lf() {
    if (this.y === this.bottom) this.scrollUp();
    else this.y = Math.min(this.rows - 1, this.y + 1);
  }
  put(ch) {
    if (this.x >= this.cols) {
      this.x = 0;
      this.lf();
    }
    this.lines[this.y][this.x] = ch;
    this.x += ch.length > 1 ? 2 : 1;
  }
  clamp() {
    this.x = Math.max(0, Math.min(this.cols - 1, this.x));
    this.y = Math.max(0, Math.min(this.rows - 1, this.y));
  }
  csi(params, final, priv) {
    const p = params.split(';').map((v) => (v === '' ? NaN : Number(v)));
    const n = (i, d = 1) => (Number.isNaN(p[i]) || p[i] === undefined || p[i] === 0 ? d : p[i]);
    const row = this.lines[this.y];
    switch (final) {
      case 'H':
      case 'f':
        this.y = n(0) - 1;
        this.x = n(1) - 1;
        break;
      case 'A': this.y -= n(0); break;
      case 'B': this.y += n(0); break;
      case 'C': this.x += n(0); break;
      case 'D': this.x -= n(0); break;
      case 'E': this.y += n(0); this.x = 0; break;
      case 'F': this.y -= n(0); this.x = 0; break;
      case 'G': this.x = n(0) - 1; break;
      case 'd': this.y = n(0) - 1; break;
      case 'K': {
        const mode = Number.isNaN(p[0]) ? 0 : p[0];
        const [a, b] = mode === 0 ? [this.x, this.cols] : mode === 1 ? [0, this.x + 1] : [0, this.cols];
        for (let i = a; i < b; i++) row[i] = ' ';
        break;
      }
      case 'J': {
        const mode = Number.isNaN(p[0]) ? 0 : p[0];
        if (mode === 2 || mode === 3) this.lines = this.blank();
        else if (mode === 0) {
          for (let i = this.x; i < this.cols; i++) row[i] = ' ';
          for (let y = this.y + 1; y < this.rows; y++) this.lines[y].fill(' ');
        } else {
          for (let i = 0; i <= this.x; i++) row[i] = ' ';
          for (let y = 0; y < this.y; y++) this.lines[y].fill(' ');
        }
        break;
      }
      case 'X': for (let i = 0; i < n(0); i++) if (this.x + i < this.cols) row[this.x + i] = ' '; break;
      case 'P': row.splice(this.x, n(0)); while (row.length < this.cols) row.push(' '); break;
      case '@': for (let i = 0; i < n(0); i++) row.splice(this.x, 0, ' '); row.length = this.cols; break;
      case 'L': for (let i = 0; i < n(0); i++) { this.lines.splice(this.bottom, 1); this.lines.splice(this.y, 0, Array(this.cols).fill(' ')); } break;
      case 'M': for (let i = 0; i < n(0); i++) { this.lines.splice(this.y, 1); this.lines.splice(this.bottom, 0, Array(this.cols).fill(' ')); } break;
      case 'S': this.scrollUp(n(0)); break;
      case 'T': this.scrollDown(n(0)); break;
      case 'r':
        this.top = n(0) - 1;
        this.bottom = (Number.isNaN(p[1]) || p[1] === undefined ? this.rows : p[1]) - 1;
        this.x = 0;
        this.y = 0;
        break;
      case 's': this.saved = [this.x, this.y]; break;
      case 'u': [this.x, this.y] = this.saved; break;
      case 'h':
      case 'l':
        if (priv === '?' && /(^|;)(1049|1047|47)(;|$)/.test(params)) {
          this.lines = this.blank();
          this.x = 0;
          this.y = 0;
        }
        break;
      default:
        break;
    }
    this.clamp();
  }
  write(data) {
    const s = this.pending + data;
    this.pending = '';
    let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (c === '\x1b') {
        const rest = s.slice(i);
        let m;
        if ((m = /^\x1b\[([?>=<]?)([\d;:]*)([ -/]*)([@-~])/.exec(rest))) {
          if (!m[3]) this.csi(m[2].replace(/:/g, ';'), m[4], m[1]);
          i += m[0].length;
        } else if ((m = /^\x1b[\]P_^][\s\S]*?(?:\x07|\x1b\\)/.exec(rest))) {
          i += m[0].length;
        } else if (/^\x1b[\]P_^]/.test(rest) || /^\x1b(\[[?>=<]?[\d;:]*[ -/]*)?$/.test(rest)) {
          this.pending = rest; // unvollständige Folge: auf das nächste Stück warten
          return;
        } else if (rest[1] === '7') {
          this.saved = [this.x, this.y];
          i += 2;
        } else if (rest[1] === '8') {
          [this.x, this.y] = this.saved;
          i += 2;
        } else if (rest[1] === 'M') {
          if (this.y === this.top) this.scrollDown();
          else this.y--;
          i += 2;
        } else if (/^\x1b[()*+][\s\S]/.test(rest)) {
          i += 3;
        } else {
          i += 2;
        }
        continue;
      }
      if (c === '\r') this.x = 0;
      else if (c === '\n') this.lf();
      else if (c === '\b') this.x = Math.max(0, this.x - 1);
      else if (c === '\t') this.x = Math.min(this.cols - 1, (Math.floor(this.x / 8) + 1) * 8);
      else if (c >= ' ' && c !== '\x7f') {
        const cp = s.codePointAt(i);
        const ch = String.fromCodePoint(cp);
        this.put(ch);
        i += ch.length;
        continue;
      }
      i++;
    }
  }
}

await runScenario();
