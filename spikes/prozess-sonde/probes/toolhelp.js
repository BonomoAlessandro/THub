// Wegwerf-Spike: Prozessliste über CreateToolhelp32Snapshot / Process32FirstW / Process32NextW mit koffi.
// Die Struktur PROCESSENTRY32W wird als roher Puffer übergeben und von Hand gelesen; das ist
// deutlich schneller, als koffi bei jedem Aufruf ein JS-Objekt bauen zu lassen.
'use strict';
const koffi = require('koffi');

const TH32CS_SNAPPROCESS = 0x2;
const INVALID_HANDLE_VALUE = 0xffffffffffffffffn;
// sizeof(PROCESSENTRY32W) auf 64 Bit: 568. Felder: th32ProcessID @8, th32ParentProcessID @32, szExeFile @44.
const ENTRY_SIZE = process.arch === 'ia32' ? 556 : 568;
const OFF_PID = 8;
const OFF_PPID = process.arch === 'ia32' ? 24 : 32;
const OFF_EXE = process.arch === 'ia32' ? 36 : 44;

function create() {
  const kernel32 = koffi.load('kernel32.dll');
  const CreateToolhelp32Snapshot = kernel32.func('void *__stdcall CreateToolhelp32Snapshot(uint32_t flags, uint32_t pid)');
  const Process32FirstW = kernel32.func('int __stdcall Process32FirstW(void *snap, void *entry)');
  const Process32NextW = kernel32.func('int __stdcall Process32NextW(void *snap, void *entry)');
  const CloseHandle = kernel32.func('int __stdcall CloseHandle(void *h)');

  const entry = Buffer.alloc(ENTRY_SIZE);

  function snapshotSync() {
    const snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
    if (snap == null || snap === INVALID_HANDLE_VALUE || snap === 0n) throw new Error('CreateToolhelp32Snapshot fehlgeschlagen');
    const out = [];
    try {
      entry.writeUInt32LE(ENTRY_SIZE, 0);
      let ok = Process32FirstW(snap, entry);
      while (ok) {
        const exe = entry.toString('utf16le', OFF_EXE, OFF_EXE + 520);
        const nul = exe.indexOf('\0');
        out.push({
          pid: entry.readUInt32LE(OFF_PID),
          ppid: entry.readUInt32LE(OFF_PPID),
          name: nul >= 0 ? exe.slice(0, nul) : exe,
        });
        ok = Process32NextW(snap, entry);
      }
    } finally {
      CloseHandle(snap);
    }
    return out;
  }

  return {
    name: 'koffi + Toolhelp32',
    kind: 'in-process',
    snapshotSync,
    snapshot: async () => snapshotSync(),
    dispose() {},
  };
}

module.exports = { create };
