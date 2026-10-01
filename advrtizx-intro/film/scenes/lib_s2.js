/* DOMINANT · scenes/lib_s2.js
   Shared by ACT IV (every city) and ACT V (at once). Owner: the act4/act5 author.
   A tiny skyline COMPOSER (rows with a controlled silhouette instead of a random grid), the nine signature cities built only from the
   monogram's grammar (A wedge / D dome / D side-sail / D sphere, exact profiles via kits.logo), a timing scheduler that makes every
   crown LAND on a chosen frame, water helpers, and the eruption/type helpers both acts share.
   Conventions: camera looks toward -z, +x is screen right, y up, metres, a city is centred on its own origin (placed by group.position). */
import * as THREE from 'three';
import { makeRng, lerp, clamp, EASE } from '../engine/util.js';

/* ───────────────────────────── composer ───────────────────────────── */

/** crown picker with a rhythm (never the same crown three times in a row). weights: {A:.3, Dd:.3, ...} */
export function crownSeq(rng, weights) {
  const ents = Object.entries(weights); const tot = ents.reduce((a, [, w]) => a + w, 0);
  let last = '', run = 0;
  return () => {
    let k = ents[0][0];
    for (let tries = 0; tries < 8; tries++) {
      let r = rng() * tot; k = ents[0][0];
      for (const [kk, w] of ents) { if ((r -= w) <= 0) { k = kk; break; } }
      if (!(k === last && run >= 2)) break;
    }
    run = k === last ? run + 1 : 1; last = k; return k;
  };
}
export const CROWNS = { mix: { A: 0.30, Am: 0.12, Dd: 0.28, Ds: 0.12, Dsm: 0.08 }, wedge: { A: 0.6, Am: 0.4 }, dome: { Dd: 0.7, Ds: 0.15, Dsm: 0.15 }, spiky: { A: 0.5, Am: 0.2, Dd: 0.3 } };

const val = (v, x, rng, T) => (typeof v === 'function' ? v(x, rng, T) : Array.isArray(v) ? rng.range(v[0], v[1]) : v);
/** Sets cam.look[1] so that a ground point at horizontal depth d lands at screen fraction sBase (0 top .. 1 bottom): the foreground band below the skyline is then exactly where you want it. */
export function fitCam(cam, d, sBase) {
  const [px, py] = cam.pos, hl = Math.hypot(cam.look[0] - px, cam.look[2] - cam.pos[2]), th = Math.tan(cam.fov * Math.PI / 360);
  const pitch = -Math.atan(py / d) - Math.atan((1 - 2 * sBase) * th);
  cam.look[1] = py + hl * Math.tan(pitch);
  return cam;
}
/** crown height / crown width for each kind (from the exact profiles) */
export const CR = { A: 0.858, Am: 0.858, Dd: 0.941, Ds: 1.0627, Dsm: 1.0627, S: 1 };
/** Screen-driven heights: S = roofAt(cam) gives the world height whose top lands at screen fraction s (0 = top edge, 1 = bottom edge) at depth z. */
export function roofAt(cam) {
  const [px, py, pz] = cam.pos, [lx, ly, lz] = cam.look, hl = Math.hypot(lx - px, lz - pz), fx = (lx - px) / hl, fz = (lz - pz) / hl;
  const pitch = Math.atan2(ly - py, hl), th = Math.tan(cam.fov * Math.PI / 360);
  return (s, x, z) => { const d = Math.max(30, fx * (x - px) + fz * (z - pz)); return py + d * Math.tan(pitch + Math.atan((1 - 2 * s) * th)); };
}

/** A row of towers packed left to right. o: {x0,x1, z (number|fn(x)), gap:[a,b], w:[a,b], dr:[a,b] (depth/width), top (fn(x,rng,T)->TOTAL height incl. crown | [a,b]), crowns (weights),
    zj, y (base elevation), wave, tiers, extra, rot (fn|num), pitch, crownScale, accept(T), nocrown} */
