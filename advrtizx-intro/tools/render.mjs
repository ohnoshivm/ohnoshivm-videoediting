#!/usr/bin/env node
// DOMINANT renderer: headless Chromium (software WebGL2) renders film/index.html frame by frame, raw RGBA frames are piped
// in order into ffmpeg (libx264, bt709, yuv420p, 30 fps) and the score (audio/out/score.wav) is muxed if it exists.
//
//   node tools/render.mjs --draft                      half-res (960x540), K=1, fast encode -> renders/advrtizx-intro-draft.mp4
//   node tools/render.mjs --final                      1080p, motion blur (K from the scenes, min 4 for antialiasing), grain, x264 slow
//   node tools/render.mjs --draft --from 0 --to 127 --out out/act1.mp4         a range
//   node tools/render.mjs --draft --acts 3 --from 256 --to 383                 only load act 3 (scene agents)
// Flags: --draft | --final  --from N --to N  --acts 1,2  --out FILE  --workers N  --scale S  --k N (force sub-frames)  --kmin N  --kmax N
//        --crf N  --preset NAME  --maxrate 10M  --bufsize 20M  --audio FILE|none  --strict (fail on any scene error)  --stats FILE
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { startServer } from './lib/server.mjs';
import { launch, openFilm, ROOT, FRAMES, FPS } from './lib/browser.mjs';

const argv = process.argv.slice(2);
const flag = (k) => argv.includes('--' + k);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true); };

const final = flag('final') || !flag('draft');
const from = Math.max(0, +arg('from', 0)), to = Math.min(FRAMES - 1, +arg('to', FRAMES - 1)), n = to - from + 1;
const scale = +arg('scale', final ? 1 : 0.5);
const W = Math.round(1920 * scale), H = Math.round(1080 * scale);
const workers = Math.max(1, +arg('workers', final ? 3 : 3));
const out = path.resolve(process.cwd(), arg('out', path.join(ROOT, 'renders', final ? 'advrtizx-intro-1080p.mp4' : 'advrtizx-intro-draft.mp4')));
const crf = +arg('crf', final ? 17 : 23), preset = String(arg('preset', final ? 'slow' : 'veryfast'));
const maxrate = String(arg('maxrate', final ? '10M' : '6M')), bufsize = String(arg('bufsize', final ? '20M' : '12M'));
const audioArg = arg('audio', 'auto');
const audioFile = audioArg === 'none' ? null : (audioArg === 'auto' ? path.join(ROOT, 'audio/out/score.wav') : path.resolve(process.cwd(), audioArg));
const haveAudio = audioFile && fs.existsSync(audioFile);
const query = {}; if (arg('acts') && arg('acts') !== true) query.acts = arg('acts');
if (arg('k')) query.k = arg('k'); else if (!final) query.k = 1;
if (arg('kmin')) query.kmin = arg('kmin'); else if (final) query.kmin = 4;
if (arg('kmax')) query.kmax = arg('kmax');
if (flag('strict')) query.strict = 1;
const statsFile = arg('stats', path.join(ROOT, 'out/render-stats.json'));

fs.mkdirSync(path.dirname(out), { recursive: true }); fs.mkdirSync(path.dirname(statsFile), { recursive: true });
console.log(`${final ? 'FINAL' : 'DRAFT'} f${from}-f${to} (${n} frames, ${(n / FPS).toFixed(2)} s)  ${W}x${H}  workers ${workers}  crf ${crf} ${preset}  audio ${haveAudio ? path.relative(ROOT, audioFile) : 'none (silent)'}`);
if (audioArg !== 'auto' && audioArg !== 'none' && !haveAudio) console.warn(`audio ${audioFile} not found, rendering silent`);

// ---- ffmpeg ------------------------------------------------------------------------------------------------------------------
const ffArgs = ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-framerate', String(FPS), '-i', 'pipe:0'];
if (haveAudio) ffArgs.push('-ss', (from / FPS).toFixed(4), '-t', (n / FPS).toFixed(4), '-i', audioFile);
ffArgs.push('-map', '0:v', ...(haveAudio ? ['-map', '1:a', '-c:a', 'aac', '-b:a', '320k', '-ar', '48000', '-ac', '2'] : []),
  '-vf', 'vflip,scale=in_range=pc:out_range=tv:out_color_matrix=bt709:flags=bicubic+accurate_rnd+full_chroma_int,format=yuv420p',
  '-c:v', 'libx264', '-preset', preset, '-crf', String(crf), '-maxrate', maxrate, '-bufsize', bufsize, '-profile:v', 'high', '-pix_fmt', 'yuv420p',
  '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
  '-r', String(FPS), '-t', (n / FPS).toFixed(4), '-movflags', '+faststart', out);
