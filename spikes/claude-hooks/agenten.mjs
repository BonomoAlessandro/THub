// Messung zu Ticket 37: Hook-Ereignisse zu Agenten (Vordergrund und Hintergrund) mit dem installierten Claude Code.
// Aufruf: node agenten.mjs <szenario>
//   hintergrund   ein Agent im Hintergrund (~30 s); Claude beendet die Antwort, während er läuft (1 Prompt)
//   zwei          zwei Agenten im Hintergrund, die nacheinander enden (1 Prompt)
//   esc           Esc, während Claude selbst arbeitet und ein Agent im Hintergrund läuft; danach Esc im Ruhezustand
//                 (1 Prompt)
//   stoppen       Agent im Hintergrund über die Aufgabenliste (/tasks) stoppen, sonst durch Claude (1 bis 2 Prompts)
//   drei          drei Agenten: einen über die Aufgabenliste stoppen, dann /clear und /exit, während andere laufen
//                 (1 Prompt)
//   exit          /exit, während ein Agent im Hintergrund läuft (1 Prompt)
//   rueckfrage    Rückfrage aus einem Agenten (Berechtigungsmodus „manual“); Haiku liess run_in_background weg, der
//                 Agent lief im Hintergrund und fragte nach Claudes Stop (1 Prompt)
//   vordergrund   Agent ausdrücklich im Vordergrund mit Rückfrage („manual“, 1 Prompt)
//   clear         /clear, während ein Agent im Hintergrund läuft (1 Prompt; nicht gelaufen, steckt in `drei`)
//   samples       redigierte Beispiele und Zeitachsen aus den Rohdaten schreiben (ohne Claude)
// Bestätigt wird eine Rückfrage nur, wenn sie hi.txt im Arbeitsordner schreibt; alles andere lehnt das Skript ab.
//
// Aufbau wie der Spike zu den Tickets 10 bis 13 (docs/spikes/claude-hooks.md): eigener HTTP-Empfänger auf 127.0.0.1,
// eigene Hook-Datei per --settings, claude in node-pty in einem Temp-Ordner, ohne die geerbten CLAUDE*- und THUB_*-
// Variablen, --model haiku. Jeder Lauf hat eine harte Zeitgrenze: Danach beendet das Skript den Prozessbaum des
// selbst gestarteten claude (taskkill /T über die eigene Prozess-ID) und sich selbst.
//
// Läuft ohne @xterm/headless: Ein kleiner Nachbau des Bildschirms (genug für Dialoge und Abzüge) steht unten.
// Rohdaten (Zeitachsen, Terminalausgabe, Debug-Log) landen unter SPIKE_DIR (Standard: %TEMP%\thub-spike-agenten)
// und werden nicht eingecheckt; `samples` schreibt redigierte Beispiele nach samples/ und befunde-agenten.json.

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SPIKE_DIR = process.env.SPIKE_DIR || path.join(os.tmpdir(), 'thub-spike-agenten');
const RAW_DIR = path.join(SPIKE_DIR, 'raw');
/** Derselbe Arbeitsordner für alle Läufe: Claude fragt nur beim ersten Mal, ob es dem Ordner vertraut. */
const WS_DIR = path.join(SPIKE_DIR, 'ws');
const LIMIT_MS = Number(process.env.SPIKE_LIMIT_MS || 240_000);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Alle Ereignisse, die per HTTP-Hook ankommen können (SessionStart und Setup nicht, siehe Spike). */
const HTTP_EVENTS = [
  'SessionEnd',
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'PostToolBatch',
  'PermissionRequest',
  'PermissionDenied',
  'Notification',
  'Stop',
  'StopFailure',
  // Agenten und Aufgaben laut Hook-Beschreibung im installierten Claude Code:
  'SubagentStart',
  'SubagentStop',
  'TaskCreated',
  'TaskCompleted',
  'TeammateIdle',
  'PreCompact',
  'PostCompact',
];

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

