/* ACT V · AT ONCE (f640-895) · owner: act4/act5 author
   The frame splits into a precise grid of simultaneous skylines (2, 4, 8, 16, 32, 64 panels), every panel a different city with its name in its own
   script standing in the fog. Each split lands on its cue frame: gutters slam in, every panel erupts at once. Copy lines slam in on a solid red band.
   f832 UNISON: in all 64 panels every tower rises together and every crown lands on the same frame. f864-895: tension build (push-in, grid zoom,
   density landing on 16ths then 32nds, rumble). Hard cut at f896. Panels are views (scissor viewports) of small dioramas under one scene. */
import * as S2 from './lib_s2.js';

const ARCH = ['london', 'newyork', 'singapore', 'mumbai', 'miami', 'sydney', 'riyadh', 'hongkong', 'tokyo'];
// name pool: [text, lang, archetype index, stretch]
const POOL = [
  ['TOKYO', 'latin', 8], ['DUBAI', 'latin', 1], ['東京', 'ja', 8], ['LONDON', 'latin', 0], ['الرياض', 'arabic', 6], ['NEW YORK', 'latin', 1], ['新加坡', 'zh', 2], ['मुंबई', 'devanagari', 3],
  ['SYDNEY', 'latin', 5], ['MIAMI', 'latin', 4], ['香港', 'zh', 7], ['서울', 'ko', 7], ['กรุงเทพ', 'thai', 1], ['МОСКВА', 'cyrillic', 7], ['ΑΘΗΝΑ', 'greek', 5], ['دبي', 'arabic', 1],
  ['上海', 'zh', 2], ['北京', 'zh', 7], ['大阪', 'ja', 8], ['दिल्ली', 'devanagari', 3], ['القاهرة', 'arabic', 6], ['SÃO PAULO', 'latin', 1], ['MÉXICO', 'latin', 0], ['TORONTO', 'latin', 1],
  ['PARIS', 'latin', 0], ['BERLIN', 'latin', 7], ['MADRID', 'latin', 5], ['LISBOA', 'latin', 5], ['İSTANBUL', 'latin', 3], ['ЛОНДОН', 'cyrillic', 0], ['深圳', 'zh', 7], ['广州', 'zh', 2],
  ['CHICAGO', 'latin', 1], ['SEATTLE', 'latin', 2], ['MELBOURNE', 'latin', 5], ['АСТАНА', 'cyrillic', 6], ['الدوحة', 'arabic', 6], ['أبوظبي', 'arabic', 6], ['ΘΕΣΣΑΛΟΝΙΚΗ', 'greek', 3], ['HANOI', 'latin', 4],
  ['জাকার্তা', 'devanagari', 3], ['台北', 'zh', 8], ['부산', 'ko', 4], ['MUMBAI', 'latin', 3], ['LAGOS', 'latin', 4], ['NAIROBI', 'latin', 2], ['BOGOTÁ', 'latin', 7], ['LIMA', 'latin', 0],
  ['SANTIAGO', 'latin', 1], ['MIAMI', 'latin', 4], ['VIENNA', 'latin', 0], ['ZÜRICH', 'latin', 5], ['MILANO', 'latin', 7], ['OSLO', 'latin', 3], ['KRAKÓW', 'latin', 8], ['PRAHA', 'latin', 0],
  ['BAKU', 'latin', 6], ['ΑΘΗΝΑ', 'greek', 2], ['ТБИЛИСИ', 'cyrillic', 7], ['江戸', 'ja', 8], ['HOUSTON', 'latin', 1], ['DENVER', 'latin', 2], ['BOSTON', 'latin', 0], ['AUSTIN', 'latin', 4],
];
const STAGES = [['a5.p2', 2, 2, 1], ['a5.p4', 4, 2, 2], ['a5.p8', 8, 4, 2], ['a5.p16', 16, 4, 4], ['a5.p32', 32, 8, 4], ['a5.p64', 64, 8, 8]];
const COPY = [['a5.p2', 'ANY TOWER.'], ['a5.p4', 'ANY CITY.'], ['a5.p8', 'ANY LANGUAGE.'], ['a5.p32', 'AT ONCE.'], ['a5.unison', 'ONE INTELLIGENCE.']];

