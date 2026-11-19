// Wegwerf-Spike: Was kostet die Abfrage des Konsolen-Hosts (ProcessConsoleHostProcess) pro Prozess?
// Misst einmal für alle Prozesse und einmal nur für "Waisen" (Elternprozess beendet oder PID neu vergeben).
// Aufruf: node console-host-cost.js
'use strict';
const koffi = require('koffi');
const { performance } = require('perf_hooks');
const full = require('./probes/ntqsi').create();

const kernel32 = koffi.load('kernel32.dll');
const ntdll = koffi.load('ntdll.dll');
const OpenProcess = kernel32.func('void *__stdcall OpenProcess(uint32_t access, int inherit, uint32_t pid)');
const CloseHandle = kernel32.func('int __stdcall CloseHandle(void *h)');
const NtQueryInformationProcess = ntdll.func('int32_t __stdcall NtQueryInformationProcess(void *h, int32_t cls, _Out_ uint64_t *info, uint32_t len, void *retLen)');

function consoleHost(pid) {
  const h = OpenProcess(0x1000, 0, pid);
  if (!h) return null;
  try {
    const v = [0n];
    return NtQueryInformationProcess(h, 49, v, 8, null) < 0 ? null : Number(BigInt(v[0]) & ~3n);
  } finally {
    CloseHandle(h);
  }
}

const list = full.snapshotSync();
const byPid = new Map(list.map((p) => [p.pid, p]));
const orphans = list.filter((p) => {
  if (p.pid === 0 || p.pid === 4) return false;
  const parent = byPid.get(p.ppid);
  return !parent || parent.createTime > p.createTime;
});

for (const [label, set] of [['alle', list], ['nur Waisen', orphans]]) {
  const runs = [];
  let ok = 0;
  for (let r = 0; r < 20; r++) {
    ok = 0;
    const t = performance.now();
    for (const p of set) if (consoleHost(p.pid) != null) ok++;
    runs.push(performance.now() - t);
  }
  runs.sort((a, b) => a - b);
  console.log(`${label}: ${set.length} Prozesse, davon ${ok} lesbar; Median ${runs[10].toFixed(2)} ms, min ${runs[0].toFixed(2)} ms`);
}
