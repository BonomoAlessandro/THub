// Wegwerf-Spike zu Ticket 13: misst die Kandidaten für die Prozess-Sonde im Electron-Hauptprozess.
//
// Aufruf (unverpackt):  ..\..\node_modules\.bin\electron . --out=release\bench-unpackaged.json
// Aufruf (verpackt):    release\win-unpacked\ProzessSondeSpike.exe --out=<datei>
// Optionen: --quick (kurze Läufe), --interval-seconds=N (Dauer des 1,5-s-Laufs, Standard 30),
//           --only=toolhelp,ntqsi,ntqsi-async,basic,wpt,ps-csv,ps-json,pwsh-csv
'use strict';
const { app } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { performance } = require('perf_hooks');

const args = Object.fromEntries(
  process.argv
    .slice(1)
    .filter((a) => a.startsWith('--'))
    .map((a) => {
      const [k, v] = a.slice(2).split('=');
      return [k, v ?? true];
    }),
);
const QUICK = !!args.quick;
const INTERVAL_S = Number(args['interval-seconds'] ?? (QUICK ? 6 : 30));
const POLL_MS = 1500;
const OUT = args.out ? path.resolve(args.out) : path.join(os.tmpdir(), 'prozess-sonde-bench.json');

const CANDIDATES = {
  toolhelp: () => require('./probes/toolhelp').create(),
  ntqsi: () => require('./probes/ntqsi').create(),
  'ntqsi-async': () => require('./probes/ntqsi').create({ async: true }),
  basic: () => require('./probes/ntqsi').create({ mode: 'basic' }),
  wpt: () => require('./probes/wpt').create(),
  'ps-csv': () => require('./probes/powershell-cim').create({ exe: 'powershell.exe', format: 'csv' }),
  'ps-json': () => require('./probes/powershell-cim').create({ exe: 'powershell.exe', format: 'json' }),
  'pwsh-csv': () => require('./probes/powershell-cim').create({ exe: 'pwsh.exe', format: 'csv' }),
};
const ONLY = args.only ? String(args.only).split(',') : Object.keys(CANDIDATES);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cpuMs = () => {
  const u = process.cpuUsage();
  return (u.user + u.system) / 1000;
};
function stats(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  const r = (x) => Math.round(x * 1000) / 1000;
  return { n: s.length, min: r(s[0]), median: r(q(0.5)), p95: r(q(0.95)), max: r(s[s.length - 1]), mean: r(s.reduce((a, b) => a + b, 0) / s.length) };
}

// Hilfssonde für CPU-Zeiten fremder Prozesse (Kind-PowerShell, WmiPrvSE.exe).
let helper;
function externalCpuMs(childPid) {
  let child = 0;
  let wmi = 0;
  let childWs = 0;
  let childPriv = 0;
  for (const p of helper.snapshotSync()) {
    if (p.pid === childPid) {
      child += Number(p.cpu) / 1e4;
      childWs = p.workingSet;
      childPriv = p.privateBytes;
    }
    if (p.name.toLowerCase() === 'wmiprvse.exe') wmi += Number(p.cpu) / 1e4;
  }
  return { child, wmi, childWs, childPriv };
}

async function measureIdle(seconds) {
  const e0 = externalCpuMs(-1);
  const c0 = cpuMs();
  await sleep(seconds * 1000);
  const c1 = cpuMs();
  const e1 = externalCpuMs(-1);
  return { seconds, mainCpuMs: c1 - c0, wmiCpuMs: e1.wmi - e0.wmi };
}