export function row(rng, o) {
  const out = [], pick = crownSeq(rng, o.crowns || CROWNS.mix);
  let x = o.x0;
  while (x < o.x1) {
    const w = val(o.w || [34, 52], x, rng), cx = x + w / 2; if (cx > o.x1) break;
    const d = w * val(o.dr || [0.9, 1.25], x, rng);
    const crown = o.nocrown ? null : pick(), cs = o.crownScale || 1;
    const z = (typeof o.z === 'function' ? o.z(cx) : o.z) + rng.range(-(o.zj ?? 8), o.zj ?? 8);
    const T = { x: cx, z, y: typeof o.y === 'function' ? o.y(cx) : (o.y || 0), w, d, h: 0, crown, wave: o.wave || 0, rot: typeof o.rot === 'function' ? o.rot(cx) : (o.rot || 0), pitch: o.pitch || 4.2, crownScale: cs, layer: o.layer || 0 };
    const total = val(o.top || [80, 180], cx, rng, T);
    T.h = Math.max(24, total - (crown ? CR[crown] * w * cs : 0) - T.y);
    if (o.tiers) T.tiers = o.tiers(T.h, rng);
    if (o.extra) T.extra = o.extra(T, rng);
    if (!(o.accept && !o.accept(T))) out.push(T);
    x += w + val(o.gap || [4, 10], x, rng);
  }
  return out;
}
/** Towers on a regular pitch (staggered between rows) with a little jitter: a clean, rhythmic skyline. o: {x0,x1,pitch,stagger,z,w:[a,b] (<= 0.8 pitch),dr,top(x,rng,T),crowns,jx,zj,y,wave,tiers,extra,pitch2} */
export function slots(rng, o) {
  const out = [], pick = crownSeq(rng, o.crowns || CROWNS.mix);
  const n = Math.floor((o.x1 - o.x0) / o.pitch);
  for (let k = 0; k <= n; k++) {
    const cx = o.x0 + (o.stagger || 0) + k * o.pitch + rng.range(-1, 1) * (o.jx ?? o.pitch * 0.06);
    const w = Math.min(val(o.w, cx, rng), o.pitch * 0.84), d = w * val(o.dr || [0.95, 1.2], cx, rng);
    const crown = o.nocrown ? null : pick(), cs = o.crownScale || 1;
    const z = (typeof o.z === 'function' ? o.z(cx) : o.z) + rng.range(-(o.zj ?? 6), o.zj ?? 6);
    const T = { x: cx, z, y: typeof o.y === 'function' ? o.y(cx) : (o.y || 0), w, d, h: 0, crown, wave: o.wave || 0, rot: typeof o.rot === 'function' ? o.rot(cx) : (o.rot || 0), pitch: o.pitchF || 4.2, crownScale: cs, k, layer: o.layer || 0 };
    const total = val(o.top, cx, rng, T);
    T.h = Math.max(24, total - (crown ? CR[crown] * w * cs : 0) - T.y);
    if (o.tiers) T.tiers = o.tiers(T.h, rng);
    if (o.extra) T.extra = o.extra(T, rng);
    if (!(o.accept && !o.accept(T))) out.push(T);
  }
  return out;
}
/** remove towers overlapping any circle/rect keep-out (towers are boxes, the test is on centres + half widths) */
export const clearOf = (towers, zones) => towers.filter((T) => !zones.some((Z) => Math.abs(T.x - Z.x) < (T.w + Z.w) / 2 + (Z.m ?? 6) && Math.abs(T.z - Z.z) < (T.d + Z.d) / 2 + (Z.m ?? 6)));
export const bell = (x, c, s) => Math.exp(-(((x - c) / s) ** 2));
/** setback tiers: fractions of total height and width factors (like a wedding cake, narrowing upward) */
export const SETBACK = (h, rng) => (h > 190 ? [{ f: 0.46, wf: 1 }, { f: 0.28, wf: 0.8 }, { f: 0.16, wf: 0.6 }, { f: 0.10, wf: 0.42 }] : h > 110 ? [{ f: 0.58, wf: 1 }, { f: 0.27, wf: 0.76 }, { f: 0.15, wf: 0.52 }] : [{ f: 0.7, wf: 1 }, { f: 0.3, wf: 0.7 }]);

/* ───────────────────────────── timing ───────────────────────────── */

/** Gives every tower t0/dur/land/drop so its CROWN lands on hit + wave. Shafts arrive together (taller = longer rise, same lock frame). */
export function timeTowers(towers, { hit, rng, dropDur = 4, dur = [6, 9], drop = [70, 140], tall = 220 } = {}) {
  for (const T of towers) {
    const L = hit + (T.wave || 0);
    T.land = L; T.dur = Math.round(lerp(dur[0], dur[1], rng()) + clamp(T.h / tall, 0, 2) * 1.5);
    T.t0 = L - T.dur; T.drop = T.crown ? lerp(drop[0], drop[1], rng()) : 0; T.dropDur = dropDur;
  }
  return towers;
}

/** Emits a composed tower (with optional setback tiers and stacked crowns) into a TowerSet. Tiers share timing and a rigid rise. */
export function emitTower(set, T, crownSize) {
  const common = { x: T.x, z: T.z, rot: T.rot || 0, t0: T.t0, dur: T.dur, land: T.land, ease: T.ease || 'slam', pitch: T.pitch || 4.2, dropDur: T.dropDur, seed: 0 };
  if (!T.tiers) {
    set.add({ ...common, y: T.y || 0, w: T.w, d: T.d, h: T.h, crown: T.crown, crownScale: T.crownScale || 1, drop: T.drop, riseH: T.riseH || 0 });
    return;
  }
  let y = T.y || 0; const total = T.h;
  T.tiers.forEach((tr, k) => {
    const hh = total * tr.f, last = k === T.tiers.length - 1;
    set.add({ ...common, y, w: T.w * tr.wf, d: T.d * (tr.df ?? tr.wf), h: hh, crown: last ? T.crown : null, crownScale: T.crownScale || 1, drop: last ? T.drop : 0, riseH: total });
    y += hh;
  });
  // stacked crowns (the Chrysler move): smaller D arches nested on the first crown, sharing its landing
  let yTop = y, wTop = T.w * T.tiers[T.tiers.length - 1].wf * (T.crownScale || 1), kind = T.crown;
  for (const ex of T.extra || []) {
    const cs = crownSize(kind), cH = (cs.height / cs.width) * wTop;
    const w2 = wTop * ex.wf; yTop += cH * (ex.sink ?? 0.8); wTop = w2; kind = ex.crown;
    set.add({ ...common, y: yTop, w: w2, d: T.d * T.tiers[T.tiers.length - 1].wf * ex.wf * 1.1, h: 0.2, crown: ex.crown, crownScale: 1, drop: (T.drop || 0) + (ex.dropExtra ?? 0), riseH: total, land: T.land + (ex.dl ?? 0) });
  }
}

/* ───────────────────────────── geometry helpers (custom prisms, exact logo profiles) ───────────────────────────── */

