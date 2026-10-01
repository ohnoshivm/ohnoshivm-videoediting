/* DOMINANT · kits/city.js
   Skylines. A seeded generator plus signature presets for the 10 cities of ACT IV (+ the Dubai of ACT III), a wave scheduler
   (rings / sweep / random / instant) that sets per-tower rise + crown-landing frames, and build() which turns a preset into a
   THREE.Group (TowerSet + water) you add to ctx.root.

   CONVENTIONS: camera looks toward -z; +x is screen-right; the city is centred on its origin; y up, metres. Every tower is crowned
   with one of the monogram's shapes. Everything is deterministic from `seed`.

     const c = kits.city.build('london', { seed: 'london', t0: 384, step: 8, hero: null });
     ctx.root.add(c.group);               // c.group.position / rotation.y / scale are honoured (offset a city along a strip)
     c.landings()                         // [{f, x, z, h}] crown touch-down frames (world coords)
     c.signature.shard                    // {x, z, h} named hero elements (camera targets)
     c.nameAnchor                         // [x, y, z]: a good spot for the city-name type, behind the skyline in the fog
   Presets: dubai london newyork singapore mumbai miami sydney riyadh hongkong tokyo  (+ 'generic'). */
import * as THREE from 'three';
import { TowerSet } from './towers.js';
import { makeWater, makeRiver, makeBay, makeWaterMesh } from './world.js';
import { crownSize, extrude, profile } from './logo.js';
import { makeRng, lerp, clamp, hashStr } from '../engine/util.js';

/** Crown mix used by the generator (weights). Every tower is crowned. */
export const CROWN_MIX = { A: 0.30, Am: 0.12, Dd: 0.28, Ds: 0.12, Dsm: 0.08, S: 0.0 };
function pickCrown(rng, mix) {
  const ents = Object.entries(mix); let tot = 0; for (const [, w] of ents) tot += w;
  let r = rng() * tot; for (const [k, w] of ents) { if ((r -= w) <= 0) return k; } return 'A';
}
const rect = (cx, cz, w, d) => ({ x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2 });
const inRect = (r, x, z, m = 0) => x > r.x0 - m && x < r.x1 + m && z > r.z0 - m && z < r.z1 + m;
const tw = (x, z, h, o = {}) => ({ x, z, w: 36, d: 36, h, crown: 'A', ...o });

/* ───────────────────────────── generator ───────────────────────────── */

/** Seeded skyline filler on a jittered grid. Returns an array of tower specs (no timing yet; see schedule()).
    opts: {seed, region:{x0,x1,z0,z1}, cell (m), p (fill probability), jitter, hmin, hmax, hfun(x,z,rng)->h, keepOut:[rect|fn(x,z)->bool],
           w:[min,max], aspect:[min,max] (d/w), crowns (weights), center:[x,z], centerBias (0..1: taller toward the centre), accept(x,z)->bool} */
export function generate(opts = {}) {
  const rng = opts.rng || makeRng(opts.seed ?? 'city');
  const R = opts.region || { x0: -500, x1: 500, z0: -500, z1: 100 };
  const cell = opts.cell ?? 64, jit = opts.jitter ?? 0.3, p = opts.p ?? 0.82, hmin = opts.hmin ?? 70, hmax = opts.hmax ?? 240;
  const cx = opts.center ? opts.center[0] : (R.x0 + R.x1) / 2, cz = opts.center ? opts.center[1] : (R.z0 + R.z1) / 2;
  const maxD = Math.hypot(Math.max(Math.abs(R.x0 - cx), Math.abs(R.x1 - cx)), Math.max(Math.abs(R.z0 - cz), Math.abs(R.z1 - cz))) || 1;
  const cb = opts.centerBias ?? 0.65, wr = opts.w || [24, 42], ar = opts.aspect || [0.75, 1.1], mix = opts.crowns || CROWN_MIX;
  const out = [];
  for (let gx = R.x0 + cell / 2; gx < R.x1; gx += cell) for (let gz = R.z0 + cell / 2; gz < R.z1; gz += cell) {
    if (rng() > p) continue;
    const x = gx + (rng() - 0.5) * cell * jit, z = gz + (rng() - 0.5) * cell * jit;
    if (opts.keepOut && opts.keepOut.some((k) => (typeof k === 'function' ? k(x, z) : inRect(k, x, z)))) continue;
    if (opts.accept && !opts.accept(x, z)) continue;
    const t = 1 - clamp(Math.hypot(x - cx, z - cz) / maxD);
    const h = opts.hfun ? opts.hfun(x, z, rng) : lerp(hmin, hmax, clamp(Math.pow(t, 1.25) * cb + rng() * (1 - cb)));
    const w = clamp(rng.range(wr[0], wr[1]), 16, cell * 0.66), d = clamp(w * rng.range(ar[0], ar[1]), 16, cell * 0.66);
    out.push({ x, z, w, d, h, crown: pickCrown(rng, mix), pitch: 4.2 });
  }
  return out;
}

