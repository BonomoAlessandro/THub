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
    // node-pty ist ein natives Modul und wird zur Laufzeit aus node_modules geladen.
    external: ['electron', 'node-pty'],
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
    entryPoints: ['src/renderer/renderer.ts'],
    outfile: 'dist/renderer/renderer.js',
    platform: 'browser',
    format: 'iife',
    target: 'chrome130',
  }),
]);

mkdirSync('dist/renderer', { recursive: true });
copyFileSync('src/renderer/index.html', 'dist/renderer/index.html');