export default function act5(ctx) {
  const { kits, util, camera, THREE } = ctx;
  const { EASE, clamp, lerp, prog, shake, addShake, rumble } = util;
  const T = kits.type;
  const START = ctx.cue('act5'), END = ctx.cue('act6') - 1, UNI = ctx.cue('a5.unison'), TEN = ctx.cue('a5.tension');
  const ground = kits.world.makeGround(); ctx.root.add(ground); ctx.gate(ground);

  const stages = STAGES.map(([cueId, n, cols, rows], si) => ({ si, hit: ctx.cue(cueId), n, cols, rows, panels: [] }));
  let pi = 0;
  for (const st of stages) {
    const aspect = (1920 / st.cols) / (1080 / st.rows), last = st.n === 64;
    const lod = st.n <= 4 ? 0 : st.n <= 16 ? 1 : 2, nameSize = st.n <= 4 ? 512 : st.n <= 8 ? 320 : st.n <= 16 ? 200 : 128;
    for (let k = 0; k < st.n; k++) {
      const [text, lang, ai] = POOL[(pi++ + (st.n === 64 ? 0 : 0)) % POOL.length];
      const arch = ARCH[ai];
      const b = S2.buildCity(kits, st.n >= 16 ? 'panel' : arch, { hit: st.hit + 6, seed: arch + ':' + text + ':' + st.n + ':' + k, lod, shadow: false, thinF: st.n >= 8 ? 0.7 : 1, durRange: [4, 6], waveScale: 0.25, hScale: last ? 0.3 : 1 });
      const g = b.def.cam, nz = b.def.name.z, tt = (g.pos[2] - nz) / (g.pos[2] - g.look[2]), nx = g.pos[0] + (g.look[0] - g.pos[0]) * tt, dist = Math.hypot(g.pos[2] - nz, 0);
      const fovV = g.fov, vh = 2 * dist * Math.tan(fovV * Math.PI / 360), vw = vh * aspect;
      const N = S2.makeName(kits, text, { lang: lang === 'latin' ? undefined : lang, stretch: lang === 'latin' ? 75 : 100, track: -0.035, fog: 0.35, size: nameSize });
      const wF = lang === 'latin' ? 0.84 : 0.7, kk = Math.min(wF * vw / N.inkW, 0.42 * vh / N.inkH);
      N.mesh.scale.setScalar(kk / N.k0); N.yb = b.def.name.y; N.yc = N.yb + (N.baseT - N.texH / 2) * kk;
      N.mistU.y0.value = N.yb - 0.1 * N.inkH * kk; N.mistU.y1.value = N.yb + 0.62 * N.inkH * kk; N.mistU.lo.value = 0.12;
      N.mesh.position.set(nx, N.yc, nz); N.mesh.rotation.y = Math.atan2(g.pos[0] - nx, g.pos[2] - nz);
      b.group.add(N.mesh); ctx.root.add(b.group); ctx.gate(b.group);
      const p = { b, N, fovV, cam: ctx.makeCam(), c: k % st.cols, r: Math.floor(k / st.cols), planeH: N.texH * kk };
      if (last) {   // the unison: every tower is replaced by a taller one that rises together; the tension build adds density on 16ths then 32nds
        const rng = ctx.rng('uni:' + k), B = [], C = [];
        for (const t of b.towers) {
          const tb = { ...t, w: t.w + 1.4, d: t.d + 1.4, h: t.h / 0.3, layer: 0, wave: 0 }; tb.riseH = tb.h * 0.7;
          if (tb.tiers) tb.tiers = t.tiers; B.push(tb);
          if (rng() < 0.45) C.push({ ...t, x: t.x + (rng() - 0.5) * 40, z: t.z + (rng() - 0.5) * 40, w: t.w * 0.75, d: t.d * 0.75, h: t.h / 0.3 * 0.55, riseH: 0, layer: 0 });
        }
        S2.timeTowers(B, { hit: UNI, rng, dropDur: 4, dur: [12, 12], drop: [90, 170], tall: 1e9 });
        const nC = 12; C.forEach((t, i) => { const j = i % nC, land = j < 4 ? TEN + 2 + j * 4 : TEN + 16 + (j - 4) * 2; t.land = land; t.dur = 5; t.t0 = land - 5; t.drop = 70; t.dropDur = 3; });
        const set = new kits.towers.TowerSet({ lod: 2, shadow: false, name: 'uni' + k });
        for (const t of B) S2.emitTower(set, t, kits.logo.crownSize);
        for (const t of C) S2.emitTower(set, t, kits.logo.crownSize);
        set.build(); S2.patchHaze(set, 1, 1); b.group.add(set.group); p.uni = set;
      }
      st.panels.push(p);
    }
  }

  const gutW = [9, 7, 6, 5, 4, 3];
  const stageAt = (t) => { let s = stages[0]; for (const st of stages) if (t >= st.hit - 0.26) s = st; return s; };
  const events = [];
  stages.forEach((st) => events.push({ f: st.hit + 6, amp: 1.0 + st.si * 0.12, decay: 3, freq: 0.6, seed: st.si * 5 }, { f: st.hit, amp: 0.8, decay: 2.2, freq: 0.7, seed: st.si * 5 + 1 }));
  events.push({ f: UNI, amp: 3.2, decay: 4.5, freq: 0.5, seed: 77 });
  for (let j = 0; j < 12; j++) events.push({ f: j < 4 ? TEN + 2 + j * 4 : TEN + 16 + (j - 4) * 2, amp: 0.7, decay: 1.8, freq: 0.8, seed: 90 + j });

  const zoomAt = (t) => 1 + 0.5 * EASE.inCubic(clamp((t - TEN) / (END + 1 - TEN)));
  const copyAt = (t) => { let c = null; for (const [cue, txt] of COPY) { const f = ctx.cue(cue); if (t >= f - 0.26) c = { f, txt }; } if (c) { const nxt = stages.find((s) => s.hit > c.f && s.hit - 0.26 <= t); if (nxt && !COPY.some(([q]) => ctx.cue(q) === nxt.hit)) return null; } return c; };
  const rectOf = (st, c, r, Z) => { const x0 = c / st.cols, y0 = r / st.rows, w = 1 / st.cols, h = 1 / st.rows; return [0.5 + (x0 - 0.5) * Z, 0.5 + (y0 - 0.5) * Z, w * Z, h * Z]; };

  return {
    id: 'act5', start: START, end: END,
    samples(f) { let k = 1; for (const st of stages) if (f >= st.hit - 0.5 && f <= st.hit + 6) k = Math.max(k, 4); if (f >= UNI - 12 && f <= UNI + 4) k = 5; if (f >= TEN) k = Math.max(k, 3); return k; },
    update(t) {
      const env = ctx.env;
      kits.world.preset(env, 'city');
      env.sun = { az: -52, el: 29, intensity: 1.75, dir: null };
      env.ambient = { up: 0.46, down: 0.28, bounce: 0 };
      env.fog = { density: 0.00012, height: 450, floorY: 0, air: 0.00001 };
      env.ground = { albedo: [0.47, 0, 0] };
      env.shadow = { on: false, center: [0, 60, -200], radius: 700, size: 1024, bias: 0.0006, normalBias: 1.0 };
      const st = stageAt(t), Z = zoomAt(t), dt = Math.max(0, t - st.hit), sh = addShake(shake(t, events, { rollScale: 0.3 }), rumble(t, TEN, END + 1, 0.05, 1.6, { freq: 0.9, seed: 4 }));
      const tenE = EASE.inCubic(clamp((t - TEN) / (END + 1 - TEN)));
      const views = [];
      for (const p of st.panels) {
        const g = p.b.def.cam, hold = Math.max(1, (st.si < 5 ? stages[st.si + 1].hit : UNI) - st.hit), e = EASE.inOutSine(clamp(dt / 60)) * (st.si === 5 ? 0.6 : 1);
        const push = 1 + tenE * 3.2;
        p.cam.set({ pos: [g.pos[0] + g.push[0] * e * push, g.pos[1] + g.push[1] * e * push, g.pos[2] + g.push[2] * e * push], look: [g.look[0] + g.push[0] * e * 0.5, g.look[1] - 0.06 * 2 * 600 * Math.tan(p.fovV * Math.PI / 360) - tenE * 25, g.look[2]], fov: p.fovV, near: 2, far: 60000 });
        p.cam.shake = sh;
        const rc = rectOf(st, p.c, p.r, Z);
        if (rc[0] > 1 || rc[1] > 1 || rc[0] + rc[2] < 0 || rc[1] + rc[3] < 0) continue;
        // name rises out of the ground with the eruption
        const hit = st.hit + 6, ne = t < hit ? EASE.inCubic(clamp((t - (hit - 6)) / 6)) : 1 + 0.04 * Math.exp(-(t - hit) / 1.7) * Math.sin((t - hit) * 1.6);
        p.N.mesh.position.y = p.N.yc - (p.planeH + p.N.yb + 40) * (1 - ne);
        views.push({ rect: rc, cam: p.cam, only: [p.b.group, ground], env: { shadow: { on: false } } });
      }
      ctx.views = views;
    },
    overlay(t0, g) {
      const t = Math.round(t0);
      const st = stageAt(t), Z = zoomAt(t), dt = Math.max(0, t - st.hit);
      const gw = gutW[st.si] * Z * clamp(dt / 2 + 0.5, 0, 1);
      g.fillStyle = '#fff';
      for (let c = 1; c < st.cols; c++) { const x = (0.5 + (c / st.cols - 0.5) * Z) * 1920; g.fillRect(x - gw / 2, 0, gw, 1080); }
      for (let r = 1; r < st.rows; r++) { const y = (0.5 + (r / st.rows - 0.5) * Z) * 1080; g.fillRect(0, y - gw / 2, 1920, gw); }
      const cp = copyAt(t);
      if (cp) {
        const d = Math.max(0, t - cp.f), open = EASE.snap(clamp(d / 3)), size = cp.txt.length > 14 ? 150 : cp.txt.length > 10 ? 200 : 250, bh = size * 1.42 * open, cy = st.n === 2 ? 820 : st.n === 4 ? 470 : 540;
        g.fillStyle = '#E80101'; g.fillRect(0, cy - bh / 2, 1920, bh);
        g.fillStyle = '#fff'; g.fillRect(0, cy - bh / 2 - 3, 1920, 6); g.fillRect(0, cy + bh / 2 - 3, 1920, 6);
        g.save(); T.clipRect(g, 0, cy - bh / 2 + 3, 1920, bh - 6);
        const sc = 1 + 0.32 * (1 - EASE.snap(clamp(d / 4))), rise = (1 - EASE.snap(clamp(d / 4))) * size * 0.5;
        g.translate(960, cy + size * 0.36 + rise); g.scale(sc, sc);
        T.draw(g, cp.txt, { x: 0, y: 0, size, weight: 900, stretch: 112.5, track: -0.035, align: 'center', fill: '#fff', maxWidth: 1760 });
        g.restore();
      }
      return true;
    },
  };
}
