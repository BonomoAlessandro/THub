// Wegwerf-Spike: Prozessliste über NtQuerySystemInformation mit koffi.
//
// mode 'process' (Klasse 5, SystemProcessInformation): ein einziger Systemaufruf liefert für alle
//   Prozesse PID, Eltern-PID, Programmname, Startzeit und verbrauchte CPU-Zeit, ohne Handles auf die
//   Prozesse zu öffnen. Seit NT stabil; in winternl.h teilweise dokumentiert (die Eltern-PID steht dort
//   als "Reserved2"). Der Kernel sammelt dabei auch alle Threads ein, deshalb kostet der Aufruf auf
//   Systemen mit vielen Threads einige Millisekunden.
// mode 'basic' (Klasse 252, SystemBasicProcessInformation): undokumentiert, erst neuere Windows-11-Builds.
//   Nur PID, Eltern-PID, Sequenznummer (pro Systemstart eindeutig) und Programmname, ohne Threads.
//
// async: true führt den Systemaufruf über koffi in einem Worker-Thread aus; im Hauptthread bleibt nur
//   die Auswertung des Puffers.
//
// Layouts nur für 64 Bit (x64 und arm64).
'use strict';
const koffi = require('koffi');

const CLASS = { process: 5, basic: 252 };
const STATUS_INFO_LENGTH_MISMATCH = 0xc0000004 | 0;

function create({ mode = 'process', async = false } = {}) {
  if (process.arch !== 'x64' && process.arch !== 'arm64') throw new Error('nur 64 Bit');
  const ntdll = koffi.load('ntdll.dll');
  const NtQuerySystemInformation = ntdll.func(
    'int32_t __stdcall NtQuerySystemInformation(int32_t cls, void *buf, uint32_t len, _Out_ uint32_t *retLen)',
  );
  // memmove(buf, buf, 0) gibt die Adresse des Puffers zurück; damit lassen sich die Zeiger
  // auf die Programmnamen (die in denselben Puffer zeigen) in Versätze umrechnen.
  const memmove = ntdll.func('void *memmove(void *dst, const void *src, size_t n)');
  const cls = CLASS[mode];

  let buf = Buffer.alloc(mode === 'basic' ? 1 << 17 : 1 << 20);
  let base = memmove(buf, buf, 0);
  const retLen = [0];

  function grow() {
    buf = Buffer.alloc(Math.max(buf.length * 2, Math.ceil(retLen[0] * 1.25)));
    base = memmove(buf, buf, 0);
  }
  function check(st) {
    if (st < 0) throw new Error('NtQuerySystemInformation: 0x' + (st >>> 0).toString(16));
  }
  function querySync() {
    for (;;) {
      const st = NtQuerySystemInformation(cls, buf, buf.length, retLen);
      if (st === STATUS_INFO_LENGTH_MISMATCH) {
        grow();
        continue;
      }
      check(st);
      return;
    }
  }
  function queryAsync() {
    return new Promise((resolve, reject) => {
      const attempt = () =>
        NtQuerySystemInformation.async(cls, buf, buf.length, retLen, (err, st) => {
          if (err) return reject(err);
          if (st === STATUS_INFO_LENGTH_MISMATCH) {
            grow();
            return attempt();
          }
          try {
            check(st);
            resolve();
          } catch (e) {
            reject(e);
          }
        });
      attempt();
    });
  }

  function name(off, lenAt, ptrAt) {
    const len = buf.readUInt16LE(off + lenAt);
    if (!len) return '';
    const at = Number(buf.readBigUInt64LE(off + ptrAt) - base);
    return buf.toString('utf16le', at, at + len);
  }

  /** Klasse 5: [{ pid, ppid, name, createTime (FILETIME, BigInt), cpu (100 ns, BigInt), threads, workingSet, privateBytes }]. */
  function parseProcess() {
    const out = [];
    let off = 0;
    for (;;) {
      const next = buf.readUInt32LE(off);
      const pid = Number(buf.readBigUInt64LE(off + 0x50));
      out.push({
        pid,
        ppid: Number(buf.readBigUInt64LE(off + 0x58)),
        name: name(off, 0x38, 0x40) || (pid === 0 ? 'System Idle Process' : ''),
        createTime: buf.readBigInt64LE(off + 0x20),
        cpu: buf.readBigInt64LE(off + 0x28) + buf.readBigInt64LE(off + 0x30),
        threads: buf.readUInt32LE(off + 0x04),
        workingSet: Number(buf.readBigUInt64LE(off + 0x90)),
        privateBytes: Number(buf.readBigUInt64LE(off + 0xb8)),
      });
      if (!next) break;
      off += next;
    }
    return out;
  }

  /** Klasse 252: [{ pid, ppid, name, seq (BigInt) }]. */
  function parseBasic() {
    const out = [];
    let off = 0;
    for (;;) {
      const next = buf.readUInt32LE(off);
      out.push({
        pid: Number(buf.readBigUInt64LE(off + 8)),
        ppid: Number(buf.readBigUInt64LE(off + 16)),
        seq: buf.readBigUInt64LE(off + 24),
        name: name(off, 32, 40),
      });
      if (!next) break;
      off += next;
    }
    return out;
  }

  const parse = mode === 'basic' ? parseBasic : parseProcess;
  const snapshotSync = () => {
    querySync();
    return parse();
  };

  return {
    name: `koffi + NtQuerySystemInformation(${mode === 'basic' ? 'SystemBasicProcessInformation' : 'SystemProcessInformation'})${async ? ' async' : ''}`,
    kind: 'in-process',
    snapshotSync,
    snapshot: async ? async () => (await queryAsync(), parse()) : async () => snapshotSync(),
    /** Nur der Systemaufruf bzw. nur die Auswertung (für die Aufteilung der Zeit). */
    querySync,
    parseOnly: parse,
    dispose() {},
  };
}

module.exports = { create };
