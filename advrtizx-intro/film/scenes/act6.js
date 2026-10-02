/* ACT VI · THE WORLD (f896-1151) · owner: Act VI agent
   One continuous world skyline, rows deep into the red, every tower crowned with a logo shape. The camera trucks fast, towers erupt in
   waves ahead of it and lock on 8ths, and twelve giant SOLD boards (one per language) are STAMPED into the world exactly on their frames.
   f1048-1087 the SOLD storm (a board on every 16th), f1088-1151 the camera begins to rise while the towers keep erupting.
   Everything is a pure function of t: seeded placement, closed-form camera, GPU tower animation. Helpers live in lib_s3.js. */
import { Board, boardAspect, frameOf, project, unproject, rayAt, makeFaceTexture, slamState, makeRows, alleyZ, genSkyline, DEG } from './lib_s3.js';

export default function act6(ctx) {
  const { kits, util } = ctx;
  // tunables (window.__A6 may override them in dev renders)
  const P = Object.assign({ d0: 700, fov: 24, y0: 90, pitch0: 5.5, fogD: 0.0002, fogH: 220, fogAir: 0.0003, sun: 1.9, shadowSize: 1024, shadowOn: 1, ang0: 3.2, ang1: 5.5, wBase: 12, wPer: 0.022, lodNear: 1, lodMid: 2 }, (typeof window !== 'undefined' && window.__A6) || {});
  const { TowerSet } = kits.towers;
  const { EASE, track, clamp, lerp, shake, rumble, addShake, prog, smoothstep, makeRng, hash01 } = util;

  /* ───────────── cues ───────────── */
  const U0 = ctx.cue('act6'), END = ctx.cue('act7') - 1;                       // 896 .. 1151
  const SOLD = ctx.cues('a6.sold').map((c) => c.frame);                         // 12 board frames
  const STORM0 = ctx.cue('a6.storm'), RISE0 = ctx.cue('a6.rise');               // 1048, 1088
  const STORM = []; for (let f = STORM0; f < RISE0; f += 4) STORM.push(f);      // 10 sixteenths

  /* ───────────── the twelve boards ───────────── */
  const LANGS = [
    { id: 'en', text: 'SOLD', lang: 'latin', stretch: 125, track: -0.012 },
    { id: 'ar', text: 'مُباع', lang: 'arabic' },
    { id: 'zh', text: '已售', lang: 'zh', track: 0.06 },
    { id: 'hi', text: 'बिक गया', lang: 'devanagari' },
    { id: 'es', text: 'VENDIDO', lang: 'latin', stretch: 118, track: -0.01 },
    { id: 'fr', text: 'VENDU', lang: 'latin', stretch: 125, track: -0.01 },
    { id: 'de', text: 'VERKAUFT', lang: 'latin', stretch: 112, track: -0.01 },
    { id: 'ja', text: '成約済', lang: 'ja', track: 0.05 },
    { id: 'ko', text: '계약완료', lang: 'ko', track: 0.03 },
    { id: 'ru', text: 'ПРОДАНО', lang: 'cyrillic', track: -0.01 },
    { id: 'tr', text: 'SATILDI', lang: 'latin', stretch: 118, track: -0.01 },
    { id: 'th', text: 'ขายแล้ว', lang: 'thai' },
  ];
  for (const L of LANGS) L.face = makeFaceTexture(kits.type, L.text, { lang: L.lang, stretch: L.stretch, track: L.track });

  /* ───────────── camera: a fast lateral truck, braking into the storm, then a rise ───────────── */
  const Y0 = P.y0, FOV0 = P.fov;
  const speed = track([[0, 15.5], [40, 14.2], [96, 11.0, 'inOutSine'], [132, 5.5, 'inOutSine'], [150, 1.5, 'inOutSine'], [190, 1.0], [256, 4.2, 'inOutSine']]);
  const kick = (u) => { let k = 0; for (const f of SOLD) { const d = u - (f - U0); if (d >= 0) k += 0.26 * Math.exp(-d / 4.5); } return k; };
  const UMIN = -8, UMAX = 262, STEP = 0.125;
  const xs = new Float64Array(Math.round((UMAX - UMIN) / STEP) + 2);
  { let acc = 0; for (let i = 0; i < xs.length; i++) { const u = UMIN + i * STEP; xs[i] = acc; acc += speed(u) * (1 + kick(u)) * STEP; } const x0 = xs[Math.round(-UMIN / STEP)]; for (let i = 0; i < xs.length; i++) xs[i] -= x0; }
  const camX = (u) => { const f = (clamp(u, UMIN, UMAX - 0.02) - UMIN) / STEP, i = Math.floor(f); return lerp(xs[i], xs[i + 1], f - i); };
  const yawT = track([[0, 12.5], [140, 9.5, 'inOutSine'], [256, 5.5, 'inOutSine']]);
  const poseAt = (t) => {
    const u = t - U0, ur = clamp((u - (RISE0 - U0)) / (END + 1 - RISE0));
    const rise = EASE.inCubic(ur), tilt = EASE.inOutSine(ur);
    const y = Y0 + 250 * rise, pitch = lerp(P.pitch0, -1.0, tilt) * DEG, yaw = yawT(u) * DEG, fov = lerp(FOV0, 30, tilt);
    const pos = [camX(u), y, 0];
    const look = [pos[0] + Math.sin(yaw) * Math.cos(pitch) * 1000, y + Math.sin(pitch) * 1000, -Math.cos(yaw) * Math.cos(pitch) * 1000];
    return { pos, look, fov };
  };
  const frameAt = (t) => { const s = poseAt(t); return frameOf(s.pos, s.look, s.fov); };
  const FRAMES = []; for (let f = U0 - 1; f <= END + 2; f++) FRAMES[f] = frameAt(f);

  /* ───────────── world rows and board placement ───────────── */
  const rows = makeRows(P.d0, 5000);
  const placeBoard = (L, { Z, sx, sy, H: Hm, hf }, faceAspect) => {
    const fr = frameAt(L), ray = rayAt(fr, sx, sy), zWant = fr.pos[2] + ray[2] * Z;
    let best = 0, bd = 1e9; for (let k = 0; k < rows.length - 1; k++) { const dz = Math.abs(alleyZ(rows, k) - zWant); if (dz < bd) { bd = dz; best = k; } }
    const zA = alleyZ(rows, best), lam = (zA - fr.pos[2]) / ray[2];
    const P = [fr.pos[0] + ray[0] * lam, fr.pos[1] + ray[1] * lam, zA];
    const H = Hm ?? hf * 2 * lam * fr.th;
    return { P, H, depth: lam, alley: best, W: boardAspect(faceAspect) * H };
  };

  // primary boards: each is stamped to the RIGHT of centre (the camera trucks right, so older boards slide away left behind it),
  // alternating two tiers, every new board nearer than the last so it always lands in front
  const PRIMARY = [
    { Z: 1250, sx: 0.14, sy: 0.40, hf: 0.42 }, { Z: 1170, sx: 0.44, sy: 0.22, hf: 0.44 }, { Z: 1090, sx: 0.40, sy: 0.46, hf: 0.44 },
    { Z: 1020, sx: 0.46, sy: 0.24, hf: 0.44 }, { Z: 960, sx: 0.42, sy: 0.46, hf: 0.44 }, { Z: 905, sx: 0.48, sy: 0.26, hf: 0.44 },
    { Z: 860, sx: 0.42, sy: 0.46, hf: 0.44 }, { Z: 820, sx: 0.48, sy: 0.28, hf: 0.44 },
    { Z: 900, sx: -0.30, sy: 0.44, hf: 0.38 }, { Z: 850, sx: 0.34, sy: 0.24, hf: 0.40 }, { Z: 800, sx: 0.62, sy: 0.46, hf: 0.34 }, { Z: 770, sx: 0.00, sy: 0.30, hf: 0.40 },
  ];
  // storm: a stepped pyramid of all twelve signs, justified rows with even gutters. The stamps trace an arch up the left, across the top and
  // down the right, following the pitch of the score (A5 C#6 E6 G6 A6 G6 E6 C#6 A5 C#6): top row = the highest notes.
  const hitOf = (i) => (i < 2 ? 0 : i > 9 ? 9 : i - 1);
  const PYR = [{ ids: [4, 5, 6], Z: 820 }, { ids: [2, 3, 7, 8], Z: 1000 }, { ids: [0, 1, 9, 10, 11], Z: 1250 }];
  const STORMP = []; {
    const FWH = 16 / 9, gut = 0.028, x0 = 0.12, x1 = FWH - 0.12; let y = 0.045;
    for (const row of PYR) {
      const asp = row.ids.map((i) => boardAspect(LANGS[i].face.aspect)), sumA = asp.reduce((a, c) => a + c, 0);
      const h = (x1 - x0 - gut * (row.ids.length - 1)) / sumA; let x = x0;
      row.ids.forEach((i, j) => { STORMP[i] = { Z: row.Z, sx: ((x + asp[j] * h / 2) / FWH) * 2 - 1, sy: 1 - 2 * (y + h / 2), hf: h }; x += asp[j] * h + gut; });
      y += h + gut;
    }
  }

  // storm hero stage: every sign is first stamped BIG in the clear space in front of the skyline, on an arch that follows the score, then pushed
  // back into its slot of the pyramid
  const CONTOUR = [0, 0.33, 0.58, 0.83, 1, 0.83, 0.58, 0.33, 0, 0.33];
  const HERO = LANGS.map((_, i) => { const h = hitOf(i), pair = i < 2 ? (i ? 0.22 : -0.22) : i > 9 ? (i === 10 ? -0.22 : 0.22) : 0;
    return { Z: 540, sx: -0.58 + 1.16 * (h / 9) + pair * 1.1, sy: 0.04 + 0.42 * CONTOUR[h], hf: 0.30 }; });

  const boards = [];   // {board, L, P, H, W, tEnd, kind}
  const addBoard = (li, L, plan, kind, tEnd) => {
    const lg = LANGS[li], pl = placeBoard(L, plan, lg.face.aspect);
    const b = new Board({ tex: lg.face.tex, faceAspect: lg.face.aspect, H: pl.H, yc: pl.P[1], fogAmt: 0.5, name: `sold.${lg.id}.${kind}` });
    ctx.root.add(b.group);
    const rec = { board: b, L, P: pl.P, H: pl.H, W: pl.W, alley: pl.alley, tEnd, kind, li, hf: plan.hf };
    if (kind === 's') { const fr = frameAt(L), hp = HERO[li]; rec.HP = unproject(fr, hp.sx, hp.sy, hp.Z); rec.s0 = (hp.hf * 2 * hp.Z * fr.th) / pl.H; }
    boards.push(rec);
    return pl;
  };
  PRIMARY.forEach((p, i) => addBoard(i, SOLD[i], p, 'p', STORM0 - 0.01));
  STORMP.forEach((p, i) => addBoard(i, STORM[hitOf(i)], p, 's', 1e9));

  /* ───────────── the skyline ───────────── */
  const rng = makeRng('act6.world');
  const Xend = camX(END - U0 + 2);
  const exclude = boards.map((b) => ({ x0: b.P[0] - b.W / 2 - 14, x1: b.P[0] + b.W / 2 + 14, z0: b.P[2] - 0.13 * b.H - 6, z1: b.P[2] + 0.06 * b.H + 6 }));
  const towers = genSkyline({ rng, util, rows, xMin: (d) => -0.34 * d - 200, xMax: (d) => Xend + 0.86 * d + 200, camY: Y0, crownSize: kits.logo.crownSize, exclude, ang0: P.ang0, ang1: P.ang1, wBase: P.wBase, wPer: P.wPer });
  const sxAt = (tw, t) => project(FRAMES[t], [tw.x, 0, tw.z]);
  towers.forEach((tw, i) => { tw.id = i; tw.t0 = -1e6; tw.dur = 12; tw.land = null; tw.ease = 'slam'; });

  // (0) composition at each stamp: towers standing IN FRONT of a board are lowered so they only bite its bottom edge; a few of them
  //     instead rise a beat AFTER the stamp (sold first, built next) and partly cover the board's lower corners.
  boards.forEach((b, bi) => {
    const fr = FRAMES[b.L], th = fr.th, asp = fr.aspect;
    const cs = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, c]) => project(fr, [b.P[0] + a * b.W / 2, b.P[1] + c * b.H / 2, b.P[2]]));
    const sxL = Math.min(...cs.map((c) => c[0])), sxR = Math.max(...cs.map((c) => c[0])), syB = Math.min(...cs.map((c) => c[1])), syT = Math.max(...cs.map((c) => c[1])), db = cs[0][2];
    const hits = [];
    for (const tw of towers) {
      if (tw.t0 > -1e5 && tw.land == null) continue;
      const [sx, , dep] = project(fr, [tw.x, 0, tw.z]);
      if (dep <= 0 || dep > db - 20) continue;
      const ws = (tw.w / 2) / (dep * th * asp);
      if (sx + ws < sxL || sx - ws > sxR) continue;
      const u = Math.abs(((sx - (sxL + sxR) / 2) / ((sxR - sxL) / 2)) || 0), rnd = hash01(tw.id, 40 + bi);
      // proscenium: low in front of the lettering, rising toward the board's two ends (bites the bottom corners)
      const frac = (b.kind === 'p' ? 0.02 + 0.52 * Math.pow(Math.min(1, Math.max(0, (u - 0.45) / 0.55)), 1.5) : 0.08 + 0.50 * Math.pow(Math.min(1, u), 1.2)) * (0.55 + 0.45 * rnd);
      const yCap = unproject(fr, sx, syB + frac * (syT - syB), dep)[1], yTop = tw.h + tw.crownH;
      if (yTop > yCap + 1) hits.push({ tw, yCap, over: yTop - yCap });
    }
    hits.sort((a, c) => c.over - a.over);
    let risers = 0;
    for (const { tw, yCap } of hits) {
      if (b.kind === 'p' && risers < 4 && !tw.cluster && hash01(tw.id, 77 + bi) < 0.7) {
        const frac2 = 0.16 + 0.22 * hash01(tw.id, 90 + bi), y2 = unproject(fr, project(fr, [tw.x, 0, tw.z])[0], syB + frac2 * (syT - syB), project(fr, [tw.x, 0, tw.z])[2])[1];
        const land = b.L + (risers < 2 ? 8 : 16), dur = risers < 2 ? 6 : 8 + Math.floor(hash01(tw.id, 12) * 4);
        tw.h = Math.max(30, Math.min(tw.h, y2 - tw.crownH)); tw.cluster = true; tw.land = land; tw.dur = dur; tw.t0 = land - dur; risers++;
      } else tw.h = Math.max(28, Math.min(tw.h, yCap - tw.crownH));
    }
  });

  // (1) front eruptions: towers beyond the right edge at the cut rise as the camera arrives and lock on an 8th
  for (const tw of towers) {
    const s0 = sxAt(tw, U0)[0];
    if (s0 <= 1.06) continue;
    const sL = 0.55 + 0.65 * hash01(tw.id, 3);
    let tc = -1; for (let t = U0; t <= END + 1; t++) { if (sxAt(tw, t)[0] <= sL) { tc = t; break; } }
    if (tc < 0) continue;
    const land = U0 + 8 * Math.ceil((tc - U0) / 8), dur = 9 + Math.floor(hash01(tw.id, 5) * 5);
    tw.land = land; tw.t0 = land - dur; tw.dur = dur; tw.front = true;
  }
  // (2) infill: tall spires pierce the skyline on every 8th (denser toward the end: tension)
  const events = []; for (let t = U0 + 8; t < RISE0; t += 8) events.push(t);
  for (let t = RISE0; t < RISE0 + 32; t += 4) events.push(t);
  for (let t = RISE0 + 32; t <= END; t += 2) events.push(t);
  const pool = towers.filter((tw) => !tw.front && !tw.cluster);
  const erng = makeRng('act6.infill');
  for (const T of events) {
    const n = T < RISE0 ? 3 + Math.floor((T - U0) / 40) : T < RISE0 + 32 ? 3 : 2;
    for (let j = 0; j < n; j++) {
      for (let tries = 0; tries < 40; tries++) {
        const tw = pool[Math.floor(erng() * pool.length)];
        if (tw.infill || tw.depth < 480 && erng() < 0.5) continue;
        const [sx, , dep] = sxAt(tw, T);
        if (sx < -0.5 || sx > 0.92 || dep < 420 || dep > 6200) continue;
        const dur = 9 + Math.floor(erng() * 5);
        tw.infill = true; tw.land = T; tw.dur = dur; tw.t0 = T - dur; tw.h *= 1.30 + 0.70 * erng();
        break;
      }
    }
  }

  /* ───────────── three LOD sets, nearest first (early-z) ───────────── */
  const sets = [];
  const mkSet = (name, lod, shadow, filt) => {
    const ts = new TowerSet({ lod, shadow, name });
    for (const tw of towers.filter(filt).sort((a, b) => a.depth - b.depth)) ts.add({ x: tw.x, z: tw.z, w: tw.w, d: tw.d, h: tw.h, crown: tw.crown, crownScale: tw.crownScale, pitch: tw.pitch, t0: tw.t0, dur: tw.dur, land: tw.land ?? undefined, ease: tw.ease, mode: 'slide' });
    ts.build(); ctx.root.add(ts.group); sets.push(ts); return ts;
  };
  mkSet('near', P.lodNear, true, (t) => t.depth < 1150);
  mkSet('mid', P.lodMid, true, (t) => t.depth >= 1150 && t.depth < 3300);
  mkSet('far', 2, false, (t) => t.depth >= 3300);
  const ground = kits.world.makeGround(); ctx.root.add(ground);

  /* ───────────── shake ───────────── */
  const impacts = [];
  SOLD.forEach((f, i) => impacts.push({ f, amp: i === 0 ? 1.5 : 1.1 - 0.02 * i, decay: 3.2, freq: 0.55, seed: i }));
  STORM.forEach((f, i) => impacts.push({ f, amp: 0.85, decay: 2.2, freq: 0.7, seed: 20 + i }));
  for (let f = U0 + 8; f < RISE0; f += 8) if (!SOLD.includes(f)) impacts.push({ f, amp: 0.22, decay: 2.0, freq: 0.8, seed: 40 + (f - U0) / 8 });
  const LAND = SOLD.concat(STORM), HOLD = 2.5, GLIDE = 9;

  /* ───────────── scene ───────────── */
  const sunV = (az, el) => [Math.sin(az * DEG) * Math.cos(el * DEG), Math.sin(el * DEG), Math.cos(az * DEG) * Math.cos(el * DEG)];
  return {
    id: 'act6', start: U0, end: END,
    samples(t) {
      for (const L of LAND) if (t > L - 5.3 && t < L + 3.2) return 6;
      return t < 1040 ? 4 : t < RISE0 ? 2 : 3;
    },
    update(t) {
      const env = ctx.env, cam = ctx.cam, st = poseAt(t);
      kits.world.preset(env, 'world');
      env.sun = { az: -38, el: 34, intensity: P.sun, dir: null };
      env.ambient = { up: 0.78, down: 0.50, bounce: 0 };
      env.fog = { density: P.fogD, height: P.fogH, floorY: 0, air: P.fogAir };
      env.ground = { albedo: [0.5, 0, 0] };
      env.post = { grain: 1.0, vignette: 0.42 };
      // key-light shadow volume follows the camera; the centre is snapped to the shadow-map texel grid so edges never crawl
      { const R = 700, size = P.shadowSize, tex = (2 * R) / size, d = sunV(-38, 34);
        const l = Math.hypot(d[0], d[2]), xa = [d[2] / l, 0, -d[0] / l], ya = [-d[1] * d[0] / l, l, -d[1] * d[2] / l];      // light-space axes (as engine lookAt)
        const c = [st.pos[0] + 380, 140, -720];
        const px = c[0] * xa[0] + c[1] * xa[1] + c[2] * xa[2], py = c[0] * ya[0] + c[1] * ya[1] + c[2] * ya[2];
        const dx = Math.floor(px / tex) * tex - px, dy = Math.floor(py / tex) * tex - py;
        env.shadow = { on: !!P.shadowOn, center: [c[0] + dx * xa[0] + dy * ya[0], c[1] + dx * xa[1] + dy * ya[1], c[2] + dx * xa[2] + dy * ya[2]], radius: R, size, bias: 0.0005, normalBias: 1.3 }; }
      // shock rings from the most recent stamps
      const rings = [];
      for (let i = boards.length - 1; i >= 0 && rings.length < 4; i--) { const b = boards[i], dt = t - b.L; if (dt >= 0 && dt < 18) rings.push({ x: b.P[0], z: b.P[2], r: 30 + dt * 85, w: 10, tail: 90, k: 0.55 * (1 - dt / 18) }); }
      env.rings = rings;

      cam.set({ pos: st.pos, look: st.look, fov: st.fov, near: 3, far: 60000 });
      cam.shake = addShake(shake(t, impacts, { rollScale: 0.35 }), rumble(t, RISE0, END + 0.9, 0.08, 1.3, { freq: 0.9, seed: 5 }));

      // boards: stamped from the lens into the world; storm signs are then pushed back into the pyramid
      for (const b of boards) {
        const C = st.pos, tau = t - b.L;
        if (t >= b.tEnd) { b.board.set(false); continue; }
        if (b.kind === 'p') {
          const s = slamState(t, b.L); if (!s) { b.board.set(false); continue; }
          const q = s.q, P = b.P;
          b.board.set(true, [C[0] + (P[0] - C[0]) * q, C[1] + (P[1] - C[1]) * q + s.drop * b.H, C[2] + (P[2] - C[2]) * q], 1, s.roll, 0);
        } else {
          const s = slamState(t, b.L, { A: 2.4, q0: 0.82, drop: 0.0, roll0: 1.0 }); if (!s) { b.board.set(false); continue; }
          const HP = b.HP, P = b.P;
          if (tau <= HOLD) { const q = s.q; b.board.set(true, [C[0] + (HP[0] - C[0]) * q, C[1] + (HP[1] - C[1]) * q, C[2] + (HP[2] - C[2]) * q], b.s0, s.roll, tau >= 0 && tau < 1 ? 1 : 0); }
          else {
            const g = clamp((tau - HOLD) / GLIDE), e = 1 - Math.pow(1 - g, 3.2), k = s.q;      // fast push-back, long settle
            b.board.set(true, [lerp(HP[0], P[0], e), lerp(HP[1], P[1], e), lerp(HP[2], P[2], e)], lerp(b.s0, 1, e), s.roll, 0);
          }
        }
      }
    },
  };
}