function short(body) {
  if (!body) return '';
  const parts = [body.hook_event_name];
  for (const k of ['source', 'reason', 'notification_type', 'tool_name', 'agent_type']) if (body[k]) parts.push(`${k}=${body[k]}`);
  if (body.agent_id) parts.push(`agent=${String(body.agent_id).slice(0, 8)}`);
  parts.push(`sid=${String(body.session_id ?? '-').slice(0, 8)}`);
  if (Array.isArray(body.background_tasks)) parts.push(`bg=${JSON.stringify(body.background_tasks.map((b) => `${b.type}:${b.status}`))}`);
  if (typeof body.prompt === 'string' && body.prompt.startsWith('<task-notification>')) parts.push('task-notification');
  return parts.join(' ');
}

function startHookServer(tl) {
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
      const e = tl.add({ kind: 'hook', path: req.url, headers: req.headers, body: json });
      events.push(e);
      console.log(`[${(e.t / 1000).toFixed(1)}s]   <- ${short(json)}`);
      for (const w of [...waiters]) {
        if (w.pred(e)) {
          waiters.splice(waiters.indexOf(w), 1);
          w.resolve(e);
        }
      }
      res.writeHead(200, { 'content-length': '0' });
      res.end();
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        port,
        base: `http://127.0.0.1:${port}`,
        events,
        /** Wartet auf ein Ereignis ab Index `from`, das `pred` erfüllt; `null` nach `timeoutMs`. */
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

const is = (name, extra = () => true) => (e) => e.body?.hook_event_name === name && extra(e.body);
const main = (b) => !b.agent_id;
const fromAgent = (b) => !!b.agent_id;
const taskNotification = (b) => typeof b.prompt === 'string' && b.prompt.startsWith('<task-notification>');

function hookSettings(base) {
  const headers = { 'X-Spike-Tab': '$SPIKE_TAB_ID', 'X-Spike-Token': '$SPIKE_TOKEN' };
  const hooks = {
    SessionStart: [
      {
        hooks: [
          {
            type: 'command',
            command: 'C:\\Windows\\System32\\curl.exe',
            args: [
              '-s', '-S', '--connect-timeout', '1', '-m', '2', '--noproxy', '*',
              '--variable', '%SPIKE_TAB_ID=', '--variable', '%SPIKE_TOKEN=',
              '--expand-header', 'X-Spike-Tab: {{SPIKE_TAB_ID}}',
              '--expand-header', 'X-Spike-Token: {{SPIKE_TOKEN}}',
              '-H', 'Content-Type: application/json',
              '--data-binary', '@-',
              `${base}/hooks/SessionStart`,
            ],
            timeout: 3,
          },
        ],
      },
    ],
  };
  for (const ev of HTTP_EVENTS) {
    hooks[ev] = [
      { hooks: [{ type: 'http', url: `${base}/hooks/${ev}`, timeout: 2, headers, allowedEnvVars: ['SPIKE_TAB_ID', 'SPIKE_TOKEN'] }] },
    ];
  }
  return { hooks };
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
  const file = findClaudeExe();
  const proc = pty.spawn(file, args, { name: 'xterm-256color', cols, rows, cwd, env, useConpty: true });
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
      resolve({ exitCode, t: tl.now() });
      // Unerwartet beendet: nicht bis zur Zeitgrenze auf Ereignisse warten.
      if (!exitExpected) {
        tl.step('claude unerwartet beendet');
        setTimeout(() => finish(1), 3000);
      }
    });
  });
  return {
    pid: proc.pid,
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
    /** Beendet den eigenen Prozessbaum hart (nur die selbst gestartete Prozess-ID). */
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

const scenario = process.argv[2];
if (!scenario) throw new Error('Szenario fehlt');

if (scenario === 'samples') {
  writeSamples();
  process.exit(0);
}

const outDir = path.join(RAW_DIR, scenario);
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(WS_DIR, { recursive: true });
const tl = new Timeline(path.join(outDir, 'timeline.jsonl'));
const tab = 'tab-' + crypto.randomUUID();
const token = crypto.randomBytes(16).toString('hex');
const result = { scenario, tab, token, prompts: 0, checks: {} };
let claude = null;
let srv = null;
/** Das Skript beendet claude selbst (/exit); sonst endet der Lauf, sobald claude endet. */
let exitExpected = false;

// Harte Zeitgrenze für den ganzen Lauf.
const watchdog = setTimeout(() => {
  tl.step(`ZEITGRENZE ${LIMIT_MS} ms erreicht: beende den eigenen Prozessbaum`);
  claude?.killTree();
  finish(2);
}, LIMIT_MS);

async function finish(code = 0) {
  clearTimeout(watchdog);
  claude?.killTree();
  if (srv) {
    result.events = srv.events.map((e) => ({ t: e.t, path: e.path, headers: e.headers, body: e.body }));
    await srv.close();
  }
  fs.writeFileSync(path.join(outDir, 'result.json'), JSON.stringify(result, null, 2));
  console.log(`Ergebnis: ${path.join(outDir, 'result.json')}`);
  process.exit(code);
}

async function start({ permissionMode } = {}) {
  srv = await startHookServer(tl);
  const hookFile = path.join(outDir, 'hooks.json');
  fs.writeFileSync(hookFile, JSON.stringify(hookSettings(srv.base), null, 2));
  const args = ['--model', 'haiku', '--settings', hookFile, '--debug-file', path.join(outDir, 'debug.log')];
  if (permissionMode) args.push('--permission-mode', permissionMode);
  tl.step(`Start claude ${args.join(' ')}`);
  claude = runClaude(tl, {
    args,
    cwd: WS_DIR,
    env: cleanEnv({ SPIKE_TAB_ID: tab, SPIKE_TOKEN: token }),
    rawFile: path.join(outDir, 'raw.txt'),
  });
  // Vertrauensdialog nur beim ersten Lauf im Arbeitsordner.
  // Vorausgewählt ist „No, exit“.
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
  const ss = await srv.waitFor(is('SessionStart'), 30000);
  tl.step(`SessionStart: ${ss ? ss.body.session_id : 'NEIN'}`);
  await sleep(4000);
  if (/Settings Warning/i.test(claude.text())) throw new Error('Settings Warning');
  return ss;
}

async function prompt(text) {
  result.prompts++;
  const m = srv.events.length;
  await claude.type(text);
  const up = await srv.waitFor(is('UserPromptSubmit'), 20000, m);
  tl.step(`UserPromptSubmit: ${up ? 'ja' : 'NEIN'}`);
  return m;
}

/** Wartet auf `Stop` der Hauptsession ab Index `from`. */
const mainStop = (from, ms = 90000) => srv.waitFor(is('Stop', main), ms, from);

async function exitClaude() {
  if (claude.done) return;
  exitExpected = true;
  await claude.type('/exit');
  const ex = await Promise.race([claude.exited, sleep(20000).then(() => null)]);
  if (!ex) {
    claude.snap('nach-exit');
    tl.step('claude läuft nach /exit noch; Enter (erste Wahl eines Dialogs)');
    claude.write('\r', 'Enter');
    await Promise.race([claude.exited, sleep(10000)]);
  }
}

/**
 * Ein Bash-Befehl, der etwa `seconds` Sekunden braucht. `sleep` allein im Vordergrund blockiert Claude Code selbst
 * („standalone sleep“); der Agent startete ihn dann im Hintergrund und wartete auf seine eigene Arbeit.
 */
const WAIT = (seconds) => `ping -n ${seconds + 1} 127.0.0.1 > /dev/null`;
const AGENT_TASK = (seconds, word = 'FERTIG') =>
  `Run exactly this Bash command in the foreground (not with run_in_background) with a timeout of 120000 ms: ` +
  `${WAIT(seconds)} Then reply only with the word ${word}.`;

/** Agenten laufen in Claude Code 2.1.332 standardmässig im Hintergrund; der Prompt sagt es trotzdem ausdrücklich. */
const BG = (task) =>
  `Use the Agent tool exactly once with subagent_type "general-purpose" and run_in_background: true. ` +
  `The agent's prompt: "${task}" Do not wait for the agent and do not check on it. ` +
  `After launching it, reply only with the word OK.`;

// Erst am Dateiende gestartet, damit die Klasse `Screen` unten schon ausgewertet ist.
async function runScenario() {
try {
  if (scenario === 'vordergrund' || scenario === 'rueckfrage') {
    // Berechtigungsmodus „manual“: Der Agent fragt, bevor er im Temp-Ordner schreibt.
    // rueckfrage: Haiku liess run_in_background weg, der Agent lief im Hintergrund und fragte nach Claudes Stop.
    // vordergrund: ausdrücklich im Vordergrund; Claude wartet auf den Agenten.
    await start({ permissionMode: 'manual' });
    const task = 'Run exactly this Bash command in the current directory: echo hi > hi.txt Then reply only with DONE.';
    const m = await prompt(
      scenario === 'rueckfrage'
        ? `Use the Agent tool exactly once with subagent_type "general-purpose" and run_in_background: false. ` +
            `The agent's prompt: "${task}" After the agent has returned, reply only with OK.`
        : `Call the Agent tool exactly once with subagent_type "general-purpose" and with the parameter ` +
            `run_in_background set to the boolean false. This matters: the agent must run in the foreground, because ` +
            `your next step depends on its result. The agent's prompt: "${task}" After the agent has returned, reply ` +
            `only with OK.`,
    );
    const pr = await srv.waitFor(is('PermissionRequest'), 90000, m);
    tl.step(`PermissionRequest: ${pr ? short(pr.body) : 'NEIN'}`);
    if (pr) {
      // Erst bestätigen, wenn der Dialog steht und nur im Arbeitsordner geschrieben wird.
      const shown = await claude.waitScreen(/Do you want to proceed\?/, 30000);
      const s = claude.snap('rueckfrage');
      if (shown && /ws\\hi\.txt/.test(s.replace(/\s*\n\s*│?\s*/g, '')) && !/\.\.[\\/]/.test(s)) {
        claude.write('1', '1 (Ja, schreibt nur hi.txt im Temp-Ordner)');
      } else {
        claude.write('\x1b', 'Esc (Rückfrage ablehnen)');
      }
    }
    const sub = await srv.waitFor(is('SubagentStop', (b) => !!b.agent_type), 90000, m);
    tl.step(`SubagentStop: ${sub ? short(sub.body) : 'NEIN'}`);
    if (sub) await mainStop(srv.events.indexOf(sub) + 1, 40000);
    await sleep(10000);
    claude.snap('ende');
    await exitClaude();
  } else if (scenario === 'hintergrund') {
    await start();
    const m = await prompt(BG(AGENT_TASK(30)));
    const stop = await mainStop(m);
    tl.step(`Stop: ${stop ? short(stop.body) : 'NEIN'}`);
    claude.snap('nach-stop');
    const sub = await srv.waitFor(is('SubagentStop', (b) => !!b.agent_type), 90000, m);
    tl.step(`SubagentStop: ${sub ? short(sub.body) : 'NEIN'}`);
    await srv.waitFor(is('UserPromptSubmit', taskNotification), 40000, m);
    await sleep(12000);
    claude.snap('ende');
    await exitClaude();
  } else if (scenario === 'zwei') {
    await start();
    const m = await prompt(
      'Use the Agent tool exactly twice, in parallel in one message, both with subagent_type "general-purpose" and ' +
        `run_in_background: true. First agent's prompt: "${AGENT_TASK(10, 'A')}" ` +
        `Second agent's prompt: "${AGENT_TASK(35, 'B')}" ` +
        'Do not wait for the agents and do not check on them. After launching both, reply only with OK.',
    );
    const stop = await mainStop(m);
    tl.step(`Stop: ${stop ? short(stop.body) : 'NEIN'}`);
    const first = await srv.waitFor(is('SubagentStop', (b) => !!b.agent_type), 90000, m);
    tl.step(`erstes SubagentStop: ${first ? short(first.body) : 'NEIN'}`);
    const second =
      first && (await srv.waitFor(is('SubagentStop', (b) => !!b.agent_type), 90000, srv.events.indexOf(first) + 1));
    tl.step(`zweites SubagentStop: ${second ? short(second.body) : 'NEIN'}`);
    if (second) await srv.waitFor(is('UserPromptSubmit', taskNotification), 40000, srv.events.indexOf(second) + 1);
    await sleep(12000);
    claude.snap('ende');
    await exitClaude();
  } else if (scenario === 'esc') {
    await start();
    const m = await prompt(
      'First use the Agent tool exactly once with subagent_type "general-purpose" and run_in_background: true. ' +
        `The agent's prompt: "${AGENT_TASK(45)}" ` +
        'Then, without waiting for the agent, run exactly this Bash command yourself in the foreground (not with ' +
        `run_in_background) with a timeout of 120000 ms: ${WAIT(20)} Then reply only with the word OK.`,
    );
    const own = await srv.waitFor(is('PreToolUse', (b) => main(b) && b.tool_name === 'Bash'), 90000, m);
    tl.step(`eigenes Bash: ${own ? short(own.body) : 'NEIN'}`);
    await sleep(3000);
    claude.snap('vor-esc');
    const escAt = tl.now();
    claude.write('\x1b', 'Esc (Claude selbst unterbrechen)');
    result.checks.escAt = escAt;
    await sleep(3000);
    claude.snap('nach-esc');
    // Läuft der Agent weiter? Dann kommt später SubagentStop, ggf. eine Meldung an Claude.
    const sub = await srv.waitFor(is('SubagentStop', (b) => !!b.agent_type), 15000, m);
    if (!sub) {
      tl.step('Agent noch nicht fertig: Esc im Ruhezustand');
      claude.write('\x1b', 'Esc (Ruhezustand, Agent läuft)');
      await sleep(2000);
      claude.snap('nach-esc-ruhe');
    }
    const sub2 = sub || (await srv.waitFor(is('SubagentStop', (b) => !!b.agent_type), 70000, m));
    tl.step(`SubagentStop: ${sub2 ? `${sub2.t - escAt} ms nach Esc` : 'NEIN'}`);
    if (sub2) await srv.waitFor(is('UserPromptSubmit', taskNotification), 30000, srv.events.indexOf(sub2) + 1);
    await sleep(10000);
    claude.snap('ende');
    await exitClaude();
  } else if (scenario === 'stoppen') {
    await start();
    const m = await prompt(BG(AGENT_TASK(60)));
    const stop = await mainStop(m);
    tl.step(`Stop: ${stop ? short(stop.body) : 'NEIN'}`);
    await sleep(3000);
    await claude.type('/tasks');
    await sleep(2500);
    claude.snap('tasks');
    claude.write('\r', 'Enter (Aufgabe öffnen)');
    await sleep(2000);
    claude.snap('tasks-detail');
    const k = srv.events.length;
    const stopAt = tl.now();
    claude.write('x', 'x (stoppen)');
    await sleep(2500);
    claude.snap('nach-x');
    let sub = await srv.waitFor(is('SubagentStop', (b) => !!b.agent_type), 5000, k);
    result.checks.stoppedByUi = !!sub || /stopped|killed/i.test(claude.text());
    claude.write('\x1b', 'Esc (Dialog schliessen)');
    await sleep(800);
    if (/Esc to|esc to close|← /i.test(claude.text())) claude.write('\x1b', 'Esc (Dialog schliessen)');
    await sleep(15000);
    claude.snap('nach-stoppen');
    tl.step(`SubagentStop nach dem Stoppen: ${sub ? `${sub.t - stopAt} ms` : 'NEIN'}; per Oberfläche gestoppt: ${result.checks.stoppedByUi}`);
    if (!result.checks.stoppedByUi) {
      const m2 = await prompt('Stop the running background agent now with the appropriate tool. Then reply only with OK.');
      await mainStop(m2, 60000);
      await sleep(15000);
      claude.snap('nach-stoppen-durch-claude');
    }
    await exitClaude();
  } else if (scenario === 'clear') {
    await start();
    const m = await prompt(BG(AGENT_TASK(40)));
    const stop = await mainStop(m);
    tl.step(`Stop: ${stop ? short(stop.body) : 'NEIN'}`);
    await sleep(3000);
    const k = srv.events.length;
    await claude.type('/clear');
    await sleep(3000);
    claude.snap('nach-clear');
    await srv.waitFor(is('SubagentStop', (b) => !!b.agent_type), 60000, k);
    await sleep(15000);
    claude.snap('ende');
    await exitClaude();
  } else if (scenario === 'exit') {
    await start();
    const m = await prompt(BG(AGENT_TASK(40)));
    const stop = await mainStop(m);
    tl.step(`Stop: ${stop ? short(stop.body) : 'NEIN'}`);
    await sleep(3000);
    exitExpected = true;
    await claude.type('/exit');
    await sleep(3000);
    claude.snap('nach-exit');
    let ex = await Promise.race([claude.exited, sleep(3000).then(() => null)]);
    if (!ex) {
      // Dialog „Background work is running“: 1. Exit and stop tasks (vorausgewählt)
      tl.step('claude läuft nach /exit noch; Enter (Exit and stop tasks)');
      claude.write('\r', 'Enter');
      await sleep(2000);
      claude.snap('nach-enter');
      ex = await Promise.race([claude.exited, sleep(15000).then(() => null)]);
    }
    result.checks.exit = ex;
    // Kommen nach dem Ende noch Ereignisse an?
    await sleep(10000);
  } else if (scenario === 'drei') {
    // Ein Prompt für drei Fragen: Agent über die Aufgabenliste stoppen, /clear und /exit, während Agenten laufen.
    await start();
    const m = await prompt(
      'Use the Agent tool exactly three times, in parallel in one message, all with subagent_type "general-purpose" and ' +
        `run_in_background: true. First agent's prompt: "${AGENT_TASK(45, 'A')}" ` +
        `Second agent's prompt: "${AGENT_TASK(45, 'B')}" ` +
        `Third agent's prompt: "${AGENT_TASK(150, 'C')}" ` +
        'Do not wait for the agents and do not check on them. After launching all three, reply only with OK.',
    );
    const stop = await mainStop(m);
    tl.step(`Stop: ${stop ? short(stop.body) : 'NEIN'}`);
    await sleep(3000);
    // 1. Über die Aufgabenliste stoppen: bei mehreren Aufgaben zuerst die Liste, Enter öffnet die erste.
    await claude.type('/tasks');
    await sleep(2500);
    let s = claude.snap('tasks');
    if (!/x to stop/.test(s) || !/Progress/.test(s)) {
      claude.write('\r', 'Enter (erste Aufgabe öffnen)');
      await sleep(2000);
      s = claude.snap('tasks-detail');
    }
    const k = srv.events.length;
    const stopAt = tl.now();
    if (/x to stop/.test(s)) claude.write('x', 'x (stoppen)');
    await sleep(3000);
    claude.snap('nach-x');
    const note = await srv.waitFor(is('UserPromptSubmit', taskNotification), 8000, k);
    tl.step(`nach x: ${srv.events.slice(k).map((e) => short(e.body)).join(' | ') || 'nichts'}`);
    result.checks.stopUi = { stopAt, notification: note ? note.t - stopAt : null };
    for (let i = 0; i < 3 && /Esc to close|to go back/i.test(claude.text()); i++) {
      claude.write('\x1b', 'Esc (Dialog schliessen)');
      await sleep(800);
    }
    if (note) await mainStop(srv.events.indexOf(note), 30000);
    await sleep(3000);
    claude.snap('vor-clear');
    // 2. /clear, während noch zwei Agenten laufen.
    const c = srv.events.length;
    await claude.type('/clear');
    await sleep(2500);
    s = claude.snap('nach-clear');
    if (/Enter to confirm/i.test(s)) {
      tl.step('/clear fragt nach; Enter (erste Wahl)');
      claude.write('\r', 'Enter');
      await sleep(2000);
      claude.snap('nach-clear-enter');
    }
    // Endet der Agent mit 45 s nach /clear? Was kommt dann, mit welcher Session?
    await srv.waitFor(is('SubagentStop', (b) => !!b.agent_type), 45000, c);
    await sleep(12000);
    claude.snap('vor-exit');
    tl.step(`nach /clear: ${srv.events.slice(c).map((e) => short(e.body)).join(' | ') || 'nichts'}`);
    // 3. /exit, während der dritte Agent noch läuft.
    exitExpected = true;
    const x = srv.events.length;
    await claude.type('/exit');
    await sleep(2500);
    claude.snap('nach-exit');
    let ex = await Promise.race([claude.exited, sleep(2000).then(() => null)]);
    if (!ex) {
      tl.step('claude läuft nach /exit noch; Enter (Exit and stop tasks)');
      claude.write('\r', 'Enter');
      ex = await Promise.race([claude.exited, sleep(15000).then(() => null)]);
    }
    result.checks.exit = ex;
    await sleep(8000);
    tl.step(`nach /exit: ${srv.events.slice(x).map((e) => short(e.body)).join(' | ') || 'nichts'}`);
  } else {
    throw new Error('unbekanntes Szenario ' + scenario);
  }
  await finish(0);
} catch (err) {
  tl.step('FEHLER ' + (err?.stack || err));
  await finish(1);
}
}

// ---------- redigierte Beispiele und Zeitachsen ----------

/**
 * Schreibt redigierte Beispiele neuer Ereignisse nach samples/ (bestehende Beispiele bleiben) und die Zeitachsen aller
 * Szenarien nach befunde-agenten.json. Gelesen wird die Zeitachse jedes Laufs; Tab und Token stehen in den Kopfzeilen.
 */
function writeSamples() {
  // Die Szenarien in der Reihenfolge, in der sie ausgewertet werden; die ersten liefern die Beispiele.
  const ORDER = ['hintergrund', 'zwei', 'esc', 'stoppen', 'drei', 'exit', 'rueckfrage', 'vordergrund'];
  const user = process.env.USERNAME || '';
  const shortUser = user ? user.slice(0, 6).toUpperCase() + '~1' : null;
  const anon = (s, ctx) => {
    if (typeof s !== 'string') return s;
    let r = s;
    if (ctx.token) r = r.split(ctx.token).join('<token>');
    if (ctx.tab) r = r.split(ctx.tab).join('<tab-id>');
    if (user) r = r.split(user).join('<user>');
    if (shortUser) r = r.split(shortUser).join('<USER~1>').split(shortUser.replace('~', '-')).join('<USER-1>');
    return r;
  };
  const cut = (v, n = 200) => (typeof v === 'string' && v.length > n ? v.slice(0, n) + `… [+${v.length - n} Zeichen]` : v);
  const tag = (text, name) => (new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(text) || [])[1];
  const agentMessageFrom = (prompt) => /^<agent-message from="([^"]+)">/.exec(prompt || '')?.[1];
  const redactPrompt = (p) => {
    if (taskNotification({ prompt: p })) {
      // Aufbau und Kennung bleiben, damit die Tests die Meldung einem Agenten zuordnen können.
      return (
        `<task-notification>\n<task-id>${tag(p, 'task-id')}</task-id>\n<tool-use-id>${tag(p, 'tool-use-id')}</tool-use-id>\n` +
        `<output-file>…</output-file>\n<status>${tag(p, 'status')}</status>\n<summary>${tag(p, 'summary')}</summary>\n` +
        `…(gekuerzt)…\n</task-notification>`
      );
    }
    const from = agentMessageFrom(p);
    if (from) return `<agent-message from="${from}">\n[Subagent hand-back] …(gekuerzt)…\n  <redigiert>\n</agent-message>`;
    return '<redigiert>';
  };
  const redact = (body, ctx) => {
    const b = JSON.parse(JSON.stringify(body));
    if ('prompt' in b) b.prompt = redactPrompt(b.prompt);
    if ('last_assistant_message' in b) b.last_assistant_message = '<redigiert>';
    if (b.tool_input?.prompt) b.tool_input.prompt = '<redigiert>';
    if (b.tool_input?.message) b.tool_input.message = '<redigiert>';
    if (b.tool_response) {
      const tr = JSON.stringify(b.tool_response);
      b.tool_response = tr.length > 300 ? `<gekuerzt, ${tr.length} Zeichen JSON>` : b.tool_response;
    }
    const walk = (o) => {
      for (const k of Object.keys(o)) {
        // Der Prompt ist schon redigiert und bleibt ganz, damit Aufbau und Kennungen erhalten bleiben.
        if (typeof o[k] === 'string') o[k] = k === 'prompt' ? anon(o[k], ctx) : cut(anon(o[k], ctx));
        else if (o[k] && typeof o[k] === 'object') walk(o[k]);
      }
    };
    walk(b);
    return b;
  };
  /** Name des Beispiels für ein Ereignis; `null`, wenn es dafür schon eines gibt oder es nichts Neues zeigt. */
  const sampleName = (b) => {
    const ev = b.hook_event_name;
    switch (ev) {
      case 'SubagentStart':
        return ev;
      case 'SubagentStop':
        return b.agent_type ? ev : `${ev}-helfer`;
      case 'Stop':
        return b.background_tasks?.some((x) => x.type === 'subagent') ? `${ev}-mit-agent` : null;
      case 'UserPromptSubmit':
        if (agentMessageFrom(b.prompt)) return `${ev}-agent-message`;
        if (taskNotification(b) && /<summary>Agent /.test(b.prompt)) {
          return `${ev}-task-notification-agent${tag(b.prompt, 'status') === 'killed' ? '-killed' : ''}`;
        }
        return null;
      case 'PreToolUse':
      case 'PostToolUse':
      case 'PostToolUseFailure':
        if (b.agent_id) return `${ev}-${b.tool_name}-aus-agent`;
        return b.tool_name === 'Agent' ? `${ev}-Agent` : null;
      case 'PermissionRequest':
      case 'PermissionDenied':
        return b.agent_id ? `${ev}-aus-agent` : null;
      case 'Notification':
        return b.agent_id ? `${ev}-${b.notification_type}-aus-agent` : null;
      case 'PostToolBatch':
      case 'TaskCreated':
      case 'TaskCompleted':
      case 'TeammateIdle':
        return ev;
      default:
        return null;
    }
  };
  const OUT = path.join(HERE, 'samples');
  const seen = new Set();
  const befunde = {};
  for (const name of ORDER) {
    const tlFile = path.join(RAW_DIR, name, 'timeline.jsonl');
    if (!fs.existsSync(tlFile)) continue;
    const lines = fs.readFileSync(tlFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    const hooks = lines.filter((e) => e.kind === 'hook' && e.body?.hook_event_name);
    const ctx = { tab: hooks[0]?.headers?.['x-spike-tab'], token: hooks[0]?.headers?.['x-spike-token'] };
    const sids = new Map();
    const agents = new Map();
    const label = (map, id, prefix) => {
      if (!id) return undefined;
      if (!map.has(id)) map.set(id, `${prefix}${map.size + 1}`);
      return map.get(id);
    };
    // Prompts, die bei Claude ankamen (Meldungen über Agenten und Aufgaben beginnen mit „<“).
    const prompts = hooks.filter((e) => e.body.hook_event_name === 'UserPromptSubmit' && !/^</.test(e.body.prompt || '')).length;
    befunde[name] = {
      prompts,
      zeitachse: lines
        .filter((e) => e.kind === 'hook' || e.kind === 'key' || e.kind === 'exit' || (e.kind === 'step' && /ZEITGRENZE|FEHLER|unerwartet/.test(e.msg)))
        .map((e) => {
          const t = +(e.t / 1000).toFixed(2);
          if (e.kind === 'key') return { t, taste: /^tippe: (?!\/)/.test(e.label) ? 'tippe: <Prompt>' : anon(e.label, ctx) };
          if (e.kind === 'exit') return { t, ende: e.exitCode };
          if (e.kind === 'step') return { t, schritt: anon(e.msg, ctx) };
          const b = e.body;
          const entry = { t, ereignis: b.hook_event_name, session: label(sids, b.session_id, 'S') };
          if (b.agent_id) entry.agent = label(agents, b.agent_id, 'A');
          if (b.agent_id && b.agent_type !== undefined) entry.agent_type = b.agent_type;
          for (const k of ['source', 'reason', 'notification_type', 'tool_name']) if (b[k]) entry[k] = b[k];
          if (b.hook_event_name === 'PreToolUse' && b.tool_name === 'Agent' && 'run_in_background' in (b.tool_input || {})) {
            entry.run_in_background = b.tool_input.run_in_background;
          }
          if (Array.isArray(b.background_tasks)) {
            entry.background_tasks = b.background_tasks.map((x) => (x.type === 'subagent' ? `${label(agents, x.id, 'A')}:${x.status}` : `${x.type}:${x.status}`));
          }
          if (taskNotification(b)) entry.task_notification = { task: label(agents, tag(b.prompt, 'task-id'), 'A') ?? 'shell', status: tag(b.prompt, 'status') };
          const from = agentMessageFrom(b.prompt);
          if (from) entry.agent_message = label(agents, from, 'A');
          return entry;
        }),
    };
    for (const e of hooks) {
      const key = sampleName(e.body);
      if (key === null || seen.has(key)) continue;
      seen.add(key);
      const sample = { szenario: `agenten-${name}`, pfad: e.path, nutzdaten: redact(e.body, ctx) };
      fs.writeFileSync(path.join(OUT, `${key}.json`), JSON.stringify(sample, null, 2) + '\n');
    }
  }
  fs.writeFileSync(path.join(HERE, 'befunde-agenten.json'), JSON.stringify(befunde, null, 2) + '\n');
  console.log([...seen].join('\n'));
}

// ---------- kleiner Nachbau des Bildschirms ----------

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