const ff = spawn('ffmpeg', ffArgs, { stdio: ['pipe', 'inherit', 'inherit'] });
const ffDone = new Promise((res, rej) => ff.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg exited ' + c)))));
ff.stdin.on('error', (e) => console.error('ffmpeg stdin:', e.message));

// ---- frame hand-off ----------------------------------------------------------------------------------------------------------
const ready = new Map(), waiters = new Map();
const { port, close } = await startServer({ root: ROOT, onFrame: (id, buf) => { const f = +id; const w = waiters.get(f); if (w) { waiters.delete(f); w(buf); } else ready.set(f, buf); } });
const take = (f) => (ready.has(f) ? Promise.resolve().then(() => { const b = ready.get(f); ready.delete(f); return b; }) : new Promise((r) => waiters.set(f, r)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const t0 = Date.now();
const browsers = [], pages = [];
const stats = new Array(n);
try {
  for (let i = 0; i < workers; i++) { const b = await launch(); browsers.push(b); pages.push(await openFilm(b, { port, scale, query, quiet: true })); }
  const info = await pages[0].evaluate(() => window.__info());
  console.log(`webgl: ${info.gl.renderer}  boot ${((Date.now() - t0) / 1000).toFixed(1)}s  scenes: ${info.scenes.map((s) => `${s.id}[${s.start}-${s.end}]`).join(' ')}`);
  const errs = await pages[0].evaluate(() => window.__sceneErrors); if (errs.length) { console.error('SCENE ERRORS:\n' + errs.join('\n')); if (flag('strict')) throw new Error('scene errors'); }

  let next = from, written = from; const LOOKAHEAD = 12;
  const tCap = Date.now();
  const work = async (page, wi) => {
    while (true) {
      const f = next++; if (f > to) return;
      while (f - written > LOOKAHEAD) await sleep(5);
      const t1 = Date.now();
      let attempt = 0;
      for (;;) {
        try { const r = await page.evaluate(([fr]) => window.__renderPost(fr, String(fr)), [f]); stats[f - from] = { f, ms: Date.now() - t1, K: r.K }; break; }
        catch (e) { if (++attempt > 2) throw e; console.error(`\nframe ${f} failed (${e.message}); retrying`); await sleep(200); }
      }
    }
  };
  const writer = (async () => {
    for (let f = from; f <= to; f++) {
      const buf = await take(f);
      if (buf.length !== W * H * 4) throw new Error(`frame ${f}: got ${buf.length} bytes, expected ${W * H * 4}`);
      if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
      written = f + 1;
      const done = f - from + 1;
      if (done % 15 === 0 || f === to) { const el = (Date.now() - tCap) / 1000; process.stderr.write(`\rframe ${f}  ${done}/${n}  ${(done / el).toFixed(2)} fps  ${(1000 * el / done).toFixed(0)} ms/frame  ETA ${Math.round((n - done) * el / done)}s   `); }
    }
    ff.stdin.end();
  })();
  await Promise.all([...pages.map((p, i) => work(p, i)), writer]);
  await ffDone;
  const el = (Date.now() - tCap) / 1000;
  fs.writeFileSync(statsFile, JSON.stringify({ final, from, to, scale, workers, seconds: el, msPerFrame: (1000 * el) / n, frames: stats }, null, 0));
  const size = fs.statSync(out).size;
  console.log(`\n${out}\n${n} frames  ${(1000 * el / n).toFixed(0)} ms/frame  capture+encode ${el.toFixed(1)}s  total ${((Date.now() - t0) / 1000).toFixed(1)}s  size ${(size / 1048576).toFixed(1)} MB`);
  if (size > 95 * 1048576) console.warn('WARNING: output exceeds 95 MB; raise --crf or lower --maxrate or reduce grain');
} finally { for (const b of browsers) await b.close().catch(() => {}); await close(); }
