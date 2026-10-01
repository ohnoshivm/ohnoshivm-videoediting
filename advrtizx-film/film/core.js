/* TRUE ANGLE · core.js — engine + design system. Plain JS, no dependencies.
   Everything is a pure function of the frame number. See BUILD_GUIDE.md. */
(function () {
'use strict';
const TA = (window.TA = {});
const W = 1920, H = 1080, FPS = 30, FRAMES = 1800;

/* ───────────────────────── 1. TOKENS ───────────────────────── */
const C = { RED: '#E80101', WHITE: '#FFFFFF', RED_40: '#F69999', RED_25: '#F9C0C0', RED_12: '#FCE0E0',
            RED_06: '#FEF0F0', WHITE_40: '#F16767' };
const LW = { ROPE: 4, PRIMARY: 4, DRAW: 3, DETAIL: 2, HAIR: 1.5 };            // screen px, never camera-scaled
const GRID = { M: 60, COLS: 32, ROWS: 18, SAFE: 120, LIVE: [120, 120, 1800, 960], HEAD_X: 120, CARD_X: 180, BASE: 12 };
const SIZES = [16, 18, 20, 24, 34, 52, 72, 88, 96, 160];
const TIME = { FPS, FRAMES, BPM: 120, BEAT: 15, BAR: 60, G3: 20, G4: 15, G5: 12, SAMPLES_PER_FRAME: 1600 };
const ACTS = [['I MEASURE', 0, 329], ['II MEANING', 330, 899], ['III THE DOOR', 900, 1349], ['IV THE MARK', 1350, 1799]];
const SPEC = {};  // treatment §4 — exact frame ranges, one-line descriptions, base background
[
  ['S01', 0, 119, 'Twelve Knots', 'I', 'WHITE', 'A slack rope of 13 knots draws on, then is pegged into a 3-4-5 triangle: 3 · 4 · 5 · 90°.'],
  ['S02', 120, 239, 'The Compass Proof', 'I', 'WHITE', 'The hypotenuse swings down as a compass arm, lands on the A’s right edge, and the true A is inked.'],
  ['S03', 240, 329, 'Spec Hatch', 'I', 'WHITE', 'The A fills with spec-sheet type as hatch, tickers, doubles, freezes, and collapses to the baseline.'],
  ['S04', 330, 449, 'The Fold', 'II', 'WHITE', 'The elevation folds flat on its baseline and the floor plan unfolds up from the same hinge.'],
  ['S05', 450, 539, 'Nobody Buys Square Feet', 'II', 'RED', 'Full red. One sentence in two voices: the measurement is set in the spec-sheet voice.'],
  ['S06', 540, 719, 'Sun Study', 'II', 'WHITE', 'A sun study crosses the bedroom bay; BEDROOM 14’-0” × 13’-2” flips into Sunday mornings.'],
  ['S07', 720, 899, 'Which Buyer', 'II', 'WHITE', 'One plan relabelled per buyer, per reason, per hour on a 3:4:5 grid, then the dive into the gap.'],
  ['S08', 900, 1019, 'The Door Is 9:16', 'III', 'RED', 'Inside the gap the slabs slide apart to an exact 9:16 door: the first door they open is 9:16.'],
  ['S09', 1020, 1169, 'Thumb-Stop', 'III', 'RED', 'A blurred feed of luxury clichés brakes hard on the one true ad: Sunday mornings face east.'],
  ['S10', 1170, 1349, 'The Stair', 'III', 'WHITE', 'The funnel as a 3:4 staircase from SEEN to KEYS, a door block, and a push through its slot.'],
  ['S11', 1350, 1499, 'The Plan Was the Mark', 'IV', 'WHITE', 'The full plan redraws, retracts, and its walls thicken until the apartment is the solid mark.'],
  ['S12', 1500, 1649, 'The True Angle', 'IV', 'WHITE', '53.13° is measured on the mark: every property has an angle, we find the true one.'],
  ['S13', 1650, 1799, 'Red Angle / End Card', 'IV', 'RED', 'A red field wipes at 53.13°, the mark turns white, and the AdvrtizX lockup sets.'],
].forEach(([id, start, end, name, act, bg, desc]) => { SPEC[id] = { id, start, end, name, act, bg, desc }; });

/* ───────────────────────── 2. TIME + EASING ───────────────────────── */
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const mix = (a, b, t) => (Array.isArray(a) ? a.map((v, i) => mix(v, b[i], t)) : lerp(a, b, t));
const LINEAR = (t) => clamp(t);

/** cubic-bezier(x1,y1,x2,y2) solved properly: Newton on x(t), bisection fallback. */
function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (t) => ((ax * t + bx) * t + cx) * t, sy = (t) => ((ay * t + by) * t + cy) * t;
  const dx = (t) => (3 * ax * t + 2 * bx) * t + cx;
  function solve(x) {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const e = sx(t) - x; if (Math.abs(e) < 1e-7) return t;
      const d = dx(t); if (Math.abs(d) < 1e-6) break;
      t -= e / d; if (t < 0 || t > 1) break;
    }
    let lo = 0, hi = 1; t = x;
    for (let i = 0; i < 50; i++) { const v = sx(t); if (Math.abs(v - x) < 1e-7) break; if (v < x) lo = t; else hi = t; t = (lo + hi) / 2; }
    return t;
  }
  const f = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : sy(solve(x)));
  f.css = `cubic-bezier(${x1},${y1},${x2},${y2})`;
  return f;
}
const EASE = {
  DRAFT: bezier(0.65, 0, 0.35, 1),   // line draw-on/off, camera reframes <= 1.5s
  SET: bezier(0.16, 1, 0.3, 1),      // type/objects landing, 8–14f, no overshoot
  LIFT: bezier(0.7, 0, 0.84, 0),     // exits, pushes into openings
  HINGE: bezier(0.83, 0, 0.17, 1),   // folds, swings, slabs, compass
  BRAKE: bezier(0.05, 0.7, 0.1, 1),  // braked wipes/stops
  SCROLL: bezier(0.7, 0, 0.05, 1),   // S09 feed
  TAUT: bezier(0.3, 0, 0, 1),        // rope pulling tight
  SURVEY: LINEAR,                    // constant drifts
};
/** inverse of a monotone ease: x such that ease(x) = y (e.g. DRAFT⁻¹(i/12) for knot timing). */
function easeInv(ease, y) { let lo = 0, hi = 1; for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; if (ease(m) < y) lo = m; else hi = m; } return (lo + hi) / 2; }
/** eased 0..1 progress of frame f through [a,b]. f<=a → 0, f>=b → 1. */
function prog(f, a, b, ease = LINEAR) { if (b <= a) return f >= a ? 1 : 0; return ease(clamp((f - a) / (b - a))); }
/** tween(f, [a,b], [from,to], ease) — numbers or arrays. */
function tween(f, range, vals, ease) { return mix(vals[0], vals[1], prog(f, range[0], range[1], ease)); }
/** log-space tween for scales/zooms (treatment §2.6: ease applied to log(scale)). */
function logTween(f, range, vals, ease) { return Math.exp(lerp(Math.log(vals[0]), Math.log(vals[1]), prog(f, range[0], range[1], ease))); }
/** piecewise keys: [[f0,v0],[f1,v1,ease],...] — ease on a key applies to the segment arriving at it. */
function keys(f, ks) {
  if (f <= ks[0][0]) return ks[0][1];
  for (let i = 1; i < ks.length; i++) if (f <= ks[i][0]) return tween(f, [ks[i - 1][0], ks[i][0]], [ks[i - 1][1], ks[i][1]], ks[i][2]);
  return ks[ks.length - 1][1];
}
/** progress of item i in a staggered set: range shifted by i*step. */
function stagger(f, range, i, step, ease) { return prog(f, range[0] + i * step, range[1] + i * step, ease); }
const beat = (n) => n * 15, bar = (n) => n * 60;
const onGrid = (f, step, origin = 0) => (f - origin) % step === 0;

