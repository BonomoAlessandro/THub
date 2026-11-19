// Wegwerf-Spike zu Ticket 13: startet echte Shells über node-pty (ConPTY) im Electron-Hauptprozess
// und zeichnet den echten Prozessbaum auf.
//
// Aufruf: ..\..\node_modules\.bin\electron trees.js [--only=pwsh,powershell,cmd,gitbash,cmd-dll] [--show-output]
// Ergebnis: release\trees.txt und release\trees.json (bereinigte Kopie in ergebnisse\)
// Alle gestarteten Prozesse werden am Ende jedes Szenarios beendet (Ctrl+C, pty.kill(), Überlebende per PID).
//
// node-pty wird aus dem node_modules des Hauptprojekts geladen (zwei Ordner höher).
'use strict';
const { app } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { performance } = require('perf_hooks');
const pty = require('node-pty');
const koffi = require('koffi');
const ntqsi = require('./probes/ntqsi');

const REPO = path.resolve(__dirname, '..', '..');
const OUT_DIR = path.join(__dirname, 'release');
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);

const full = ntqsi.create();
const basic = ntqsi.create({ mode: 'basic' });
const kernel32 = koffi.load('kernel32.dll');
const OpenProcess = kernel32.func('void *__stdcall OpenProcess(uint32_t access, int inherit, uint32_t pid)');
const QueryFullProcessImageNameW = kernel32.func('int __stdcall QueryFullProcessImageNameW(void *h, uint32_t flags, void *buf, _Inout_ uint32_t *size)');
const CloseHandle = kernel32.func('int __stdcall CloseHandle(void *h)');
const ntdll = koffi.load('ntdll.dll');
const NtQueryInformationProcess = ntdll.func(
  'int32_t __stdcall NtQueryInformationProcess(void *h, int32_t cls, _Out_ uint64_t *info, uint32_t len, void *retLen)',
);

