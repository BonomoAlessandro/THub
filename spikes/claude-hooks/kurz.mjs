// Kurze Szenarien (meist ohne Prompt). Aufruf: node kurz.mjs <szenario> [optionen]
//   resume <sid> <ordner> [ctrlc|exit] [nosettings]   --resume mit bekannter Kennung
//   resume-missing                        --resume mit nicht existierender Kennung
//   sessionid-taken <sid> <ordner>        --session-id mit bereits benutzter Kennung
//   double-settings [reverse]             zwei --settings (unsere zuerst, dann die des Nutzers)
//   kill                                  Pseudoterminal hart schliessen (wie TermHub beim Beenden)
//   down [prompt]                         Hook-Endpunkt nicht erreichbar (Port geschlossen), 1 Prompt mit "prompt"
//   hang                                  Hook-Endpunkt nimmt an, antwortet aber nie
//   disable-all [override]                .claude/settings.local.json mit disableAllHooks: true
//   interrupt                             idle_prompt nach Stop, Bash-Rueckfrage mit Esc ablehnen (2 Prompts)
//   esc [anzahl]                          Esc waehrend der Antwort (1 Prompt)
//   bg                                    background_tasks und Ende einer Hintergrund-Aufgabe (1 Prompt)
//   invalid                               ungueltiger Hook-Eintrag: Verhalten der Oberflaeche
//   recommended                           empfohlene-hook-datei.json mit echtem Port pruefen
import path from 'node:path';
import fs from 'node:fs';
import net from 'node:net';
import crypto from 'node:crypto';
import {
  Timeline, startHookServer, hookSettings, writeJson, termhubEnv, runPty, findClaudeExe,
  acceptTrustIfShown, prepareWorkspace, saveScenario, isEvent, sleep, typeLine, RAW_DIR,
} from './lib.mjs';

const [scenario, ...rest] = process.argv.slice(2);
const variant = rest.filter((a) => !/[\\/:]/.test(a) && a.length < 12);
const NAME = `k-${scenario}${variant.length ? '-' + variant.join('-') : ''}`;
const outDir = path.join(RAW_DIR, NAME);
fs.rmSync(outDir, { recursive: true, force: true });
const tl = new Timeline(path.join(outDir, 'timeline.jsonl'));
const tab = 'tab-' + crypto.randomUUID();
const token = crypto.randomBytes(16).toString('hex');
const result = { scenario, args: rest, tab, token, checks: {} };
const cleanups = [];

async function launch(srvBase, args, cwd, { hookFile, extraEnv = {} } = {}) {
  const dbg = path.join(outDir, 'debug.log');
  const fullArgs = ['--model', 'haiku', ...(hookFile ? ['--settings', hookFile] : []), ...args, '--debug-file', dbg];
  tl.step(`Start claude ${fullArgs.join(' ')} in ${cwd}`);
  const p = runPty(tl, {
    file: findClaudeExe(),
    args: fullArgs,
    cwd,
    env: termhubEnv({ TERMHUB_TAB_ID: tab, TERMHUB_TOKEN: token, TERMHUB_API: srvBase, ...extraEnv }),
    rawFile: path.join(outDir, 'raw.txt'),
  });
  cleanups.push(() => p.kill());
  return p;
}

async function exitWith(p, how) {
  const t = tl.now();
  if (how === 'ctrlc') {
    p.write('\x03', 'Ctrl+C');
    await sleep(700);
    p.snap('nach-erstem-ctrlc');
    p.write('\x03', 'Ctrl+C');
  } else {
    await typeLine(p, '/exit');
  }
  const ex = await Promise.race([p.exited, sleep(30000).then(() => null)]);
  result.exit = ex && { ...ex, msAfterCommand: ex.t - t };
  tl.step(`Ende (${how}): ${JSON.stringify(result.exit)}`);
  return ex;
}

