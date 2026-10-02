/* DOMINANT · engine/util.js
   Pure helpers: clamp/lerp, real cubic-bezier eases, tracks (keyframes), seeded PRNG, deterministic noise and impact shake.
   Nothing here touches Math.random, Date, performance or requestAnimationFrame. Every function is a pure function of its inputs. */

export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (v - a) / (b - a);
export const remap = (v, a, b, c, d) => c + ((v - a) / (b - a)) * (d - c);
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const smootherstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * t * (t * (t * 6 - 15) + 10); };
export const mix = (a, b, t) => (Array.isArray(a) ? a.map((v, i) => v + (b[i] - v) * t) : a + (b - a) * t);
export const DEG = Math.PI / 180;
export const fract = (x) => x - Math.floor(x);

/* ───────────────────────────────── EASES ───────────────────────────────── */

/** cubic-bezier(x1,y1,x2,y2) solved properly (Newton, bisection fallback): the same maths as CSS and After Effects. */
export function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (t) => ((ax * t + bx) * t + cx) * t, sy = (t) => ((ay * t + by) * t + cy) * t;
  const dx = (t) => (3 * ax * t + 2 * bx) * t + cx;
  const solve = (x) => {
    let t = x;
    for (let i = 0; i < 8; i++) { const e = sx(t) - x; if (Math.abs(e) < 1e-7) return t; const d = dx(t); if (Math.abs(d) < 1e-6) break; t -= e / d; if (t < 0 || t > 1) break; }
    let lo = 0, hi = 1; t = x;
    for (let i = 0; i < 50; i++) { const v = sx(t); if (Math.abs(v - x) < 1e-7) break; if (v < x) lo = t; else hi = t; t = (lo + hi) / 2; }
    return t;
  };
  return (x) => (x <= 0 ? 0 : x >= 1 ? 1 : sy(solve(x)));
}

const pow = (n) => ({ in: (t) => Math.pow(t, n), out: (t) => 1 - Math.pow(1 - t, n), inOut: (t) => (t < 0.5 ? Math.pow(2 * t, n) / 2 : 1 - Math.pow(2 - 2 * t, n) / 2) });
const Q2 = pow(2), Q3 = pow(3), Q4 = pow(4), Q5 = pow(5);

/** Back ease with overshoot s (outBack): lands past 1 and settles. */
export const outBack = (s = 1.70158) => (t) => { const u = t - 1; return 1 + (s + 1) * u * u * u + s * u * u; };
/** Damped spring that settles to 1: freq in cycles over [0,1], damp = decay rate. */
export const spring = (freq = 2.5, damp = 5) => (t) => (t <= 0 ? 0 : t >= 1 ? 1 : 1 - Math.exp(-damp * t) * Math.cos(2 * Math.PI * freq * t));

export const EASE = {
  linear: (t) => clamp(t),
  inQuad: Q2.in, outQuad: Q2.out, inOutQuad: Q2.inOut,
  inCubic: Q3.in, outCubic: Q3.out, inOutCubic: Q3.inOut,
  inQuart: Q4.in, outQuart: Q4.out, inOutQuart: Q4.inOut,
  inQuint: Q5.in, outQuint: Q5.out, inOutQuint: Q5.inOut,
  inSine: (t) => 1 - Math.cos((t * Math.PI) / 2), outSine: (t) => Math.sin((t * Math.PI) / 2), inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  inExpo: (t) => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10)), outExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inOutExpo: (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2),
  inCirc: (t) => 1 - Math.sqrt(1 - t * t), outCirc: (t) => Math.sqrt(1 - (t - 1) * (t - 1)),
  inOutCirc: (t) => (t < 0.5 ? (1 - Math.sqrt(1 - 4 * t * t)) / 2 : (Math.sqrt(1 - Math.pow(-2 * t + 2, 2)) + 1) / 2),
  outBack: outBack(1.2),
  // Cinematic named eases (cubic-bezier, tuned for motion design)
  cine: bezier(0.76, 0, 0.24, 1),        // strong in-out: camera moves that start and stop
  glide: bezier(0.45, 0, 0.15, 1),       // soft start, long settle
  surge: bezier(0.6, 0, 0.9, 0.5),       // accelerates hard, never settles (use up to a hit)
  snap: bezier(0.05, 0.9, 0.1, 1),       // near-instant attack, micro settle (slams, locks)
  whip: bezier(0.85, 0, 0.12, 1),        // the whip-pan: ~dead start, violent middle, dead stop
  slam: bezier(0.9, 0, 1, 0.55),         // pure acceleration into an impact
};