/* ───────────────────────────── scheduling ───────────────────────────── */

/** Assigns t0/dur/land/drop to specs (mutates, returns specs). Crown LANDING frames are integers on the grid you choose.
    opts: {mode:'rings'|'sweep'|'random'|'instant', center:[x,z], t0 (landing frame of ring 0), step (frames between rings, default 8),
           ringW (m per ring, rings mode), dir:[dx,dz] (sweep mode), span (frames, random mode), rise:[min,max] frames the shaft takes,
           drop:[min,max] metres the crown falls, dropDur (frames), jitter (extra random 0..n frames), seed, ease} */
export function schedule(specs, opts = {}) {
  const rng = makeRng(opts.seed ?? 'sched'), mode = opts.mode || 'rings', t0 = opts.t0 ?? 0, step = opts.step ?? 8, ringW = opts.ringW ?? 110;
  const [r0, r1] = opts.rise || [9, 15], [d0, d1] = opts.drop || [90, 150], dropDur = opts.dropDur ?? 4, jit = opts.jitter ?? 0;
  const c = opts.center || [0, 0], dir = opts.dir || [1, 0];
  const dl = Math.hypot(dir[0], dir[1]) || 1, ux = dir[0] / dl, uz = dir[1] / dl;
  let pmin = 1e9; if (mode === 'sweep') for (const s of specs) pmin = Math.min(pmin, s.x * ux + s.z * uz);
  for (const s of specs) {
    let idx = 0;
    if (mode === 'rings') idx = Math.floor(Math.hypot(s.x - c[0], s.z - c[1]) / ringW);
    else if (mode === 'sweep') idx = Math.floor((s.x * ux + s.z * uz - pmin) / ringW);
    else if (mode === 'random') idx = Math.floor(rng() * ((opts.span ?? 48) / step));
    const land = Math.round(t0 + idx * step + (jit ? rng.int(0, jit) : 0));
    const dur = rng.int(r0, r1);
    s.dur = dur; s.ease = opts.ease || s.ease || 'slam'; s.mode = s.mode || 'slide';
    if (s.crown) { s.dropDur = dropDur; s.drop = rng.range(d0, d1); s.land = land; s.t0 = land - dropDur - dur - (opts.lead ?? 0); }
    else { s.drop = 0; s.land = land; s.t0 = land - dur; }
  }
  return specs;
}

/* ───────────────────────────── custom prisms ───────────────────────────── */

/** Bridge: a slab (length L, height H, y from 0) with D-shaped arch openings (the exact D profile, dome up) cut into its underside.
    Returns geometry (metres, z thickness 1) for TowerSet.addPrism. */
function bridgeGeometry(L, H, archW, archCount, gap = 0.35) {
  const D = profile('Dd'), s = archW / D.width, pts = D.pts.map(([x, y]) => [x * s, y * s]);
  // bottom-left / bottom-right vertices of the dome profile
  let ibl = 0, ibr = 0; pts.forEach(([x, y], i) => { if (y < 1e-6) { if (x < pts[ibl][0] || pts[ibl][1] > 1e-6) ibl = i; if (x > pts[ibr][0] || pts[ibr][1] > 1e-6) ibr = i; } });
  const n = pts.length, seq = []; for (let k = 0, i = ibr; k < n; k++, i = (i + 1) % n) { seq.push(pts[i]); if (i === ibl) break; }   // CCW from bottom-right around the top to bottom-left
  const up = seq.slice().reverse();                                                                                   // bottom-left -> over the top -> bottom-right
  const total = archCount * archW + (archCount - 1) * archW * gap, x0 = -total / 2, outline = [[-L / 2, 0]];
  for (let a = 0; a < archCount; a++) { const ox = x0 + a * archW * (1 + gap) + archW / 2; for (const [x, y] of up) outline.push([ox + x, y]); }
  outline.push([L / 2, 0], [L / 2, H], [-L / 2, H]);
  return extrude(outline, { smoothDeg: 40 });
}
/** A rectangle with one hole shaped like the A rotated 180 degrees (an inverted-A void). w,h in metres. */
function voidGeometry(w, h, holeW) {
  const A = profile('A'), s = holeW / A.width, inv = A.pts.map(([x, y]) => [-x * s, A.height * s - y * s]);       // 180 deg about the bbox centre
  const hx = 0, hy = (h - A.height * s) / 2 - 0 ;
  const hole = inv.map(([x, y]) => [x + hx, y + hy]);
  return extrude([[-w / 2, 0], [w / 2, 0], [w / 2, h], [-w / 2, h]], { holes: [hole], smoothDeg: 40 });
}

