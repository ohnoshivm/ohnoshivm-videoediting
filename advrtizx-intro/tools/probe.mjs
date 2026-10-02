#!/usr/bin/env node
// WebGL2 probe: prints the renderer string, limits, and ms per sub-frame / frame for a trivial and a real scene.
//   node tools/probe.mjs
import { startServer } from './lib/server.mjs';
import { launch, openFilm, ROOT } from './lib/browser.mjs';
const { port, close } = await startServer({ root: ROOT });
const browser = await launch();
try {
  for (const [label, scale, k] of [['draft 960x540 K=1', 0.5, 1], ['final 1920x1080 K=4', 1, 4]]) {
    const page = await openFilm(browser, { port, scale, query: { acts: '1', k }, quiet: true });
    const info = await page.evaluate(() => window.__info());
    if (label.startsWith('draft')) console.log(`renderer: ${info.gl.renderer}\nversion: ${info.gl.version}  MAX_SAMPLES ${info.gl.maxSamples}  fonts ${info.fonts.total} faces`);
    const ms = await page.evaluate(() => { const t = []; for (const f of [40, 41, 42, 43, 44]) { const a = performance.now(); window.seek(f); window.__pixels(); t.push(performance.now() - a); } return t; });
    console.log(`${label}: ${ms.map((v) => v.toFixed(0)).join(', ')} ms per frame (Act I f40-44)`);
    await page.close();
  }
} finally { await browser.close(); await close(); }
