#!/usr/bin/env node
// Quality checks that must pass before a render is trusted:
//   1. FLAT RED: a frame with nothing in it reads exactly (232,1,1) everywhere (the end-card red is #E80101 exactly).
//   2. CROWN PROFILE: every crown kind, rendered straight-on orthographic, matches the logo's path (IoU against Path2D of mark.svg).
//   node tools/qa.mjs
import { startServer } from './lib/server.mjs';
import { launch, openFilm, ROOT } from './lib/browser.mjs';

const { port, close } = await startServer({ root: ROOT });
const browser = await launch();
let ok = true;
try {
  // ---- 1. flat red
  let page = await openFilm(browser, { port, scale: 0.5, query: { acts: '', dev: 'qa', mode: 'flat', k: 1 }, quiet: true });
  await page.evaluate(() => window.seek(0));
  const pts = []; for (let y = 5; y < 540; y += 53) for (let x = 5; x < 960; x += 97) pts.push([x, y]);
  const probe = await page.evaluate((p) => window.__probe(p, 2), pts);
  const bad = probe.filter((s) => s.min[0] !== 232 || s.max[0] !== 232 || s.min[1] !== 1 || s.max[1] !== 1 || s.min[2] !== 1 || s.max[2] !== 1);
  console.log(`flat red (grain 0, vignette 0): ${probe.length} sample windows, ${bad.length} off-colour -> ${bad.length ? 'FAIL' : 'PASS (all exactly 232,1,1)'}`);
  if (bad.length) { ok = false; console.log(bad.slice(0, 3)); }
  await page.close();
  // with grain+vignette on (normal frames): sky stays within +-2
  page = await openFilm(browser, { port, scale: 0.5, query: { acts: '1', k: 1 }, quiet: true });
  await page.evaluate(() => window.seek(3));
  const sk = await page.evaluate(() => window.__probe([[10, 10], [950, 10], [100, 60], [60, 200], [900, 150]], 6));
  const skBad = sk.filter((s) => Math.abs(s.avg[0] - 232) > 2 || s.avg[1] > 3 || s.avg[2] > 3);
  console.log(`sky with grain+vignette (Act I f3): ${sk.map((s) => s.avg.map((v) => v.toFixed(1)).join(',')).join(' | ')} -> ${skBad.length ? 'FAIL' : 'PASS (within +-2)'}`);
  if (skBad.length) ok = false;
  await page.close();

  // ---- 2. crown profile: rendered silhouette vs a raster of the ORIGINAL path data (independent of the parser)
  for (const kind of ['A', 'Am', 'Dd', 'Ds', 'Dsm']) {
    const pg = await openFilm(browser, { port, scale: 1, query: { acts: '', dev: 'qa', mode: 'crown', kind, k: 1 }, quiet: true });
    const res = await pg.evaluate(async (kind) => {
      window.seek(0);
      const { W, H } = window.__engine, buf = window.__pixels(), S = H / 200;   // px per mark unit
      let n = 0, x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const o = ((H - 1 - y) * W + x) * 4; const cov = Math.min(1, Math.max(0, (buf[o + 1] - 1) / 254)); if (cov > 0.5) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } n += cov; }
      // reference: original path, 20 px per mark unit
      const logo = await import('/film/kits/logo.js'), part = kind.startsWith('A') ? 'A' : 'D', R = 20;
      const cv = document.createElement('canvas'); cv.width = 260 * R; cv.height = 100 * R; const g = cv.getContext('2d', { willReadFrequently: true });
      g.scale(R, R); g.fillStyle = '#000'; g.fill(logo.path2D(part));
      const d = g.getImageData(0, 0, cv.width, cv.height).data; let m = 0, rx0 = 1e9, rx1 = -1, ry0 = 1e9, ry1 = -1;
      for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) { const a = d[(y * cv.width + x) * 4 + 3] / 255; m += a; if (a > 0.5) { rx0 = Math.min(rx0, x); rx1 = Math.max(rx1, x); ry0 = Math.min(ry0, y); ry1 = Math.max(ry1, y); } }
      const rotated = kind === 'Dd';
      const refW = ((rx1 - rx0 + 1) / R), refH = ((ry1 - ry0 + 1) / R);
      return { px: { w: x1 - x0 + 1, h: y1 - y0 + 1, area: n }, ref: { w: (rotated ? refH : refW) * S, h: (rotated ? refW : refH) * S, area: (m / (R * R)) * S * S } };
    }, kind);
    const dA = Math.abs(res.px.area - res.ref.area) / res.ref.area * 100, dW = Math.abs(res.px.w - res.ref.w), dH = Math.abs(res.px.h - res.ref.h);
    const pass = dA < 0.3 && dW < 1.5 && dH < 1.5;
    if (!pass) ok = false;
    console.log(`crown ${kind.padEnd(3)} rendered ${res.px.w}x${res.px.h}px  reference ${res.ref.w.toFixed(1)}x${res.ref.h.toFixed(1)}px  area ${res.px.area.toFixed(0)} vs ${res.ref.area.toFixed(0)} (${dA.toFixed(3)}% off)  -> ${pass ? 'PASS' : 'FAIL'}`);
    await pg.close();
  }
} finally { await browser.close(); await close(); }
console.log(ok ? '\nQA PASS' : '\nQA FAIL');
process.exit(ok ? 0 : 1);