/** PID des Konsolen-Hosts (conhost.exe/OpenConsole.exe), an dem der Prozess hängt (ProcessConsoleHostProcess = 49). */
function consoleHost(pid) {
  const h = OpenProcess(0x1000, 0, pid);
  if (!h) return null;
  try {
    const v = [0n];
    const st = NtQueryInformationProcess(h, 49, v, 8, null);
    return st < 0 ? `Fehler 0x${(st >>> 0).toString(16)}` : Number(BigInt(v[0]) & ~3n);
  } finally {
    CloseHandle(h);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lines = [];
const log = (s = '') => {
  lines.push(s);
  console.log(s);
};

function imagePath(pid) {
  const h = OpenProcess(0x1000 /* PROCESS_QUERY_LIMITED_INFORMATION */, 0, pid);
  if (!h) return null;
  try {
    const buf = Buffer.alloc(2048);
    const size = [1024];
    return QueryFullProcessImageNameW(h, 0, buf, size) ? buf.toString('utf16le', 0, size[0] * 2) : null;
  } finally {
    CloseHandle(h);
  }
}

/** Einmalige Diagnose: Befehlszeilen per CIM (startet bewusst einen Prozess, nur für den Spike). */
function commandLines(pids) {
  if (!pids.length) return {};
  const filter = pids.map((p) => `ProcessId=${p}`).join(' OR ');
  const ps = `Get-CimInstance Win32_Process -Filter '${filter}' | Select-Object ProcessId, CommandLine | ConvertTo-Json -Compress`;
  try {
    const out = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { encoding: 'utf8', windowsHide: true });
    const arr = [].concat(JSON.parse(out || '[]'));
    return Object.fromEntries(arr.map((x) => [x.ProcessId, x.CommandLine]));
  } catch (e) {
    return {};
  }
}

/** Kinder nach Eltern-PID, aber nur, wenn das Kind nach dem Elternprozess gestartet wurde (PID-Wiederverwendung). */
function childrenIndex(list, newer) {
  const byPid = new Map(list.map((p) => [p.pid, p]));
  const kids = new Map();
  for (const p of list) {
    const parent = byPid.get(p.ppid);
    if (!parent || p.pid === p.ppid || !newer(p, parent)) continue;
    if (!kids.has(p.ppid)) kids.set(p.ppid, []);
    kids.get(p.ppid).push(p);
  }
  return { byPid, kids };
}
const newerFull = (child, parent) => child.createTime >= parent.createTime;
const newerBasic = (child, parent) => child.seq > parent.seq;

function descendants(list, rootPid, newer) {
  const { byPid, kids } = childrenIndex(list, newer);
  const out = [];
  const walk = (pid, depth) => {
    for (const k of kids.get(pid) || []) {
      out.push({ ...k, depth });
      walk(k.pid, depth + 1);
    }
  };
  if (byPid.has(rootPid)) walk(rootPid, 1);
  return out;
}

/** Baum unter dem Electron-Hauptprozess, ohne Electrons eigene Hilfsprozesse. */
function captureTree(label, ptyPid, t0) {
  const list = full.snapshotSync();
  const { byPid, kids } = childrenIndex(list, newerFull);
  const me = byPid.get(process.pid);
  const nodes = [];
  const walk = (p, depth) => {
    nodes.push({ pid: p.pid, ppid: p.ppid, name: p.name, depth, createTime: p.createTime });
    for (const k of kids.get(p.pid) || []) {
      if (depth === 0 && k.name.toLowerCase() === 'electron.exe') continue;
      walk(k, depth + 1);
    }
  };
  walk(me, 0);
  const cmd = commandLines(nodes.slice(1).map((n) => n.pid));
  const t0ft = t0;
  const out = nodes.map((n) => ({
    ...n,
    createTime: undefined,
    startedMsAfterSpawn: n.depth ? Number(n.createTime - t0ft) / 1e4 : null,
    image: imagePath(n.pid),
    cmdline: cmd[n.pid] || null,
    isPtyPid: n.pid === ptyPid,
  }));
  log(`  -- ${label}`);
  for (const n of out) {
    const pad = '     '.repeat(n.depth);
    const host = n.depth ? consoleHost(n.pid) : null;
    const mark = (n.isPtyPid ? '   <== pid von node-pty' : '') + (n.depth ? `   (Konsolen-Host ${host})` : '');
    const head = n.depth === 0 ? `${n.name} [${n.pid}] (Electron-Hauptprozess)` : `${n.name} [${n.pid}]${mark}`;
    log(`  ${pad}${n.depth ? '└─ ' : ''}${head}`);
    if (n.depth) {
      log(`  ${pad}     Pfad: ${n.image || '?'}`);
      if (n.cmdline) log(`  ${pad}     Befehl: ${n.cmdline.length > 160 ? n.cmdline.slice(0, 157) + '...' : n.cmdline}`);
      if (n.startedMsAfterSpawn != null) log(`  ${pad}     gestartet ${n.startedMsAfterSpawn.toFixed(0)} ms nach pty.spawn`);
    }
  }
  return { label, nodes: out };
}

/** Schnelle Abfrage (Klasse 252, ca. 0,3 ms) während Enter gedrückt wird: kurzlebige Kinder der Shell finden. */
async function watchShortLived(p, rootPid, { enters = 5, gapMs = 1200, tailMs = 1500 }) {
  const seen = new Map();
  const start = performance.now();
  const end = start + enters * gapMs + tailMs;
  let next = start + 300;
  let sent = 0;
  let polls = 0;
  const initial = new Set(descendants(basic.snapshotSync(), rootPid, newerBasic).map((x) => `${x.pid}:${x.seq}`));
  let present = new Set();
  while (performance.now() < end) {
    if (sent < enters && performance.now() >= next) {
      p.write('\r');
      sent++;
      next = performance.now() + gapMs;
    }
    const now = performance.now();
    const list = basic.snapshotSync();
    polls++;
    const { byPid } = childrenIndex(list, newerBasic);
    present = new Set();
    for (const x of descendants(list, rootPid, newerBasic)) {
      const k = `${x.pid}:${x.seq}`;
      present.add(k);
      if (initial.has(k)) continue;
      const e = seen.get(k);
      if (e) e.last = now;
      else seen.set(k, { pid: x.pid, name: x.name, parent: `${(byPid.get(x.ppid) || {}).name} [${x.ppid}]`, depth: x.depth, first: now, last: now });
    }
    await new Promise((r) => setImmediate(r));
  }
  const pollMs = (performance.now() - start) / polls;
  const items = [...seen.entries()].map(([k, e]) => ({
    pid: e.pid,
    name: e.name,
    parent: e.parent,
    depth: e.depth,
    lifetimeMsAtLeast: Math.round((e.last - e.first) * 10) / 10,
    stillRunning: present.has(k),
  }));
  log(`  -- Kurzlebige Nachfahren bei ${enters}x Enter (Abfrage alle ${pollMs.toFixed(2)} ms, ${polls} Abfragen)`);
  if (!items.length) log('     keine');
  for (const it of items) {
    log(`     ${'  '.repeat(it.depth - 1)}${it.name} [${it.pid}] unter ${it.parent}: mindestens ${it.lifetimeMsAtLeast} ms${it.stillRunning ? ' (läuft noch)' : ''}`);
  }
  return { enters, pollMs, polls, items };
}

function shellEnv() {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v === undefined || /^(npm_|ELECTRON_)/i.test(k)) continue;
    env[k] = v;
  }
  return env;
}

