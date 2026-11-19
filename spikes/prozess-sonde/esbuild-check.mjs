// Wegwerf-Spike: Lässt sich koffi in den esbuild-Bundle des Hauptprozesses packen, oder muss es "external" sein?
// Aufruf: node esbuild-check.mjs
import { build } from '../../node_modules/esbuild/lib/main.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const dir = path.join(import.meta.dirname, 'release', 'esbuild-check');
mkdirSync(dir, { recursive: true });
const entry = path.join(dir, 'entry.js');
writeFileSync(entry, "const koffi = require('koffi');\nconsole.log('koffi geladen', koffi.version);\n");

for (const external of [[], ['koffi']]) {
  const outfile = path.join(dir, `out-${external.length ? 'external' : 'bundled'}.js`);
  try {
    await build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'cjs', target: 'node22', outfile, external, logLevel: 'silent', nodePaths: [path.join(import.meta.dirname, 'node_modules')] });
    const run = execFileSync(process.execPath, [outfile], { encoding: 'utf8', env: { ...process.env, NODE_PATH: path.join(import.meta.dirname, 'node_modules') } }).trim();
    console.log(`external=${JSON.stringify(external)}: Bundle ok, Lauf: ${run}`);
  } catch (e) {
    console.log(`external=${JSON.stringify(external)}: FEHLER: ${String(e.message).split('\n').slice(0, 4).join(' | ')}`);
  }
}
