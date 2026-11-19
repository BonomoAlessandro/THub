import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Teststelle 1: Workspace-Kern in Node, ohne Electron und ohne Fenster.
// Dazu die reine Zuordnung der Tastenkürzel aus dem Renderer (ohne DOM) und Teile des Hauptprozesses,
// die Electron nur über schmale Schnittstellen sehen (Design hell/dunkel).
export default defineConfig({
  resolve: {
    // Lädt getesteter Code doch Electron, schlägt der Test laut fehl, statt still weiterzulaufen.
    alias: { electron: fileURLToPath(new URL('./test/support/noElectron.ts', import.meta.url)) },
  },
  test: {
    include: ['test/workspace/**/*.test.ts', 'test/renderer/**/*.test.ts', 'test/main/**/*.test.ts'],
    setupFiles: ['test/support/setup.ts'],
    environment: 'node',
  },
});
