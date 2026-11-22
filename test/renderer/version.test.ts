import { describe, expect, it } from 'vitest';
import { versionLabel } from '../../src/renderer/version';

// Versionszeile im Einstellungsdialog (Ticket 30): Version, Commit, „+ Änderungen“ und „Entwicklung“.

describe('Versionszeile', () => {
  const base = { version: '2.0.0', commit: 'e8e865a', dirty: false, packaged: true };

  it('installiert, aus einem sauberen Commit: Version und Commit', () => {
    expect(versionLabel(base)).toBe('THub 2.0.0 · e8e865a');
  });

  it('beim Bauen nicht alles committet: „+ Änderungen“ hinter dem Commit', () => {
    expect(versionLabel({ ...base, dirty: true })).toBe('THub 2.0.0 · e8e865a + Änderungen');
  });

  it('unpaketiert (npm start): „Entwicklung“ am Ende', () => {
    expect(versionLabel({ ...base, packaged: false })).toBe('THub 2.0.0 · e8e865a · Entwicklung');
    expect(versionLabel({ ...base, dirty: true, packaged: false })).toBe(
      'THub 2.0.0 · e8e865a + Änderungen · Entwicklung',
    );
  });

  it('ohne Commit (ohne Git gebaut): nur die Version', () => {
    expect(versionLabel({ ...base, commit: null })).toBe('THub 2.0.0');
    expect(versionLabel({ ...base, commit: null, dirty: true, packaged: false })).toBe('THub 2.0.0 · Entwicklung');
  });
});
