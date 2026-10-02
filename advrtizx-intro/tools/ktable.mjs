#!/usr/bin/env node
// Prints the per-frame K schedule (scene samples(t) hooks, clamped by --kmin/--kmax) and optionally times 1 sub-frame at sample frames.
//   node tools/ktable.mjs [--kmax 6] [--time 0,64,128] [--scale 1]
import { startServer } from './lib/server.mjs';
import { launch, openFilm, ROOT } from './lib/browser.mjs';
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const { port, close } = await startServer({ root: ROOT, onFrame: () => {} });
const browser = await launch();
try {
  const query = { kmax: arg('kmax', '6') }; if (arg('kmin')) query.kmin = arg('kmin');
  const page = await openFilm(browser, { port, scale: +arg('scale', 1), query, quiet: true });
  const K = await page.evaluate(() => { const e = window.__engine, out = []; for (let f = 0; f < 1800; f++) out.push(e.pickK(f, e.activeScenes(f))); return out; });
  const acts = [[0, 127], [128, 255], [256, 383], [384, 639], [640, 895], [896, 1151], [1152, 1407], [1408, 1631], [1632, 1799]];
  acts.forEach(([a, b], i) => { const s = K.slice(a, b + 1); console.log(`act${i + 1} f${a}-${b}: sumK ${s.reduce((x, y) => x + y, 0)}  frames ${s.length}  hist ${JSON.stringify(s.reduce((h, k) => ((h[k] = (h[k] || 0) + 1), h), {}))}`); });
  console.log('TOTAL sub-frames', K.reduce((x, y) => x + y, 0));
  if (arg('dump')) console.log(JSON.stringify(K));
  if (arg('time')) {
    const fr = arg('time').split(',').map(Number); const res = [];
    for (const f of fr) { await page.evaluate((f) => { window.__engine.opts.kOverride = 1; window.seek(f); window.__pixels(); }, f);
      const ms = await page.evaluate((f) => { const t = performance.now(); window.seek(f); window.__pixels(); return performance.now() - t; }, f);
      res.push([f, Math.round(ms), K[f]]); console.log(`f${f} K=${K[f]} subframe ${Math.round(ms)} ms -> est ${(ms * K[f] / 1000).toFixed(1)} s`); }
  }
} finally { await browser.close(); await close(); }
