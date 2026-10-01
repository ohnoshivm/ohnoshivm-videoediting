#!/usr/bin/env node
// Contact sheet: renders frames and tiles them (default: a 6x6 sheet of 36 key frames -> renders/contact-sheet.png).
//   node tools/contact.mjs                                   the 6x6 key-frame sheet of the whole film (draft look, ~2 min)
//   node tools/contact.mjs --frames 0,3,12,50 --cols 4 --tile 480 --acts 1 --out out/a1/sheet.png
// Flags: --frames a,b,c  --cols N (default 6)  --tile W (px, default 480; height = W*9/16)  --scale S (render scale, default 0.5)  --k N  --acts 1,2  --out FILE  --labels 0|1
import fs from 'node:fs';
import path from 'node:path';
import { startServer } from './lib/server.mjs';
import { launch, openFilm, ROOT } from './lib/browser.mjs';
import { encodePNG, downscaleTopDown } from './lib/png.mjs';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true); };
const KEY = [0, 3, 36, 63, 71, 100, 140, 224, 248, 256, 288, 352, 384, 448, 512, 576, 608, 632, 672, 736, 800, 832, 896, 928, 1020, 1060, 1120, 1250, 1376, 1408, 1440, 1480, 1536, 1632, 1664, 1790];
const frames = arg('frames') ? String(arg('frames')).split(',').map(Number) : KEY;
const cols = +arg('cols', 6), rows = Math.ceil(frames.length / cols), tw = +arg('tile', 480), th = Math.round(tw * 9 / 16), scale = +arg('scale', 0.5), labels = String(arg('labels', '1')) !== '0';
const out = path.resolve(process.cwd(), arg('out', path.join(ROOT, 'renders/contact-sheet.png')));
const query = { k: arg('k', '2') }; if (arg('acts') && arg('acts') !== true) query.acts = arg('acts');

// 5x7 digit font for frame labels (white on a red chip)
const GLYPH = { '0': '01110100011001110101110011000101110', '1': '00100011000010000100001000010001110', '2': '01110100010000100010001000100011111', '3': '11110000010000101110000010000111110',
  '4': '00010001100101010010111110001000010', '5': '11111100001111000001000001000111110', '6': '00110010001000011110100011000101110', '7': '11111000010001000100010000100001000',
  '8': '01110100011000101110100011000101110', '9': '01110100011000101111000010001001100', f: '00110010001110001000010000100001000' };
function label(buf, W, text, x0, y0, s = 3) {
  const cw = 6 * s, chipW = text.length * cw + 4 * s, chipH = 9 * s;
  for (let y = 0; y < chipH; y++) for (let x = 0; x < chipW; x++) { const o = ((y0 + y) * W + x0 + x) * 4; buf[o] = 232; buf[o + 1] = 1; buf[o + 2] = 1; }
  [...text].forEach((ch, i) => { const g = GLYPH[ch]; if (!g) return; for (let gy = 0; gy < 7; gy++) for (let gx = 0; gx < 5; gx++) if (g[gy * 5 + gx] === '1') for (let yy = 0; yy < s; yy++) for (let xx = 0; xx < s; xx++) { const o = ((y0 + 2 * s + gy * s + yy) * W + x0 + 2 * s + i * cw + gx * s + xx) * 4; buf[o] = 255; buf[o + 1] = 255; buf[o + 2] = 255; } });
}

const pending = new Map();
const { port, close } = await startServer({ root: ROOT, onFrame: (id, b) => { const r = pending.get(id); if (r) { pending.delete(id); r(b); } } });
const browser = await launch();
try {
  const page = await openFilm(browser, { port, scale, query, quiet: true });
  const info = await page.evaluate(() => window.__info());
  const SW = cols * tw, SH = rows * th, sheet = Buffer.alloc(SW * SH * 4); for (let i = 0; i < sheet.length; i += 4) { sheet[i] = 232; sheet[i + 1] = 1; sheet[i + 2] = 1; sheet[i + 3] = 255; }
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i], id = 'c' + f, got = new Promise((r) => pending.set(id, r));
    await page.evaluate(([fr, k]) => window.__renderPost(fr, k), [f, id]);
    const tile = downscaleTopDown(await got, info.W, info.H, tw, th);
    const cx = (i % cols) * tw, cy = Math.floor(i / cols) * th;
    for (let y = 0; y < th; y++) tile.copy(sheet, ((cy + y) * SW + cx) * 4, y * tw * 4, (y + 1) * tw * 4);
    if (labels) label(sheet, SW, 'f' + f, cx + 6, cy + 6, Math.max(2, Math.round(tw / 160)));
    process.stderr.write(`\rtile ${i + 1}/${frames.length} (f${f})   `);
  }
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, encodePNG(sheet, SW, SH, { flipY: false, level: 6 }));
  console.log(`\n${out}  ${SW}x${SH}`);
} finally { await browser.close(); await close(); }