/** Slab with the exact D at its right end (a Singapore-style skybridge). L body length, H thickness (metres). Profile in x/y, thickness 1 in z. */
export function slabD(kits, L, H, { left = false } = {}) {
  const { profile, extrude } = kits.logo;
  const D = profile('Ds'), s = H / D.height;
  let pts = D.pts.map(([x, y]) => [x * s, y * s]);
  // rotate list to start at the bottom-left corner and run CCW: bottom edge -> arc -> top edge -> back down the flat side
  let i0 = 0, best = 1e9; pts.forEach(([x, y], i) => { const v = x * 1000 + y; if (v < best) { best = v; i0 = i; } });
  pts = pts.slice(i0).concat(pts.slice(0, i0));
  const x0 = pts[0][0];
  const body = [[-L / 2, 0]];
  const dpts = pts.map(([x, y]) => [x - x0 + L / 2 - 0.0, y]);
  const poly = body.concat(dpts, [[-L / 2, H]]);
  return extrude(poly, { smoothDeg: 40 });
}
/** Long viaduct slab with exact D arch openings (dome up) cut into its underside. */
export function viaduct(kits, L, H, archW, n, gap = 0.28) {
  const { profile, extrude } = kits.logo;
  const D = profile('Dd'), s = archW / D.width, pts = D.pts.map(([x, y]) => [x * s, y * s]);
  let ibl = -1, ibr = -1; pts.forEach(([x, y], i) => { if (y < 1e-4) { if (ibl < 0 || x < pts[ibl][0]) ibl = i; if (ibr < 0 || x > pts[ibr][0]) ibr = i; } });
  // chain from bottom-left, over the top, to bottom-right (CCW polygon runs bottom-right -> top -> bottom-left, so walk it backwards)
  const nn = pts.length, seq = []; for (let k = 0, i = ibr; k < nn; k++, i = (i + 1) % nn) { seq.push(pts[i]); if (i === ibl) break; }
  const up = seq.slice().reverse();
  const total = n * archW + (n - 1) * archW * gap, x0 = -total / 2, outline = [[-L / 2, 0]];
  for (let a = 0; a < n; a++) { const ox = x0 + a * archW * (1 + gap) + archW / 2; for (const [x, y] of up) outline.push([ox + x, y]); }
  outline.push([L / 2, 0], [L / 2, H], [-L / 2, H]);
  return extrude(outline, { smoothDeg: 40 });
}
/** Rectangle with an inverted-A void (the exact A rotated 180 degrees) cut through it. w x h metres, hole width holeW, hole centre at (hx, hy from the bottom). */
export function voidSlab(kits, w, h, holeW, hy) {
  const { profile, extrude } = kits.logo;
  const A = profile('A'), s = holeW / A.width, inv = A.pts.map(([x, y]) => [-x * s, A.height * s - y * s]);
  const hole = inv.map(([x, y]) => [x, y + hy]);
  return extrude([[-w / 2, 0], [w / 2, 0], [w / 2, h], [-w / 2, h]], { holes: [hole], smoothDeg: 40 });
}

/* ───────────────────────────── water ───────────────────────────── */

export function waterQuad(kits, cx, cz, w, l, rot = 0, y = -0.2, o = {}) {
  const g = new THREE.PlaneGeometry(w, l); g.rotateX(-Math.PI / 2); g.rotateY(rot); g.translate(cx, y, cz);
  return kits.world.makeWaterMesh(g, o);
}
function makeWaterFrom(kits, w) {
  if (w.kind === 'rect') return kits.world.makeWater({ x0: w.x0, x1: w.x1, z0: w.z0, z1: w.z1, tint: w.tint || [0.34, 0, 0] });
  if (w.kind === 'river') return kits.world.makeRiver(w.pts, w.width, { tint: w.tint });
  if (w.kind === 'bay') return kits.world.makeBay(w.cx, w.cz, w.r, { tint: w.tint || [0.34, 0, 0] });
  if (w.kind === 'quad') return waterQuad(kits, w.cx, w.cz, w.w, w.l, w.rot || 0, -0.2, { tint: w.tint || [0.34, 0, 0] });
  throw new Error('water kind ' + w.kind);
}

/* ───────────────────────────── the nine cities ───────────────────────────── */
/* Each definition: (rng, o) -> { towers, prisms, water, cam, name, ... }.  o.thin (0..1] thins rows for small panels, o.scale scales heights.
   cam = camera pose for a 16:9 hold in LOCAL coords: { pos, look, fov, push:[dx,dy,dz] (drift over the hold) }.
   name = { z, y (baseline), cx } where the huge name stands in the fog behind the skyline. */

const thin = (o) => (o && o.thin != null ? o.thin : 1);
const keepFrac = (rng, towers, f) => (f >= 1 ? towers : towers.filter(() => rng() < f));