/* ───────────────────────────── presets ───────────────────────────── */

const SEA = (x0, x1, z0, z1) => ({ kind: 'rect', x0, x1, z0, z1 });

/** Each preset returns {specs, prisms:[{geometry, spec}], water:[mesh descriptors], signature, nameAnchor, center, extent, defaults}. */
export const presets = {
  /** DUBAI: dense avenue-cluster around the hero supertall, a sea on the right, a D "sail" on an island, slender A towers behind. */
  dubai(o, rng) {
    const hero = o.hero, specs = [], keep = [{ x0: -1600, x1: 1600, z0: -30, z1: 30 }, SEA(470, 3000, -2000, 600)];
    if (hero) keep.push(rect(hero.x, hero.z, hero.w + 70, hero.d + 70));
    specs.push(...generate({ rng, region: { x0: -820, x1: 470, z0: -560, z1: 220 }, cell: 66, p: 0.88, hmin: 90, hmax: 330, centerBias: 0.78, center: hero ? [hero.x, hero.z] : [0, 0], keepOut: keep, w: [24, 42] }));
    specs.push(...generate({ rng, region: { x0: -1000, x1: 460, z0: -1050, z1: -560 }, cell: 86, p: 0.72, hmin: 150, hmax: 420, centerBias: 0.3, keepOut: keep, w: [28, 50], crowns: { A: 0.5, Am: 0.12, Dd: 0.2, Ds: 0.1, Dsm: 0.08 } }));
    specs.push(...generate({ rng, region: { x0: -700, x1: 460, z0: 230, z1: 520 }, cell: 80, p: 0.5, hmin: 50, hmax: 120, keepOut: keep }));
    // the island and the D sail
    specs.push({ x: 700, z: -40, w: 360, d: 210, h: 3, crown: null });
    specs.push({ x: 700, z: -40, w: 250, d: 34, h: 0.6, crown: 'Ds', crownScale: 1, pitch: 6, ease: 'back' });
    return { specs, prisms: [], water: [SEA(470, 3200, -2200, 700)], signature: { sail: { x: 700, z: -40, h: 265 } }, nameAnchor: [0, 190, -1250], center: [0, -200], extent: 1400,
      defaults: { mode: 'rings', center: hero ? [hero.x, hero.z] : [0, 0], step: 8, ringW: 105 } };
  },

  /** LONDON: a bending river, a tall A "shard", a D dome, mid-rise banks. */
  london(o, rng) {
    const rz = (x) => -70 + 120 * Math.sin(x / 430), specs = [], R = 105;
    const pts = []; for (let x = -2200; x <= 2200; x += 70) pts.push([x, rz(x)]);
    const keep = [(x, z) => Math.abs(z - rz(x)) < R, rect(-170, rz(-170) - 205, 130, 130), rect(235, rz(235) - 175, 190, 190)];
    specs.push(...generate({ rng, region: { x0: -900, x1: 900, z0: -700, z1: 260 }, cell: 62, p: 0.86, hmin: 55, hmax: 240, centerBias: 0.55, keepOut: keep, w: [24, 40], hfun: (x, z, r) => (x < -120 && x > -520 && z < rz(x) ? lerp(150, 260, r()) : lerp(48, 130, r())) }));
    specs.push(tw(-170, rz(-170) - 205, 320, { w: 58, d: 58, crown: 'A', crownScale: 1, signature: 'shard' }));
    specs.push(tw(235, rz(235) - 175, 46, { w: 100, d: 100, crown: 'Dd', pitch: 3.2 }));
    return { specs, prisms: [], water: [{ kind: 'river', pts, width: 2 * R }], signature: { shard: { x: -170, z: rz(-170) - 205, h: 380 }, dome: { x: 235, z: rz(235) - 175, h: 140 } }, nameAnchor: [0, 170, -980], center: [0, -150], extent: 900,
      defaults: { mode: 'sweep', dir: [1, 0], step: 8, ringW: 90 } };
  },

  /** NEW YORK: a dense block of setback towers, A-wedge crowns and stacked D-arch crowns. */
  newyork(o, rng) {
    const specs = [], cx = 76, cz = 104;
    for (let i = -4; i <= 4; i++) for (let j = 0; j < 5; j++) {
      if (rng() < 0.08) continue;
      const x = i * cx + (rng() - 0.5) * 8, z = -j * cz + 40 + (rng() - 0.5) * 10, central = 1 - Math.hypot(i / 4.2, (j - 1.5) / 3);
      const H = lerp(110, 360, clamp(central * 0.9 + rng() * 0.35));
      const tiers = [{ f: 0.58, w: 54, d: 68 }, { f: 0.26, w: 40, d: 52 }, { f: 0.16, w: 26, d: 34 }];
      let y = 0; const rise = H; const crown = pickCrown(rng, { A: 0.34, Am: 0.12, Dd: 0.54 }), stacked = crown === 'Dd' && rng() < 0.6;
      tiers.forEach((t, k) => {
        const h = H * t.f, last = k === tiers.length - 1;
        specs.push({ x, z, w: t.w, d: t.d, y, h, crown: last ? crown : null, riseH: rise, pitch: 4.2, crownScale: stacked ? 0.92 : 1 });
        y += h;
      });
      if (stacked) { const cH = crownSize('Dd').height / crownSize('Dd').width * 26 * 0.92; specs.push({ x, z, w: 17, d: 22, y: y + cH * 0.86, h: 0.2, crown: 'Dd', riseH: rise, pitch: 4.2, stackOn: true }); }
    }
    return { specs, prisms: [], water: [], signature: { tallest: { x: 0, z: -cz + 40, h: 380 } }, nameAnchor: [0, 190, -700], center: [0, -220], extent: 520,
      defaults: { mode: 'rings', center: [0, -120], step: 8, ringW: 85 } };
  },

  /** SINGAPORE: three towers joined by a long D-ended skybridge slab; a bay in front. */
  singapore(o, rng) {
    const specs = [], H = 205, gx = [-92, 0, 92];
    gx.forEach((x) => specs.push({ x, z: -40, w: 46, d: 74, h: H, crown: null, pitch: 4.4 }));
    // the slab (rectangle) and the D end (the exact D profile), cantilevering past the right tower
    specs.push({ x: 18, z: -40, w: 330, d: 60, y: H, h: 26, crown: null, riseH: H + 26, pitch: 6.5 });
    specs.push({ x: 18 + 165 + 12.2, z: -40, w: 24.4, d: 60, y: H, h: 0.2, crown: 'Ds', riseH: H + 26, pitch: 6.5 });
    specs.push(...generate({ rng, region: { x0: -700, x1: 700, z0: -520, z1: -120 }, cell: 66, p: 0.82, hmin: 80, hmax: 230, centerBias: 0.4, keepOut: [rect(0, -40, 380, 120)], w: [24, 40] }));
    specs.push(...generate({ rng, region: { x0: -700, x1: 700, z0: 40, z1: 200 }, cell: 70, p: 0.4, hmin: 40, hmax: 90 }));
    return { specs, prisms: [], water: [SEA(-3000, 3000, 140, 900)], signature: { skybridge: { x: 18, z: -40, h: H + 26 } }, nameAnchor: [0, 170, -900], center: [0, -120], extent: 700,
      defaults: { mode: 'sweep', dir: [1, 0], step: 6, ringW: 70 } };
  },

  /** MUMBAI: a crescent of towers curving along a bay. */
  mumbai(o, rng) {
    const specs = [], R = 640, C = [0, 420];
    for (let row = 0; row < 3; row++) {
      const r = R + row * 78;
      for (let a = -62; a <= 62; a += 3.4 - row * 0.3) {
        if (rng() < 0.12) continue;
        const th = (a + (rng() - 0.5) * 1.4) * Math.PI / 180, x = C[0] + r * Math.sin(th), z = C[1] - r * Math.cos(th), t = 1 - Math.abs(a) / 66;
        const h = lerp(70, 250, clamp(t * 0.7 + rng() * 0.45)) * (row ? 1.08 : 0.82), w = rng.range(26, 40);
        specs.push({ x, z, w, d: w * rng.range(0.8, 1.05), h, rot: -th, crown: pickCrown(rng, CROWN_MIX), pitch: 4.2 });
      }
    }
    return { specs, prisms: [], water: [{ kind: 'bay', cx: C[0], cz: C[1], r: R - 38 }], signature: { crescent: { x: 0, z: C[1] - R, h: 240 } }, nameAnchor: [0, 150, -420], center: [0, -150], extent: 700,
      defaults: { mode: 'sweep', dir: [1, 0], step: 6, ringW: 85 } };
  },

  /** MIAMI: slender towers on a thin strip between waters. */
  miami(o, rng) {
    const specs = [];
    for (let x = -900; x <= 900; x += 46) {
      if (rng() < 0.1) continue;
      const t = 1 - Math.abs(x) / 1000, h = lerp(95, 300, clamp(t * 0.65 + rng() * 0.45)), w = rng.range(22, 30);
      specs.push({ x: x + (rng() - 0.5) * 6, z: -8 + (rng() - 0.5) * 14, w, d: w * rng.range(0.9, 1.4), h, crown: pickCrown(rng, { A: 0.4, Am: 0.15, Dd: 0.3, Ds: 0.1, Dsm: 0.05 }), pitch: 3.8 });
    }
    for (let x = -800; x <= 800; x += 90) if (rng() > 0.35) specs.push({ x: x + rng() * 20, z: -330, w: 30, d: 30, h: rng.range(70, 160), crown: pickCrown(rng, CROWN_MIX) });
    return { specs, prisms: [], water: [SEA(-3000, 3000, 70, 900), SEA(-3000, 3000, -300 + 40, -80 + 20), SEA(-3000, 3000, -900, -360)], signature: { strip: { x: 0, z: -8, h: 300 } }, nameAnchor: [0, 150, -700], center: [0, -80], extent: 900,
      defaults: { mode: 'sweep', dir: [1, 0], step: 4, ringW: 60 } };
  },

  /** SYDNEY: D-sails at the water's edge and a D-arch bridge. */
  sydney(o, rng) {
    const specs = [], prisms = [], widths = [150, 118, 90, 66, 46];
    // opera-house style D sails (the exact D profile) cascading down in size on a low podium; they alternate arc-right / arc-left
    let sx = -440; const podiumW = widths.reduce((a, b) => a + b, 0) + 12 * widths.length;
    specs.push({ x: sx + podiumW / 2 - 6, z: 76, w: podiumW + 20, d: 120, h: 4, crown: null });
    widths.forEach((w, i) => { specs.push({ x: sx + w / 2, z: 70 + i * 4, w, d: 30 - i * 3, h: 0.4, crown: i % 2 ? 'Dsm' : 'Ds', crownScale: 1, ease: 'back' }); sx += w + 12; });
    // D-arch bridge across the harbour behind (arches are the exact D, dome up)
    prisms.push({ geometry: bridgeGeometry(820, 150, 130, 4), spec: { x: 120, y: 0, z: -260, depth: 34, riseH: 150, ease: 'slam', pitch: 4 } });
    specs.push(...generate({ rng, region: { x0: -600, x1: 900, z0: -820, z1: -330 }, cell: 66, p: 0.82, hmin: 70, hmax: 270, centerBias: 0.5 }));
    specs.push(...generate({ rng, region: { x0: 160, x1: 900, z0: -230, z1: 120 }, cell: 70, p: 0.6, hmin: 55, hmax: 150 }));
    return { specs, prisms, water: [SEA(-3000, 3000, -330, 300), SEA(-3000, -420, -330, 900)], signature: { sails: { x: -210, z: 90, h: 190 }, bridge: { x: 120, z: -260, h: 150 } }, nameAnchor: [0, 160, -950], center: [0, -250], extent: 800,
      defaults: { mode: 'sweep', dir: [-1, 0], step: 6, ringW: 90 } };
  },

  /** RIYADH: a supertall with an inverted-A void at its crown, a D-sphere tower, a dense desert-city field. */
  riyadh(o, rng) {
    const specs = [], prisms = [], H = 300, SH = 92;
    specs.push({ x: 0, z: -60, w: 74, d: 46, h: H, crown: null, riseH: H + SH, pitch: 4.2 });
    prisms.push({ geometry: voidGeometry(74, SH, 54), spec: { x: 0, y: H, z: -60, depth: 46, riseH: H + SH, ease: 'slam' } });
    // the D-sphere tower
    specs.push({ x: 205, z: -30, w: 24, d: 24, h: 215, crown: 'S', crownScale: 2.4, pitch: 4.2 });
    specs.push(...generate({ rng, region: { x0: -760, x1: 760, z0: -560, z1: 160 }, cell: 66, p: 0.78, hmin: 55, hmax: 230, centerBias: 0.6, keepOut: [rect(0, -60, 130, 100), rect(205, -30, 90, 90)] }));
    return { specs, prisms, water: [], signature: { void: { x: 0, z: -60, h: H + SH }, sphere: { x: 205, z: -30, h: 275 } }, nameAnchor: [0, 190, -820], center: [0, -150], extent: 760,
      defaults: { mode: 'rings', center: [0, -60], step: 4, ringW: 140 } };
  },

  /** HONG KONG: dense slender towers stepping down both sides of a harbour. */
  hongkong(o, rng) {
    const specs = [];
    specs.push(...generate({ rng, region: { x0: -900, x1: 900, z0: -540, z1: -150 }, cell: 54, p: 0.92, w: [20, 34], hfun: (x, z, r) => lerp(70, 420, clamp(1 - Math.abs(x) / 900 + r() * 0.35 - (z + 150) / -900 * 0.35)), center: [0, -200] }));
    specs.push(...generate({ rng, region: { x0: -900, x1: 900, z0: -1040, z1: -540 }, cell: 66, p: 0.78, w: [24, 40], hmin: 180, hmax: 460, centerBias: 0.3 }));
    specs.push(...generate({ rng, region: { x0: -700, x1: 700, z0: 160, z1: 400 }, cell: 60, p: 0.7, w: [22, 36], hmin: 90, hmax: 300, centerBias: 0.4 }));
    return { specs, prisms: [], water: [SEA(-3000, 3000, -150, 160)], signature: { harbour: { x: 0, z: 0, h: 0 } }, nameAnchor: [0, 200, -1100], center: [0, -300], extent: 900,
      defaults: { mode: 'sweep', dir: [1, 0], step: 4, ringW: 100 } };
  },

  /** TOKYO: a dense field of towers and a slender mast with two D-sphere decks. */
  tokyo(o, rng) {
    const specs = [];
    specs.push(...generate({ rng, region: { x0: -900, x1: 900, z0: -760, z1: 160 }, cell: 56, p: 0.9, w: [20, 34], hmin: 60, hmax: 250, centerBias: 0.4, keepOut: [rect(230, -150, 90, 90)] }));
    specs.push({ x: 230, z: -150, w: 16, d: 16, h: 500, crown: 'A', crownScale: 1.0, pitch: 5 });
    specs.push({ x: 230, z: -150, w: 44, d: 44, y: 330, h: 0.2, crown: 'S', riseH: 500, pitch: 5 });
    specs.push({ x: 230, z: -150, w: 34, d: 34, y: 430, h: 0.2, crown: 'S', riseH: 500, pitch: 5 });
    return { specs, prisms: [], water: [], signature: { mast: { x: 230, z: -150, h: 520 } }, nameAnchor: [0, 190, -900], center: [0, -300], extent: 900,
      defaults: { mode: 'rings', center: [230, -150], step: 4, ringW: 110 } };
  },

  /** Any seeded skyline (opts.region, opts.hmax ...). */
  generic(o, rng) {
    const R = o.region || { x0: -600, x1: 600, z0: -600, z1: 200 };
    return { specs: generate({ rng, ...o, region: R }), prisms: [], water: [], signature: {}, nameAnchor: [(R.x0 + R.x1) / 2, 160, R.z0 - 200], center: [(R.x0 + R.x1) / 2, (R.z0 + R.z1) / 2], extent: Math.max(R.x1 - R.x0, R.z1 - R.z0) / 2,
      defaults: { mode: 'rings', center: [(R.x0 + R.x1) / 2, (R.z0 + R.z1) / 2], step: 8, ringW: 100 } };
  },
};

