#!/usr/bin/env node
// Render any list of frames to PNG (final-quality by default: 1080p, motion blur, grain).
//   node tools/stills.mjs --frames 0,3,12,50          -> out/stills/f0000.png ...
//   node tools/stills.mjs --range 0-127 --step 8       a range, every 8th frame
//   node tools/stills.mjs --frames 3 --acts 1          load only act1 (scene agents: load ONLY your own acts, a broken file elsewhere cannot hurt you)
//   node tools/stills.mjs --frames 72 --scale 0.5 --k 1   draft look (half-res, no motion blur)
//   node tools/stills.mjs --frames 0 --probe 40,40;960,540   print sRGB samples (avg/min/max over a 5x5 window)
// Flags: --out DIR (default advrtizx-intro/out/stills)  --prefix NAME  --scale S  --k N (force sub-frames)  --kmin N  --acts 1,2
import fs from 'node:fs';
import path from 'node:path';
import { startServer } from './lib/server.mjs';
import { launch, openFilm, ROOT } from './lib/browser.mjs';
import { encodePNG } from './lib/png.mjs';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true); };

const scale = +arg('scale', 1);
let frames = [];
if (arg('frames')) frames = String(arg('frames')).split(',').map(Number);
else if (arg('range')) { const [a, b] = String(arg('range')).split('-').map(Number); const st = +arg('step', 1); for (let f = a; f <= b; f += st) frames.push(f); }
if (!frames.length) { console.error('usage: node tools/stills.mjs --frames 0,3,12  |  --range 0-127 --step 8   [--acts 1,2] [--scale 1] [--k N] [--probe x,y;x,y]'); process.exit(2); }
const outDir = path.resolve(process.cwd(), arg('out', path.join(ROOT, 'out/stills'))); fs.mkdirSync(outDir, { recursive: true });
const prefix = arg('prefix', 'f');
const query = {}; if (arg('acts') !== undefined && arg('acts') !== true) query.acts = arg('acts'); if (arg('acts') === 'none') query.acts = ''; if (arg('dev')) query.dev = arg('dev'); if (arg('q')) for (const [k, v] of new URLSearchParams(String(arg('q')))) query[k] = v; if (arg('k')) query.k = arg('k'); if (arg('kmin')) query.kmin = arg('kmin'); if (arg('msaa')) query.msaa = arg('msaa');
const probes = arg('probe') ? String(arg('probe')).split(';').map((s) => s.split(',').map(Number)) : null;

const pending = new Map();
const { port, close } = await startServer({ root: ROOT, onFrame: (id, buf) => { const r = pending.get(id); if (r) { pending.delete(id); r(buf); } } });
const browser = await launch();
try {
  const t0 = Date.now();
  const page = await openFilm(browser, { port, scale, query });
  const info = await page.evaluate(() => window.__info());
  console.log(`webgl: ${info.gl.renderer}`);
  console.log(`scenes: ${info.scenes.map((s) => `${s.id}[${s.start}-${s.end}]`).join(' ')}  fonts: ${info.fonts.total} faces`);
  if (await page.evaluate(() => window.__sceneErrors.length)) console.error('SCENE ERRORS:\n' + (await page.evaluate(() => window.__sceneErrors)).join('\n'));
  console.log(`boot ${(Date.now() - t0) / 1000}s`);
  for (const f of frames) {
    const id = `${prefix}${f}`; const t1 = Date.now();
    const got = new Promise((res) => pending.set(id, res));
    const r = await page.evaluate(([fr, i]) => window.__renderPost(fr, i), [f, id]);
    const buf = await got;
    const file = path.join(outDir, `${prefix}${String(f).padStart(4, '0')}.png`);
    fs.writeFileSync(file, encodePNG(buf, info.W, info.H));
    console.log(`f${f}  K=${r.K}  ${Date.now() - t1} ms  ${path.relative(process.cwd(), file)}`);
    if (probes) { const p = await page.evaluate((pts) => window.__probe(pts), probes); p.forEach((s, i) => console.log(`   probe (${probes[i]}) avg ${s.avg.join(',')}  min ${s.min.join(',')}  max ${s.max.join(',')}`)); }
  }
} finally { await browser.close(); await close(); }