export const CITIES = {
  /* LONDON: a bending river, one tall A shard, a D dome */
  london(rng, o = {}) {
    const cam = fitCam({ pos: [-30, 44, 360], look: [36, 166, -300], fov: 42, push: [24, 4, -34] }, 500, 0.80), S = roofAt(cam);
    const rz = (x) => -60 + 26 * Math.sin(x / 300 + 0.4), RW = 100, bank = (x) => rz(x) - RW / 2;
    const prof = (x) => 0.35 + 0.65 * bell(x, 90, 360);
    const crowns = { A: 0.34, Am: 0.08, Dd: 0.38, Ds: 0.10, Dsm: 0.10 };
    const band = (z0, a, b, pitch, stagger, w, wave, cs, layer, x0 = -640, x1 = 760) => slots(rng, { x0, x1, pitch, stagger, z: (x) => bank(x) - z0, w, crowns, wave, zj: 5, crownScale: cs, layer, top: (x, r, T) => S(lerp(a, b, prof(x) * (0.25 + 0.75 * r())), T.x, T.z) });
    let T = [];
    T.push(...band(36, 0.52, 0.38, 92, 0, [32, 46], 0, 0.94, 0, -560, 700));
    T.push(...band(170, 0.44, 0.30, 100, 46, [32, 44], 0, 0.88, 1, -640, 780));
    T.push(...band(340, 0.38, 0.25, 108, 16, [30, 42], 8, 0.82, 2, -720, 860));
    T.push(...band(560, 0.33, 0.22, 118, 60, [30, 40], 16, 0.76, 3, -800, 960));
    const sx = 128, sz = bank(sx) - 250, shard = { x: sx, z: sz, w: 46, d: 46, crown: 'A', crownScale: 1.25, wave: 0, tiers: [{ f: 0.34, wf: 1 }, { f: 0.28, wf: 0.86 }, { f: 0.22, wf: 0.7 }, { f: 0.16, wf: 0.54 }], hero: 'shard' };
    shard.h = S(0.07, sx, sz) - CR.A * (46 * 0.54) * 1.25;
    const dx = -170, dz = bank(dx) - 105, dw2 = 100 * 0.62, dome = { x: dx, z: dz, w: 100, d: 82, crown: 'Dd', crownScale: 1.0, wave: 0, tiers: [{ f: 0.5, wf: 1 }, { f: 0.5, wf: 0.62 }], hero: 'dome', pitch: 3.4 };
    dome.h = S(0.40, dx, dz) - CR.Dd * dw2;
    T = clearOf(T, [shard, dome]); T = keepFrac(rng, T, thin(o));
    T.push(shard, dome);
    const pts = []; for (let x = -1500; x <= 1500; x += 60) pts.push([x, rz(x)]);
    return { towers: T, prisms: [], hazes: [[1, 1], [0.90, 0.82], [0.76, 0.62], [0.60, 0.46]], water: [{ kind: 'river', pts, width: RW, tint: [0.30, 0, 0] }], cam, name: { z: -760, y: S(0.46, 70, -760) }, label: { y: 1000 }, shardX: 128 };
  },

  /* NEW YORK: a dense block of setback towers, A crowns and stacked D-arch crowns */
  newyork(rng, o = {}) {
    const cam = fitCam({ pos: [-130, 74, 560], look: [-10, 200, -280], fov: 40, push: [34, 6, -40] }, 600, 0.82), S = roofAt(cam);
    const prof = (x) => 0.30 + 0.70 * bell(x, -40, 330), crowns = { A: 0.36, Am: 0.12, Dd: 0.52 };
    const stackD = (T, r) => (T.crown === 'Dd' && T.h > 110 && r() < 0.6 ? [{ crown: 'Dd', wf: 0.6, sink: 0.82 }] : null);
    const B = bander(rng, S, crowns, prof);
    let T = [];
    T.push(...B({ z: -40, s: [0.56, 0.40], pitch: 84, w: [52, 66], wave: 0, cs: 0.84, layer: 0, tiers: SETBACK, extra: stackD, x0: -620, x1: 700, pitchF: 3.9 }));
    T.push(...B({ z: -190, s: [0.47, 0.32], pitch: 92, stagger: 44, w: [50, 64], wave: 0, cs: 0.8, layer: 1, tiers: SETBACK, extra: stackD, x0: -680, x1: 760, pitchF: 3.9 }));
    T.push(...B({ z: -350, s: [0.41, 0.26], pitch: 100, stagger: 14, w: [50, 62], wave: 8, cs: 0.76, layer: 2, tiers: SETBACK, x0: -760, x1: 860, pitchF: 3.9 }));
    T.push(...B({ z: -540, s: [0.37, 0.22], pitch: 112, stagger: 56, w: [50, 60], wave: 16, cs: 0.7, layer: 3, tiers: SETBACK, x0: -860, x1: 960, pitchF: 3.9 }));
    const tiers4 = [{ f: 0.42, wf: 1 }, { f: 0.26, wf: 0.8 }, { f: 0.18, wf: 0.58 }, { f: 0.14, wf: 0.38 }], tiers3 = [{ f: 0.46, wf: 1 }, { f: 0.30, wf: 0.76 }, { f: 0.24, wf: 0.56 }];
    const esb = { x: -60, z: -120, w: 66, d: 66, crown: 'A', crownScale: 1.0, wave: 0, tiers: tiers4, hero: 'esb', pitch: 3.9, layer: 0 }; esb.h = S(0.08, esb.x, esb.z) - CR.A * 66 * 0.38;
    const chr = { x: 215, z: -250, w: 60, d: 60, crown: 'Dd', crownScale: 1.0, wave: 0, tiers: tiers3, extra: [{ crown: 'Dd', wf: 0.66, sink: 0.84 }, { crown: 'Dd', wf: 0.66, sink: 0.84 }], hero: 'chrysler', pitch: 3.9, layer: 0 }; chr.h = S(0.12, chr.x, chr.z) - 1.75 * CR.Dd * 60 * 0.56;
    const wtc = { x: -330, z: -100, w: 54, d: 54, crown: 'Am', crownScale: 1.0, wave: 0, tiers: tiers3, hero: 'wtc', pitch: 3.9, layer: 0 }; wtc.h = S(0.15, wtc.x, wtc.z) - CR.Am * 54 * 0.56;
    const heroes = [esb, chr, wtc];
    T = clearOf(T, heroes.map((h) => ({ x: h.x, z: h.z, w: h.w + 12, d: h.d + 90 }))); T = keepFrac(rng, T, thin(o));
    T.push(...heroes);
    return { towers: T, prisms: [], hazes: [[1, 1], [0.90, 0.80], [0.76, 0.60], [0.60, 0.44]], water: [], cam, name: { z: -800, y: S(0.47, -10, -800) }, label: { y: 1000 } };
  },

  /* SINGAPORE: three towers joined by a long D-ended skybridge slab, on the waterfront */
  singapore(rng, o = {}) {
    const cam = fitCam({ pos: [26, 44, 660], look: [8, 170, -100], fov: 38, push: [-16, 3, -26] }, 740, 0.80), S = roofAt(cam);
    const zt = -80, SL = 46, Ht = S(0.44, 0, zt) - SL, crowns = { A: 0.34, Am: 0.16, Dd: 0.34, Ds: 0.08, Dsm: 0.08 };
    const prof = (x) => 0.25 + 0.75 * (1 - bell(x, 10, 250));
    const B = bander(rng, S, crowns, prof);
    const hero = [-118, 0, 118].map((x) => ({ x, z: zt, w: 56, d: 86, h: Ht, crown: null, wave: 0, pitch: 4.6, hero: 'pillar', layer: 0 }));
    let T = [];
    T.push(...B({ z: -230, s: [0.62, 0.48], pitch: 96, stagger: 20, w: [38, 52], wave: 8, cs: 0.9, layer: 1, x0: -700, x1: 760, accept: (t) => Math.abs(t.x - 10) > 215 }));
    T.push(...B({ z: -400, s: [0.54, 0.40], pitch: 108, stagger: 60, w: [40, 54], wave: 16, cs: 0.84, layer: 2, x0: -780, x1: 860 }));
    T.push(...B({ z: -150, s: [0.74, 0.62], pitch: 90, stagger: 0, w: [34, 46], wave: 4, cs: 0.9, layer: 0, x0: -640, x1: 700, accept: (t) => Math.abs(t.x - 10) > 240 }));
    T.push(...B({ z: -560, s: [0.50, 0.38], pitch: 120, stagger: 30, w: [42, 56], wave: 16, cs: 0.8, layer: 3, x0: -860, x1: 960 }));
    T = clearOf(T, hero.map((h) => ({ ...h, m: 14 }))); T = keepFrac(rng, T, thin(o));
    T.push(...hero);
    return { towers: T, prisms: [{ geom: (k) => slabD(k, 380, SL), spec: { x: 12, y: Ht, z: zt, depth: 82, riseH: Ht, ease: 'slam', hero: 'slab', drop: 180, dropDur: 4, layer: 0 } }],
      hazes: [[1, 1], [0.90, 0.80], [0.76, 0.60], [0.60, 0.44]], water: [{ kind: 'rect', x0: -1500, x1: 1500, z0: 36, z1: 1400, tint: [0.30, 0, 0] }],
      cam, name: { z: -720, y: S(0.47, 8, -720) }, label: { y: 1000 } };
  },

  /* MUMBAI: a crescent of towers along a curved bay */
  mumbai(rng, o = {}) {
    const C = [0, 600], R = 470, cam = fitCam({ pos: [0, 62, 980], look: [0, 150, 130], fov: 44, push: [-14, 3, -40] }, 640, 0.80), S = roofAt(cam), crowns = { A: 0.30, Am: 0.12, Dd: 0.30, Ds: 0.14, Dsm: 0.14 };
    const T = [];
    for (let rowi = 0; rowi < 3; rowi++) {
      const r = R + rowi * 96, pick = crownSeq(rng, crowns); let a = -68 + rowi * 2.2;
      while (a < 68) {
        const th = (a + (rng() - 0.5) * 0.8) * Math.PI / 180, w = rng.range(34, 46) * (1 + rowi * 0.12), arc = (w * 1.55 + rng.range(4, 14)) / r * 180 / Math.PI, x = C[0] + r * Math.sin(th), z = C[1] - r * Math.cos(th);
        const t = bell(a, -6, 40), top = lerp(110 + rowi * 20, 300 + rowi * 30, clamp(t * 0.85 + rng() * 0.3)), crown = pick(), cs = 0.9 - rowi * 0.04, h = Math.max(40, top - CR[crown] * w * cs);
        T.push({ x, z, w, d: w * rng.range(0.9, 1.1), h, rot: -th, crown, crownScale: cs, wave: rowi === 2 ? 8 : rowi === 1 ? 4 : 0, pitch: 4.0, layer: rowi });
        a += arc;
      }
    }
    return { towers: keepFrac(rng, T, thin(o)), prisms: [], hazes: [[1, 1], [0.88, 0.78], [0.72, 0.58]], water: [{ kind: 'bay', cx: C[0], cz: C[1], r: R - 50, tint: [0.30, 0, 0] }],
      cam, name: { z: -340, y: S(0.46, 0, -340) }, label: { y: 1000 } };
  },

  /* MIAMI: slender towers on a thin strip between two waters (seen along the strip) */
  miami(rng, o = {}) {
    const al = 0.62, ux = -Math.sin(al), uz = -Math.cos(al), rotA = Math.atan2(ux, uz), S0 = [400, 190], LEN = 1500;
    const cam = fitCam({ pos: [150, 96, 560], look: [-90, 150, -300], fov: 42, push: [-22, 2, -44] }, 420, 0.84), S = roofAt(cam);
    const T = [], pick = crownSeq(rng, { A: 0.4, Am: 0.15, Dd: 0.3, Ds: 0.1, Dsm: 0.05 });
    for (let s = 40; s < LEN; s += rng.range(52, 68)) {
      const k = s / LEN, h = lerp(100, 340, Math.pow(Math.sin(Math.PI * Math.pow(k, 0.62)), 1.0) * (0.55 + 0.45 * rng())), w = rng.range(24, 30), side = rng.range(-10, 10);
      T.push({ x: S0[0] + ux * s - uz * side, z: S0[1] + uz * s + ux * side, w, d: w * rng.range(1.6, 2.1), h, rot: rotA, crown: pick(), crownScale: 0.95, wave: s > 1000 ? 8 : s > 560 ? 4 : 0, pitch: 3.7, layer: s > 1000 ? 2 : s > 520 ? 1 : 0 });
    }
    const half = 52, wq = 4400, nx = -uz, nz = ux;
    const water = [-1, 1].map((sgn) => ({ kind: 'quad', cx: S0[0] + ux * 700 + nx * sgn * (half + wq / 2), cz: S0[1] + uz * 700 + nz * sgn * (half + wq / 2), w: wq, l: 5400, rot: rotA, tint: [0.30, 0, 0] }));
    return { towers: keepFrac(rng, T, thin(o)), prisms: [], hazes: [[1, 1], [0.86, 0.76], [0.68, 0.52]], water, cam, name: { z: -1180, y: S(0.5, -150, -1180) }, label: { y: 1000 } };
  },

  /* SYDNEY: D-sails at the water's edge and a D-arch bridge */
  sydney(rng, o = {}) {
    const cam = fitCam({ pos: [-60, 58, 640], look: [90, 140, -150], fov: 40, push: [28, 3, -30] }, 600, 0.82), S = roofAt(cam), crowns = { A: 0.28, Am: 0.12, Dd: 0.34, Ds: 0.14, Dsm: 0.12 };
    const T = [];
    T.push({ x: -150, z: 30, w: 330, d: 90, h: 7, crown: null, wave: 0, hero: 'podium', pitch: 6, layer: 0 });
    const sails = [[-260, 118, 'Ds', 14], [-196, 94, 'Ds', -4], [-142, 70, 'Ds', -20], [-76, 106, 'Dsm', 8], [-18, 80, 'Dsm', -10], [30, 56, 'Dsm', -24]];
    sails.forEach(([x, w, k, zz], i) => T.push({ x, z: 40 + zz, w, d: 26, h: 0.6, crown: k, crownScale: 1, wave: 0, hero: 'sail', ease: 'slam', pitch: 6, layer: 0 }));
    const B = bander(rng, S, crowns, (x) => 0.4 + 0.6 * bell(x, 420, 380));
    T.push(...B({ z: -520, s: [0.58, 0.40], pitch: 100, stagger: 0, w: [38, 52], wave: 8, cs: 0.84, layer: 1, x0: 200, x1: 1000 }));
    T.push(...B({ z: -700, s: [0.50, 0.34], pitch: 116, stagger: 50, w: [42, 58], wave: 16, cs: 0.8, layer: 2, x0: 200, x1: 1040 }));
    T.push(...B({ z: -390, s: [0.68, 0.56], pitch: 92, stagger: 20, w: [34, 46], wave: 4, cs: 0.88, layer: 1, x0: 380, x1: 980 }));
    return { towers: keepFrac(rng, T, thin(o)), prisms: [{ geom: (k) => viaduct(k, 880, 150, 118, 5), spec: { x: 270, y: 0, z: -250, depth: 32, riseH: 150, ease: 'slam', hero: 'bridge', drop: 0, dropDur: 4, layer: 1 } }],
      hazes: [[1, 1], [0.86, 0.76], [0.66, 0.5]],
      water: [{ kind: 'rect', x0: -1500, x1: 1500, z0: -320, z1: 40, tint: [0.30, 0, 0] }, { kind: 'rect', x0: -1500, x1: -430, z0: 40, z1: 1400, tint: [0.30, 0, 0] }, { kind: 'rect', x0: -430, x1: 1500, z0: 140, z1: 1400, tint: [0.30, 0, 0] }],
      cam, name: { z: -900, y: S(0.46, 100, -900) }, label: { y: 1000 } };
  },

  /* RIYADH: a supertall with an inverted-A void at its crown, a tower crowned by a D sphere */
  riyadh(rng, o = {}) {
    const cam = fitCam({ pos: [-70, 42, 560], look: [10, 232, -90], fov: 42, push: [20, 8, -30] }, 520, 0.80), S = roofAt(cam), crowns = { A: 0.32, Am: 0.12, Dd: 0.30, Ds: 0.14, Dsm: 0.12 };
    const B = bander(rng, S, crowns, (x) => 0.35 + 0.65 * bell(x, 0, 520));
    let T = [];
    T.push(...B({ z: -250, s: [0.58, 0.40], pitch: 96, stagger: 10, w: [38, 50], wave: 4, cs: 0.88, layer: 1, x0: -700, x1: 760 }));
    T.push(...B({ z: -430, s: [0.50, 0.32], pitch: 110, stagger: 54, w: [40, 54], wave: 12, cs: 0.82, layer: 2, x0: -780, x1: 860 }));
    T.push(...B({ z: -140, s: [0.72, 0.60], pitch: 100, stagger: 0, w: [34, 44], wave: 0, cs: 0.9, layer: 0, x0: -620, x1: 700 }));
    const H = S(0.20, -20, -90) - 98;
    const supertall = { x: -20, z: -90, w: 76, d: 48, h: H, crown: null, wave: 0, hero: 'void', pitch: 4.4, layer: 0 };
    const sph = { x: 220, z: -60, w: 22, d: 22, crown: 'S', crownScale: 2.8, wave: 0, hero: 'sphere', pitch: 4.4, tiers: [{ f: 1, wf: 1 }], layer: 0 }; sph.h = S(0.30, 220, -60) - 1.0 * 22 * 2.8;
    T = clearOf(T, [supertall, { ...sph, w: 90, d: 60 }]); T = keepFrac(rng, T, thin(o));
    T.push(supertall, sph);
    return { towers: T, prisms: [{ geom: (k) => voidSlab(k, 76, 98, 54, 30), spec: { x: -20, y: H, z: -90, depth: 48, riseH: H, ease: 'slam', hero: 'voidslab', drop: 150, dropDur: 4, layer: 0 } }], water: [],
      hazes: [[1, 1], [0.88, 0.78], [0.72, 0.56]], cam, name: { z: -800, y: S(0.5, 10, -800) }, label: { y: 1000 } };
  },

  /* HONG KONG: a dense wall of slender towers climbing the hillside behind a harbour */
  hongkong(rng, o = {}) {
    const cam = fitCam({ pos: [-40, 58, 700], look: [8, 210, -220], fov: 42, push: [18, 4, -36] }, 740, 0.80), S = roofAt(cam), crowns = { A: 0.36, Am: 0.12, Dd: 0.30, Ds: 0.12, Dsm: 0.10 };
    const B = bander(rng, S, crowns, (x) => 0.35 + 0.65 * bell(x, 20, 480));
    const T = [];
    T.push(...B({ z: -40, s: [0.58, 0.40], pitch: 70, stagger: 0, w: [30, 42], wave: 0, cs: 0.92, layer: 0, x0: -700, x1: 760, pitchF: 3.6 }));
    T.push(...B({ z: -140, s: [0.50, 0.32], pitch: 76, stagger: 34, w: [28, 40], wave: 0, cs: 0.88, layer: 1, x0: -740, x1: 800, pitchF: 3.6 }));
    T.push(...B({ z: -260, s: [0.44, 0.26], pitch: 82, stagger: 12, w: [28, 38], wave: 8, cs: 0.84, layer: 1, x0: -800, x1: 860, pitchF: 3.6 }));
    T.push(...B({ z: -400, s: [0.40, 0.22], pitch: 90, stagger: 44, w: [30, 40], wave: 8, cs: 0.8, layer: 2, x0: -860, x1: 920, pitchF: 3.6 }));
    T.push(...B({ z: -560, s: [0.36, 0.18], pitch: 98, stagger: 8, w: [30, 42], wave: 8, cs: 0.76, layer: 3, x0: -900, x1: 980, pitchF: 3.6 }));
    return { towers: keepFrac(rng, T, thin(o)), prisms: [], hazes: [[1, 1], [0.90, 0.80], [0.76, 0.60], [0.60, 0.44]], water: [{ kind: 'rect', x0: -1500, x1: 1500, z0: 30, z1: 1400, tint: [0.30, 0, 0] }],
      cam, name: { z: -700, y: S(0.46, 0, -700) }, label: { y: 1000 } };
  },

  /* TOKYO: a dense field of towers and a slender mast carrying two D spheres */
  tokyo(rng, o = {}) {
    const cam = fitCam({ pos: [-85, 38, 590], look: [60, 250, -160], fov: 44, push: [24, 8, -32] }, 640, 0.80), S = roofAt(cam), crowns = { A: 0.34, Am: 0.14, Dd: 0.26, Ds: 0.14, Dsm: 0.12 };
    const B = bander(rng, S, crowns, (x) => 0.3 + 0.7 * bell(x, -150, 480));
    let T = [];
    T.push(...B({ z: -50, s: [0.60, 0.48], pitch: 80, stagger: 0, w: [34, 48], wave: 0, cs: 0.92, layer: 0, x0: -700, x1: 760, pitchF: 3.8 }));
    T.push(...B({ z: -170, s: [0.52, 0.38], pitch: 88, stagger: 40, w: [32, 46], wave: 0, cs: 0.88, layer: 1, x0: -760, x1: 800, pitchF: 3.8 }));
    T.push(...B({ z: -300, s: [0.46, 0.32], pitch: 96, stagger: 14, w: [32, 44], wave: 8, cs: 0.84, layer: 2, x0: -820, x1: 880, pitchF: 3.8 }));
    T.push(...B({ z: -450, s: [0.42, 0.28], pitch: 106, stagger: 52, w: [32, 44], wave: 8, cs: 0.8, layer: 3, x0: -880, x1: 940, pitchF: 3.8 }));
    const mx = 140, mz = -250, mast = { x: mx, z: mz, w: 20, d: 20, crown: 'A', crownScale: 1.0, wave: 0, hero: 'mast', pitch: 5, layer: 0 }; const mt = S(0.06, mx, mz); mast.h = mt - CR.A * 20;
    const deck = (yc, d) => ({ x: mx, z: mz, y: yc - d / 2, w: d, d, h: 0.2, crown: 'S', riseH: mast.h, wave: 0, hero: 'deck', layer: 0 });
    T = clearOf(T, [{ x: mx, z: mz, w: 80, d: 90 }]); T = keepFrac(rng, T, thin(o));
    T.push(mast, deck(mt * 0.58, 50), deck(mt * 0.79, 34));
    return { towers: T, prisms: [], hazes: [[1, 1], [0.88, 0.78], [0.72, 0.56], [0.58, 0.42]], water: [], cam, name: { z: -760, y: S(0.50, 20, -760) }, label: { y: 1000 } };
  },
};

