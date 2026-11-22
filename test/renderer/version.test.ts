import { describe, expect, it } from 'vitest';
import { versionLabel } from '../../src/renderer/version';

// Versionszeile im Einstellungsdialog (Ticket 30): die Version, unpaketiert mit „Entwicklung“. Ohne Commit (Wunsch des
// Nutzers am 2026-11-22).

describe('Versionszeile', () => {
  it('installiert: nur die Version', () => {
    expect(versionLabel({ version: '0.2.0', packaged: true })).toBe('THub 0.2.0');
  });

  it('unpaketiert (npm start): „Entwicklung“ dahinter', () => {
    expect(versionLabel({ version: '0.2.0', packaged: false })).toBe('THub 0.2.0 · Entwicklung');
  });
});
