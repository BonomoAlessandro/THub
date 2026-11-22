// Erzeugt das App-Symbol resources/icon/icon.ico aus den SVG-Vorlagen daneben (Ticket 29). Aufruf: npm run icon
//
// Läuft als Electron-Hauptprozess: Chromium zeichnet jede Grösse aus ihrer Vorlage in einen Canvas, in einem
// unsichtbaren Fenster ohne Bildschirm (offscreen). Die kleinen Grössen haben eigene, von Hand auf ganze Pixel gelegte
// Vorlagen (16, 20, 24 px); alles ab 32 px kommt aus der grossen (256 px).

'use strict';

const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { writeIco, readIco } = require('./ico.cjs');

const DIR = path.join(__dirname, '..', 'resources', 'icon');
/** Die Grössen, die Windows bei 100 % bis 200 % Skalierung und in grossen Ansichten anfragt. */
const SIZES = [16, 20, 24, 32, 40, 48, 64, 256];
const masterFor = (size) => (size <= 16 ? 16 : size <= 20 ? 20 : size <= 24 ? 24 : 256);

/** Läuft in der Seite: zeichnet die SVG in `size` Pixel und liefert Pixel (RGBA) und PNG, beides als Base64. */
function draw(svg, size) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, size, size);
      const data = ctx.getImageData(0, 0, size, size).data;
      let binary = '';
      for (let i = 0; i < data.length; i++) binary += String.fromCharCode(data[i]);
      resolve({ rgba: btoa(binary), png: canvas.toDataURL('image/png').split(',')[1] });
    };
    img.onerror = () => reject(new Error(`SVG für ${size} px liess sich nicht laden`));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

app.whenReady().then(async () => {
  try {
    const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
    await win.loadURL('data:text/html;charset=utf-8,<!doctype html><title>Symbol</title>');
    const images = [];
    for (const size of SIZES) {
      const svg = fs.readFileSync(path.join(DIR, `icon-${masterFor(size)}.svg`), 'utf8');
      const result = await win.webContents.executeJavaScript(`(${draw.toString()})(${JSON.stringify(svg)}, ${size})`);
      images.push({ size, rgba: Buffer.from(result.rgba, 'base64'), png: Buffer.from(result.png, 'base64') });
    }
    const ico = writeIco(images);
    const target = path.join(DIR, 'icon.ico');
    fs.writeFileSync(target, ico);
    const sizes = readIco(ico).map((e) => `${e.width} (${e.format})`);
    console.log(`${path.relative(process.cwd(), target)}: ${sizes.join(', ')}; ${ico.length} Bytes`);
    app.exit(0);
  } catch (err) {
    console.error('Das Symbol liess sich nicht erzeugen:', err);
    app.exit(1);
  }
});
