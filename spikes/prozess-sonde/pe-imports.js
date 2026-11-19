// Wegwerf-Spike: listet Maschinentyp und importierte DLLs einer PE-Datei (.node, .dll, .exe).
// Zweck: prüfen, ob ein natives Modul die VC++-Laufzeit (VCRUNTIME140.dll, MSVCP140.dll, api-ms-win-crt-*)
// braucht, die auf einem frischen Rechner fehlen kann.
// Aufruf: node pe-imports.js <datei> [<datei> ...]
'use strict';
const fs = require('fs');

function parse(file) {
  const b = fs.readFileSync(file);
  const pe = b.readUInt32LE(0x3c);
  if (b.toString('latin1', pe, pe + 4) !== 'PE\0\0') throw new Error('keine PE-Datei');
  const machine = b.readUInt16LE(pe + 4);
  const nSections = b.readUInt16LE(pe + 6);
  const optSize = b.readUInt16LE(pe + 20);
  const opt = pe + 24;
  const magic = b.readUInt16LE(opt);
  const dataDir = opt + (magic === 0x20b ? 112 : 96);
  const importRva = b.readUInt32LE(dataDir + 8);
  const delayRva = b.readUInt32LE(dataDir + 13 * 8);
  const secs = [];
  for (let i = 0; i < nSections; i++) {
    const s = opt + optSize + i * 40;
    secs.push({ va: b.readUInt32LE(s + 12), vsize: b.readUInt32LE(s + 8), raw: b.readUInt32LE(s + 20), rsize: b.readUInt32LE(s + 16) });
  }
  const off = (rva) => {
    const s = secs.find((x) => rva >= x.va && rva < x.va + Math.max(x.vsize, x.rsize));
    return s ? rva - s.va + s.raw : -1;
  };
  const cstr = (o) => b.toString('latin1', o, b.indexOf(0, o));
  const imports = [];
  if (importRva) {
    for (let d = off(importRva); ; d += 20) {
      const nameRva = b.readUInt32LE(d + 12);
      if (!nameRva) break;
      imports.push(cstr(off(nameRva)));
    }
  }
  const delay = [];
  if (delayRva) {
    for (let d = off(delayRva); ; d += 32) {
      const nameRva = b.readUInt32LE(d + 4);
      if (!nameRva) break;
      delay.push(cstr(off(nameRva)));
    }
  }
  const arch = { 0x8664: 'x64', 0x14c: 'x86', 0xaa64: 'arm64' }[machine] || machine.toString(16);
  return { arch, imports, delay };
}

for (const file of process.argv.slice(2)) {
  const r = parse(file);
  const crt = [...r.imports, ...r.delay].filter((n) => /^(vcruntime|msvcp|ucrtbase|api-ms-win-crt)/i.test(n));
  console.log(`${file}\n  Architektur: ${r.arch}\n  Importe: ${r.imports.join(', ')}\n  Verzögert: ${r.delay.join(', ') || '-'}\n  VC++-Laufzeit nötig: ${crt.length ? 'JA (' + crt.join(', ') + ')' : 'nein'}`);
}