/** a band generator over a roofline mapper S (see roofAt): c = {z, s:[a,b] screen fractions, pitch, stagger, w, wave, cs, layer, x0, x1, tiers, extra, accept, pitchF, crowns, prof} */
function bander(rng, S, crowns, prof) {
  return (c) => slots(rng, { x0: c.x0 ?? -640, x1: c.x1 ?? 760, pitch: c.pitch, stagger: c.stagger || 0, z: c.z, w: c.w, crowns: c.crowns || crowns, wave: c.wave || 0, zj: c.zj ?? 5,
    crownScale: c.cs ?? 0.9, layer: c.layer || 0, tiers: c.tiers, extra: c.extra, y: c.y, pitchF: c.pitchF, accept: c.accept,
    top: (x, r, T) => S(lerp(c.s[0], c.s[1], (c.prof || prof)(x) * (0.25 + 0.75 * r())), T.x, T.z) });
}

/* ───────────────────────────── build ───────────────────────────── */

/** Per-set atmospheric haze (the kit has only one exponential fog): final colour = mix(fogRed, colour, haze * mix(hazeLow, 1, smoothstep(0, 140 m, y))).
    haze 1 = crisp white, lower = dissolving into the brand red; hazeLow adds extra ground mist. Patches the kit's materials locally (kits are untouched). */