/** Eased 0..1 progress of t between a and b. */
export const prog = (t, a, b, ease = EASE.linear) => ease(clamp((t - a) / (b - a)));
/** Interpolate between two values (numbers or arrays) over [a,b] with an ease. */
export const tween = (t, a, b, from, to, ease = EASE.linear) => mix(from, to, prog(t, a, b, ease));

/** Keyframe track. keys: [[frame, value, ease?], ...] (values: number or number[]).
    ease belongs to the segment that ARRIVES at that key (like a bezier on the incoming handle).
    Before the first key = first value, after the last = last value. */
export function track(keys) {
  const ks = keys.map(([f, v, e]) => ({ f, v, e: typeof e === 'function' ? e : (e ? EASE[e] : EASE.linear) }));
  return (t) => {
    if (t <= ks[0].f) return ks[0].v;
    const last = ks[ks.length - 1];
    if (t >= last.f) return last.v;
    let i = 1; while (ks[i].f < t) i++;
    const a = ks[i - 1], b = ks[i];
    return mix(a.v, b.v, b.e(clamp((t - a.f) / (b.f - a.f))));
  };
}

/** Catmull-Rom spline through [[frame, vec3|number], ...]: C1 camera/target paths across many keys (no stop at each key). */
export function spline(points) {
  const P = points.map(([f, v]) => ({ f, v: Array.isArray(v) ? v : [v] }));
  return (t) => {
    const n = P.length;
    if (t <= P[0].f) return P[0].v.length === 1 ? P[0].v[0] : P[0].v.slice();
    if (t >= P[n - 1].f) return P[n - 1].v.length === 1 ? P[n - 1].v[0] : P[n - 1].v.slice();
    let i = 1; while (P[i].f < t) i++;
    const p1 = P[i - 1], p2 = P[i], p0 = P[Math.max(0, i - 2)], p3 = P[Math.min(n - 1, i + 1)];
    const u = (t - p1.f) / (p2.f - p1.f), u2 = u * u, u3 = u2 * u;
    const out = p1.v.map((_, k) => {
      // Hermite with Catmull-Rom tangents scaled to the segment length (non-uniform times)
      const m1 = p2.f === p0.f ? 0 : ((p2.v[k] - p0.v[k]) / (p2.f - p0.f)) * (p2.f - p1.f);
      const m2 = p3.f === p1.f ? 0 : ((p3.v[k] - p1.v[k]) / (p3.f - p1.f)) * (p2.f - p1.f);
      return (2 * u3 - 3 * u2 + 1) * p1.v[k] + (u3 - 2 * u2 + u) * m1 + (-2 * u3 + 3 * u2) * p2.v[k] + (u3 - u2) * m2;
    });
    return out.length === 1 ? out[0] : out;
  };
}

/* ───────────────────────────────── DETERMINISTIC RANDOM ───────────────────────────────── */

/** 32-bit string/number hash (cyrb53 folded to 32 bits). */
export function hashStr(s) {
  s = String(s); let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 ^ h1) >>> 0;
}

/** Seeded PRNG (mulberry32). rng = makeRng('london'); rng() -> [0,1). Helpers: rng.range(a,b), rng.int(a,b), rng.pick(arr), rng.gauss(). */
export function makeRng(seed = 1) {
  let a = typeof seed === 'number' ? seed >>> 0 : hashStr(seed);
  const r = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  r.range = (lo, hi) => lo + (hi - lo) * r();
  r.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * r());
  r.pick = (arr) => arr[Math.floor(r() * arr.length)];
  r.chance = (p) => r() < p;
  r.gauss = () => { let u = 0, v = 0; while (u === 0) u = r(); while (v === 0) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  r.fork = (tag) => makeRng(hashStr(String(tag)) ^ a);
  return r;
}

