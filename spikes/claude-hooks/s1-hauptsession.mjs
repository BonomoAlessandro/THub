// S1: Hauptsession mit echten Prompts (haiku). Sammelt die Nutzdaten aller Ereignisse und prueft
// Esc-Unterbrechung, Berechtigungsfrage, idle_prompt-Verzoegerung, AskUserQuestion, /clear und /exit.
// Kosten: bis zu 5 Prompts (im aufgezeichneten Lauf 4, siehe docs/spikes/claude-hooks.md).
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {
  Timeline, startHookServer, hookSettings, writeJson, termhubEnv, runPty, findClaudeExe,
  acceptTrustIfShown, prepareWorkspace, userHookFiles, saveScenario, isEvent, sleep, typeLine, RAW_DIR,
} from './lib.mjs';

const NAME = 's1-hauptsession';
const IDLE_WAIT = Number(process.env.IDLE_WAIT || 80000);
const tl = new Timeline(path.join(RAW_DIR, NAME, 'timeline.jsonl'));
const srv = await startHookServer(tl);
const dir = prepareWorkspace(NAME, { 'a.txt': 'Inhalt von a\n' });
const uh = userHookFiles(dir);
writeJson(path.join(dir, '.claude', 'settings.local.json'), uh.settings);
const hookFile = writeJson(path.join(RAW_DIR, NAME, 'termhub-hooks.json'), hookSettings(srv.base));
const sid = crypto.randomUUID();
const tab = 'tab-' + crypto.randomUUID();
const token = crypto.randomBytes(16).toString('hex');
const dbg = path.join(RAW_DIR, NAME, 'debug.log');
fs.rmSync(dbg, { force: true });
fs.rmSync(path.join(RAW_DIR, NAME, 'raw.txt'), { force: true });

const args = ['--model', 'haiku', '--settings', hookFile, '--session-id', sid, '-n', 'Spike Eins', '--permission-mode', 'manual', '--debug-file', dbg];
tl.step(`Start claude ${args.join(' ')} in ${dir}`);
const p = runPty(tl, {
  file: findClaudeExe(),
  args,
  cwd: dir,
  env: termhubEnv({ TERMHUB_TAB_ID: tab, TERMHUB_TOKEN: token, TERMHUB_API: srv.base }),
  rawFile: path.join(RAW_DIR, NAME, 'raw.txt'),
});

const result = { sid, tab, token, checks: {} };
const mark = () => srv.events.length;
const waitEv = (name, ms, from, extra) => srv.waitFor(isEvent(name, extra), ms, from);

async function idleCheck(label, sinceT) {
  const m = mark();
  tl.step(`${label}: warte bis ${IDLE_WAIT / 1000}s auf Notification idle_prompt`);
  const ev = await waitEv('Notification', IDLE_WAIT, m, (b) => b.notification_type === 'idle_prompt');
  result.checks[label] = ev ? { idleAfterMs: ev.t - sinceT } : { idleAfterMs: null };
  tl.step(`${label}: idle_prompt ${ev ? `nach ${((ev.t - sinceT) / 1000).toFixed(1)}s` : 'kam NICHT'}`);
}