async function settle(getLast, quietMs = 800, maxMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    if (Date.now() - getLast() > quietMs) return;
    await sleep(100);
  }
}

const filetimeNow = () => (BigInt(Date.now()) + 11644473600000n) * 10000n;

async function run(sc) {
  log('');
  log(`=== ${sc.title}`);
  log(`  pty.spawn(${JSON.stringify(sc.file)}, ${JSON.stringify(sc.args)}${sc.useConptyDll ? ', useConptyDll: true' : ''})`);
  const t0 = filetimeNow();
  const tSpawn = performance.now();
  const p = pty.spawn(sc.file, sc.args, {
    name: 'xterm-256color',
    cols: 120,
    rows: 30,
    cwd: REPO,
    env: shellEnv(),
    useConpty: true,
    useConptyDll: !!sc.useConptyDll,
  });
  const spawnMs = performance.now() - tSpawn;
  let last = Date.now();
  let exited = false;
  let output = '';
  p.onData((d) => {
    last = Date.now();
    output = (output + d).slice(-4000);
  });
  p.onExit(() => (exited = true));
  log(`  node-pty meldet pid ${p.pid}; pty.spawn() blockierte den Hauptthread ${spawnMs.toFixed(0)} ms`);
  const rep = { id: sc.id, title: sc.title, file: sc.file, args: sc.args, ptyPid: p.pid, spawnMs, snapshots: [], shortLived: [] };
  await settle(() => last);
  const tracked = new Map();
  const track = (snap) => {
    for (const n of snap.nodes) if (n.depth > 0 && n.name.toLowerCase() !== 'conhost.exe' && n.name.toLowerCase() !== 'openconsole.exe') tracked.set(n.pid, n.name);
  };
  for (const st of sc.steps) {
    if (st.write) {
      p.write(st.write);
      await sleep(st.wait ?? 1500);
    }
    if (st.snapshot) {
      if (process.argv.includes('--show-output')) {
        log('  -- Terminal (Ende, ohne Escape-Sequenzen):');
        for (const l of output.replace(/\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g, '').replace(/\x1b\[[0-9;?]*[ -\/]*[@-~]/g, '').split(/\r?\n/).slice(-6)) log(`     | ${l}`);
      }
      const snap = captureTree(st.snapshot, p.pid, t0);
      rep.snapshots.push(snap);
      track(snap);
    }
    if (st.find) {
      rep.found = rep.found || [];
      for (const line of findWithAncestors(st.find)) {
        rep.found.push(line);
        log(`  -- systemweit gesucht: ${line}`);
      }
    }
    if (st.watch) rep.shortLived.push(await watchShortLived(p, st.watchRoot === 'pty' ? p.pid : findInnerShell(p.pid), st.watch));
  }
  // Aufräumen: Ctrl+C, pty beenden, Überlebende gezielt beenden.
  p.write('\x03');
  await sleep(300);
  try {
    p.kill();
  } catch {}
  for (let i = 0; i < 50 && !exited; i++) await sleep(100);
  await sleep(1500);
  const alive = new Set(full.snapshotSync().map((x) => x.pid));
  const leftovers = [...tracked.entries()].filter(([pid]) => alive.has(pid));
  rep.leftoversAfterPtyKill = leftovers.map(([pid, name]) => ({ pid, name }));
  log(`  -- nach pty.kill() noch am Leben: ${leftovers.length ? leftovers.map(([pid, name]) => `${name} [${pid}]`).join(', ') : 'nichts'}`);
  for (const [pid] of leftovers) {
    try {
      process.kill(pid);
    } catch {}
  }
  return rep;
}

/** Für die Beobachtung: bei Git Bash ist die innerste Shell das einzige bash.exe-Kind des Starters. */
function findInnerShell(ptyPid) {
  const list = full.snapshotSync();
  const { byPid, kids } = childrenIndex(list, newerFull);
  let cur = byPid.get(ptyPid);
  for (;;) {
    const k = (kids.get(cur.pid) || []).filter((x) => x.name.toLowerCase() === cur.name.toLowerCase());
    if (k.length !== 1) return cur.pid;
    cur = k[0];
  }
}

/** Alle Prozesse mit diesem Namen, mit Vorfahrenkette (bricht bei beendetem oder neu vergebenem Elternprozess ab). */
function findWithAncestors(name) {
  const list = full.snapshotSync();
  const byPid = new Map(list.map((p) => [p.pid, p]));
  const out = [];
  for (const x of list.filter((p) => p.name.toLowerCase() === name.toLowerCase())) {
    let s = `${x.name} [${x.pid}] (Konsolen-Host ${consoleHost(x.pid)})`;
    let c = x;
    for (let i = 0; i < 8; i++) {
      const par = byPid.get(c.ppid);
      if (!par) {
        s += ` <- [${c.ppid}] (Elternprozess beendet)`;
        break;
      }
      if (par.createTime > c.createTime) {
        s += ` <- [${c.ppid}] (PID inzwischen an ${par.name} vergeben)`;
        break;
      }
      s += ` <- ${par.name} [${par.pid}]`;
      if (par.pid === process.pid) break;
      c = par;
    }
    out.push(s);
  }
  return out.length ? out : [`${name}: nicht gefunden`];
}

function staleParentLinks() {
  const list = full.snapshotSync();
  const byPid = new Map(list.map((p) => [p.pid, p]));
  let missing = 0;
  const stale = [];
  for (const p of list) {
    if (p.pid === 0 || p.pid === 4) continue;
    const parent = byPid.get(p.ppid);
    if (!parent) missing++;
    else if (parent.createTime > p.createTime) stale.push(`${p.name} [${p.pid}] -> ${parent.name} [${parent.pid}]`);
  }
  return { total: list.length, parentGone: missing, parentPidReused: stale };
}

const LOCAL = process.env.LOCALAPPDATA;
const PING = { write: 'ping -t localhost\r', wait: 2500 };
const STOP = { write: '\x03', wait: 1000 };
const SCENARIOS = [
  {
    id: 'pwsh',
    title: 'PowerShell 7 über den WindowsApps-Alias',
    file: path.join(LOCAL, 'Microsoft', 'WindowsApps', 'pwsh.exe'),
    args: ['-NoLogo'],
    steps: [
      { snapshot: 'Leerlauf am Prompt' },
      { ...PING, snapshot: 'mit "ping -t localhost"' },
      STOP,
      { write: "Start-Process -WindowStyle Hidden ping -ArgumentList '-t','localhost'\r", wait: 2500, snapshot: 'nach Start-Process -WindowStyle Hidden ping' },
      { write: 'function prompt { $null = git rev-parse --abbrev-ref HEAD 2>$null; "PS $($PWD.Path)> " }\r', wait: 1500 },
      { watch: { enters: 5 }, watchRoot: 'pty' },
    ],
  },
  {
    id: 'powershell',
    title: 'Windows PowerShell 5.1',
    file: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
    args: ['-NoLogo'],
    steps: [{ snapshot: 'Leerlauf am Prompt' }, { ...PING, snapshot: 'mit "ping -t localhost"' }, STOP, { watch: { enters: 3 }, watchRoot: 'pty' }],
  },
  {
    id: 'cmd',
    title: 'cmd',
    file: 'C:\\Windows\\System32\\cmd.exe',
    args: [],
    steps: [{ snapshot: 'Leerlauf am Prompt' }, { ...PING, snapshot: 'mit "ping -t localhost"' }, STOP, { watch: { enters: 3 }, watchRoot: 'pty' }],
  },
  {
    id: 'gitbash',
    title: 'Git Bash (bin\\bash.exe)',
    file: 'C:\\Program Files\\Git\\bin\\bash.exe',
    args: ['--login', '-i'],
    steps: [
      { snapshot: 'Leerlauf am Prompt' },
      // MSYS-fork ist langsam: länger warten als bei den anderen Shells.
      { write: 'ping -t localhost\r', wait: 6000, snapshot: 'mit "ping -t localhost"' },
      { write: '\x03', wait: 3000 },
      { write: 'sleep 300 &\r', wait: 5000, snapshot: 'mit Hintergrundjob "sleep 300 &"', find: 'sleep.exe' },
      // Vordergrund: MSYS-Programm (sleep.exe) und natives Programm über cmd (node-ähnlich).
      { write: 'kill %1\r', wait: 1500 },
      { write: 'sleep 300\r', wait: 5000, snapshot: 'mit Vordergrund "sleep 300"', find: 'sleep.exe' },
      { write: '\x03', wait: 2000 },
      { write: 'cmd //c "ping -t localhost" &\r', wait: 5000, snapshot: 'mit Hintergrundjob "cmd //c ping -t localhost &"', find: 'PING.EXE' },
      { write: 'kill %1\r', wait: 1000 },
      { watch: { enters: 5 }, watchRoot: 'inner' },
    ],
  },
  {
    id: 'cmd-dll',
    title: 'cmd mit useConptyDll (mitgeliefertes OpenConsole.exe)',
    file: 'C:\\Windows\\System32\\cmd.exe',
    args: [],
    useConptyDll: true,
    steps: [{ ...PING, snapshot: 'mit "ping -t localhost"' }],
  },
];

app.whenReady().then(async () => {
  const report = { when: new Date().toISOString(), electronPid: process.pid, os: `${os.type()} ${os.release()}`, scenarios: [] };
  try {
    log(`Electron ${process.versions.electron}, node-pty aus ${require.resolve('node-pty')}`);
    report.staleParentLinks = staleParentLinks();
    log(
      `Systemweit: ${report.staleParentLinks.total} Prozesse, ${report.staleParentLinks.parentGone} mit beendetem Elternprozess, ` +
        `${report.staleParentLinks.parentPidReused.length} mit wiederverwendeter Eltern-PID (Elternprozess jünger als das Kind)`,
    );
    for (const s of report.staleParentLinks.parentPidReused.slice(0, 15)) log(`  ${s}`);
    for (const sc of SCENARIOS) {
      if (ONLY.length && !ONLY.includes(sc.id)) continue;
      try {
        report.scenarios.push(await run(sc));
      } catch (e) {
        log(`  FEHLER: ${e && e.stack ? e.stack : e}`);
      }
    }
  } catch (e) {
    log(`FEHLER: ${e && e.stack ? e.stack : e}`);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const suffix = ONLY.length ? '-' + ONLY.join('-') : '';
  fs.writeFileSync(path.join(OUT_DIR, `trees${suffix}.txt`), lines.join('\n'));
  fs.writeFileSync(path.join(OUT_DIR, `trees${suffix}.json`), JSON.stringify(report, (k, v) => (typeof v === 'bigint' ? String(v) : v), 2));
  app.quit();
});
app.on('window-all-closed', () => {});