function collect(srv) {
  result.events = srv.events.map((e) => ({ t: e.t, path: e.path, headers: e.headers, body: e.body }));
  result.summary = srv.events.map((e) => `${e.path} ${e.body?.source || e.body?.reason || ''} sid=${e.body?.session_id}`);
}

try {
  if (scenario === 'resume') {
    const [sid, cwd, how = 'ctrlc', mode] = rest;
    const srv = await startHookServer(tl);
    cleanups.push(() => srv.close());
    // mode "nosettings": ohne --settings fortsetzen (pruefen, ob Hooks aus der ersten Sitzung nachwirken)
    const hookFile = mode === 'nosettings' ? null : writeJson(path.join(outDir, 'hooks.json'), hookSettings(srv.base));
    const p = await launch(srv.base, ['--resume', sid], cwd, { hookFile });
    await acceptTrustIfShown(p, tl, 6000);
    const ss = await srv.waitFor(isEvent('SessionStart'), hookFile ? 30000 : 12000);
    tl.step(`SessionStart: ${ss ? `${ss.body.source} sid=${ss.body.session_id} cwd=${ss.body.cwd}` : 'NEIN'}`);
    result.checks.sameId = ss ? ss.body.session_id === sid : null;
    await sleep(4000);
    p.snap('nach-resume');
    await exitWith(p, how);
    await sleep(1000);
    p.snap('nach-ende');
    collect(srv);
  } else if (scenario === 'resume-missing') {
    const srv = await startHookServer(tl);
    cleanups.push(() => srv.close());
    const hookFile = writeJson(path.join(outDir, 'hooks.json'), hookSettings(srv.base));
    const cwd = prepareWorkspace(NAME);
    const missing = crypto.randomUUID();
    result.missing = missing;
    const p = await launch(srv.base, ['--resume', missing], cwd, { hookFile });
    await acceptTrustIfShown(p, tl, 6000);
    const ex = await Promise.race([p.exited, sleep(15000).then(() => null)]);
    p.snap('bildschirm');
    result.exit = ex;
    if (!ex) {
      tl.step('Prozess laeuft nach 15s noch; beende mit Ctrl+C');
      await exitWith(p, 'ctrlc');
    }
    result.screen = p.screen();
    collect(srv);
  } else if (scenario === 'sessionid-taken') {
    const [sid, cwd] = rest;
    const srv = await startHookServer(tl);
    cleanups.push(() => srv.close());
    const hookFile = writeJson(path.join(outDir, 'hooks.json'), hookSettings(srv.base));
    const p = await launch(srv.base, ['--session-id', sid], cwd, { hookFile });
    const ex = await Promise.race([p.exited, sleep(15000).then(() => null)]);
    p.snap('bildschirm');
    result.exit = ex;
    if (!ex) await exitWith(p, 'exit');
    result.screen = p.screen();
    collect(srv);
  } else if (scenario === 'double-settings') {
    const srv = await startHookServer(tl);
    cleanups.push(() => srv.close());
    const ours = writeJson(path.join(outDir, 'termhub.json'), hookSettings(srv.base, { prefix: '/termhub' }));
    const users = writeJson(path.join(outDir, 'nutzer.json'), hookSettings(srv.base, { prefix: '/nutzer' }));
    const cwd = prepareWorkspace(NAME);
    const order = rest[0] === 'reverse' ? [users, ours] : [ours, users];
    const p = await launch(srv.base, ['--settings', order[0], '--settings', order[1]], cwd);
    await acceptTrustIfShown(p, tl, 6000);
    await srv.waitFor(isEvent('SessionStart'), 20000);
    await sleep(4000);
    p.snap('nach-start');
    await exitWith(p, 'exit');
    await sleep(1000);
    result.screen = p.screen();
    collect(srv);
  } else if (scenario === 'kill') {
    const srv = await startHookServer(tl);
    cleanups.push(() => srv.close());
    const hookFile = writeJson(path.join(outDir, 'hooks.json'), hookSettings(srv.base));
    const cwd = prepareWorkspace(NAME);
    const p = await launch(srv.base, [], cwd, { hookFile });
    await acceptTrustIfShown(p, tl, 6000);
    await srv.waitFor(isEvent('SessionStart'), 20000);
    await sleep(3000);
    const m = srv.events.length;
    tl.step('Pseudoterminal hart schliessen (pty.kill)');
    p.proc.kill();
    await Promise.race([p.exited, sleep(10000)]);
    await sleep(4000);
    result.checks.afterKill = srv.events.slice(m).map((e) => `${e.body?.hook_event_name}:${e.body?.reason}`);
    tl.step(`Nach kill: ${result.checks.afterKill.join(', ') || 'keine Ereignisse'}`);
    collect(srv);
  } else if (scenario === 'down' || scenario === 'hang') {
    // Endpunkt nicht erreichbar: Port reservieren und wieder freigeben (geschlossen).
    // hang: TCP-Server, der Verbindungen annimmt, aber nie antwortet.
    let port;
    if (scenario === 'down') {
      const s = net.createServer();
      await new Promise((r) => s.listen(0, '127.0.0.1', r));
      port = s.address().port;
      await new Promise((r) => s.close(r));
    } else {
      const sockets = [];
      const s = net.createServer((sock) => {
        sockets.push(sock);
        tl.add({ kind: 'hang-accept' });
        console.log(`[${(tl.now() / 1000).toFixed(1)}s]   <- Verbindung angenommen (keine Antwort)`);
      });
      await new Promise((r) => s.listen(0, '127.0.0.1', r));
      port = s.address().port;
      cleanups.push(() => { sockets.forEach((x) => x.destroy()); s.close(); });
    }
    const base = `http://127.0.0.1:${port}`;
    result.base = base;
    const hookFile = writeJson(path.join(outDir, 'hooks.json'), hookSettings(base));
    const cwd = prepareWorkspace(NAME);
    const p = await launch(base, [], cwd, { hookFile });
    await acceptTrustIfShown(p, tl, 6000);
    const ready = await p.waitScreen(/❯/, 30000);
    await sleep(5000);
    p.snap('nach-start');
    result.checks.readyScreen = ready;
    if (rest[0] === 'prompt') {
      const t = tl.now();
      await typeLine(p, 'Antworte nur mit OK');
      // Ende der Antwort am Bildschirm erkennen: Eingabezeile wieder leer und OK sichtbar
      let saw = false;
      for (let i = 0; i < 120 && !saw; i++) {
        await sleep(500);
        saw = /●\s*OK|⏺\s*OK|^\s*OK\s*$/m.test(p.visible());
      }
      result.checks.promptRoundTripMs = tl.now() - t;
      await sleep(8000);
      p.snap('nach-prompt');
    }
    await exitWith(p, 'exit');
    result.screen = p.screen();
  } else if (scenario === 'disable-all') {
    const srv = await startHookServer(tl);
    cleanups.push(() => srv.close());
    const extra = rest[0] === 'override' ? { disableAllHooks: false } : {};
    const hookFile = writeJson(path.join(outDir, 'hooks.json'), hookSettings(srv.base, { extra }));
    const cwd = prepareWorkspace(NAME, { '.claude/settings.local.json': { disableAllHooks: true } });
    const sid = crypto.randomUUID();
    result.sid = sid;
    const p = await launch(srv.base, ['--session-id', sid], cwd, { hookFile });
    await acceptTrustIfShown(p, tl, 6000);
    const ss = await srv.waitFor(isEvent('SessionStart'), 15000);
    tl.step(`SessionStart: ${ss ? 'ja' : 'NEIN'}`);
    await sleep(4000); // SessionStart kommt vor der Eingabebereitschaft der Oberflaeche
    p.snap('nach-start');
    await exitWith(p, 'exit');
    await sleep(1500);
    collect(srv);
    result.checks.anyHook = srv.events.length > 0;
  } else if (scenario === 'interrupt') {
    // Esc waehrend sichtbar gestreamter Antwort, danach idle_prompt abwarten; dann Bash-Rueckfrage
    // mit Esc ablehnen und wieder idle_prompt abwarten. 2 Prompts.
    const IDLE = 80000;
    const srv = await startHookServer(tl);
    cleanups.push(() => srv.close());
    const hookFile = writeJson(path.join(outDir, 'hooks.json'), hookSettings(srv.base));
    const cwd = prepareWorkspace(NAME);
    const p = await launch(srv.base, ['--permission-mode', 'manual'], cwd, { hookFile });
    await acceptTrustIfShown(p, tl, 6000);
    await srv.waitFor(isEvent('SessionStart'), 20000);
    await sleep(4000);
    // A: Unterbrechung waehrend der Ausgabe
    let m = srv.events.length;
    await typeLine(p, 'Schreibe die Zahlen von 1 bis 300 aus, jede auf einer eigenen Zeile, ohne weiteren Text.');
    const streaming = await p.waitScreen(/^\s*(●\s*)?1[0-9]\s*$/m, 60000);
    const escA = tl.now();
    p.write('\x1b', 'Esc (Antwort unterbrechen)');
    tl.step(`Ausgabe sichtbar: ${streaming}; Esc gesendet`);
    await sleep(2000);
    p.snap('A-nach-esc');
    const idleA = await srv.waitFor(isEvent('Notification', (b) => b.notification_type === 'idle_prompt'), IDLE, m);
    p.snap('A-nach-warten');
    result.checks.A = {
      streaming,
      events: srv.events.slice(m).map((e) => `${e.body?.hook_event_name}${e.body?.notification_type ? ':' + e.body.notification_type : ''}@${((e.t - escA) / 1000).toFixed(1)}s`),
      idleAfterEscMs: idleA ? idleA.t - escA : null,
    };
    tl.step(`A: ${JSON.stringify(result.checks.A)}`);
    // Eingabezeile leeren, falls Claude den Prompt zurueckgelegt hat
    if (/❯\s*Schreibe/.test(p.visible())) {
      tl.step('Prompt wurde in die Eingabe zurueckgelegt; leere die Eingabe');
      p.write('\x15', 'Ctrl+U');
      await sleep(500);
    }
    // B: Bash-Rueckfrage mit Esc ablehnen
    m = srv.events.length;
    await typeLine(p, 'Fuehre mit dem Bash-Tool genau diesen Befehl aus: echo hi > hi.txt');
    const pr = await srv.waitFor(isEvent('PermissionRequest'), 60000, m);
    tl.step(`B PermissionRequest: ${pr ? pr.body.tool_name + ' ' + JSON.stringify(pr.body.tool_input) : 'NEIN'}`);
    const pn = await srv.waitFor(isEvent('Notification', (b) => b.notification_type === 'permission_prompt'), 15000, m);
    p.snap('B-rueckfrage');
    if (!/echo hi/.test(p.visible())) tl.step('WARNUNG: Rueckfrage zeigt nicht den erwarteten Befehl');
    const escB = tl.now();
    p.write('\x1b', 'Esc (Rueckfrage ablehnen)');
    await sleep(3000);
    p.snap('B-nach-esc');
    const idleB = await srv.waitFor(isEvent('Notification', (b) => b.notification_type === 'idle_prompt'), IDLE, m);
    p.snap('B-nach-warten');
    result.checks.B = {
      permissionPromptDelayMs: pr && pn ? pn.t - pr.t : null,
      events: srv.events.slice(m).map((e) => `${e.body?.hook_event_name}${e.body?.tool_name ? ':' + e.body.tool_name : ''}${e.body?.notification_type ? ':' + e.body.notification_type : ''}@${((e.t - escB) / 1000).toFixed(1)}s`),
      idleAfterEscMs: idleB ? idleB.t - escB : null,
      hiTxtExists: fs.existsSync(path.join(cwd, 'hi.txt')),
    };
    tl.step(`B: ${JSON.stringify(result.checks.B)}`);
    await exitWith(p, 'exit');
    collect(srv);
  } else if (scenario === 'esc') {
    // Esc waehrend die Antwort sichtbar gestreamt wird; danach 80s auf idle_prompt warten und im
    // Gespraechsprotokoll nach der Unterbrechungsmarke suchen. 1 Prompt.
    const srv = await startHookServer(tl);
    cleanups.push(() => srv.close());
    const hookFile = writeJson(path.join(outDir, 'hooks.json'), hookSettings(srv.base));
    const cwd = prepareWorkspace(NAME);
    const p = await launch(srv.base, [], cwd, { hookFile });
    await acceptTrustIfShown(p, tl, 6000);
    await srv.waitFor(isEvent('SessionStart'), 20000);
    await sleep(4000);
    const m = srv.events.length;
    const upTo = rest[0] || '300';
    await typeLine(p, `Schreibe die Zahlen von 1 bis ${upTo} in arabischen Ziffern (1, 2, 3 ...), jede auf einer eigenen Zeile, ohne weiteren Text.`);
    const ups = await srv.waitFor(isEvent('UserPromptSubmit'), 30000, m);
    // sobald mindestens zwei Zahlenzeilen sichtbar sind (oder nach 6s), Esc senden
    let streaming = false;
    for (let i = 0; i < 150 && !streaming; i++) {
      await sleep(40);
      streaming = (p.visible().match(/^\s*(?:●\s*)?\d{1,3}\s*$/gm) || []).length >= 2;
    }
    const stopBefore = srv.events.slice(m).some((e) => e.body?.hook_event_name === 'Stop');
    p.snap('vor-esc');
    const escT = tl.now();
    p.write('\x1b', 'Esc (Antwort unterbrechen)');
    tl.step(`Ausgabe sichtbar: ${streaming}; Stop schon vorher: ${stopBefore}; Esc ${((escT - (ups?.t ?? escT)) / 1000).toFixed(1)}s nach UserPromptSubmit`);
    await sleep(2000);
    p.snap('nach-esc');
    const idle = await srv.waitFor(isEvent('Notification', (b) => b.notification_type === 'idle_prompt'), 80000, m);
    p.snap('nach-warten');
    let marker = null;
    try {
      const tp = ups?.body?.transcript_path;
      const lines = fs.readFileSync(tp, 'utf8').split('\n').filter((l) => /interrupted/i.test(l));
      marker = lines.map((l) => {
        const j = JSON.parse(l);
        const c = j.message?.content;
        return { type: j.type, text: typeof c === 'string' ? c : Array.isArray(c) ? c.map((x) => x.text).filter(Boolean).join(' ') : null };
      });
    } catch (err) {
      marker = 'Fehler: ' + err.message;
    }
    result.checks.esc = {
      streaming,
      stopBefore,
      events: srv.events.slice(m).map((e) => `${e.body?.hook_event_name}${e.body?.notification_type ? ':' + e.body.notification_type : ''}@${((e.t - escT) / 1000).toFixed(1)}s`),
      idleAfterEscMs: idle ? idle.t - escT : null,
      transcriptMarker: marker,
    };
    tl.step(`esc: ${JSON.stringify(result.checks.esc)}`);
    await exitWith(p, 'exit');
    collect(srv);
  } else if (scenario === 'recommended') {
    // Die empfohlene Hook-Datei (empfohlene-hook-datei.json) mit echtem Port: wird sie ohne Warnung
    // akzeptiert, und kommen SessionStart (curl) und SessionEnd (http) an?
    const srv = await startHookServer(tl);
    cleanups.push(() => srv.close());
    const tpl = fs.readFileSync(new URL('./empfohlene-hook-datei.json', import.meta.url), 'utf8');
    const hookFile = path.join(outDir, 'hooks.json');
    fs.writeFileSync(hookFile, tpl.split('<PORT>').join(String(srv.port)));
    const cwd = prepareWorkspace(NAME);
    const p = await launch(srv.base, [], cwd, { hookFile });
    await acceptTrustIfShown(p, tl, 6000);
    const ss = await srv.waitFor(isEvent('SessionStart'), 20000);
    await sleep(4000);
    result.checks.settingsWarning = /Settings Warning/.test(p.screen());
    result.checks.sessionStart = !!ss;
    p.snap('nach-start');
    await exitWith(p, 'exit');
    await sleep(500);
    collect(srv);
  } else if (scenario === 'invalid') {
    // Ungueltige Hook-Datei (http-Hook ohne url): Was zeigt die interaktive Oberflaeche?
    const cwd = prepareWorkspace(NAME);
    const bad = writeJson(path.join(outDir, 'ungueltig.json'), { hooks: { Stop: [{ hooks: [{ type: 'http' }] }] } });
    const p = await launch('http://127.0.0.1:9', [], cwd, { hookFile: bad });
    await acceptTrustIfShown(p, tl, 6000);
    await sleep(8000);
    result.screen = p.snap('bildschirm');
    tl.step('Bildschirm:\n' + result.screen);
    p.write('\x1b', 'Esc');
    await sleep(1500);
    p.snap('nach-esc');
    const ex = await Promise.race([p.exited, sleep(3000).then(() => null)]);
    if (!ex) await exitWith(p, 'exit');
    else result.exit = ex;
  } else if (scenario === 'bg') {
    // Hintergrund-Aufgabe: background_tasks in Stop und was beim Ende der Aufgabe passiert.
    // Standard-Berechtigungsmodus des Nutzers; eine Rueckfrage wird mit Esc abgelehnt. 1 Prompt.
    const srv = await startHookServer(tl);
    cleanups.push(() => srv.close());
    const hookFile = writeJson(path.join(outDir, 'hooks.json'), hookSettings(srv.base));
    const cwd = prepareWorkspace(NAME);
    const p = await launch(srv.base, [], cwd, { hookFile });
    await acceptTrustIfShown(p, tl, 6000);
    await srv.waitFor(isEvent('SessionStart'), 20000);
    await sleep(4000);
    const m = srv.events.length;
    await typeLine(p, 'Starte mit dem Bash-Tool im Hintergrund (run_in_background: true) den Befehl "ping -n 25 127.0.0.1" und antworte danach nur mit OK.');
    const first = await Promise.race([
      srv.waitFor(isEvent('Stop'), 90000, m),
      srv.waitFor(isEvent('PermissionRequest'), 90000, m),
    ]);
    if (first?.body?.hook_event_name === 'PermissionRequest') {
      tl.step('Rueckfrage erschienen, lehne mit Esc ab');
      await sleep(1000);
      p.snap('rueckfrage');
      p.write('\x1b', 'Esc');
    } else {
      tl.step(`Stop: background_tasks=${JSON.stringify(first?.body?.background_tasks)}`);
    }
    p.snap('nach-stop');
    tl.step('beobachte 45s, bis die Hintergrund-Aufgabe endet');
    await sleep(45000);
    p.snap('nach-warten');
    result.checks.events = srv.events.slice(m).map((e) => `${e.body?.hook_event_name}${e.body?.tool_name ? ':' + e.body.tool_name : ''}${e.body?.notification_type ? ':' + e.body.notification_type : ''}${e.body?.background_tasks ? ' bg=' + e.body.background_tasks.length : ''}`);
    await exitWith(p, 'exit');
    collect(srv);
  } else {
    throw new Error('unbekanntes Szenario ' + scenario);
  }
} catch (err) {
  tl.step('FEHLER ' + err.stack);
} finally {
  for (const c of cleanups.reverse()) {
    try { await c(); } catch {}
  }
}
saveScenario(NAME, result);
console.log(JSON.stringify({ exit: result.exit, checks: result.checks, summary: result.summary }, null, 2));
process.exit(0);