/** seeded PRNG (mulberry32) and a stateless hash → [0,1). Never use Math.random. */
function prng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function hash01(a, b = 0) { let h = Math.imul((a | 0) ^ 0x9E3779B9, 0x85EBCA6B) ^ Math.imul((b | 0) + 0x632BE5AB, 0xC2B2AE35); h ^= h >>> 16; h = Math.imul(h, 0x7FEB352D); h ^= h >>> 15; h = Math.imul(h, 0x846CA68B); h ^= h >>> 16; return (h >>> 0) / 4294967296; }

/* ───────────────────────── 3. GEOMETRY ───────────────────────── */
const V = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1]], sub: (a, b) => [a[0] - b[0], a[1] - b[1]], mul: (a, k) => [a[0] * k, a[1] * k],
  len: (a) => Math.hypot(a[0], a[1]), dist: (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]),
  norm: (a) => { const l = Math.hypot(a[0], a[1]) || 1; return [a[0] / l, a[1] / l]; },
  rot: (a, r) => [a[0] * Math.cos(r) - a[1] * Math.sin(r), a[0] * Math.sin(r) + a[1] * Math.cos(r)],
  lerp: (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)],
  polar: (c, r, deg) => [c[0] + r * Math.cos(deg * Math.PI / 180), c[1] + r * Math.sin(deg * Math.PI / 180)],
};
const DEG = Math.PI / 180;
/** 3-4-5. Screen y is down, so the A's slope runs up-right: dir (0.6,-0.8). */
const SLOPE = { run: 3, rise: 4, hyp: 5, deg: Math.atan2(4, 3) / DEG, rad: Math.atan2(4, 3), comp: 90 - Math.atan2(4, 3) / DEG,
                dir: [0.6, -0.8], normal: [0.8, 0.6] /* into the A */ };
/** 3-4-5 triangle on unit u (px or MU) with right angle to the right of V0: {V0, V3 (90°), V7 (apex)}. */
function tri345(V0, u) { return { V0, V3: [V0[0] + 3 * u, V0[1]], V7: [V0[0] + 3 * u, V0[1] - 4 * u] }; }

/* Mark (MU, mark height 100, origin = sharp BL vertex of A at (0,100), y down). Source: assets/mark.svg */
const MARK = {
  PATH_A: 'M80.4 0 L125.5 0 L125.5 100 L84.407 100 A21.2 21.2 0 0 0 52.393 100 L15 100 A7.5 7.5 0 0 1 9 88 L71.76 4.32 A10.8 10.8 0 0 1 80.4 0 Z',
  PATH_D: 'M133.1 0 L177.2 0 A50 50 0 0 1 177.2 100 L133.1 100 Z',
  V0: [0, 100], V7: [75, 0], TR: [125.5, 0], BR: [125.5, 100],
  A_RIGHT: 125.5, GAP: 7.6, D_LEFT: 133.1, D_RECT_RIGHT: 177.2, D_C: [177.2, 50], D_R: 50, RIGHT: 227.2,
  NOTCH: { cx: 68.4, cy: 113.9, r: 21.2 }, FILLET: { BL: 7.5, TL: 10.8 }, BBOX: [7.5, 0, 227.2, 100], U: 25,
  GAP_C: [129.3, 50],
};
/** A as path segments. Options: filletBL, filletTL (MU; 0 = sharp), notch (bool), notchCx/Cy/R, dx (MU shift). */
function markA(o = {}) {
  const rBL = o.filletBL ?? 7.5, rTL = o.filletTL ?? 10.8, dx = o.aDx ?? 0;
  const dBL = 2 * rBL;          // tangent distance at the 53.13° corner: r / tan(26.565°) = 2r
  const dTL = rTL / 2;          // at the 126.87° corner: r / tan(63.435°) = r/2
  const s = [['M', 75 + dTL, 0], ['L', 125.5, 0], ['L', 125.5, 100]];
  if (o.notch ?? true) {
    const cx = o.notchCx ?? 68.4, cy = o.notchCy ?? 113.9, r = o.notchR ?? 21.2, dy = cy - 100;
    if (r > Math.abs(dy) && r > 0) { const hc = Math.sqrt(r * r - dy * dy); s.push(['L', cx + hc, 100], ['A', r, cy < 100 ? 1 : 0, 0, cx - hc, 100]); }
  }
  s.push(['L', dBL, 100]);
  if (rBL > 1e-6) s.push(['A', rBL, 0, 1, 0.6 * dBL, 100 - 0.8 * dBL]);
  s.push(['L', 75 - 0.6 * dTL, 0.8 * dTL]);
  if (rTL > 1e-6) s.push(['A', rTL, 0, 1, 75 + dTL, 0]);
  s.push(['Z']);
  return dx ? shiftSegs(s, dx, 0) : s;
}
/** D as path segments. Options: gap (MU, default 7.6 — moves D), dDx (extra MU shift). */
function markD(o = {}) {
  const x0 = 125.5 + (o.gap ?? 7.6) + (o.dDx ?? 0), x1 = x0 + 44.1;
  return [['M', x0, 0], ['L', x1, 0], ['A', 50, 0, 1, x1, 100], ['L', x0, 100], ['Z']];
}
function shiftSegs(segs, dx, dy) { return segs.map((s) => s[0] === 'A' ? ['A', s[1], s[2], s[3], s[4] + dx, s[5] + dy] : s[0] === 'Z' ? s : [s[0], s[1] + dx, s[2] + dy]); }