try {
  const startEv = srv.waitFor(isEvent('SessionStart'), 40000);
  result.trustDialog = await acceptTrustIfShown(p, tl, 8000);
  const ss = await startEv;
  tl.step(`SessionStart (per curl-Befehls-Hook): ${ss ? ss.body.session_id : 'NEIN'}`);
  await sleep(3000);
  p.snap('bereit');

  // P1: einfache Antwort
  let m = mark();
  await typeLine(p, 'Antworte nur mit OK');
  let stop = await waitEv('Stop', 90000, m);
  tl.step(`P1 Stop: ${stop ? 'ja' : 'NEIN'}`);
  p.snap('nach-P1');
  await idleCheck('idle-nach-Stop', stop ? stop.t : tl.now());

  // P2: Werkzeug ohne Rueckfrage (Read im Arbeitsordner)
  m = mark();
  await typeLine(p, 'Lies die Datei a.txt mit dem Read-Tool und antworte nur mit ihrem Inhalt.');
  stop = await waitEv('Stop', 90000, m);
  tl.step(`P2 Stop: ${stop ? 'ja' : 'NEIN'}`);
  p.snap('nach-P2');
  await sleep(2000);

  // P3: Berechtigungsfrage, ablehnen mit Esc
  m = mark();
  await typeLine(p, 'Fuehre mit dem Bash-Tool genau diesen Befehl aus: echo hi > hi.txt');
  const permReq = await waitEv('PermissionRequest', 60000, m);
  tl.step(`P3 PermissionRequest: ${permReq ? 'ja' : 'NEIN'}`);
  const permNote = await waitEv('Notification', 20000, m, (b) => b.notification_type === 'permission_prompt');
  tl.step(`P3 Notification permission_prompt: ${permNote ? `nach ${((permNote.t - (permReq?.t ?? 0)) / 1000).toFixed(1)}s ab PermissionRequest` : 'NEIN'}`);
  result.checks.permissionPromptDelayMs = permNote && permReq ? permNote.t - permReq.t : null;
  p.snap('P3-berechtigungsfrage');
  const m3 = mark();
  const escT = tl.now();
  p.write('\x1b', 'Esc (Berechtigung ablehnen)');
  await sleep(8000);
  p.snap('P3-nach-esc');
  result.checks.afterPermissionEsc = srv.events.slice(m3).map((e) => e.body?.hook_event_name + (e.body?.notification_type ? ':' + e.body.notification_type : ''));
  tl.step(`P3 Ereignisse nach Esc: ${result.checks.afterPermissionEsc.join(', ') || 'keine'}`);
  await idleCheck('idle-nach-Ablehnung', escT);

  // P4: lange Antwort, mit Esc unterbrechen
  m = mark();
  await typeLine(p, 'Schreibe die Zahlen von 1 bis 400 aus, jede auf einer eigenen Zeile, ohne weiteren Text.');
  const ups = await waitEv('UserPromptSubmit', 30000, m);
  await sleep(2500);
  const m4 = mark();
  const esc4 = tl.now();
  p.write('\x1b', 'Esc (Antwort unterbrechen)');
  await sleep(1500);
  p.snap('P4-nach-esc');
  await sleep(6000);
  result.checks.afterInterruptEsc = srv.events.slice(m4).map((e) => e.body?.hook_event_name);
  result.checks.stopBeforeEsc = srv.events.slice(m, m4).some((e) => e.body?.hook_event_name === 'Stop');
  tl.step(`P4 Stop vor Esc: ${result.checks.stopBeforeEsc}; Ereignisse nach Esc: ${result.checks.afterInterruptEsc.join(', ') || 'keine'}`);
  await idleCheck('idle-nach-Unterbrechung', esc4);

  // P5: AskUserQuestion (Claude fragt zurueck)
  m = mark();
  await typeLine(p, 'Benutze das AskUserQuestion-Tool und frag mich, ob ich Tee oder Kaffee will. Sonst nichts.');
  await sleep(15000);
  p.snap('P5-frage');
  result.checks.askEvents = srv.events.slice(m).map((e) => e.body?.hook_event_name + (e.body?.tool_name ? ':' + e.body.tool_name : '') + (e.body?.notification_type ? ':' + e.body.notification_type : ''));
  tl.step(`P5 Ereignisse: ${result.checks.askEvents.join(', ')}`);
  const m5 = mark();
  p.write('\x1b', 'Esc (Frage abbrechen)');
  await sleep(6000);
  p.snap('P5-nach-esc');
  result.checks.afterAskEsc = srv.events.slice(m5).map((e) => e.body?.hook_event_name + (e.body?.tool_name ? ':' + e.body.tool_name : ''));
  tl.step(`P5 Ereignisse nach Esc: ${result.checks.afterAskEsc.join(', ') || 'keine'}`);

  // /clear
  m = mark();
  await typeLine(p, '/clear');
  await sleep(6000);
  p.snap('nach-clear');
  result.checks.clearEvents = srv.events.slice(m).map((e) => ({ ev: e.body?.hook_event_name, src: e.body?.source || e.body?.reason, sid: e.body?.session_id, path: e.path }));
  tl.step(`/clear: ${JSON.stringify(result.checks.clearEvents)}`);

  // /exit
  m = mark();
  await typeLine(p, '/exit');
  result.exit = await Promise.race([p.exited, sleep(20000).then(() => null)]);
  await sleep(1000);
  result.checks.exitEvents = srv.events.slice(m).map((e) => ({ ev: e.body?.hook_event_name, reason: e.body?.reason, sid: e.body?.session_id }));
  tl.step(`/exit: ${JSON.stringify(result.exit)} ${JSON.stringify(result.checks.exitEvents)}`);
} catch (err) {
  tl.step('FEHLER ' + err.stack);
  p.snap('fehler');
} finally {
  p.kill();
  await srv.close();
}
result.userHookLog = fs.existsSync(uh.log) ? fs.readFileSync(uh.log, 'utf8') : null;
result.events = srv.events.map((e) => ({ t: e.t, path: e.path, headers: e.headers, body: e.body }));
saveScenario(NAME, result);
console.log(JSON.stringify(result.checks, null, 2));
process.exit(0);
