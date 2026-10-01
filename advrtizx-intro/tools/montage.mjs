#!/usr/bin/env node
// Tile existing PNGs into one image (for reviewing many stills at once):  node tools/montage.mjs OUT.png --cols 3 --tile 640 a.png b.png c.png ...
import fs from 'node:fs';
import path from 'node:path';
import { launch } from './lib/browser.mjs';
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const files = []; const skip = new Set(); ['cols', 'tile'].forEach((k) => { const i = argv.indexOf('--' + k); if (i >= 0) { skip.add(i); skip.add(i + 1); } });
argv.forEach((a, i) => { if (!skip.has(i)) files.push(a); });
const out = path.resolve(files.shift()); const cols = +opt('cols', 3), tw = +opt('tile', 640), th = Math.round(tw * 9 / 16);
const imgs = files.map((f) => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64'));
const browser = await launch();
try {
  const page = await browser.newPage();
  const b64 = await page.evaluate(async ({ imgs, cols, tw, th }) => {
    const rows = Math.ceil(imgs.length / cols), cv = document.createElement('canvas'); cv.width = cols * tw; cv.height = rows * th; const g = cv.getContext('2d'); g.imageSmoothingQuality = 'high';
    for (let i = 0; i < imgs.length; i++) { const im = new Image(); im.src = imgs[i]; await im.decode(); g.drawImage(im, (i % cols) * tw, Math.floor(i / cols) * th, tw, th); }
    return cv.toDataURL('image/png').split(',')[1];
  }, { imgs, cols, tw, th });
  fs.writeFileSync(out, Buffer.from(b64, 'base64')); console.log(out);
} finally { await browser.close(); }