/* Path segments: ['M',x,y] ['L',x,y] ['A',r,large,sweep,x,y] (circular) ['Z'] — absolute coords. */
const fmt = (v) => +(+v).toFixed(3);
function parseD(d) {
  const tok = d.match(/[MLHVAZmlhvaz]|-?\d*\.?\d+(?:e-?\d+)?/g); const out = []; let i = 0, cmd = '', cur = [0, 0], st = [0, 0];
  const n = () => +tok[i++];
  while (i < tok.length) {
    if (/[A-Za-z]/.test(tok[i])) cmd = tok[i++];
    switch (cmd) {
      case 'M': cur = [n(), n()]; st = cur; out.push(['M', ...cur]); cmd = 'L'; break;
      case 'L': cur = [n(), n()]; out.push(['L', ...cur]); break;
      case 'H': cur = [n(), cur[1]]; out.push(['L', ...cur]); break;
      case 'V': cur = [cur[0], n()]; out.push(['L', ...cur]); break;
      case 'A': { const r = n(); n(); n(); const la = n(), sw = n(); cur = [n(), n()]; out.push(['A', r, la, sw, ...cur]); break; }
      case 'Z': case 'z': out.push(['Z']); cur = st; break;
      default: throw new Error('parseD: unsupported command ' + cmd + ' (absolute M L H V A Z only)');
    }
  }
  return out;
}
function segsToD(segs, cam) {
  const P = cam ? (x, y) => cam.apply([x, y]) : (x, y) => [x, y], k = cam ? cam.s : 1; let d = '';
  for (const s of segs) {
    if (s[0] === 'M' || s[0] === 'L') { const q = P(s[1], s[2]); d += s[0] + fmt(q[0]) + ' ' + fmt(q[1]); }
    else if (s[0] === 'A') { const q = P(s[4], s[5]), r = fmt(s[1] * k); d += `A${r} ${r} 0 ${s[2]} ${s[3]} ${fmt(q[0])} ${fmt(q[1])}`; }
    else if (s[0] === 'Z') d += 'Z';
  }
  return d;
}
/** SVG arc endpoint → centre (circle). Returns {c, r, a0, da} (radians, y-down: +da = clockwise = sweep 1). */
function arcCenter(p0, p1, r, large, sweep) {
  const x1p = (p0[0] - p1[0]) / 2, y1p = (p0[1] - p1[1]) / 2, d2 = x1p * x1p + y1p * y1p;
  if (r * r < d2) r = Math.sqrt(d2);
  const sign = large !== sweep ? 1 : -1, coef = sign * Math.sqrt(Math.max(0, (r * r - d2) / (d2 || 1e-12)));
  const cxp = coef * y1p, cyp = -coef * x1p, c = [cxp + (p0[0] + p1[0]) / 2, cyp + (p0[1] + p1[1]) / 2];
  const a0 = Math.atan2((y1p - cyp) / r, (x1p - cxp) / r), a1 = Math.atan2((-y1p - cyp) / r, (-x1p - cxp) / r);
  let da = a1 - a0; if (sweep && da < 0) da += 2 * Math.PI; if (!sweep && da > 0) da -= 2 * Math.PI;
  return { c, r, a0, da };
}
function prims(segs) {
  const out = []; let cur = [0, 0], st = [0, 0];
  for (const s of segs) {
    if (s[0] === 'M') { cur = [s[1], s[2]]; st = cur; out.push({ t: 'M', p: cur, len: 0 }); }
    else if (s[0] === 'L') { const p = [s[1], s[2]]; out.push({ t: 'L', p0: cur, p1: p, len: V.dist(cur, p) }); cur = p; }
    else if (s[0] === 'A') { const p = [s[4], s[5]], a = arcCenter(cur, p, s[1], s[2], s[3]); out.push({ t: 'A', p0: cur, p1: p, ...a, len: Math.abs(a.da) * a.r }); cur = p; }
    else if (s[0] === 'Z') { out.push({ t: 'L', p0: cur, p1: st, len: V.dist(cur, st), z: true }); cur = st; }
  }
  return out;
}
const primAt = (q, u) => q.t === 'L' ? V.lerp(q.p0, q.p1, u) : V.polar(q.c, q.r, (q.a0 + q.da * u) / DEG);
function pathLength(segs) { return prims(segs).reduce((a, q) => a + q.len, 0); }
/** point + tangent angle (rad) at fraction t of total length. */
function pointAt(segs, t) {
  const ps = prims(segs), total = ps.reduce((a, q) => a + q.len, 0); let L = clamp(t) * total;
  for (const q of ps) { if (!q.len) continue; if (L <= q.len) { const u = L / q.len; const p = primAt(q, u);
    const ang = q.t === 'L' ? Math.atan2(q.p1[1] - q.p0[1], q.p1[0] - q.p0[0]) : q.a0 + q.da * u + (q.da > 0 ? Math.PI / 2 : -Math.PI / 2);
    return { p, ang }; } L -= q.len; }
  const last = ps[ps.length - 1]; return { p: last.p1 || last.p, ang: 0 };
}
/** the part of a path between length fractions t0..t1 (stroke draw-on/off without dash tricks). */
function trimSegs(segs, t0, t1) {
  t0 = clamp(t0); t1 = clamp(t1); if (t1 <= t0) return [];
  if (t0 <= 0 && t1 >= 1) return segs;
  const ps = prims(segs), total = ps.reduce((a, q) => a + q.len, 0), L0 = t0 * total, L1 = t1 * total;
  const out = []; let acc = 0, pen = null;
  for (const q of ps) {
    if (q.t === 'M') { pen = null; continue; }
    const a = acc, b = acc + q.len; acc = b;
    if (b <= L0 || a >= L1 || !q.len) continue;
    const u0 = Math.max(0, (L0 - a) / q.len), u1 = Math.min(1, (L1 - a) / q.len), p0 = primAt(q, u0), p1 = primAt(q, u1);
    if (!pen || V.dist(pen, p0) > 1e-6) out.push(['M', p0[0], p0[1]]);
    if (q.t === 'L') out.push(['L', p1[0], p1[1]]);
    else { const dd = q.da * (u1 - u0); out.push(['A', q.r, Math.abs(dd) > Math.PI ? 1 : 0, dd > 0 ? 1 : 0, p1[0], p1[1]]); }
    pen = p1;
  }
  return out;
}
/** builders (MU or px — they are just numbers) */
function arcSegs(c, r, a0deg, a1deg) {
  const p0 = V.polar(c, r, a0deg), out = [['M', ...p0]], span = a1deg - a0deg, n = Math.ceil(Math.abs(span) / 179.9) || 1;
  for (let i = 1; i <= n; i++) { const p = V.polar(c, r, a0deg + span * i / n); out.push(['A', r, 0, span > 0 ? 1 : 0, ...p]); }
  return out;
}
function circleSegs(c, r, startDeg = -90) { return [...arcSegs(c, r, startDeg, startDeg + 360), ['Z']]; }
function polySegs(pts, closed = false) { const s = pts.map((p, i) => [i ? 'L' : 'M', p[0], p[1]]); if (closed) s.push(['Z']); return s; }
function lineSegs(a, b) { return [['M', ...a], ['L', ...b]]; }

/* Camera: cam(s, W→P[, rot]) — screen = P + s·R(rot)·(world − W). Treatment notation cam(s, W→P). */
function cam(s, Wp = [0, 0], Pp = [960, 540], rot = 0) {
  const co = Math.cos(rot), si = Math.sin(rot);
  return {
    s, W: Wp, P: Pp, rot,
    apply: (p) => { const x = p[0] - Wp[0], y = p[1] - Wp[1]; return [Pp[0] + s * (co * x - si * y), Pp[1] + s * (si * x + co * y)]; },
    inv: (q) => { const x = (q[0] - Pp[0]) / s, y = (q[1] - Pp[1]) / s; return [Wp[0] + co * x + si * y, Wp[1] - si * x + co * y]; },
    len: (v) => v * s,
    matrix: () => { const a = s * co, b = s * si, c = -s * si, d = s * co; return `matrix(${fmt(a)} ${fmt(b)} ${fmt(c)} ${fmt(d)} ${fmt(Pp[0] - (a * Wp[0] + c * Wp[1]))} ${fmt(Pp[1] - (b * Wp[0] + d * Wp[1]))})`; },
  };
}
const samePt = (a, b) => Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;
/** interpolate cameras: scale in log space; same W → P moves; same P → W moves; else a.W travels linearly on screen. */
function camLerp(a, b, e) {
  const s = Math.exp(lerp(Math.log(a.s), Math.log(b.s), e)), rot = lerp(a.rot, b.rot, e);
  if (samePt(a.W, b.W)) return cam(s, a.W, V.lerp(a.P, b.P, e), rot);
  if (samePt(a.P, b.P)) return cam(s, V.lerp(a.W, b.W, e), a.P, rot);
  return cam(s, a.W, V.lerp(a.P, b.apply(a.W), e), rot);
}
/** camTween(f, [a,b], camA, camB, ease) */
function camTween(f, range, a, b, ease) { return camLerp(a, b, prog(f, range[0], range[1], ease)); }
/** screen-space zoom k about a screen point (e.g. the S02 SURVEY push 1.00 → 1.03 about (961,540)). */
function camZoom(c, k, about = [960, 540]) { return cam(c.s * k, c.W, [about[0] + k * (c.P[0] - about[0]), about[1] + k * (c.P[1] - about[1])], c.rot); }
const CAMS = {
  ACT1: cam(4.8, [0, 100], [660, 780]),             // S01–S04 construction camera (A centred, x 961)
  PLAN_WIDE: cam(4.8, [62.75, 50], [960, 540]),     // S04 f370 start (≈ACT1, 1.2px left)
  PLAN: cam(6.4, [117.35, 50], [960, 540]),         // S04 f415 / S11 f1350
  SUN: cam(12, [180, 50], [960, 540]),              // S06 f540
  BUYER: cam(5.4, [0, 0], [573.1, 420]),            // S06 f705 → S07
  DOOR: cam(30, [129.3, 50], [960, 540]),           // S07 f900 end of dive / S08 slabs
  HERO: cam(3.6, [117.35, 50], [960, 480]),         // S11 f1455 → S13
};

