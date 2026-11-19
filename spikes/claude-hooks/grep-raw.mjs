// Sucht in der rohen Terminalausgabe (ohne Escape-Sequenzen) nach einem Muster.
// Aufruf: node grep-raw.mjs <raw.txt> <regex>
import fs from 'node:fs';

const [file, pattern] = process.argv.slice(2);
const raw = fs.readFileSync(file, 'utf8');
const plain = raw
  .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '') // OSC
  .replace(/\x1b\[[0-9;?<>=]*[ -/]*[@-~]/g, ' ') // CSI (Cursorbewegungen als Leerzeichen)
  .replace(/\x1b[()][0-9A-B]/g, '')
  .replace(/\x1b./g, '')
  .replace(/ {2,}/g, ' ');
const re = new RegExp(pattern, 'gi');
const hits = new Set();
for (const m of plain.matchAll(re)) hits.add(m[0].trim());
for (const h of hits) console.log(h);
if (!hits.size) console.log('(kein Treffer)');
