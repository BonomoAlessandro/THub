// Bündelt Main-, Preload- und Renderer-Code mit esbuild nach dist/.
import { build } from 'esbuild';
import { copyFileSync, mkdirSync, rmSync } from 'node:fs';

const dev = process.argv.includes('--dev');

rmSync('dist', { recursive: true, force: true });

const common = {
  bundle: true,
  sourcemap: dev ? 'inline' : false,
  minify: !dev,
  logLevel: 'info',
};

await Promise.all([
  build({
    ...common,
    entryPoints: ['src/main/main.ts'],
    outfile: 'dist/main/main.js',
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    // node-pty und koffi sind native Module und werden zur Laufzeit aus node_modules geladen (koffi lässt sich
    // nicht bündeln; seine Binärdatei liegt im optionalen Paket @koromix/koffi-win32-*).
    external: ['electron', 'node-pty', 'koffi'],
    // Das spät geladene koffi (`await import('koffi')`) wird zu require: so lädt es wie node-pty über den
    // CommonJS-Lader von Electron, der Module im Paket aus app.asar.unpacked holt.
    supported: { 'dynamic-import': false },
  }),
  build({
    ...common,
    entryPoints: ['src/preload/preload.ts'],
    outfile: 'dist/preload/preload.js',
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    external: ['electron'],
  }),
  build({
    ...common,
    // React-Oberfläche; JSX wird mit der automatischen Laufzeit von React übersetzt.
    entryPoints: ['src/renderer/main.tsx'],
    outfile: 'dist/renderer/renderer.js',
    platform: 'browser',
    format: 'iife',
    target: 'chrome130',
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': JSON.stringify(dev ? 'development' : 'production') },
  }),
]);

mkdirSync('dist/renderer', { recursive: true });
copyFileSync('src/renderer/index.html', 'dist/renderer/index.html');
