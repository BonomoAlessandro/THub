// Gemeinsame Bausteine fuer den Spike: Hook-Empfaenger, Hook-Datei, Umgebung, Claude in node-pty.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import headless from '@xterm/headless';

const require = createRequire(import.meta.url);
const pty = require('node-pty'); // aus node_modules im Wurzelordner des Repos

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Ausgabeordner fuer Rohdaten (nicht eingecheckt) und Temp-Ordner fuer die Claude-Sessions. */
export const RAW_DIR = process.env.SPIKE_RAW_DIR || path.join(os.tmpdir(), 'termhub-spike-raw');
export const WS_DIR = process.env.SPIKE_WS_DIR || path.join(os.tmpdir(), 'termhub-spike-ws');

export function findClaudeExe() {
  const out = execFileSync('where.exe', ['claude'], { encoding: 'utf8' });
  const lines = out.split(/\r?\n/).filter(Boolean);
  return lines.find((l) => l.toLowerCase().endsWith('claude.exe')) || lines[0];
}

/** Gemeinsame Zeitachse fuer Schritte, Bildschirm und Hook-Ereignisse. */
export class Timeline {
  constructor(file) {
    this.t0 = Date.now();
    this.file = file;
    this.entries = [];
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '');
  }
  now() {
    return Date.now() - this.t0;
  }
  add(entry) {
    const e = { t: this.now(), ...entry };
    this.entries.push(e);
    fs.appendFileSync(this.file, JSON.stringify(e) + '\n');
    return e;
  }
  step(msg) {
    console.log(`[${(this.now() / 1000).toFixed(1)}s] ${msg}`);
    return this.add({ kind: 'step', msg });
  }
}

/**
 * HTTP-Hook-Empfaenger auf 127.0.0.1. Antwortet sofort mit 200 und leerem Inhalt
 * (ausser delayMs ist gesetzt). Jede Anfrage landet in der Zeitachse.
 */
