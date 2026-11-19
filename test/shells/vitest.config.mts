// Eigener Testlauf fuer die Shell-Integration (Teststelle 2): `npm run test:shells`.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    root: import.meta.dirname,
    include: ['**/*.test.ts'],
    testTimeout: 60000,
    hookTimeout: 90000,
    teardownTimeout: 20000,
    pool: 'forks',
    // Tests innerhalb einer Datei teilen sich Shells und laufen nacheinander.
    sequence: { concurrent: false },
  },
});