/* ───────────────────────────── build ───────────────────────────── */

/** Build a city. opts: {seed, hero:{x,z,w,d}|null, t0, step, schedule:{...}, lod, origin:[x,z], rot (rad), scale, shadow (default true), region/hmax... (generic)}.
    schedule opts override the preset's wave pattern (see schedule()); t0 = frame ring 0's crowns land.
    Returns {name, group, set, specs, water, signature, bounds, center, extent, nameAnchor, landings()}. */
export function build(name, opts = {}) {
  const P = presets[name]; if (!P) throw new Error('unknown city preset ' + name + ' (known: ' + Object.keys(presets).join(', ') + ')');
  const rng = makeRng(opts.seed ?? name);
  const res = P({ hero: opts.hero === undefined ? null : opts.hero, ...opts }, rng);
  const sched = { ...res.defaults, ...(opts.schedule || {}), t0: opts.t0 ?? opts.schedule?.t0 ?? 0, seed: (opts.seed ?? name) + ':sched' };
  if (opts.step != null) sched.step = opts.step;
  // tiers/stacks must share timing: schedule per "tower id" = same x,z
  const key = (s) => `${s.x.toFixed(2)},${s.z.toFixed(2)}`;
  const groups = new Map(); for (const s of res.specs) { const k = key(s); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(s); }
  const heads = [...groups.values()].map((g) => g[0]);
  schedule(heads, sched);
  for (const g of groups.values()) for (let i = 1; i < g.length; i++) { const h = g[0], s = g[i]; s.t0 = h.t0; s.dur = h.dur; s.ease = h.ease; s.mode = 'slide'; s.land = h.land; if (s.crown) { s.drop = h.drop || 120; s.dropDur = h.dropDur ?? 4; } }
  // the crown tier carries the landing; non-crown tiers rise with the stack and end at t0+dur
  const reflect = opts.reflect ?? 0;   // 0..1: skyline reflected in the water (needs water: all presets with water get stencil writes when reflect > 0)
  const set = new TowerSet({ lod: opts.lod ?? 0, shadow: opts.shadow ?? true, name: 'city:' + name, reflect });
  for (const s of res.specs) set.add(s);
  const sh = { ...sched, mode: 'instant' };
  for (const p of res.prisms) { const s = { ...p.spec, t0: sched.t0 - (sched.step || 8) * 0 - 18, dur: 14, ease: 'slam' }; s.land = s.t0 + s.dur; set.addPrism(p.geometry, s); }
  set.build();
  const group = new THREE.Group(); group.name = 'city:' + name; group.add(set.group);
  const water = [];
  for (const w of res.water) {
    let m;
    const wo = { reflect: reflect > 0 };
    if (w.kind === 'rect') m = makeWater({ x0: w.x0, x1: w.x1, z0: w.z0, z1: w.z1, ...wo });
    else if (w.kind === 'river') m = makeRiver(w.pts, w.width, wo);
    else if (w.kind === 'bay') m = makeBay(w.cx, w.cz, w.r, wo);
    water.push(m); group.add(m);
  }
  if (opts.origin) group.position.set(opts.origin[0], 0, opts.origin[1]);
  if (opts.rot) group.rotation.y = opts.rot;
  if (opts.scale) group.scale.setScalar(opts.scale);
  const c = Math.cos(opts.rot || 0), s_ = Math.sin(opts.rot || 0), sc = opts.scale || 1, ox = opts.origin ? opts.origin[0] : 0, oz = opts.origin ? opts.origin[1] : 0;
  const toWorld = (x, z) => [ox + sc * (c * x + s_ * z), oz + sc * (-s_ * x + c * z)];
  const landings = () => set.landings().map((l) => { const [x, z] = toWorld(l.x, l.z); return { ...l, x, z, h: l.h * sc }; });
  return { name, group, set, specs: res.specs, water, signature: res.signature, bounds: set.bounds(), center: res.center, extent: res.extent, nameAnchor: res.nameAnchor, landings, toWorld };
}

export const NAMES = Object.keys(presets).filter((k) => k !== 'generic');
export { rect, inRect };