/** The one 3D move (S04): rotateX about a horizontal hinge line, perspective p, vanishing point vp.
    fold.css(deg) → CSS transform for a layer (transform-origin 0 0). fold.project(pt, deg) → exact screen point.
    +deg tilts the part above the hinge AWAY from the viewer. */
const fold = {
  css(deg, o = {}) { const h = o.hingeY ?? 780, p = o.perspective ?? 2000, vp = o.vp ?? [960, 540];
    return `translate(${vp[0]}px,${vp[1]}px) perspective(${p}px) translate(${-vp[0]}px,${-vp[1]}px) translateY(${h}px) rotateX(${deg}deg) translateY(${-h}px)`; },
  project(pt, deg, o = {}) { const h = o.hingeY ?? 780, p = o.perspective ?? 2000, vp = o.vp ?? [960, 540];
    const dy = pt[1] - h, Y = h + dy * Math.cos(deg * DEG), Z = dy * Math.sin(deg * DEG), k = p / (p - Z);
    return [vp[0] + (pt[0] - vp[0]) * k, vp[1] + (Y - vp[1]) * k]; },
  segs(segs, deg, o) { // projects a path (arcs flattened to 4° polylines) — for drawing folded linework crisply
    const out = []; for (const q of prims(segs)) {
      if (q.t === 'M') { out.push(['M', ...fold.project(q.p, deg, o)]); continue; }
      const n = q.t === 'A' ? Math.max(2, Math.ceil(Math.abs(q.da) / (4 * DEG))) : 1;
      for (let i = 1; i <= n; i++) out.push(['L', ...fold.project(primAt(q, i / n), deg, o)]);
    } return out; },
};

