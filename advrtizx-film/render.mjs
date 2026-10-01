#!/usr/bin/env node
// TRUE ANGLE renderer: headless Chromium seeks film/index.html frame by frame, ffmpeg encodes the images.
// node render.mjs [--from 0] [--to 1799] [--scale 1] [--out out/true-angle.mp4] [--stills "0,90,420"]
//                 [--audio public/audio/score.wav] [--workers 4] [--format png|jpeg] [--crf 16] [--preset medium]
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
const FRAMES = 1800, FPS = 30;

const argv = process.argv.slice(2), arg = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true); };
const from = Math.max(0, +arg('from', 0)), to = Math.min(FRAMES - 1, +arg('to', FRAMES - 1));
const scale = Math.min(1, Math.max(0.1, +arg('scale', 1))), workers = Math.max(1, +arg('workers', 4)), crf = +arg('crf', 16), preset = arg('preset', 'medium');
const format = arg('format', scale < 1 ? 'jpeg' : 'png');
const stills = arg('stills', null), audio = arg('audio', null);
const out = path.resolve(HERE, arg('out', scale < 1 ? 'out/true-angle_draft.mp4' : 'out/true-angle.mp4'));
const page_url = pathToFileURL(path.join(HERE, 'film/index.html')).href;

function loadPlaywright() {
  const req = createRequire(import.meta.url), paths = [HERE, ...(process.env.NODE_PATH || '').split(':').filter(Boolean)];
  try { paths.push(execSync('npm root -g', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()); } catch {}
  for (const name of ['playwright-core', 'playwright']) { try { return req(req.resolve(name, { paths })); } catch {} }
  throw new Error('playwright(-core) not found locally, in NODE_PATH or npm root -g. Run: npm i playwright-core (in advrtizx-film/)');
}

async function openPage(browser) {
  // scale < 1: smaller viewport, index.html scales the stage down with CSS (vectors re-rasterise crisply).
  const page = await browser.newPage({ viewport: { width: Math.round(1920 * scale), height: Math.round(1080 * scale) }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error('[page error]', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.error('[console]', m.text()); });
  await page.goto(page_url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 });
  await page.evaluate(() => document.fonts.ready);
  const cdp = await page.context().newCDPSession(page);
  const shot = async (f) => {
    await page.evaluate((fr) => window.seek(fr), f);
    const r = await cdp.send('Page.captureScreenshot', { format, quality: format === 'jpeg' ? 95 : undefined, optimizeForSpeed: true, captureBeyondViewport: false });
    return Buffer.from(r.data, 'base64');
  };
  return { page, shot };
}

const t0 = Date.now();
const { chromium } = loadPlaywright();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--force-color-profile=srgb', '--font-render-hinting=none', '--hide-scrollbars', '--disable-lcd-text', '--allow-file-access-from-files'] });
try {
  if (stills) {
    const dir = path.resolve(HERE, 'out/stills'); fs.mkdirSync(dir, { recursive: true });
    const { page, shot } = await openPage(browser);
    const fonts = await page.evaluate(() => ({ fonts: window.__fonts, errors: window.__fontErrors }));
    console.log('fonts:', fonts.fonts.join(' | ')); if (fonts.errors.length) console.error('FONT ERRORS:', fonts.errors);
    for (const f of String(stills).split(',').map((s) => +s.trim()).filter((n) => n >= 0 && n < FRAMES)) {
      const file = path.join(dir, `f${String(f).padStart(4, '0')}.png`);
      await page.evaluate((fr) => window.seek(fr), f);
      await page.screenshot({ path: file, type: 'png' });
      console.log('still', file);
    }
  } else {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const n = to - from + 1, haveAudio = audio && fs.existsSync(path.resolve(HERE, audio));
    if (audio && !haveAudio) console.warn(`audio ${audio} not found, rendering silent`);
    const vf = format === 'jpeg' ? 'scale=in_color_matrix=bt601:in_range=pc:out_color_matrix=bt709:out_range=tv,format=yuv420p'
                                 : 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p';
    const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', format === 'jpeg' ? 'mjpeg' : 'png', '-i', '-',
      ...(haveAudio ? ['-ss', (from / FPS).toFixed(3), '-t', (n / FPS).toFixed(3), '-i', path.resolve(HERE, audio)] : []),
      '-map', '0:v', ...(haveAudio ? ['-map', '1:a', '-c:a', 'aac', '-b:a', '320k', '-ar', '48000'] : []),
      '-vf', vf, '-c:v', 'libx264', '-preset', String(preset), '-crf', String(crf), '-pix_fmt', 'yuv420p',
      '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
      '-r', String(FPS), '-t', (n / FPS).toFixed(3), '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
    const ffDone = new Promise((res, rej) => ff.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg exited ' + c)))));
    ff.stdin.on('error', (e) => console.error('ffmpeg stdin', e.message));

    const pages = await Promise.all(Array.from({ length: Math.min(workers, n) }, () => openPage(browser)));
    const tCap = Date.now(), ready = new Map(), waiters = new Map(); let next = from, written = from;
    const LOOKAHEAD = 32;
    const deliver = (f, buf) => { const w = waiters.get(f); if (w) { waiters.delete(f); w(buf); } else ready.set(f, buf); };
    const take = (f) => (ready.has(f) ? Promise.resolve(ready.get(f)).finally(() => ready.delete(f)) : new Promise((r) => waiters.set(f, r)));
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const work = async ({ shot }) => { while (true) { const f = next++; if (f > to) return; while (f - written > LOOKAHEAD) await sleep(2); deliver(f, await shot(f)); } };
    const writer = (async () => {
      for (let f = from; f <= to; f++) {
        const buf = await take(f);
        if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
        written = f + 1;
        if ((f - from + 1) % 60 === 0 || f === to) { const el = (Date.now() - tCap) / 1000, done = f - from + 1;
          process.stderr.write(`\rframe ${f}  ${done}/${n}  ${(done / el).toFixed(1)} fps  ${(1000 * el / done).toFixed(0)} ms/frame  ETA ${((n - done) * el / done).toFixed(0)}s   `); }
      }
      ff.stdin.end();
    })();
    await Promise.all([...pages.map(work), writer]); await ffDone;
    const el = (Date.now() - tCap) / 1000;
    console.log(`\n${out}\n${n} frames · ${pages.length} workers · ${format} · scale ${scale} · capture+encode ${el.toFixed(1)}s · ${(1000 * el / n).toFixed(1)} ms/frame · total ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }
} finally { await browser.close(); }