/** Stateless integer hash -> [0,1). hash01(i, seed). */
export function hash01(i, seed = 0) {
  let h = (Math.imul(i | 0, 0x27d4eb2d) ^ Math.imul(seed | 0, 0x165667b1) ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Smooth 1D value noise in [-1,1] (quintic interpolation). */
export function noise1(x, seed = 0) {
  const i = Math.floor(x), f = x - i, u = f * f * f * (f * (f * 6 - 15) + 10);
  return (hash01(i, seed) * (1 - u) + hash01(i + 1, seed) * u) * 2 - 1;
}
/** fBm of noise1 (3 octaves). */
export function fbm1(x, seed = 0) { return (noise1(x, seed) * 0.6 + noise1(x * 2.13, seed + 17) * 0.28 + noise1(x * 4.37, seed + 53) * 0.12); }

/* ───────────────────────────────── IMPACT SHAKE ───────────────────────────────── */

/** Deterministic camera shake from impact events. events: [{f, amp, decay, freq?, seed?}].
    amp is in degrees (rotation) and the same number in metres * posScale for translation.
    decay = time constant in frames (envelope exp(-dt/decay)). Returns {yaw,pitch,roll,x,y,z} offsets (degrees / metres units * posScale).
    Used by the camera rig: rig.shake = shake(t, events). */
export function shake(t, events, { posScale = 0, rollScale = 0.35 } = {}) {
  let yaw = 0, pitch = 0, roll = 0, x = 0, y = 0, z = 0;
  for (let i = 0; i < events.length; i++) {
    // the envelope opens 0.26 f before the event so the whole 180-degree shutter of the hit frame is kicked (otherwise half the
    // sub-frames are unkicked and motion blur shows a double image on every impact)
    const e = events[i], dt = t - e.f + 0.26;
    if (dt < 0) continue;
    const env = Math.exp(-dt / (e.decay ?? 3)) * (dt < 0.001 ? 1 : 1);
    if (env < 1e-3) continue;
    const fr = e.freq ?? 0.55, s = (e.seed ?? 0) + i * 31, ph = dt * fr;
    const a = e.amp * env;
    // the first swing is a hard downward pitch kick (impact), the rest is noise
    pitch += a * (-0.7 * Math.exp(-dt * 0.9) + noise1(ph * 3.1 + 7, s + 1) * 0.6);
    yaw += a * noise1(ph * 3.1 + 19, s + 2) * 0.55;
    roll += a * rollScale * noise1(ph * 3.1 + 41, s + 3);
    if (posScale) { x += a * posScale * noise1(ph * 3.1 + 5, s + 4); y += a * posScale * noise1(ph * 3.1 + 11, s + 5); z += a * posScale * noise1(ph * 3.1 + 23, s + 6); }
  }
  return { yaw, pitch, roll, x, y, z };
}

/** Continuous rumble (sum of noises) between frames a and b with a ramped amplitude envelope: for "jolts merge into a surge". */
export function rumble(t, a, b, amp0, amp1, { freq = 0.9, seed = 0, rollScale = 0.35, ease = EASE.linear } = {}) {
  if (t < a || t > b) return { yaw: 0, pitch: 0, roll: 0, x: 0, y: 0, z: 0 };
  const amp = mix(amp0, amp1, ease(clamp((t - a) / (b - a))));
  const ph = t * freq;
  return { yaw: amp * noise1(ph + 3, seed + 1), pitch: amp * noise1(ph + 91, seed + 2), roll: amp * rollScale * noise1(ph + 57, seed + 3), x: 0, y: 0, z: 0 };
}
export function addShake(...ss) { const o = { yaw: 0, pitch: 0, roll: 0, x: 0, y: 0, z: 0 }; for (const s of ss) { o.yaw += s.yaw; o.pitch += s.pitch; o.roll += s.roll; o.x += s.x; o.y += s.y; o.z += s.z; } return o; }

/* ───────────────────────────────── COLOUR ───────────────────────────────── */

export const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
export const linearToSrgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
/** [r,g,b] 0..255 -> linear 0..1 */
export const rgb255ToLinear = (rgb) => rgb.map((v) => srgbToLinear(v / 255));
export const BRAND_RED_255 = [232, 1, 1];   // #E80101
export const RED_LIN = rgb255ToLinear(BRAND_RED_255);
export const WHITE_LIN = [1, 1, 1];
/** linear tone between brand red and white, k = 0 red .. 1 white (mixed in linear light, how fog mixes) */
export const redWhite = (k) => [RED_LIN[0] + (1 - RED_LIN[0]) * k, RED_LIN[1] + (1 - RED_LIN[1]) * k, RED_LIN[2] + (1 - RED_LIN[2]) * k];
/** Deep red = brand red scaled in linear light (shadow tones). */
export const deepRed = (s) => [RED_LIN[0] * s, RED_LIN[1] * s, RED_LIN[2] * s];

/** Halton sequence value for sub-pixel jitter. */
export function halton(i, b) { let f = 1, r = 0; while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); } return r; }
