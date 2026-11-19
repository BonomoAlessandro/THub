import { describe, expect, it } from 'vitest';
import { startWorkspace } from '../support/harness';

// Rahmenbedingungen des Test-Gerüsts, auf die sich alle Kern-Tests verlassen.
describe('Test-Gerüst', () => {
  it('erzeugt den Kern in Node ohne Electron', async () => {
    await expect(import('electron')).rejects.toThrow('Electron darf in den Kern-Tests nicht geladen werden');

    expect(startWorkspace().tabs()).toHaveLength(1);
  });

  it('läuft ohne geerbte THUB_*-Variablen', () => {
    expect(Object.keys(process.env).filter((key) => key.toUpperCase().startsWith('THUB_'))).toEqual([]);
  });
});
