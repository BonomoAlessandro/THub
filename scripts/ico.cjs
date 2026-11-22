// Schreibt und liest Windows-Symboldateien (.ico), ohne Abhängigkeiten (Ticket 29).
// Grössen unter 256 px stehen als 32-Bit-Bitmap (BGRA mit Alphakanal, dazu die 1-Bit-Maske) in der Datei, so wie sie
// jede Windows-Komponente liest; 256 px als PNG, wie Windows es dafür vorsieht und electron-builder es verlangt.

'use strict';

/**
 * Baut eine .ico aus Bildern.
 * @param {{ size: number, rgba: Buffer, png: Buffer }[]} images je Grösse die Pixel (RGBA, nicht vormultipliziert,
 *   Zeile für Zeile von oben) und dasselbe Bild als PNG
 * @returns {Buffer}
 */
function writeIco(images) {
  const sorted = [...images].sort((a, b) => a.size - b.size);
  const blobs = sorted.map((img) => (img.size >= 256 ? img.png : bitmap(img.size, img.rgba)));
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserviert
  header.writeUInt16LE(1, 2); // 1 = Symbol
  header.writeUInt16LE(sorted.length, 4);
  const directory = Buffer.alloc(16 * sorted.length);
  let offset = header.length + directory.length;
  sorted.forEach((img, i) => {
    const at = i * 16;
    const side = img.size >= 256 ? 0 : img.size; // 0 heisst 256
    directory.writeUInt8(side, at);
    directory.writeUInt8(side, at + 1);
    directory.writeUInt8(0, at + 2); // keine Farbpalette
    directory.writeUInt8(0, at + 3);
    directory.writeUInt16LE(1, at + 4); // Ebenen
    directory.writeUInt16LE(32, at + 6); // Bit pro Pixel
    directory.writeUInt32LE(blobs[i].length, at + 8);
    directory.writeUInt32LE(offset, at + 12);
    offset += blobs[i].length;
  });
  return Buffer.concat([header, directory, ...blobs]);
}

/** Ein Bild als Bitmap im Format der .ico: BITMAPINFOHEADER, Pixel von unten nach oben in BGRA, dann die Maske. */
function bitmap(size, rgba) {
  if (rgba.length !== size * size * 4) throw new Error(`${size} px: ${rgba.length} Bytes statt ${size * size * 4}`);
  const info = Buffer.alloc(40);
  info.writeUInt32LE(40, 0);
  info.writeInt32LE(size, 4);
  info.writeInt32LE(size * 2, 8); // Höhe zählt Farbe und Maske
  info.writeUInt16LE(1, 12);
  info.writeUInt16LE(32, 14);
  const pixels = Buffer.alloc(size * size * 4);
  const maskRow = Math.ceil(size / 32) * 4;
  const mask = Buffer.alloc(maskRow * size);
  for (let y = 0; y < size; y++) {
    const row = size - 1 - y;
    for (let x = 0; x < size; x++) {
      const from = (y * size + x) * 4;
      const to = (row * size + x) * 4;
      pixels[to] = rgba[from + 2];
      pixels[to + 1] = rgba[from + 1];
      pixels[to + 2] = rgba[from];
      pixels[to + 3] = rgba[from + 3];
      // Ganz durchsichtige Pixel sind auch in der Maske durchsichtig (Bit gesetzt).
      if (rgba[from + 3] === 0) mask[row * maskRow + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  info.writeUInt32LE(pixels.length + mask.length, 20);
  return Buffer.concat([info, pixels, mask]);
}

/**
 * Liest das Verzeichnis einer .ico: je Bild Grösse, Format und die Lage in der Datei.
 * @param {Buffer} buf
 * @returns {{ width: number, height: number, bitCount: number, format: 'png' | 'bmp', offset: number, length: number }[]}
 */
function readIco(buf) {
  if (buf.readUInt16LE(0) !== 0 || buf.readUInt16LE(2) !== 1) throw new Error('keine Symboldatei');
  const count = buf.readUInt16LE(4);
  const entries = [];
  for (let i = 0; i < count; i++) {
    const at = 6 + i * 16;
    const offset = buf.readUInt32LE(at + 12);
    const length = buf.readUInt32LE(at + 8);
    const isPng = buf.subarray(offset, offset + 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    entries.push({
      width: buf.readUInt8(at) || 256,
      height: buf.readUInt8(at + 1) || 256,
      bitCount: buf.readUInt16LE(at + 6),
      format: isPng ? 'png' : 'bmp',
      offset,
      length,
    });
  }
  return entries;
}

module.exports = { writeIco, readIco };