/* ───────────────────────── 4. SVG MARKUP ───────────────────────── */
const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
function attrs(o) { let s = ''; for (const k in o) { const v = o[k]; if (v === undefined || v === null || v === false) continue; s += ` ${k}="${typeof v === 'number' ? fmt(v) : esc(v)}"`; } return s; }
let _pref = 'x', _n = 0;
/** deterministic unique id for clipPaths/masks inside the current shot render. */
const uid = (name = 'id') => `${_pref}-${name}-${_n++}`;
/** path(segs|d, {cam, draw, from, stroke, sw, fill, cap, join, dash, op, clip, mask, extra}) */
function path(segs, o = {}) {
  if (typeof segs === 'string') segs = parseD(segs);
  if (o.draw !== undefined || o.from !== undefined) { const t1 = o.draw ?? 1, t0 = o.from ?? 0; if (t1 <= t0) return ''; segs = trimSegs(segs, t0, t1); }
  if (!segs.length) return '';
  const fill = o.fill ?? 'none', stroke = o.stroke ?? (o.fill ? 'none' : C.RED);
  return `<path${attrs({ d: segsToD(segs, o.cam), fill, stroke, 'stroke-width': stroke === 'none' ? null : (o.sw ?? LW.HAIR),
    'stroke-linecap': o.cap ?? 'round', 'stroke-linejoin': o.join ?? 'round', 'stroke-dasharray': o.dash ? o.dash.join(' ') : null,
    'stroke-dashoffset': o.dashOffset, opacity: o.op, 'clip-path': o.clip ? `url(#${o.clip})` : null, mask: o.mask ? `url(#${o.mask})` : null })}${o.extra || ''}/>`;
}
const line = (a, b, o) => path(lineSegs(a, b), o);
const poly = (pts, o = {}) => path(polySegs(pts, o.closed ?? !!o.fill), o);
function circle(c, r, o = {}) { const k = o.cam ? o.cam.s : 1, p = o.cam ? o.cam.apply(c) : c;
  if (o.draw !== undefined) return path(circleSegs(c, r), o);
  const fill = o.fill ?? 'none', stroke = o.stroke ?? (o.fill ? 'none' : C.RED);
  return `<circle${attrs({ cx: p[0], cy: p[1], r: r * k, fill, stroke, 'stroke-width': stroke === 'none' ? null : (o.sw ?? LW.HAIR), opacity: o.op, 'stroke-dasharray': o.dash ? o.dash.join(' ') : null })}/>`; }
const rect = (x, y, w, h, fill = C.RED, extra = '') => `<rect${attrs({ x, y, width: w, height: h, fill })}${extra}/>`;
function g(inner, o = {}) { if (!inner) return ''; return `<g${attrs({ transform: o.transform, opacity: o.op, 'clip-path': o.clip ? `url(#${o.clip})` : null, mask: o.mask ? `url(#${o.mask})` : null })}>${inner}</g>`; }
/** clip the inner markup to a path (segs or d) — returns markup with its own clipPath def. */
function clipTo(inner, segs, cam) { if (!inner) return ''; const id = uid('clip'); return `<clipPath id="${id}"><path d="${typeof segs === 'string' ? segs : segsToD(segs, cam)}"/></clipPath><g clip-path="url(#${id})">${inner}</g>`; }

/* ───────────────────────── 5. TYPE: three voices (+ cliché) ───────────────────────── */
const VOICE = {
  measure:     { family: "'IBM Plex Mono'", weight: 500, style: 'normal', track: 0.08, small: 0.12, feat: '"tnum" 1' },
  measureLong: { family: "'IBM Plex Mono'", weight: 400, style: 'normal', track: 0.08, small: 0.12, feat: '"tnum" 1' },
  meaning:     { family: "'Instrument Serif'", weight: 400, style: 'italic', track: -0.01 },
  authority:   { family: "'Archivo'", weight: 700, style: 'normal', stretch: 112, track: -0.02 },
  card:        { family: "'Archivo'", weight: 800, style: 'normal', stretch: 112, track: -0.02 },   // S05 red card
  wordmark:    { family: "'Archivo'", weight: 700, style: 'normal', stretch: 112, track: -0.015 },
  cliche:      { family: "'Playfair Display'", weight: 400, style: 'normal', track: 0.2 },             // S09 only
};
const trackOf = (v, size, o = {}) => o.track ?? (v.small !== undefined && size <= 18 ? v.small : v.track);
function fontCSS(voice, size, o = {}) {
  const v = VOICE[voice] || VOICE.measure, tr = trackOf(v, size, o);
  return `font-family:${v.family};font-size:${fmt(size)}px;font-weight:${o.weight ?? v.weight};font-style:${v.style};letter-spacing:${fmt(tr * size)}px` +
    (v.stretch ? `;font-stretch:${o.stretch ?? v.stretch}%` : '') + (v.feat ? `;font-feature-settings:${v.feat}` : '');
}
/** text(content, {x, y (baseline), voice, size, anchor:'start'|'middle'|'end', fill, op, rotate, track, weight})
    content: string, or runs [{t, voice?, size?, fill?, weight?, track?}, ...] for mid-sentence voice switches. */
function text(content, o = {}) {
  const runs = Array.isArray(content) ? content : [{ t: content }];
  const base = { voice: o.voice ?? 'measure', size: o.size ?? 18, fill: o.fill ?? C.RED };
  const last = { ...base, ...runs[runs.length - 1] }, lastTrack = trackOf(VOICE[last.voice], last.size, last) * last.size;
  const anchor = o.anchor ?? 'start';
  const x = (o.x ?? 0) + (anchor === 'end' ? lastTrack : anchor === 'middle' ? lastTrack / 2 : 0); // cancel trailing letter-spacing
  const inner = runs.map((r) => { const q = { ...base, ...r }; return `<tspan style="${fontCSS(q.voice, q.size, q)}" fill="${q.fill}">${esc(q.t)}</tspan>`; }).join('');
  return `<text${attrs({ x, y: o.y ?? 0, 'text-anchor': anchor, opacity: o.op, transform: o.rotate ? `rotate(${o.rotate} ${fmt(o.x ?? 0)} ${fmt(o.y ?? 0)})` : null })} xml:space="preserve">${inner}</text>`;
}
let _measureSvg = null; const _mcache = new Map();
/** advance width in px (excluding the trailing letter-spacing) of a string or runs. Fonts must be loaded (after TA.ready). */
function measure(content, o = {}) {
  const key = JSON.stringify([content, o.voice, o.size, o.track, o.weight]); if (_mcache.has(key)) return _mcache.get(key);
  if (!_measureSvg) { _measureSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); _measureSvg.setAttribute('style', 'position:absolute;left:-9999px;top:0;width:10px;height:10px;visibility:hidden'); document.body.appendChild(_measureSvg); }
  _measureSvg.innerHTML = text(content, { ...o, x: 0, y: 100, anchor: 'start' });
  const runs = Array.isArray(content) ? content : [{ t: content }], last = { voice: o.voice ?? 'measure', size: o.size ?? 18, ...runs[runs.length - 1] };
  const w = _measureSvg.firstChild.getComputedTextLength() - trackOf(VOICE[last.voice], last.size, last) * last.size;
  _mcache.set(key, w); return w;
}
/** SET via a mask rising from the baseline: content slides up from below a clip box. */
function rise(inner, o) {
  const p = o.p ?? 1; if (p <= 0 || !inner) return ''; if (p >= 1 && !o.keepClip) return inner;
  const size = o.size ?? 72, top = o.baseline - size * 1.15, bot = o.baseline + size * 0.32, id = uid('rise');
  return `<clipPath id="${id}"><rect${attrs({ x: o.x0 ?? -10, y: top, width: (o.x1 ?? W + 10) - (o.x0 ?? -10), height: bot - top })}/></clipPath>` +
    `<g clip-path="url(#${id})"><g transform="translate(0 ${fmt((1 - p) * (bot - top))})">${inner}</g></g>`;
}
/** exit (≤6f): move dy px and fade (the only permitted opacity, rule 2b). p: 0 → 1. */
function exit(inner, p, dy = -24) { if (p >= 1 || !inner) return ''; if (p <= 0) return inner; return `<g transform="translate(0 ${fmt(dy * p)})" opacity="${fmt(1 - p)}">${inner}</g>`; }

/* ───────────────────────── 6. PRIMITIVES ───────────────────────── */
/** drawMark({cam, parts:'AD', fill, stroke, sw, draw, from, poche, pocheColor, op, filletBL, filletTL, notch, notchCx, notchCy, notchR, gap, aDx, dDx})
    fill: colour or 'none' (default RED when no stroke). stroke+sw: outline in screen px; draw/from: stroke trim 0..1.
    poche: wall stroke width in MU clipped to the mark (4.8 → 2.4 MU visible wall; 250 → solid). */
function drawMark(o = {}) {
  const c = o.cam || CAMS.HERO, parts = o.parts ?? 'AD', list = [];
  if (parts.includes('A')) list.push(markA(o)); if (parts.includes('D')) list.push(markD(o));
  const all = [].concat(...list), d = segsToD(all, c); let out = '';
  const fill = o.fill ?? (o.stroke || o.poche ? 'none' : C.RED);
  if (fill !== 'none') out += `<path d="${d}" fill="${fill}"${o.op != null ? ` opacity="${o.op}"` : ''}/>`;
  if (o.poche) { const id = uid('mark'); out += `<clipPath id="${id}"><path d="${d}"/></clipPath><path d="${d}" fill="none" stroke="${o.pocheColor ?? C.RED}" stroke-width="${fmt(o.poche * c.s)}" stroke-linejoin="miter" clip-path="url(#${id})"/>`; }
  if (o.stroke) for (const s of list) out += path(s, { cam: c, stroke: o.stroke, sw: o.sw ?? LW.DRAW, draw: o.draw, from: o.from, cap: o.cap ?? 'round', join: o.join ?? 'round', op: o.op });
  return out;
}
/** dimension string between screen points a→b. offset (px) is to the RIGHT of a→b (a→b left-to-right → below).
    {label, draw (0..1), size 18, voice 'measure', ink RED, knock WHITE (6px knockout), ext 8, tick 12, gap 6} */
function dimString(a, b, o = {}) {
  const p = o.draw ?? 1; if (p <= 0) return '';
  const ink = o.ink ?? C.RED, dir = V.norm(V.sub(b, a)), n = [-dir[1], dir[0]], off = o.offset ?? 24, ext = o.ext ?? 8, gap = o.gap ?? 6;
  const a2 = V.add(a, V.mul(n, off)), b2 = V.add(b, V.mul(n, off)), sg = Math.sign(off) || 1;
  const wit = (q) => lineSegs(V.add(q, V.mul(n, gap * sg)), V.add(q, V.mul(n, off + ext * sg)));
  const st = { stroke: ink, sw: o.sw ?? LW.HAIR, cap: 'butt', draw: p };
  let out = path(wit(a), st) + path(wit(b), st) + path(lineSegs(V.sub(a2, V.mul(dir, ext)), V.add(b2, V.mul(dir, ext))), st);
  let ang = Math.atan2(dir[1], dir[0]) / DEG; if (ang > 90) ang -= 180; if (ang <= -90) ang += 180;   // reading frame of the dim
  const sl = V.mul([Math.cos((ang - 45) * DEG), Math.sin((ang - 45) * DEG)], (o.tick ?? 12) / 2);     // '/' in that frame
  const tick = (q) => line(V.sub(q, sl), V.add(q, sl), { stroke: ink, sw: LW.DETAIL, cap: 'butt' });
  out += tick(a2); if (p >= 1) out += tick(b2);
  if (o.label && p >= 0.5) {
    const size = o.size ?? 18, voice = o.voice ?? 'measure', m = V.lerp(a2, b2, 0.5);
    const w = measure(o.label, { voice, size }) + 12, h = size * 0.7 + 12;
    out += `<g transform="translate(${fmt(m[0])} ${fmt(m[1])}) rotate(${fmt(ang)})">` + (o.knock !== false ? rect(-w / 2, -h / 2, w, h, o.knock ?? C.WHITE) : '') +
      text(o.label, { x: 0, y: size * 0.35, anchor: 'middle', voice, size, fill: ink }) + '</g>';
  }
  return out;
}
/** drafting grid: 9px crosses at module intersections, 1px RED at 14% alpha. scaleFn(i,j,x,y) → 0..1 (pop-on/out). */
function draftGrid(scaleFn, o = {}) {
  let d = '';
  for (let i = 1; i < GRID.COLS; i++) for (let j = 1; j < GRID.ROWS; j++) {
    const x = i * 60 + 0.5, y = j * 60 + 0.5, k = scaleFn ? clamp(scaleFn(i, j, x, y)) : 1; if (k <= 0) continue;
    const r = 4.5 * k; d += `M${fmt(x - r)} ${y}h${fmt(2 * r)}M${x} ${fmt(y - r)}v${fmt(2 * r)}`;
  }
  return d ? `<path d="${d}" fill="none" stroke="${o.ink ?? C.RED}" stroke-opacity="${o.alpha ?? 0.14}" stroke-width="1"${o.transform ? ` transform="${o.transform}"` : ''}/>` : '';
}
/** grid "prints at the logo's angle": delay ∝ projection of (x,y) onto the slope normal, 0..1 across the frame. */
const slopeOrder = (x, y) => clamp((x * 0.8 + y * 0.6) / (W * 0.8 + H * 0.6));
/** slope-angle wipe (S13): leading edge parallel to the A slope (top leads), travelling `travel` px left→right.
    Returns {x: edge x at the bottom of frame, d: path of the region already passed}. */
function slopeWipe(p, o = {}) {
  const travel = o.travel ?? 2730, run = H * 3 / 4, xb = -run + p * travel, ex = (y) => xb + (H - y) * 0.75;
  return { x: xb, d: `M-20 -20L${fmt(ex(-20))} -20L${fmt(ex(H + 20))} ${H + 20}L-20 ${H + 20}Z` };
}
/** split-flap rewrite: chars flip left→right every `rate` frames; each passes `cycles` intermediate glyphs
    (the next letters of the target) for `step` frames each, then lands (done:true → switch face). */
function splitFlap(src, dst, lf, o = {}) {
  const rate = o.rate ?? 1, cycles = o.cycles ?? 3, step = o.step ?? 1, n = Math.max(src.length, dst.length), out = [];
  const letters = dst.replace(/\s/g, '') || ' '; let li = 0;
  for (let i = 0; i < n; i++) {
    const k = lf - i * rate, tgt = dst[i] ?? ''; if (tgt.trim()) li++;
    if (k < 0) out.push({ ch: src[i] ?? '', done: false, flipping: false });
    else if (k < cycles * step && tgt.trim()) out.push({ ch: letters[(li + Math.floor(k / step)) % letters.length], done: false, flipping: true });
    else out.push({ ch: tgt, done: true, flipping: false });
  }
  return out;
}
/** frames (relative to the rewrite start) of every flip — share with the audio script for FLAPs. */
splitFlap.events = (dst, o = {}) => { const rate = o.rate ?? 1, cycles = o.cycles ?? 3, step = o.step ?? 1, ev = [];
  for (let i = 0; i < dst.length; i++) if (dst[i].trim()) for (let c = 0; c <= cycles; c++) ev.push({ f: i * rate + c * step, i, final: c === cycles }); return ev; };

/* Floor plan (treatment S04), canonical MU. Shared by S04, S06, S07, S11 so the plan is identical everywhere. */
const PLAN = {
  glazeT: [0.12, 0.88], glazeOff: [0, 1.2, 2.4],
  bay: { c: [177.2, 50], r: [50, 48.8, 47.6], a0: -55, a1: 55 },
  walls: [[[98, 0], [98, 30], [110, 30]], [[133.1, 38], [140, 38]], [[150, 38], [158, 38], [158, 0]]], wallW: 1.2,
  doors: [
    { id: 'ENTRY', hinge: [125.5, 100], leaf: [125.5, 92.4], from: [133.1, 100] },
    { id: 'A_SIDE', hinge: [125.5, 72], leaf: [113.5, 72], from: [125.5, 60], cut: [123.1, 60, 2.4, 12] },
    { id: 'D_SIDE', hinge: [133.1, 72], leaf: [145.1, 72], from: [133.1, 60], cut: [133.1, 60, 2.4, 12] },
    { id: 'BATH', hinge: [140, 38], leaf: [140, 47], from: [149, 38] },
  ],
  north: { c: [-8, 112], r: 5 },
  scaleBar: { x: 0, y: 121, m: 100 / 6.8326 },   // 1 m in MU (22'-5" = 100 MU) — placement is ours, not the treatment's
  labels: {
    LIVING:  { at: [52, 55],     measure: ['LIVING', '19\'-0" × 22\'-5"'],  meaning: 'Long dinners' },
    KITCHEN: { at: [111.5, 15],  measure: ['KITCHEN', '6\'-2" × 6\'-9"'],   meaning: 'First coffee' },
    BEDROOM: { at: [186, 62],    measure: ['BEDROOM', '14\'-0" × 13\'-2"'], meaning: 'Sunday mornings' },
    BATH:    { at: [145.5, 19],  measure: ['BATH', '5\'-7" × 8\'-6"'],      meaning: 'Ten quiet minutes' },
    ENTRY:   { at: [129.3, 108], measure: ['ENTRY'],                        meaning: 'Shoes off' },
    PORCH:   { at: [68.4, 110],  measure: ['PORCH'],                        meaning: null },
  },
  dims: { width: { a: [7.5, 0], b: [227.2, 0], off: -10, label: '49\'-4"' }, height: { a: [0, 100], b: [0, 0], off: -4, label: '22\'-5"' } },
  stamp: { at: [227.2, 118], label: '860 SQ FT' },
};
const slopeAt = (t) => [75 * t, 100 - 100 * t];
/** one label (screen-sized, world-anchored). kind 'measure' → two-line MEASURE 18; 'meaning' → MEANING `size` (34). */
function planLabel(c, key, kind = 'measure', o = {}) {
  const L = PLAN.labels[key], p = c.apply(L.at), ink = o.ink ?? C.RED;
  if (kind === 'meaning') { const t = o.text ?? L.meaning; return t ? text(t, { x: p[0], y: p[1] + (o.size ?? 34) * 0.3, anchor: 'middle', voice: 'meaning', size: o.size ?? 34, fill: ink }) : ''; }
  const lines = o.text ? [].concat(o.text) : L.measure, y0 = p[1] + 6 - (lines.length - 1) * 12;
  return lines.map((t, i) => text(t, { x: p[0], y: y0 + i * 24, anchor: 'middle', voice: i ? 'measureLong' : 'measure', size: 18, fill: ink })).join('');
}
/** drawPlan(cam, o) — group progress values are 0..1 draw-on (strokes trim). Defaults = the complete canonical plan.
    {poche:true, pocheW:4.8 MU, cuts:1 (glazing/door gaps open; 0 = closed), glazing, walls, doors, dims, north, scale,
     labels:'measure'|'meaning'|false|{KEY:text}, labelSize, stamp:true, ink, paper} */
function drawPlan(c, o = {}) {
  const ink = o.ink ?? C.RED, paper = o.paper ?? C.WHITE, v = (k) => (o[k] === undefined ? 1 : +o[k]);
  const markAll = [...markA(o), ...markD(o)], dMark = segsToD(markAll, c); let out = '';
  const cuts = o.cuts ?? 1;
  if (o.poche !== false) {
    const cid = uid('plan'); let mask = '';
    if (cuts > 0) {
      const tm = 0.5, hw = 0.38 * cuts, n = SLOPE.normal, P0 = slopeAt(tm - hw), P1 = slopeAt(tm + hw);
      const par = [V.add(P0, V.mul(n, -1)), V.add(P1, V.mul(n, -1)), V.add(P1, V.mul(n, 3)), V.add(P0, V.mul(n, 3))];
      const B = PLAN.bay, a0 = B.a0 * cuts, a1 = B.a1 * cuts;
      const sector = [...arcSegs(B.c, 51.5, a0, a1), ['L', ...V.polar(B.c, 46.5, a1)], ...arcSegs(B.c, 46.5, a1, a0).slice(1), ['Z']];
      let dc = segsToD(polySegs(par, true), c) + segsToD(sector, c);
      for (const dr of PLAN.doors) if (dr.cut) { const [x, y, w, h] = dr.cut, hh = h / 2 * cuts, cy = y + h / 2; dc += segsToD(polySegs([[x - 0.5, cy - hh], [x + w + 0.5, cy - hh], [x + w + 0.5, cy + hh], [x - 0.5, cy + hh]], true), c); }
      const mid = uid('cut'); mask = `<mask id="${mid}" maskUnits="userSpaceOnUse" x="-20000" y="-20000" width="40000" height="40000"><rect x="-20000" y="-20000" width="40000" height="40000" fill="#fff"/><path d="${dc}" fill="#000"/></mask>`;
      out += mask; mask = ` mask="url(#${mid})"`;
    }
    out += `<clipPath id="${cid}"><path d="${dMark}"/></clipPath><g${mask}><path d="${dMark}" fill="none" stroke="${ink}" stroke-width="${fmt((o.pocheW ?? 4.8) * c.s)}" stroke-linejoin="miter" clip-path="url(#${cid})"/></g>`;
  }
  const gl = v('glazing');
  if (gl > 0) {
    for (const off of PLAN.glazeOff) { const n = V.mul(SLOPE.normal, off); out += path(lineSegs(V.add(slopeAt(PLAN.glazeT[0]), n), V.add(slopeAt(PLAN.glazeT[1]), n)), { cam: c, stroke: ink, sw: LW.DETAIL, cap: 'butt', draw: gl }); }
    for (const r of PLAN.bay.r) out += path(arcSegs(PLAN.bay.c, r, PLAN.bay.a0, PLAN.bay.a1), { cam: c, stroke: ink, sw: LW.DETAIL, cap: 'butt', draw: gl });
  }
  if (v('walls') > 0) for (const w of PLAN.walls) out += path(polySegs(w), { cam: c, stroke: ink, sw: PLAN.wallW * c.s, cap: 'square', join: 'miter', draw: v('walls') });
  if (v('doors') > 0) for (const dr of PLAN.doors) {
    const r = V.dist(dr.hinge, dr.from), a0 = Math.atan2(dr.from[1] - dr.hinge[1], dr.from[0] - dr.hinge[0]) / DEG;
    let a1 = Math.atan2(dr.leaf[1] - dr.hinge[1], dr.leaf[0] - dr.hinge[0]) / DEG; if (a1 - a0 > 180) a1 -= 360; if (a1 - a0 < -180) a1 += 360;
    out += path(lineSegs(dr.hinge, dr.leaf), { cam: c, stroke: ink, sw: LW.HAIR, cap: 'butt', draw: v('doors') }) + path(arcSegs(dr.hinge, r, a0, a1), { cam: c, stroke: ink, sw: LW.HAIR, cap: 'butt', draw: v('doors') });
  }
  if (v('north') > 0) { const N = PLAN.north, p = c.apply(N.c);
    out += path(circleSegs(N.c, N.r), { cam: c, stroke: ink, sw: LW.HAIR, draw: v('north') });
    if (v('north') >= 1) out += poly([[N.c[0], N.c[1] - 4], [N.c[0] + 3, N.c[1] + 4], [N.c[0] - 3, N.c[1] + 4]].map(c.apply), { fill: ink }) + text('N', { x: p[0], y: p[1] - N.r * c.s - 10, anchor: 'middle', size: 16, fill: ink }); }
  if (v('scale') > 0) { const S = PLAN.scaleBar, ticks = [0, 1, 2, 5], y = S.y;
    out += path(lineSegs([S.x, y], [S.x + 5 * S.m, y]), { cam: c, stroke: ink, sw: LW.HAIR, cap: 'butt', draw: v('scale') });
    if (v('scale') >= 1) ticks.forEach((t) => { const p = c.apply([S.x + t * S.m, y]); out += line([p[0], p[1] - 5], [p[0], p[1] + 5], { stroke: ink, sw: LW.HAIR, cap: 'butt' }) + text(t === 5 ? '5 M' : String(t), { x: p[0], y: p[1] + 24, anchor: t ? 'middle' : 'start', size: 16, fill: ink }); }); }
  if (v('dims') > 0) for (const k in PLAN.dims) { const D = PLAN.dims[k];
    out += dimString(c.apply(D.a), c.apply(D.b), { offset: D.off * c.s, label: D.label, draw: v('dims'), ink, knock: paper }); }
  if (o.stamp !== false && v('dims') >= 1) { const p = c.apply(PLAN.stamp.at); out += text(PLAN.stamp.label, { x: p[0], y: p[1], anchor: 'end', size: 18, fill: ink }); }
  const lab = o.labels ?? 'measure';
  if (lab) for (const key in PLAN.labels) {
    if (typeof lab === 'object') { if (lab[key] != null) out += planLabel(c, key, o.labelKind ?? 'meaning', { text: lab[key], size: o.labelSize, ink }); }
    else out += planLabel(c, key, lab, { size: o.labelSize, ink });
  }
  return out;
}

/* ───────────────────────── 7. ENGINE ───────────────────────── */
const SHOTS = []; let mounted = false, curFrame = 0;
/** registerShot({id, start, end, render(localFrame, ctx), bg?, z?}) — start/end inclusive global frames; overlaps allowed.
    render returns SVG markup (string | array) for the shot's own <svg>, or undefined if it drew itself (ctx.svg / ctx.canvas()). */
function registerShot(def) {
  if (!def.id || def.start == null || def.end == null || typeof def.render !== 'function') throw new Error('registerShot: id, start, end, render required');
  if (SHOTS.some((s) => s.id === def.id)) throw new Error('registerShot: duplicate id ' + def.id);
  def._order = SHOTS.length; SHOTS.push(def); if (mounted) { mountShot(def); sortLayers(); }
}
function mountShot(s) {
  const el = document.createElement('div'); el.className = 'shot'; el.id = 'shot-' + s.id;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('width', W); svg.setAttribute('height', H);
  el.appendChild(svg); s.el = el; s.svg = svg; s._on = false;
  s.ctx = { id: s.id, start: s.start, end: s.end, len: s.end - s.start + 1, layer: el, svg, W, H, f: 0, spec: SPEC[s.id],
    canvas() { if (!s.cv) { s.cv = document.createElement('canvas'); el.insertBefore(s.cv, svg); }
      const dpr = window.devicePixelRatio || 1; if (s.cv.width !== Math.round(W * dpr)) { s.cv.width = Math.round(W * dpr); s.cv.height = Math.round(H * dpr); }
      const x = s.cv.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, s.cv.width, s.cv.height); x.setTransform(dpr, 0, 0, dpr, 0, 0); return x; } };
  document.getElementById('stage').appendChild(el);
}
function sortLayers() { const st = document.getElementById('stage'); SHOTS.slice().sort((a, b) => (a.z ?? 0) - (b.z ?? 0) || a._order - b._order).forEach((s) => st.appendChild(s.el)); st.appendChild(document.getElementById('guides')); }
function mount() { if (mounted) return; SHOTS.forEach(mountShot); sortLayers(); mounted = true; }
const BG = (v) => (v && C[v]) || v || 'transparent';
/** seek(frame): render frame 0..1799 synchronously (fractional frames allowed, e.g. motion-blur subsamples). */
function seek(f) {
  if (!mounted) mount();
  f = clamp(+f || 0, 0, FRAMES - 1); curFrame = f;
  for (const s of SHOTS) {
    const on = f >= s.start && f < s.end + 1;
    if (!on) { if (s._on) { s.el.style.display = 'none'; s._on = false; } continue; }
    const lf = f - s.start; s._on = true; s.ctx.f = f;
    const el = s.el.style; el.display = 'block'; el.transform = ''; el.opacity = ''; el.clipPath = '';
    el.background = BG(typeof s.bg === 'function' ? s.bg(lf, s.ctx) : s.bg);
    _pref = s.id; _n = 0;
    const out = s.render(lf, s.ctx);
    if (out !== undefined) s.svg.innerHTML = Array.isArray(out) ? out.join('') : out;
  }
  window.__frame = f; if (ui) ui.update(f);
  return f;
}
const activeShots = (f) => SHOTS.filter((s) => f >= s.start && f < s.end + 1).map((s) => s.id);

/* fonts: load every face explicitly (document.fonts.ready alone only waits for faces already in use). */
const FACES = ["500 18px 'IBM Plex Mono'", "400 18px 'IBM Plex Mono'", "italic 400 40px 'Instrument Serif'", "700 72px 'Archivo'", "800 72px 'Archivo'", "400 40px 'Playfair Display'"];
function loadFonts() {
  return Promise.all(FACES.map((f) => document.fonts.load(f, 'AdvrtizX 0123456789').catch(() => []))).then(() => document.fonts.ready).then(() => {
    window.__fonts = [...document.fonts].map((f) => `${f.family.replace(/"/g, '')} ${f.style} ${f.weight} ${f.stretch} → ${f.status}`);
    window.__fontErrors = [...document.fonts].filter((f) => f.status !== 'loaded').map((f) => f.family + ' ' + f.style + ' ' + f.weight);
  });
}

/* preview UI: ?play (real time, loops) · ?f=420 (one frame) · ?shot=S05 (loop one shot) · ?grid (module guides) · ?audio[=path] */
let ui = null;
function boot() {
  mount();
  const q = new URLSearchParams(location.search), stage = document.getElementById('stage');
  const shotId = q.get('shot'), sh = shotId ? SHOTS.find((s) => s.id === shotId.toUpperCase()) : null;
  const interactive = q.has('play') || !!sh, lo = sh ? sh.start : 0, hi = sh ? Math.min(sh.end, FRAMES - 1) : FRAMES - 1;
  if (q.has('grid')) { const gd = document.getElementById('guides'); gd.style.display = 'block'; let d = '';
    for (let x = 60; x < W; x += 60) d += `M${x} 0V${H}`; for (let y = 60; y < H; y += 60) d += `M0 ${y}H${W}`;
    gd.innerHTML = `<path d="${d}" stroke="${C.RED}" stroke-opacity=".18" stroke-width="1"/><rect x="120" y="120" width="1680" height="840" fill="none" stroke="${C.RED}" stroke-opacity=".5" stroke-dasharray="6 6"/><path d="M950 540H970M960 530V550" stroke="${C.RED}"/>`; }
  const fit = () => { const bar = interactive ? 48 : 0, k = Math.min(innerWidth / W, (innerHeight - bar) / H);
    stage.style.transform = k < 1 || interactive ? `translate(${(innerWidth - W * k) / 2}px,${(innerHeight - bar - H * k) / 2}px) scale(${k})` : ''; };
  addEventListener('resize', fit); fit();
  if (interactive) {
    document.body.classList.add('preview');
    const bar = document.getElementById('ui'), btn = document.getElementById('play'), scrub = document.getElementById('scrub'), out = document.getElementById('readout');
    bar.style.display = 'flex'; scrub.min = lo; scrub.max = hi;
    let playing = false, t0 = 0, f0 = lo, audio = null;
    if (q.has('audio')) { audio = new Audio(q.get('audio') || '../public/audio/score.wav'); audio.preload = 'auto'; }
    const pad = (n, k) => String(Math.floor(n)).padStart(k, '0');
    ui = { update(f) { scrub.value = Math.floor(f); out.textContent = `F ${pad(f, 4)}  ${(f / FPS).toFixed(3)}S  BAR ${pad(Math.floor(f / 60) + 1, 2)}.${Math.floor((f % 60) / 15) + 1}  ${activeShots(f).join('+')}`; } };
    const tick = (now) => { if (!playing) return;
      let f = audio && !audio.paused ? Math.floor(audio.currentTime * FPS + 1e-6) : f0 + Math.floor((now - t0) * FPS / 1000);
      if (f > hi) { f = lo; f0 = lo; t0 = now; if (audio) audio.currentTime = lo / FPS; }
      seek(f); requestAnimationFrame(tick); };
    const play = (on) => { playing = on; btn.textContent = on ? 'PAUSE' : 'PLAY';
      if (on) { f0 = curFrame >= hi ? lo : Math.floor(curFrame); t0 = performance.now(); if (audio) { audio.currentTime = f0 / FPS; audio.play().catch(() => {}); } requestAnimationFrame(tick); } else if (audio) audio.pause(); };
    btn.onclick = () => play(!playing);
    scrub.oninput = () => { play(false); seek(+scrub.value); };
    addEventListener('keydown', (e) => { const step = e.shiftKey ? 15 : 1;
      if (e.code === 'Space') { e.preventDefault(); play(!playing); }
      else if (e.code === 'ArrowRight') { play(false); seek(Math.min(hi, Math.floor(curFrame) + step)); }
      else if (e.code === 'ArrowLeft') { play(false); seek(Math.max(lo, Math.floor(curFrame) - step)); }
      else if (e.code === 'Home') { play(false); seek(lo); } });
    TA.ready.then(() => { seek(q.has('f') ? +q.get('f') : lo); play(true); });
  } else TA.ready.then(() => seek(q.has('f') ? +q.get('f') : 0));
}
TA.ready = new Promise((res) => { const go = () => loadFonts().then(() => { window.__ready = true; res(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go(); });

/* ───────────────────────── 8. PLACEHOLDER (until a shot is built) ───────────────────────── */
function placeholder(id, o = {}) {
  const sp = SPEC[id];
  registerShot({ ...sp, bg: o.bg ?? sp.bg, render(lf, ctx) {
    const red = (o.bg ?? sp.bg) === 'RED', ink = red ? C.WHITE : C.RED, n = sp.end - sp.start;
    const out = [o.extra ? o.extra(lf, ctx) : ''];
    out.push(text(`${id} · F${sp.start}–${sp.end} · ${(sp.start / FPS).toFixed(1)}–${((sp.end + 1) / FPS).toFixed(1)}S · ACT ${sp.act}`, { x: 120, y: 144, size: 18, fill: ink }));
    out.push(text(sp.name, { x: 120, y: 228, voice: 'authority', size: 72, fill: ink }));
    out.push(text(sp.desc, { x: 120, y: 276, voice: 'meaning', size: 34, fill: ink }));
    out.push(text(`LF ${String(Math.floor(lf)).padStart(3, '0')}/${n} · F ${String(Math.floor(ctx.f)).padStart(4, '0')} · PLACEHOLDER`, { x: 120, y: 1012, size: 18, fill: ink }));
    out.push(line([120, 1036], [120 + 1680 * (lf / n), 1036], { stroke: ink, sw: LW.DETAIL, cap: 'butt' }));
    let d = ''; for (let b = 0; b <= n; b += 15) { const x = fmt(120 + 1680 * b / n); d += `M${x} 1030V1042`; }
    out.push(`<path d="${d}" stroke="${ink}" stroke-width="1"/>`);
    return out;
  } });
}

Object.assign(TA, { W, H, FPS, FRAMES, C, LW, GRID, SIZES, TIME, ACTS, SPEC, VOICE, EASE, MARK, PLAN, CAMS, SLOPE, DEG, V,
  clamp, lerp, mix, bezier, easeInv, prog, tween, logTween, keys, stagger, beat, bar, onGrid, prng, hash01,
  tri345, markA, markD, shiftSegs, parseD, segsToD, arcCenter, pathLength, pointAt, trimSegs, arcSegs, circleSegs, polySegs, lineSegs, slopeAt,
  cam, camLerp, camTween, camZoom, fold, esc, attrs, uid, path, line, poly, circle, rect, g, clipTo, fmt,
  fontCSS, text, measure, rise, exit, drawMark, dimString, draftGrid, slopeOrder, slopeWipe, splitFlap, drawPlan, planLabel,
  registerShot, seek, activeShots, boot, placeholder, shots: SHOTS });
window.seek = seek; window.registerShot = registerShot;
})();
