import { describe, expect, it } from 'vitest';
import { shortPath } from '../../src/renderer/palette/shortPath';

// Anzeige der Ordner in der Befehlspalette: lange Pfade in der Mitte gekürzt, das Ende bleibt sichtbar.

describe('shortPath', () => {
  it.each([
    'C:\\workspace\\custom\\termhub',
    'C:\\Users\\anna.mueller',
    'C:\\',
    'D:\\a\\b\\c\\d',
  ])('lässt kurze Pfade unverändert: %s', (path) => {
    expect(shortPath(path)).toBe(path);
  });

  it('kürzt lange Pfade in der Mitte und behält Laufwerk und die letzten drei Ordner', () => {
    expect(shortPath('C:\\Users\\anna.mueller\\AppData\\Local\\Temp\\claude\\t17\\projects\\web')).toBe(
      'C:\\…\\t17\\projects\\web',
    );
  });

  it('behält bei UNC-Pfaden die führenden Trenner', () => {
    expect(shortPath('\\\\server\\share\\team\\projekte\\api\\src')).toBe('\\\\server\\…\\projekte\\api\\src');
  });

  it('behält Schrägstriche bei Pfaden im Unix-Stil', () => {
    expect(shortPath('/c/Users/me/work/clients/acme/api')).toBe('/c/…/clients/acme/api');
  });
});
