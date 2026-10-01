/* DOMINANT · film/main.js: boot. SHARED, DO NOT EDIT (scene agents own film/scenes/actN.js only).
   Exposes: window.seek(frame)  (deterministic, fractional OK), window.__ready, window.__fatal, plus capture helpers for tools/. */
import * as THREE from 'three';
import { Engine } from './engine/engine.js';
import * as util from './engine/util.js';
import * as camera from './engine/camera.js';
import { loadCues, cue, cues, cueFrames, hasCue, allCues } from './engine/cues.js';
import * as logo from './kits/logo.js';
import * as towers from './kits/towers.js';
import * as world from './kits/world.js';
import * as type from './kits/type.js';
import * as city from './kits/city.js';
import { SCENE_FILES } from './scenes/index.js';

const q = new URLSearchParams(location.search);
const num = (k, d) => (q.has(k) ? +q.get(k) : d);

window.__ready = false; window.__fatal = null; window.__sceneErrors = [];
window.__boot = (async () => {
  try {
    const scale = num('scale', 1);
    await Promise.all([loadCues(), logo.loadMark()]);
    const fontInfo = await type.loadAllFonts();
    window.__fonts = fontInfo;
    if (fontInfo.errors.length) console.error('FONT ERRORS: ' + fontInfo.errors.join(' | '));
    const canvas = document.getElementById('c');
    const engine = new Engine({ scale, msaa: num('msaa', 4), kMin: num('kmin', 1), kMax: num('kmax', 32), kOverride: num('k', 0), present: q.has('present') || q.has('play'), shutter: num('shutter', 0.5) });
    window.__engine = engine;
    await engine.init(canvas, async (ctx) => {
      Object.assign(ctx, { util, camera, cue, cues, cueFrames, hasCue, allCues, kits: { logo, towers, world, type, city } });
    });
    const only = q.has('acts') ? new Set(q.get('acts').split(',').filter(Boolean).map((s) => 'act' + s.replace(/^act/, ''))) : null;
    const strict = q.has('strict');
    for (const name of SCENE_FILES) {
      if (only && !only.has(name)) continue;
      try {
        const mod = await import(`./scenes/${name}.js`);
        const list = [].concat(mod.default);
        for (let i = 0; i < list.length; i++) await engine.registerScene(list[i], list.length > 1 ? `${name}.${i}` : name);
      } catch (e) {
        const msg = `scene ${name}: ${e && e.stack ? e.stack : e}`;
        window.__sceneErrors.push(msg); console.error(msg);
        if (strict) throw e;
      }
    }
    // dev scenes (film/dev/NAME.js): kit tests that are not part of the film. ?dev=name
    if (q.get('dev')) { for (const name of q.get('dev').split(',')) { const mod = await import(`./dev/${name}.js`); for (const fac of [].concat(mod.default)) await engine.registerScene(fac, 'dev.' + name); } }
    window.seek = (f) => { engine.seek(f); };
    window.__info = () => ({ W: engine.W, H: engine.H, gl: engine.glInfo, scenes: engine.scenes.map((s) => ({ id: s.id, start: s.start, end: s.end })), fonts: { total: fontInfo.total, families: fontInfo.families } });
    window.__K = () => engine.stats.K;
    window.__pixels = () => engine.readPixels();
    /** seek + read + POST raw RGBA to the render server. Resolves with {K}. */
    window.__renderPost = async (f, id) => {
      engine.seek(f);
      const buf = engine.readPixels();
      const r = await fetch('/__frame?i=' + encodeURIComponent(id), { method: 'POST', body: buf });
      if (!r.ok) throw new Error('frame upload failed ' + r.status);
      return { K: engine.stats.K };
    };
    /** average sRGB (0-255) of a (2r+1)^2 window around each [x,y] (top-left origin) of the LAST frame. */
    window.__probe = (pts, r = 2) => {
      const { W, H } = engine, buf = engine.readPixels();
      return pts.map(([x, y]) => { let s = [0, 0, 0], mn = [255, 255, 255], mx = [0, 0, 0], n = 0;
        for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) { const px = Math.min(W - 1, Math.max(0, Math.round(x) + i)), py = Math.min(H - 1, Math.max(0, Math.round(y) + j)), o = ((H - 1 - py) * W + px) * 4;
          for (let c = 0; c < 3; c++) { const v = buf[o + c]; s[c] += v; mn[c] = Math.min(mn[c], v); mx[c] = Math.max(mx[c], v); } n++; }
        return { avg: s.map((v) => +(v / n).toFixed(2)), min: mn, max: mx }; });
    };
    if (q.has('f')) engine.seek(num('f', 0));
    else if (!q.has('noWarm')) engine.seek(0);
    if (q.has('play')) {
      let f = num('from', 0), last = -1;
      const to = num('to', 1799);
      const step = (ts) => { const nf = Math.floor(ts / (1000 / 30)) % (to - num('from', 0) + 1) + num('from', 0); if (nf !== last) { last = nf; engine.seek(nf); } requestAnimationFrame(step); };
      requestAnimationFrame(step);
    }
    window.__ready = true;
  } catch (e) {
    window.__fatal = String(e && e.stack ? e.stack : e); console.error('FATAL ' + window.__fatal);
  }
})();
