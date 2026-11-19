// S0: Neue Session ohne Prompt starten und mit /exit beenden.
// Prueft: --settings wird akzeptiert, SessionStart/SessionEnd kommen an, Kopfzeilen-Interpolation,
// --session-id und -n, Exit-Code nach /exit, eigene Hooks des Nutzers laufen weiter.
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {
  Timeline, startHookServer, hookSettings, writeJson, termhubEnv, runPty, findClaudeExe,
  acceptTrustIfShown, prepareWorkspace, userHookFiles, saveScenario, isEvent, sleep, typeLine, RAW_DIR,
} from './lib.mjs';

const NAME = 's0-start-exit';
const tl = new Timeline(path.join(RAW_DIR, NAME, 'timeline.jsonl'));
const srv = await startHookServer(tl);
const dir = prepareWorkspace(NAME);
const uh = userHookFiles(dir);
writeJson(path.join(dir, '.claude', 'settings.local.json'), uh.settings);
const hookFile = writeJson(path.join(RAW_DIR, NAME, 'termhub-hooks.json'), hookSettings(srv.base));
const sid = crypto.randomUUID();
const tab = 'tab-' + crypto.randomUUID();
const token = crypto.randomBytes(16).toString('hex');
const dbg = path.join(RAW_DIR, NAME, 'debug.log');
fs.rmSync(dbg, { force: true });
fs.rmSync(path.join(RAW_DIR, NAME, 'raw.txt'), { force: true });

const args = ['--model', 'haiku', '--settings', hookFile, '--session-id', sid, '-n', 'Spike Null Ä', '--debug-file', dbg];
tl.step(`Start claude ${args.join(' ')} in ${dir}`);
const p = runPty(tl, {
  file: findClaudeExe(),
  args,
  cwd: dir,
  env: termhubEnv({ TERMHUB_TAB_ID: tab, TERMHUB_TOKEN: token, TERMHUB_API: srv.base }),
  rawFile: path.join(RAW_DIR, NAME, 'raw.txt'),
});

let result = { sid, tab, token };
try {
  const startEv = srv.waitFor(isEvent('SessionStart'), 40000);
  const trusted = await acceptTrustIfShown(p, tl, 15000);
  result.trustDialog = trusted;
  const ss = await startEv;
  tl.step(`SessionStart: ${ss ? 'ja' : 'NEIN'}`);
  await sleep(4000);
  p.snap('nach-start');
  console.log(p.visible());
  await typeLine(p, '/exit');
  const ex = await Promise.race([p.exited, sleep(20000).then(() => null)]);
  result.exit = ex;
  await sleep(1000);
  p.snap('nach-exit');
} finally {
  p.kill();
  await srv.close();
}
result.userHookLog = fs.existsSync(uh.log) ? fs.readFileSync(uh.log, 'utf8') : null;
result.events = srv.events.map((e) => ({ t: e.t, path: e.path, headers: e.headers, body: e.body }));
saveScenario(NAME, result);
console.log(JSON.stringify({ exit: result.exit, userHookLog: result.userHookLog }, null, 2));
process.exit(0);
