import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

// App-Symbol (Ticket 29): Die mitgelieferte resources/icon/icon.ico hat genau die Grössen, die Windows anfragt, in den
// Formaten, die jede Windows-Komponente liest. Erzeugt wird sie mit `npm run icon` aus den SVG-Vorlagen daneben.

/** Was scripts/ico.cjs bietet (reines JavaScript, damit `npm run icon` es ohne Übersetzen lädt). */
interface IcoModule {
  writeIco(images: { size: number; rgba: Buffer; png: Buffer }[]): Buffer;
  readIco(buf: Buffer): {
    width: number;
    height: number;
    bitCount: number;
    format: 'png' | 'bmp';
    offset: number;
    length: number;
  }[];
}

const require = createRequire(import.meta.url);
const { readIco, writeIco } = require('../../scripts/ico.cjs') as IcoModule;

const REPO = path.resolve(__dirname, '..', '..');
const ICON_DIR = path.join(REPO, 'resources', 'icon');
const ICO = fs.readFileSync(path.join(ICON_DIR, 'icon.ico'));

describe('App-Symbol', () => {
  it('hat genau die acht Grössen 16, 20, 24, 32, 40, 48, 64 und 256 px, alle mit 32 Bit', () => {
    const entries = readIco(ICO);

    expect(entries.map((e) => [e.width, e.height])).toEqual(
      [16, 20, 24, 32, 40, 48, 64, 256].map((size) => [size, size]),
    );
    expect(entries.every((e) => e.bitCount === 32)).toBe(true);
  });

  it('unter 256 px als Bitmap mit Alphakanal, 256 px als PNG', () => {
    for (const entry of readIco(ICO)) {
      const blob = ICO.subarray(entry.offset, entry.offset + entry.length);
      expect(entry.offset + entry.length).toBeLessThanOrEqual(ICO.length);
      if (entry.width === 256) {
        expect(entry.format).toBe('png');
        // Breite und Höhe im IHDR-Block des PNG.
        expect([blob.readUInt32BE(16), blob.readUInt32BE(20)]).toEqual([256, 256]);
      } else {
        expect(entry.format).toBe('bmp');
        expect(blob.readUInt32LE(0)).toBe(40);
        expect([blob.readInt32LE(4), blob.readInt32LE(8), blob.readUInt16LE(14)]).toEqual([
          entry.width,
          entry.width * 2,
          32,
        ]);
      }
    }
  });

  it('ist nicht leer: in jeder Bitmap gibt es deckende und durchsichtige Pixel (Kachel mit runden Ecken)', () => {
    for (const entry of readIco(ICO).filter((e) => e.format === 'bmp')) {
      const pixels = ICO.subarray(entry.offset + 40, entry.offset + 40 + entry.width * entry.width * 4);
      const alphas = Array.from({ length: entry.width * entry.width }, (_, i) => pixels[i * 4 + 3]);
      expect(alphas.some((a) => a === 255)).toBe(true);
      expect(alphas.some((a) => a === 0)).toBe(true);
    }
  });

  it('für jede Grösse gibt es die SVG-Vorlage, aus der das Skript sie zeichnet', () => {
    for (const master of [16, 20, 24, 256]) {
      const svg = fs.readFileSync(path.join(ICON_DIR, `icon-${master}.svg`), 'utf8');
      expect(svg).toContain(`viewBox="0 0 ${master} ${master}"`);
    }
  });

  it('writeIco legt Pixel von unten nach oben in BGRA ab und setzt die Maske für durchsichtige Pixel', () => {
    // 2 × 2: oben links rot, oben rechts durchsichtig, unten grün und blau.
    const rgba = Buffer.from([255, 0, 0, 255, 0, 0, 0, 0, 0, 255, 0, 255, 0, 0, 255, 128]);
    const ico = writeIco([
      { size: 2, rgba, png: Buffer.alloc(0) },
      { size: 256, rgba: Buffer.alloc(0), png: Buffer.from('89504e470d0a1a0a', 'hex') },
    ]);
    const [small, big] = readIco(ico);
    const bmp = ico.subarray(small.offset, small.offset + small.length);

    expect([small.width, big.width, big.format]).toEqual([2, 256, 'png']);
    // Erste Zeile in der Datei ist die untere des Bildes: grün, blau (halb durchsichtig); dann rot, durchsichtig.
    expect([...bmp.subarray(40, 56)]).toEqual([0, 255, 0, 255, 255, 0, 0, 128, 0, 0, 255, 255, 0, 0, 0, 0]);
    // Maske: untere Zeile ohne gesetztes Bit, obere mit dem Bit für das zweite Pixel.
    expect([bmp.readUInt8(56), bmp.readUInt8(60)]).toEqual([0, 0x40]);
  });
});