export function patchHaze(set, haze, hazeLow = 1) {
  const u = { uHaze: { value: haze }, uHazeLow: { value: hazeLow } };
  for (const m of set.meshes) {
    const mat = m.material;
    mat.uniforms.uHaze = u.uHaze; mat.uniforms.uHazeLow = u.uHazeLow;
    mat.fragmentShader = mat.fragmentShader.replace('void main() {', 'uniform float uHaze; uniform float uHazeLow;\nvoid main() {')
      .replace('outColor = vec4(min(col, vec3(1.0)), 1.0);', 'col = mix(uFogColor, col, uHaze * mix(uHazeLow, 1.0, smoothstep(0.0, 140.0, vWorld.y)));\n  outColor = vec4(min(col, vec3(1.0)), 1.0);');
    mat.needsUpdate = true;
  }
  return u;
}

/** Builds one city: {group, sets[], water[], towers, ...}. hit = frame its main wave's crowns land. Towers are split into haze LAYERS (def.hazes[layer] = [haze, hazeLow]). */
export function buildCity(kits, name, { hit = 0, seed = name, lod = 0, shadow = true, thinF = 1, dropDur = 4, durRange = [6, 9] } = {}) {
  const rng = makeRng('s2:' + seed);
  const def = CITIES[name](rng, { thin: thinF });
  const trng = makeRng('s2t:' + seed);
  timeTowers(def.towers, { hit, rng: trng, dropDur, dur: durRange });
  const nL = Math.max(1, ...def.towers.map((T) => (T.layer || 0) + 1), ...def.prisms.map((P) => (P.spec.layer || 0) + 1));
  const sets = [], group = new THREE.Group(); group.name = 'city:' + name;
  const crownSize = kits.logo.crownSize;
  for (let L = 0; L < nL; L++) {
    const set = new kits.towers.TowerSet({ lod, shadow, name: 'city:' + name + ':' + L });
    for (const T of def.towers) if ((T.layer || 0) === L) emitTower(set, T, crownSize);
    for (const P of def.prisms) if ((P.spec.layer || 0) === L) {
      const s = { ...P.spec }; const Ld = hit + (s.wave || 0), dur = 8;
      s.t0 = Ld - dur; s.dur = dur; s.land = Ld; s.dropDur = s.dropDur ?? 4; s.pitch = 6;
      set.addPrism(P.geom(kits), s);
    }
    set.build();
    const hz = (def.hazes && def.hazes[L]) || [1, 1];
    patchHaze(set, hz[0], hz[1]);
    sets.push(set); group.add(set.group);
  }
  const water = def.water.map((w) => { const m = makeWaterFrom(kits, w); group.add(m); return m; });
  return { name, group, sets, set: sets[0], water, def, towers: def.towers, landings: () => sets.flatMap((st) => st.landings()) };
}

