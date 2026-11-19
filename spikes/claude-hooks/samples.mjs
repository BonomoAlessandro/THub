// Zieht aus den Rohdaten je Ereignis (und Variante) ein gekuerztes, redigiertes Beispiel
// und legt es unter samples/ ab. Prompt-Texte und Antworten werden ersetzt, Benutzername und
// Token anonymisiert.
import fs from 'node:fs';
import path from 'node:path';
import { RAW_DIR } from './lib.mjs';

const OUT = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), 'samples');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const user = process.env.USERNAME || '';
const short = user ? user.slice(0, 6).toUpperCase() + '~1' : null;

function anon(s, ctx) {
  if (typeof s !== 'string') return s;
  let r = s;
  if (ctx.token) r = r.split(ctx.token).join('<token>');
  if (ctx.tab) r = r.split(ctx.tab).join('<tab-id>');
  if (user) r = r.split(user).join('<user>');
  if (short) r = r.split(short).join('<USER~1>').split(short.replace('~', '-')).join('<USER-1>');
  return r;
}

function cut(v, n = 120) {
  if (typeof v !== 'string') return v;
  return v.length > n ? v.slice(0, n) + `… [+${v.length - n} Zeichen]` : v;
}

function redact(body, ctx) {
  const b = JSON.parse(JSON.stringify(body));
  if ('prompt' in b) b.prompt = /^<task-notification>/.test(b.prompt) ? '<task-notification>…(gekuerzt)…</task-notification>' : '<redigiert>';
  if ('last_assistant_message' in b && b.hook_event_name !== 'StopFailure') b.last_assistant_message = '<redigiert>';
  if (b.tool_response) {
    const tr = JSON.stringify(b.tool_response);
    b.tool_response = tr.length > 300 ? `<gekuerzt, ${tr.length} Zeichen JSON>` : b.tool_response;
  }
  if (b.tool_input?.questions) b.tool_input = { questions: '<gekuerzt>' };
  const walk = (o) => {
    for (const k of Object.keys(o)) {
      if (typeof o[k] === 'string') o[k] = cut(anon(o[k], ctx), 200);
      else if (o[k] && typeof o[k] === 'object') walk(o[k]);
    }
  };
  walk(b);
  return b;
}

function pickHeaders(h, ctx) {
  const keep = ['x-termhub-tab', 'x-termhub-token', 'x-spike-braces', 'x-spike-mixed', 'x-spike-unlisted', 'user-agent', 'content-type'];
  const r = {};
  for (const k of keep) if (k in h) r[k] = anon(h[k], ctx);
  return r;
}

const seen = new Map();
// Hauptsession (s1) zuerst, damit die Beispiele dort herkommen, wo -n gesetzt war.
const order = (n) => (n.startsWith('s1') ? 0 : n.startsWith('s') ? 1 : 2);
for (const name of fs.readdirSync(RAW_DIR).sort((a, b) => order(a) - order(b) || a.localeCompare(b))) {
  const f = path.join(RAW_DIR, name, 'result.json');
  if (!fs.existsSync(f)) continue;
  const r = JSON.parse(fs.readFileSync(f, 'utf8'));
  const ctx = { token: r.token, tab: r.tab };
  for (const e of r.events || []) {
    const b = e.body;
    if (!b?.hook_event_name) continue;
    let variant = b.source || b.reason || b.notification_type || b.tool_name || b.error || '';
    if (b.hook_event_name === 'Stop') variant = b.background_tasks?.length ? 'mit-background_tasks' : '';
    if (b.hook_event_name === 'UserPromptSubmit' && /^<task-notification>/.test(b.prompt || '')) variant = 'task-notification';
    const key = `${b.hook_event_name}${variant ? '-' + variant : ''}`;
    if (seen.has(key)) continue;
    const sample = { szenario: name, pfad: e.path, kopfzeilen: pickHeaders(e.headers || {}, ctx), nutzdaten: redact(b, ctx) };
    seen.set(key, sample);
    fs.writeFileSync(path.join(OUT, `${key}.json`), JSON.stringify(sample, null, 2) + '\n');
  }
}
console.log([...seen.keys()].join('\n'));

// Kompakte Befunde je Szenario (Ablauf der Hook-Ereignisse mit Zeitpunkt, Exit-Code, Pruefwerte).
const befunde = {};
for (const name of fs.readdirSync(RAW_DIR).sort()) {
  const f = path.join(RAW_DIR, name, 'result.json');
  if (!fs.existsSync(f)) continue;
  const r = JSON.parse(fs.readFileSync(f, 'utf8'));
  const ctx = { token: r.token, tab: r.tab };
  const tl = path.join(RAW_DIR, name, 'timeline.jsonl');
  const steps = fs.existsSync(tl)
    ? fs.readFileSync(tl, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
        .filter((e) => e.kind === 'key' || e.kind === 'exit' || e.kind === 'hook')
        .map((e) => {
          const s = (e.t / 1000).toFixed(1) + 's ';
          if (e.kind === 'key') return s + 'Eingabe: ' + (/^tippe: (?!\/)/.test(e.label) ? 'tippe <Prompt redigiert>' : e.label);
          if (e.kind === 'exit') return s + `Prozessende exitCode=${e.exitCode}`;
          const b = e.body || {};
          const extra = b.source || b.reason || b.notification_type || b.tool_name || '';
          return s + `${e.path} ${extra} sid=${String(b.session_id || '').slice(0, 8)}`;
        })
    : [];
  befunde[name] = JSON.parse(anon(JSON.stringify({ exit: r.exit ?? null, checks: r.checks ?? {}, ablauf: steps }), ctx));
}
fs.writeFileSync(path.join(path.dirname(OUT), 'befunde.json'), JSON.stringify(befunde, null, 2) + '\n');