async function bench(key, idle) {
  const res = { key };
  const tLoad = performance.now();
  const probe = CANDIDATES[key]();
  res.name = probe.name;
  res.kind = probe.kind;
  res.createMs = performance.now() - tLoad;
  const tFirst = performance.now();
  const first = await probe.snapshot();
  res.firstSnapshotMs = performance.now() - tFirst;
  res.processCount = first.length;
  const me = first.find((p) => p.pid === process.pid);
  res.selfCheck = me ? { name: me.name, ppidOk: me.ppid === process.ppid } : 'eigener Prozess fehlt';
  res.sample = first.filter((p) => p.pid === process.pid || p.pid === process.ppid).map(({ pid, ppid, name }) => ({ pid, ppid, name }));

  for (let i = 0; i < 5; i++) await probe.snapshot();

  // Enger Lauf: Abfragen direkt hintereinander -> Zeit und CPU pro Abfrage.
  // Windows zählt CPU-Zeit in Schritten von 15,6 ms; der Lauf dauert deshalb mindestens einige Sekunden.
  const minIter = probe.kind === 'child' ? (QUICK ? 10 : 40) : 50;
  const minWall = QUICK ? 1000 : 5000;
  const times = [];
  const e0 = externalCpuMs(probe.childPid);
  const c0 = cpuMs();
  const w0 = performance.now();
  while (times.length < minIter || performance.now() - w0 < minWall) {
    const t = performance.now();
    await probe.snapshot();
    times.push(performance.now() - t);
  }
  const n = times.length;
  const wall = performance.now() - w0;
  const c1 = cpuMs();
  const e1 = externalCpuMs(probe.childPid);
  res.tight = {
    wallMs: stats(times),
    mainCpuMsPerSnapshot: (c1 - c0) / n,
    childCpuMsPerSnapshot: (e1.child - e0.child) / n,
    wmiCpuMsPerSnapshot: (e1.wmi - e0.wmi) / n,
    wallTotalMs: wall,
  };
  res.tight.totalCpuMsPerSnapshot = res.tight.mainCpuMsPerSnapshot + res.tight.childCpuMsPerSnapshot + res.tight.wmiCpuMsPerSnapshot;
  res.tight.cpuPercentOneCoreAt1500ms = (res.tight.totalCpuMsPerSnapshot / POLL_MS) * 100;

  // Bei NtQuerySystemInformation: Systemaufruf und Auswertung getrennt messen.
  if (probe.querySync) {
    const q = [];
    const p = [];
    for (let i = 0; i < n; i++) {
      let t = performance.now();
      probe.querySync();
      q.push(performance.now() - t);
      t = performance.now();
      probe.parseOnly();
      p.push(performance.now() - t);
    }
    res.tight.syscallOnlyMs = stats(q);
    res.tight.parseOnlyMs = stats(p);
  }

  // Realistischer Lauf: alle 1,5 s eine Abfrage, CPU gegen den Leerlauf gerechnet.
  if (INTERVAL_S > 0) {
    const polls = Math.round((INTERVAL_S * 1000) / POLL_MS);
    const ie0 = externalCpuMs(probe.childPid);
    const ic0 = cpuMs();
    const iw0 = performance.now();
    for (let i = 0; i < polls; i++) {
      const t = performance.now();
      await probe.snapshot();
      await sleep(Math.max(0, POLL_MS - (performance.now() - t)));
    }
    const iwall = performance.now() - iw0;
    const ic1 = cpuMs();
    const ie1 = externalCpuMs(probe.childPid);
    const mainIdlePerMs = idle.mainCpuMs / (idle.seconds * 1000);
    const wmiIdlePerMs = idle.wmiCpuMs / (idle.seconds * 1000);
    const main = ic1 - ic0 - mainIdlePerMs * iwall;
    const wmi = ie1.wmi - ie0.wmi - wmiIdlePerMs * iwall;
    const child = ie1.child - ie0.child;
    res.interval = {
      polls,
      wallMs: iwall,
      mainCpuMsOverIdle: main,
      childCpuMs: child,
      wmiCpuMsOverIdle: wmi,
      cpuPercentOneCore: ((main + child + wmi) / iwall) * 100,
      cpuPercentMachine: ((main + child + wmi) / iwall) * 100 / os.cpus().length,
      childWorkingSetMB: ie1.childWs / 1048576,
      childPrivateMB: ie1.childPriv / 1048576,
    };
  }
  await probe.dispose();
  return res;
}

app.whenReady().then(async () => {
  const out = {
    when: new Date().toISOString(),
    packaged: app.isPackaged,
    appPath: app.getAppPath(),
    electron: process.versions.electron,
    node: process.versions.node,
    napi: process.versions.napi,
    modules: process.versions.modules,
    arch: process.arch,
    os: `${os.type()} ${os.release()}`,
    cpu: os.cpus()[0].model,
    logicalCpus: os.cpus().length,
    pollMs: POLL_MS,
    results: [],
    errors: {},
  };
  try {
    helper = require('./probes/ntqsi').create();
    out.systemProcessCount = helper.snapshotSync().length;
    out.idle = await measureIdle(INTERVAL_S);
    for (const key of ONLY) {
      try {
        const r = await bench(key, out.idle);
        out.results.push(r);
        console.log(`${key}: median ${r.tight.wallMs.median} ms, CPU/Abfrage ${r.tight.totalCpuMsPerSnapshot.toFixed(3)} ms`);
      } catch (e) {
        out.errors[key] = String(e && e.stack ? e.stack : e);
        console.error(key, e);
      }
    }
    out.loadedNativeModules = Object.keys(require.cache).filter((f) => f.endsWith('.node'));
    out.processCountAtEnd = helper.snapshotSync().length;
  } catch (e) {
    out.errors.fatal = String(e && e.stack ? e.stack : e);
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log('Ergebnis:', OUT);
  app.quit();
});

app.on('window-all-closed', () => {});