export function startHookServer(timeline, { port = 0, delayMs = 0, status = 200 } = {}) {
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
      const e = timeline.add({
        kind: 'hook',
        method: req.method,
        path: req.url,
        headers: req.headers,
        body: json,
      });
      events.push(e);
      const label = json?.hook_event_name || req.url;
      const extra = json?.source || json?.reason || json?.notification_type || json?.tool_name || '';
      console.log(`[${(e.t / 1000).toFixed(1)}s]   <- hook ${req.url} ${label} ${extra} sid=${json?.session_id ?? '-'}`);
      for (const w of [...waiters]) {
        if (w.pred(e)) {
          waiters.splice(waiters.indexOf(w), 1);
          w.resolve(e);
        }
      }
      const reply = () => {
        res.writeHead(status, { 'content-length': '0' });
        res.end();
      };
      if (delayMs) setTimeout(reply, delayMs);
      else reply();
    });
  });
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      const addr = server.address();
      resolve({
        server,
        port: addr.port,
        base: `http://127.0.0.1:${addr.port}`,
        events,
        /** wartet auf ein Ereignis, das pred erfuellt; beruecksichtigt auch bereits eingetroffene ab Index from */
        waitFor(pred, timeoutMs, from = 0) {
          const hit = events.slice(from).find(pred);
          if (hit) return Promise.resolve(hit);
          return new Promise((res, rej) => {
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

export const isEvent = (name, extra = () => true) => (e) => e.body?.hook_event_name === name && extra(e.body);

export const TERMHUB_EVENTS = [
  'SessionStart',
  'SessionEnd',
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'Stop',
  'StopFailure',
  'Notification',
];
// Zusaetzlich im Spike beobachtet, um Luecken der Spezifikation zu finden.
export const SPIKE_EXTRA_EVENTS = ['PermissionRequest', 'PermissionDenied'];

/** Erzeugt eine Hook-Datei wie in der Spezifikation (plus Pruef-Kopfzeilen fuer den Spike). */
export function hookSettings(base, { events = [...TERMHUB_EVENTS, ...SPIKE_EXTRA_EVENTS], prefix = '/hooks', timeout = 5, spikeHeaders = true, sessionStartCommand = true, extra = {} } = {}) {
  const hooks = {};
  for (const ev of events) {
    const headers = {
      'X-TermHub-Tab': '$TERMHUB_TAB_ID',
      'X-TermHub-Token': '$TERMHUB_TOKEN',
    };
    if (spikeHeaders) {
      headers['X-Spike-Braces'] = '${TERMHUB_TAB_ID}';
      headers['X-Spike-Mixed'] = 'tab=$TERMHUB_TAB_ID;end';
      headers['X-Spike-Unlisted'] = '$USERNAME';
    }
    hooks[ev] = [
      {
        hooks: [
          {
            type: 'http',
            url: `${base}${prefix}/${ev}`,
            timeout,
            headers,
            allowedEnvVars: ['TERMHUB_TAB_ID', 'TERMHUB_TOKEN'],
          },
        ],
      },
    ];
  }
  if (sessionStartCommand && hooks.SessionStart) {
    hooks.SessionStart[0].hooks.push(curlForwardHook(`${base}${prefix}-cmd/SessionStart`, timeout));
  }
  return { hooks, ...extra };
}

/**
 * Ersatz fuer den (nicht unterstuetzten) HTTP-Hook bei SessionStart: Befehls-Hook in "exec form"
 * (ohne Shell) mit dem curl.exe von Windows, das die Nutzdaten von stdin weiterleitet. Die Kopfzeilen
 * holt curl selbst aus der Umgebung (--variable %NAME, --expand-header).
 */
export function curlForwardHook(url, timeout = 5) {
  return {
    type: 'command',
    command: 'C:\\Windows\\System32\\curl.exe',
    args: [
      '-s', '-S', '-m', '2', '--noproxy', '*',
      '--variable', '%TERMHUB_TAB_ID=', '--variable', '%TERMHUB_TOKEN=',
      '--expand-header', 'X-TermHub-Tab: {{TERMHUB_TAB_ID}}',
      '--expand-header', 'X-TermHub-Token: {{TERMHUB_TOKEN}}',
      '-H', 'Content-Type: application/json',
      '--data-binary', '@-',
      url,
    ],
    timeout,
  };
}

export function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj, null, 2));
  return file;
}

/** Umgebung wie in einem TermHub-Terminal: ohne Variablen der umgebenden Claude-Session. */
export function termhubEnv(extra = {}) {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (/^CLAUDE/i.test(k) || k === 'AI_AGENT' || /^TERMHUB_/.test(k)) continue;
    env[k] = v;
  }
  env.NO_PROXY = [env.NO_PROXY, '127.0.0.1,localhost'].filter(Boolean).join(',');
  return { ...env, ...extra };
}

/** Startet ein Programm in einem echten Pseudoterminal und spiegelt den Bildschirm in xterm-headless. */
export function runPty(timeline, { file, args, cwd, env, cols = 120, rows = 40, rawFile }) {
  const term = new headless.Terminal({ cols, rows, allowProposedApi: true, scrollback: 2000 });
  const proc = pty.spawn(file, args, { name: 'xterm-256color', cols, rows, cwd, env, useConpty: true });
  timeline.add({ kind: 'spawn', file, args, cwd, pid: proc.pid });
  let raw = '';
  proc.onData((d) => {
    raw += d;
    term.write(d);
    if (rawFile) fs.appendFileSync(rawFile, d);
  });
  const exited = new Promise((resolve) => {
    proc.onExit(({ exitCode, signal }) => {
      timeline.add({ kind: 'exit', exitCode, signal });
      console.log(`[${(timeline.now() / 1000).toFixed(1)}s] Prozess beendet, exitCode=${exitCode} signal=${signal}`);
      resolve({ exitCode, signal, t: timeline.now() });
    });
  });
  const screen = () => {
    const b = term.buffer.active;
    const lines = [];
    for (let i = 0; i < b.length; i++) lines.push(b.getLine(i)?.translateToString(true) ?? '');
    // nur den sichtbaren Bereich plus etwas Scrollback
    return lines.slice(Math.max(0, b.length - rows - 20)).join('\n').replace(/\n+$/, '');
  };
  const visible = () => {
    const b = term.buffer.active;
    const lines = [];
    for (let i = b.viewportY; i < b.viewportY + rows; i++) lines.push(b.getLine(i)?.translateToString(true) ?? '');
    return lines.join('\n').replace(/\s+$/, '');
  };
  let done = false;
  exited.then(() => (done = true));
  return {
    proc,
    exited,
    get done() {
      return done;
    },
    raw: () => raw,
    screen,
    visible,
    snap(label) {
      const s = visible();
      timeline.add({ kind: 'screen', label, text: s });
      return s;
    },
    write(s, label) {
      timeline.add({ kind: 'key', label: label || JSON.stringify(s) });
      proc.write(s);
    },
    async waitScreen(re, timeoutMs = 15000) {
      const end = Date.now() + timeoutMs;
      while (Date.now() < end) {
        if (re.test(visible())) return true;
        if (done) return false;
        await sleep(200);
      }
      return false;
    },
    kill() {
      if (done) return;
      try {
        proc.kill();
      } catch {}
    },
  };
}

/** Schreibt schrittweise Zeichen (Claude erkennt sonst ein Einfuegen) und dann Enter. */
export async function typeLine(p, text, { enter = true, delay = 15 } = {}) {
  p.write('', `tippe: ${text}`);
  for (const ch of text) {
    p.proc.write(ch);
    await sleep(delay);
  }
  if (enter) {
    await sleep(300);
    p.write('\r', 'Enter');
  }
}

/** Wartet auf den Vertrauensdialog fuer neue Ordner und bestaetigt ihn; true, wenn er kam. */
export async function acceptTrustIfShown(p, timeline, timeoutMs = 20000) {
  const ok = await p.waitScreen(/Yes, I trust this folder/i, timeoutMs);
  if (ok) {
    timeline.step('Vertrauensdialog sichtbar, waehle "Yes, I trust this folder"');
    p.snap('trust-dialog');
    await sleep(500);
    for (let i = 0; i < 3 && !/❯\s*Yes, I trust/.test(p.visible()); i++) {
      p.write('\x1b[B', 'Pfeil runter');
      await sleep(400);
    }
    if (!/❯\s*Yes, I trust/.test(p.visible())) throw new Error('Konnte "Yes, I trust" nicht auswaehlen');
    p.write('\r', 'Enter (trust)');
    return true;
  }
  return false;
}

export function prepareWorkspace(name, files = {}) {
  const dir = path.join(WS_DIR, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  for (const [rel, content] of Object.entries(files)) {
    const f = path.join(dir, rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, typeof content === 'string' ? content : JSON.stringify(content, null, 2));
  }
  return dir;
}

/** Projekt-Hook des "Nutzers" (Befehls-Hook), um zu pruefen, dass eigene Hooks weiterlaufen. */
export function userHookFiles(dir) {
  const script = path.join(dir, 'userhook.cjs').replace(/\\/g, '/');
  const log = path.join(dir, 'user-hook.log').replace(/\\/g, '/');
  const code = `let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{let j={};try{j=JSON.parse(d)}catch{};require('fs').appendFileSync(${JSON.stringify(log)}, JSON.stringify({at:Date.now(),ev:j.hook_event_name,src:j.source||j.reason||''})+'\\n')});`;
  fs.writeFileSync(script, code);
  const cmd = `node "${script}"`;
  return {
    log,
    settings: {
      hooks: {
        SessionStart: [{ hooks: [{ type: 'command', command: cmd }] }],
        UserPromptSubmit: [{ hooks: [{ type: 'command', command: cmd }] }],
        Stop: [{ hooks: [{ type: 'command', command: cmd }] }],
        SessionEnd: [{ hooks: [{ type: 'command', command: cmd }] }],
      },
    },
  };
}

export function saveScenario(name, data) {
  const dir = path.join(RAW_DIR, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify(data, null, 2));
  return dir;
}