/* ───────────────────────────── small shared helpers ───────────────────────────── */

/** A huge name as a 3D type plane. Returns the plane plus the numbers needed to place it by BASELINE and fit it by ink size (world metres per texture px = k).
    The type material is patched locally with a GROUND MIST: below y0 the letters dissolve into the brand red, fully white above y1 (set per frame via mistU). */
export function makeName(kits, text, { lang, stretch = 75, track = -0.035, fog = 0.5, weight = 900, tint = [1, 1, 1] } = {}) {
  const T = kits.type, size = 512, opt = { size, weight, stretch, track, lang };
  const p = T.plane(text, { ...opt, fogAmount: fog, worldHeight: 100, tint });
  const m = T.measure(text, opt), pad = Math.round(size * 0.12);
  const mat = p.mesh.material, mistU = { y0: { value: 0 }, y1: { value: 1 }, lo: { value: 0.2 } };
  mat.uniforms.uMistY0 = mistU.y0; mat.uniforms.uMistY1 = mistU.y1; mat.uniforms.uMistLo = mistU.lo;
  mat.fragmentShader = mat.fragmentShader.replace('void main() {', 'uniform float uMistY0; uniform float uMistY1; uniform float uMistLo;\nvoid main() {')
    .replace('outColor = vec4(min(col, vec3(1.0)), a);', 'col = mix(uFogColor, col, mix(uMistLo, 1.0, smoothstep(uMistY0, uMistY1, vWorld.y)));\n  outColor = vec4(min(col, vec3(1.0)), a);');
  mat.needsUpdate = true;
  return { mesh: p.mesh, plane: p, mistU, texW: p.texW, texH: p.texH, k0: p.height / p.texH, inkW: m.width, inkH: m.ascent + m.descent, asc: m.ascent, desc: m.descent, baseT: pad + size * 0.86 };
}

/** world point -> [px, py] in 1920x1080 logical px using the engine's current 3D camera (valid inside overlay()) */
export function projectToScreen(ctx, v3, p) {
  const cam = ctx.engine.cam3; v3.set(p[0], p[1], p[2]).applyMatrix4(cam.matrixWorldInverse).applyMatrix4(cam.projectionMatrix);
  return [(v3.x * 0.5 + 0.5) * 1920, (1 - (v3.y * 0.5 + 0.5)) * 1080, v3.z];
}
export { EASE };
