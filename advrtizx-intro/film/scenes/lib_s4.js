/* DOMINANT · scenes/lib_s4.js   (owner: S4 agent: acts VII-IX)
   Shared by act7.js / act8.js / act9.js.

   THE IDEA: skylines are sold before they are built. One WORLD SKYLINE (generic towers, the kit's TowerSet) stands in red fog; in its
   centre a wall of "strip" towers (AdWall) grows into a jagged envelope whose outline is the AD monogram in elevation. At f1376 the
   lights go out: everything outside the exact AD shape drops to deep unlit red; only facade INSIDE the exact AD shape (an analytic
   signed-distance mask of assets/mark.svg, projected on the vertical plane of the wall) stays lit white. At f1408 / f1440 the A
   region and the D region FUSE: gaps close, wedge crowns complete the slope / the dome, the strips snap into one plane. Then a
   dolly-zoom to orthographic leaves the exact 2D logo (see act8.js), which becomes the last word of the sentence (2D overlay).

   MARK SPACE (a, b): a = X - 7.5 (0..219.7, left to right), b = 100 - Y (0..100, up, ground = 0)  (X, Y = mark.svg coordinates).
   WORLD: x = (a - AX) * S, y = b * S, the wall's front plane is z = 0, the camera looks toward -z.
   Everything here is a pure function of time (no random/Date); GPU animation runs off the shared uTime. */
import * as THREE from 'three';
import { GLSL_COMMON, GLSL_RISE, makeMaterial, makeShadowMaterial, U } from '../engine/gfx.js';
import { clamp, lerp, smoothstep, EASE, makeRng, RED_LIN, noise1, hash01, bezier, DEG } from '../engine/util.js';
import { TowerSet } from '../kits/towers.js';
import { generate, CROWN_MIX } from '../kits/city.js';
import { makeGround } from '../kits/world.js';

/* ═════════════════════════════════════ constants ═════════════════════════════════════ */

export const S = 6;                       // metres per mark unit  (AD = 1318 m wide, 600 m tall)
export const AX = 109.85;                 // a at world x = 0 (the AD is centred on x = 0)
export const MARK_W = 219.7, MARK_H = 100;
export const WAD = MARK_W * S, HAD = MARK_H * S;

/** Frames (read from cue_sheet.json through ctx.cue where available; the numbers are the contract). */
export const F = { A7: 1152, SURGE: 1344, OUT: 1376, HITA: 1408, HITD: 1440, ORTHO: 1503, SENT: 1504, CLICK: 1536, CARD: 1632, TAG: 1664, END: 1799 };
export function readCues(ctx) {
  const c = ctx.cue;
  F.A7 = c('act7'); F.SURGE = c('a7.surge'); F.OUT = c('a7.silence'); F.HITA = c('a8.A'); F.HITD = c('a8.D');
  F.SENT = c('a8.sentence'); F.CLICK = c('a8.click'); F.CARD = c('a9.card'); F.TAG = c('a9.tagline'); F.END = c('a9.end');
  F.ORTHO = F.SENT - 1;
  return F;
}

/* ═════════════════════════════ exact mark geometry (mirrors assets/mark.svg) ═════════════════════════════
   A (SVG): sharp trapezoid (0,100) (75,0) (125.5,0) (125.5,100), fillets R7.5 bottom-left and R10.8 top-left, bite circle r21.2
   centred (68.4, 113.9).  D: rect X 133.1..177.2 + semicircle r50 centred (177.2, 50).   In (a,b): a = X - 7.5, b = 100 - Y. */
const A_RIGHT = 118.0;                        // 125.5 - 7.5
const BL = { c: [7.5, 7.5], r: 7.5 };         // bottom-left fillet
const TL = { c: [72.9, 89.2], r: 10.8 };      // top-left fillet
const BITE = { c: [60.9, -13.9], r: 21.2 };   // arch bite (circle centre below the baseline)
const D0 = 125.6, D1 = 169.7, DR = 50;        // D rect a-range, semicircle centre a, radius
export const MARK_A = { A0: 0, A1: A_RIGHT, D0, D1: D1 + DR, slotA: A_RIGHT, slotD: D0 };

/** Upper boundary of the AD (b) at mark-space a, for the A (seg 0) or the D (seg 1). Exact (fillets included). */
export function eTop(a, seg) {
  if (seg < 0.5) {
    if (a < 1.5) return 7.5 + Math.sqrt(Math.max(56.25 - (7.5 - a) * (7.5 - a), 0));
    if (a < 64.26) return (a + 7.5) * (4 / 3);
    if (a < 72.9) return 89.2 + Math.sqrt(Math.max(116.64 - (a - 72.9) * (a - 72.9), 0));
    return 100;
  }
  if (a < D1) return 100;
  const u = a - D1; return 50 + Math.sqrt(Math.max(2500 - u * u, 0));
}

/** Signed distance (mark units, negative inside) to the exact AD shape: JS mirror of the shader mask. */
export function sdA(a, b) {
  let d = Math.max(Math.max(b - 100, -b), Math.max(a - A_RIGHT, (3 * b - 4 * (a + 7.5)) * 0.2));
  let qx = a - BL.c[0], qy = b - BL.c[1];
  if (qx <= 0 && 0.8 * qy + 0.6 * qx <= 0) d = Math.hypot(qx, qy) - BL.r;
  qx = a - TL.c[0]; qy = b - TL.c[1];
  if (qx <= 0 && 0.6 * qx + 0.8 * qy >= 0) d = Math.hypot(qx, qy) - TL.r;
  return Math.max(d, BITE.r - Math.hypot(a - BITE.c[0], b - BITE.c[1]));
}
export function sdD(a, b) {
  const qx = D0 - a, qy = Math.abs(b - 50) - 50;
  const dr = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0);
  return a < D1 ? dr : Math.hypot(a - D1, b - 50) - DR;
}
export const sdAD = (a, b) => Math.min(sdA(a, b), sdD(a, b));

/** The same SDF in GLSL. p = (a, b) in mark units. */
export const GLSL_MARK = /* glsl */ `
float eTop(float a, float seg) {
  if (seg < 0.5) {
    if (a < 1.5) return 7.5 + sqrt(max(56.25 - (7.5 - a) * (7.5 - a), 0.0));
    if (a < 64.26) return (a + 7.5) * 1.3333333333;
    if (a < 72.9) return 89.2 + sqrt(max(116.64 - (a - 72.9) * (a - 72.9), 0.0));
    return 100.0;
  }
  if (a < 169.7) return 100.0;
  float u = a - 169.7; return 50.0 + sqrt(max(2500.0 - u * u, 0.0));
}
float sdA(vec2 p) {
  float d = max(max(p.y - 100.0, -p.y), max(p.x - 118.0, (3.0 * p.y - 4.0 * (p.x + 7.5)) * 0.2));
  vec2 q = p - vec2(7.5, 7.5);
  if (q.x <= 0.0 && 0.8 * q.y + 0.6 * q.x <= 0.0) d = length(q) - 7.5;
  q = p - vec2(72.9, 89.2);
  if (q.x <= 0.0 && 0.6 * q.x + 0.8 * q.y >= 0.0) d = length(q) - 10.8;
  return max(d, 21.2 - length(p - vec2(60.9, -13.9)));
}
float sdD(vec2 p) {
  vec2 q = vec2(125.6 - p.x, abs(p.y - 50.0) - 50.0);
  float dr = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
  return p.x < 169.7 ? dr : length(p - vec2(169.7, 50.0)) - 50.0;
}
float sdAD(vec2 p) { return min(sdA(p), sdD(p)); }
`;

/* ═════════════════════════════════ the AD wall (strip towers) ═════════════════════════════════ */

/** Shared uniform objects (visible + shadow materials, both acts). Everything here is rewritten by update(t). */
export const ADU = {
  uS: { value: S }, uAX: { value: AX },
  uHit: { value: new THREE.Vector2(1408, 1440) },   // fuse contact frames (A, D)
  uTopPad: { value: 0.05 },                          // geometry sits 0.05 mark units proud of the exact outline; the mask trims it
  uMaskOn: { value: 0 },                             // 0: all lit (before the lights-out)  1: only the exact AD shape is lit
  uMaskPad: { value: 0.04 }, uFlat: { value: 0 }, uAdFogK: { value: 0.0003 },
  uSinkAD: { value: 0 },                             // unlit facade -> fog red (the world sinking into the red)
  uAdSun: { value: 1.5 }, uAdAmbUp: { value: 0.80 }, uAdAmbDown: { value: 0.50 },
  uAnt: { value: 1 },                                // anticipation amount before the fuse
};

const VERT_AD = /* glsl */ `
in vec4 aA; in vec4 aB; in vec4 aJ; in vec4 aF; in vec4 aC;
uniform float uTime; uniform float uS; uniform float uAX; uniform vec2 uHit; uniform float uTopPad; uniform float uAnt;
out vec3 vWorld; out vec3 vN; flat out float vFace;
${GLSL_RISE}
${GLSL_MARK}
float topFn(float a, float seg, float hpre, float s) { return mix(hpre, eTop(a, seg) + uTopPad, s); }
void main() {
  float seg = aA.w;
  // height of the pre-fusion (flat) top: base fraction + four slam jumps
  float fr = aF.x;
  fr += aF.y * easeKind(clamp((uTime - aJ.x) / 9.0, 0.0, 1.0), 1.0);
  fr += aF.z * easeKind(clamp((uTime - aJ.y) / 9.0, 0.0, 1.0), 1.0);
  fr += aF.w * easeKind(clamp((uTime - aJ.z) / 9.0, 0.0, 1.0), 1.0);
  fr += (1.0 - aF.x - aF.y - aF.z - aF.w) * easeKind(clamp((uTime - aJ.w) / 10.0, 0.0, 1.0), 1.0);
  float hpre = aA.z * fr;
  // fuse: anticipation (a breath of separation), then 5 frames of pure acceleration into contact at hit + delay
  float hit = seg < 0.5 ? uHit.x : uHit.y;
  float t0 = hit + aC.x;
  float u = clamp((uTime - (t0 - 4.0)) / 4.0, 0.0, 1.0);
  float s = u * u * u;
  float ant = smoothstep(t0 - 18.0, t0 - 7.0, uTime) * (1.0 - smoothstep(t0 - 6.0, t0 - 3.6, uTime)) * uAnt;
  float gapK = 1.0 + 0.55 * ant;
  float ov = 0.1 * s;
  float L = aA.x + aB.x * (1.0 - s) * gapK - ov, R = aA.y - aB.y * (1.0 - s) * gapK + ov;
  float xa = mix(L, R, position.x);
  float hp = hpre + 0.9 * ant * aA.z * 0.0 + 1.1 * ant;                    // tops draw up a hair on the breath-in
  float T = topFn(xa, seg, hp, s);
  float ya = position.y * T;
  float zw = aB.z * (1.0 - s) - position.z * aB.w;
  vec3 wp = vec3((xa - uAX) * uS, ya * uS, zw);
  vFace = abs(normal.x) > 0.5 ? 0.0 : (abs(normal.z) > 0.5 ? 1.0 : 2.0);
  vec3 n = normal;
  if (abs(normal.y) > 0.5) { float dl = 0.04; float m = (topFn(xa + dl, seg, hp, s) - topFn(xa - dl, seg, hp, s)) / (2.0 * dl); n = normalize(vec3(-m, 1.0, 0.0)); }
  vN = mat3(modelMatrix) * n;
  vec4 W = modelMatrix * vec4(wp, 1.0);
  vWorld = W.xyz;
  gl_Position = projectionMatrix * viewMatrix * W;
}`;

const FRAG_AD = /* glsl */ `
precision highp float;
${GLSL_COMMON}
${GLSL_MARK}
uniform float uS; uniform float uAX; uniform float uMaskOn; uniform float uMaskPad; uniform float uFlat; uniform float uAdFogK; uniform float uSinkAD;
uniform float uAdSun; uniform float uAdAmbUp; uniform float uAdAmbDown;
in vec3 vWorld; in vec3 vN; flat in float vFace;
out vec4 outColor;
void main() {
  vec3 n = normalize(vN);
  if (uFlat > 0.5 && vFace < 0.5) discard;   // fused: the wall is one plane, its seams are never seen
  float pitch = 4.2;
  float yc = vWorld.y;
  float hc = vFace < 0.5 ? vWorld.z : vWorld.x;
  float alb = 1.0;
  if (vFace < 1.5) {
    float flo = aaLine(yc, pitch, 0.34);
    float spn = aaBand(yc + pitch * 0.5, pitch, 0.30);
    float mul = aaLine(hc, 2.6, 0.15);
    float mech = aaBand(yc, pitch * 22.0, 0.075);
    alb = 1.0 - 0.17 * flo - 0.055 * spn - 0.075 * mul * (1.0 - spn) - 0.10 * mech;
  }
  float ao = mix(0.50, 1.0, smoothstep(0.0, 60.0, vWorld.y));
  // lit state: the key + red ambient the world was lit with (constants, so the AD keeps its light when the world's light goes out)
  float ndl = dot(n, uSunDir);
  float sh = ndl > 0.0 ? shadowAt(vWorld, n) : 0.0;
  vec3 amb = BRAND_RED * mix(uAdAmbDown, uAdAmbUp, 0.5 + 0.5 * n.y) * ao;
  vec3 lit = alb * (amb + vec3(uAdSun) * (max(ndl, 0.0) * sh));
  lit = mix(lit, vec3(1.0), uFlat);
  // unlit state: the environment's (dark) ambient, exactly like the world around it
  vec3 dark = alb * mix(uAmbDown, uAmbUp, 0.5 + 0.5 * n.y) * ao;
  // the exact mark, projected on the wall's vertical plane
  float sd = sdAD(vec2(vWorld.x / uS + uAX, vWorld.y / uS));
  float fw = max(fwidth(sd), 1e-4);
  float cov = 1.0 - smoothstep(-0.5 * fw, 0.5 * fw, sd - uMaskPad * (1.0 - uFlat));
  float L = mix(1.0, cov, uMaskOn);
  vec3 col = mix(dark, lit, L);
  col = mix(col, uFogColor, (1.0 - L) * uSinkAD);
  float tau = uAdFogK * length(vWorld - cameraPosition);
  col = mix(uFogColor, col, exp(-tau));
  outColor = vec4(min(col, vec3(1.0)), 1.0);
}`;

/** Strip base geometry: u across (0..1, M segments), v bottom/top (0/1), w front/back (0/1); normal = face selector. */
function stripBase(M = 14) {
  const P = [], N = [], I = [];
  const v = (u, y, w, n) => { P.push(u, y, w); N.push(...n); return P.length / 3 - 1; };
  // front (+z)
  let b = P.length / 3;
  for (let k = 0; k <= M; k++) { v(k / M, 0, 0, [0, 0, 1]); v(k / M, 1, 0, [0, 0, 1]); }
  for (let k = 0; k < M; k++) { const a0 = b + 2 * k, a1 = a0 + 1, b0 = a0 + 2, b1 = a0 + 3; I.push(a0, b0, b1, a0, b1, a1); }
  // back (-z)
  b = P.length / 3;
  for (let k = 0; k <= M; k++) { v(k / M, 0, 1, [0, 0, -1]); v(k / M, 1, 1, [0, 0, -1]); }
  for (let k = 0; k < M; k++) { const a0 = b + 2 * k, a1 = a0 + 1, b0 = a0 + 2, b1 = a0 + 3; I.push(a0, b1, b0, a0, a1, b1); }
  // top (+y): front row then back row
  b = P.length / 3;
  for (let k = 0; k <= M; k++) { v(k / M, 1, 0, [0, 1, 0]); v(k / M, 1, 1, [0, 1, 0]); }
  for (let k = 0; k < M; k++) { const f0 = b + 2 * k, k0 = f0 + 1, f1 = f0 + 2, k1 = f0 + 3; I.push(f0, f1, k1, f0, k1, k0); }
  // sides: left (-x) at u = 0, right (+x) at u = 1
  b = P.length / 3; v(0, 0, 0, [-1, 0, 0]); v(0, 0, 1, [-1, 0, 0]); v(0, 1, 1, [-1, 0, 0]); v(0, 1, 0, [-1, 0, 0]);
  I.push(b, b + 2, b + 1, b, b + 3, b + 2);
  b = P.length / 3; v(1, 0, 0, [1, 0, 0]); v(1, 0, 1, [1, 0, 0]); v(1, 1, 1, [1, 0, 0]); v(1, 1, 0, [1, 0, 0]);
  I.push(b, b + 1, b + 2, b, b + 2, b + 3);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setIndex(I);
  return g;
}

/** Strip layout over the AD (deterministic). Returns [{a0, a1, seg, flat, gapL, gapR, zOff, depth, ...}] */
export function layoutStrips(seed = 'ad-wall') {
  const rng = makeRng(seed), out = [];
  const bounds = (a0, a1, wlo, whi) => { const n = Math.max(1, Math.round((a1 - a0) / ((wlo + whi) / 2))); const ws = Array.from({ length: n }, () => rng.range(wlo, whi)); const sum = ws.reduce((x, y) => x + y, 0); let a = a0; const bs = [a0]; for (let i = 0; i < n; i++) { a += ws[i] * (a1 - a0) / sum; bs.push(a); } bs[n] = a1; return bs; };
  const A = [...bounds(0, 72.9, 3.5, 5.0)];
  const A2 = bounds(72.9, A_RIGHT, 5.6, 8.2); A.push(...A2.slice(1));
  const Dflat = bounds(D0, D1, 5.8, 8.4);
  // the dome: boundaries chosen so the top steps by about the same height each time
  const Darc = [D1]; let u = 0;
  while (u < DR - 1e-6) { const e0 = eTop(D1 + u, 1); let du = 1.0; while (du < 8 && u + du < DR && e0 - eTop(D1 + u + du, 1) < 6.2) du += 0.25; u = Math.min(DR, u + du); Darc.push(D1 + u); }
  if (DR - (Darc[Darc.length - 2] - D1) < 1.6) Darc.splice(Darc.length - 2, 1);
  const D = [...Dflat, ...Darc.slice(1)];
  const mk = (bs, seg) => {
    const gaps = bs.slice(1, -1).map((b, i) => (bs[i + 2] - bs[i]) < 11 ? rng.range(0.45, 1.05) : rng.range(0.6, 1.5));
    for (let i = 0; i < bs.length - 1; i++) {
      const a0 = bs[i], a1 = bs[i + 1];
      let minTop = 1e9; for (let k = 0; k <= 12; k++) minTop = Math.min(minTop, eTop(a0 + (a1 - a0) * (k / 12), seg));
      const big = rng() < 0.5, def = big ? rng.range(2.0, 6.0) : rng.range(0, 1.4);
      out.push({ a0, a1, seg, minTop, flat: Math.max(6, minTop - def), gapL: i === 0 ? 0 : gaps[i - 1] / 2, gapR: i === bs.length - 2 ? 0 : gaps[i] / 2,
        zOff: rng.range(-24, 16), depth: rng.range(95, 150), idx: out.length, rnd: rng() });
    }
  };
  mk(A, 0); mk(D, 1);
  // rise schedule: base fraction + three jumps through the pull-back + the final surge (taller strips surge last)
  const order = out.map((s, i) => [s.flat, i]).sort((x, y) => x[0] - y[0]);
  order.forEach(([, i], rank) => {
    const s = out[i], f0 = rng.range(0.30, 0.58), rest = 1 - f0;
    s.f0 = f0; s.d1 = rest * rng.range(0.14, 0.22); s.d2 = rest * rng.range(0.14, 0.22); s.d3 = rest * rng.range(0.12, 0.18);
    s.t1 = rng.range(1166, 1226); s.t2 = rng.range(1236, 1296); s.t3 = rng.range(1300, 1336);
    s.tF = 1344 + (rank / (out.length - 1)) * 17 + rng.range(-2.5, 2.5);               // 1341.5 .. 1363.5, complete (10 f) by 1373.5
    s.delay = -1.3 * (1 - Math.min(1, Math.abs((s.a0 + s.a1) / 2 - (s.seg < 0.5 ? 70 : 172)) / 60));   // contact ripples outward from the middle of each region; everything has landed by the hit frame
  });
  return out;
}

export class AdWall {
  constructor({ lod = 14 } = {}) {
    this.strips = layoutStrips();
    this.group = new THREE.Group(); this.group.name = 'adwall';
    const N = this.strips.length, mk = () => new Float32Array(N * 4);
    const aA = mk(), aB = mk(), aJ = mk(), aF = mk(), aC = mk();
    this.strips.forEach((s, i) => {
      const o = i * 4;
      aA.set([s.a0, s.a1, s.flat, s.seg], o); aB.set([s.gapL, s.gapR, s.zOff, s.depth], o);
      aJ.set([s.t1, s.t2, s.t3, s.tF], o); aF.set([s.f0, s.d1, s.d2, s.d3], o); aC.set([s.delay, s.rnd, 0, 0], o);
    });
    const base = stripBase(lod);
    const g = new THREE.InstancedBufferGeometry(); g.index = base.index; for (const k of Object.keys(base.attributes)) g.setAttribute(k, base.attributes[k]);
    g.instanceCount = N;
    for (const [n, a] of [['aA', aA], ['aB', aB], ['aJ', aJ], ['aF', aF], ['aC', aC]]) g.setAttribute(n, new THREE.InstancedBufferAttribute(a, 4));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);
    const mat = makeMaterial({ vert: VERT_AD, frag: FRAG_AD, uniforms: ADU });
    const sh = makeShadowMaterial({ vert: VERT_AD, uniforms: ADU });
    this.mesh = new THREE.Mesh(g, mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 1;
    this.mesh.userData.shadowMaterial = sh; this.mesh.layers.enable(1);
    this.group.add(this.mesh);
  }
}

/* ═════════════════════════════════════ the world ═════════════════════════════════════ */

const wallTopAtX = (x) => { const a = x / S + AX; if (a < 0 || a > MARK_W) return 0; if (a > A_RIGHT && a < D0) return 0; return eTop(a, a < A_RIGHT + 3.8 ? 0 : 1) * S; };

/** Generic world towers (kit TowerSet): rows of white towers, taller toward the centre, many rows deep, never taller than the wall in front of them. */
function genericSpecs(rng) {
  const out = [];
  const keep = [(x, z) => (Math.abs(x) < 720 && z > -240 && z < 70), (x, z) => (x > -1000 && x < 1190 && z >= 70 && z < 2600), (x, z) => (Math.abs(x) < 760 && z >= 70)];
  const city = (x, z) => Math.hypot(x * 0.8, z + 120);
  const hfun = (x, z, r) => {
    const base = lerp(260, 80, clamp((city(x, z) - 500) / 4600));
    let h = base * lerp(0.38, 1.0, Math.pow(r(), 1.15));
    if (Math.abs(x) < 800 && z < -150) h = Math.min(h, 0.52 * Math.max(wallTopAtX(x), 60));  // behind the wall: always lower than the wall
    return h;
  };
  const reg = (region, cell, p, wr, extra = {}) => out.push(...generate({ rng, region, cell, p, hfun, keepOut: keep, w: wr, aspect: [0.8, 1.15], jitter: 0.34, crowns: CROWN_MIX, ...extra }));
  reg({ x0: -6500, x1: 6500, z0: -240, z1: 70 }, 80, 0.82, [24, 46]);                    // the front line, left and right of the AD
  reg({ x0: -6500, x1: 6500, z0: -1500, z1: -240 }, 96, 0.80, [26, 52]);                 // rows behind
  reg({ x0: -12000, x1: 12000, z0: -3600, z1: -1500 }, 175, 0.78, [44, 90]);             // far rows
  reg({ x0: -16000, x1: 16000, z0: -8200, z1: -3600 }, 330, 0.78, [90, 190]);            // the horizon
  reg({ x0: -6500, x1: 6500, z0: 70, z1: 1900 }, 104, 0.74, [26, 50]);                   // flanks toward the camera (the first frames are in here)
  reg({ x0: -14000, x1: 14000, z0: 1900, z1: 3500 }, 260, 0.6, [60, 130]);               // beyond the camera
  reg({ x0: 1190, x1: 2300, z0: -700, z1: 1500 }, 66, 0.94, [28, 54], { hfun: (x, z, r) => lerp(120, 340, Math.pow(r(), 0.8)) });   // the street canyon of the first frames
  return out;
}

/** Eruption waves: several epicentres, each a ring that races outward through the towers; the first wave to arrive wins. */
const WAVES = [
  { x: -1500, z: -250, f: 1158, v: 70 }, { x: 900, z: -700, f: 1176, v: 90 }, { x: -2600, z: -1500, f: 1196, v: 110 },
  { x: 2400, z: 300, f: 1214, v: 100 }, { x: 0, z: -2200, f: 1236, v: 120 }, { x: -900, z: 900, f: 1252, v: 90 },
  { x: 3600, z: -1800, f: 1272, v: 130 }, { x: -3800, z: -300, f: 1288, v: 130 }, { x: 600, z: 1400, f: 1306, v: 110 },
  { x: 0, z: -4200, f: 1324, v: 160 }, { x: -1900, z: 1700, f: 1338, v: 120 }, { x: 5200, z: 400, f: 1346, v: 150 }, { x: -5600, z: -2400, f: 1352, v: 150 },
];

export function scheduleGeneric(specs, rng) {
  for (const s of specs) {
    let land = Infinity;
    for (const w of WAVES) { const d = Math.hypot(s.x - w.x, s.z - w.z); if (d < 2800) land = Math.min(land, w.f + d / w.v); }
    const keepStanding = rng() < 0.55;                                 // most of the world is already up at f1152
    s.crownDrop = 0; s.drop = 0; s.mode = 'slide'; s.ease = 'slam'; s.dur = rng.int(9, 15);
    if (land < 1372 && !keepStanding) { s.land = Math.round(land + rng.range(0, 4)); s.t0 = s.land - s.dur; }
    else { s.t0 = -1e6; s.land = s.t0 + s.dur; }
  }
  return specs;
}

let WORLD = null;
/** Builds the one shared world (singleton: act7 and act8 both draw it; whichever is active re-parents the group into its root). */
export function getWorld(ctx) {
  if (WORLD) return WORLD;
  readCues(ctx);
  const rng = makeRng('world-skyline');
  const specs = scheduleGeneric(genericSpecs(rng), rng);
  const near = new TowerSet({ lod: 1, shadow: true, name: 'world-near' }), far = new TowerSet({ lod: 2, shadow: false, name: 'world-far' });
  for (const s of specs) {
    const d = Math.hypot(s.x, s.z + 100);
    if (d > 3600 || s.w > 80) { s.crown = d > 5200 ? null : s.crown; far.add(s); } else near.add(s);
  }
  near.build(); far.build();
  const ad = new AdWall();
  const ground = makeGround();
  const group = new THREE.Group(); group.name = 'S4-world';
  group.add(ground, near.group, far.group, ad.group);
  WORLD = { group, near, far, ad, ground, specs, count: specs.length };
  return WORLD;
}

/* ═════════════════════════════ the climax timeline (shared by act7 and act8) ═════════════════════════════ */

const smooth01 = (a, b, x) => smoothstep(a, b, x);
const FOV_END = 32;                                  // the far frontal lens
const D_END = (() => { const th = Math.tan(FOV_END * 0.5 * Math.PI / 180); return (WAD / 0.70) / (2 * th * (16 / 9)); })();   // camera distance for AD = 70% of frame width
export const FRAME = { dist: D_END, h: 2 * D_END * Math.tan(FOV_END * 0.5 * Math.PI / 180), ly: 0, fov: FOV_END };
FRAME.ly = HAD / 2 - 0.045 * FRAME.h;                // the AD sits a little above the middle of the frame

/** Camera progress: accelerating pull-back f1152-1343, constant deceleration to a dead stop at f1376. */
export function pullP(t) {
  const a = F.A7, b = F.SURGE, c = F.OUT, k = 2.1, T = c - b, span = b - a;
  const P1 = 1 / (1 + (k * T) / (2 * span));
  if (t <= a) return 0;
  if (t <= b) return P1 * Math.pow((t - a) / span, k);
  if (t >= c) return 1;
  const v1 = (P1 * k) / span, dt = t - b;
  return P1 + v1 * dt - (v1 * dt * dt) / (2 * T);
}
/** Normalised camera speed (0..1) for motion-blur and shake budgets. */
export function pullSpeed(t) { const h = 0.5; return clamp(Math.abs(pullP(t + h) - pullP(t - h)) / (2 * h) * 190 / 3.2); }

const lerp3 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
const ease = (k, p) => Math.pow(clamp(k), p);

const FOV_ORTHO = 1.0;
const PUSH = 0.988;                                  // the hold pushes in 1.2% before the D hit
const H_DZ = 2 * (D_END * PUSH) * Math.tan(FOV_END * 0.5 * DEG);   // visible height at the wall plane, held constant through the dolly-zoom
export const LY_FINAL = HAD / 2;                    // at f1503 the AD is centred in the frame
const dzEase = bezier(0.52, 0.0, 0.14, 1.0);
/** Dolly-zoom state for t >= HITD: constant visible height at the wall, lens FOV_END -> FOV_ORTHO (geometric in tan: constant zoom rate). */
export function dollyAt(t) {
  const u = clamp((t - F.HITD) / (F.ORTHO - F.HITD)), e = dzEase(u);
  const th0 = Math.tan(FOV_END * 0.5 * DEG), th1 = Math.tan(FOV_ORTHO * 0.5 * DEG), th = th0 * Math.pow(th1 / th0, e);
  return { u, e, th, fov: 2 * Math.atan(th) / DEG, dist: H_DZ / (2 * th), h: H_DZ };
}

/** World-space camera for t in [F.A7, F.ORTHO]. */
export function cameraAt(t) {
  const p = pullP(t);
  // street level at the edge of the plaza, looking down the avenue; pull back, crane up and slide across the plaza to the far frontal axis
  const x = 1100 * (1 - Math.pow(p, 1.35));
  const z = lerp(560, D_END, Math.pow(p, 0.92));
  const y = lerp(2.6, FRAME.ly + 38, Math.pow(p, 1.75));
  let pos = [x, y, z];
  const look = lerp3([420, 380, -700], [0, FRAME.ly, 0], Math.pow(p, 0.8));
  let fov = lerp(60, FOV_END, Math.pow(p, 0.8));
  let roll = -2.2 * Math.pow(1 - p, 2.2);
  const out = { pos, look, fov, roll, near: 2, far: 60000, ortho: 0, orthoHeight: H_DZ };
  if (t > F.OUT) {
    // hold (f1376-1439): a barely perceptible push; the lateral offset and height settle toward the exact frontal axis
    const q = smooth01(F.OUT, F.HITD, t);
    const push = 1 - (1 - PUSH) * smooth01(F.OUT, F.HITD, t);
    pos = [lerp(pos[0], 0, q), lerp(pos[1], FRAME.ly + 6, q), D_END * push];
    out.pos = pos; out.look = [0, FRAME.ly, 0]; out.fov = FOV_END; out.roll = 0;
  }
  if (t >= F.HITD) {
    // THE DOLLY-ZOOM: the AD keeps its size, the world flattens; the AD recentres vertically; orthographic on the last frames
    const d = dollyAt(t), ly = lerp(FRAME.ly, LY_FINAL, smooth01(F.HITD, F.ORTHO, t)), tilt = 6 * (1 - d.e);
    out.pos = [0, ly + tilt, d.dist]; out.look = [0, ly, 0]; out.fov = d.fov; out.roll = 0;
    out.near = Math.max(2, d.dist - 3600); out.far = d.dist + 16000;
    if (t >= F.ORTHO - 0.6) { out.ortho = 1; out.orthoHeight = d.h; out.pos = [0, ly, d.dist]; }
  }
  return out;
}

/** Camera-shake events (deterministic): the cut, the surge, and the two cadence hits. */
export function shakeAt(t, util) {
  const { shake, rumble, addShake } = util;
  const ev = [{ f: F.A7, amp: 0.7, decay: 4, freq: 0.6, seed: 1 }, { f: F.HITA, amp: 0.35, decay: 3.0, freq: 0.62, seed: 3 }, { f: F.HITD, amp: 1.15, decay: 6.0, freq: 0.5, seed: 9 }];
  [1170, 1188, 1203, 1221].forEach((f, i) => ev.push({ f, amp: 0.22 + 0.05 * i, decay: 2.4, freq: 0.7, seed: 20 + i }));
  const surge = rumble(t, F.SURGE, F.OUT - 0.5, 0.20, 1.05, { freq: 1.1, seed: 5, ease: EASE.inQuad });
  const run = rumble(t, F.A7, F.SURGE, 0.015, 0.20, { freq: 0.8, seed: 2, ease: EASE.inQuad });
  return addShake(shake(t, ev, { rollScale: 0.3 }), surge, run);
}

/** Everything the 3D climax needs at frame t (camera, env, AD uniforms). Pure function of t. Used by act7 (f1152-1407) and act8 (f1408-1503). */
export function applyClimax(ctx, t) {
  const { env, cam, util } = ctx;
  const world = getWorld(ctx);
  const out = t >= F.OUT - 0.5;                       // lights-out between frame 1375 and 1376: frame 1375 is wholly lit, frame 1376 wholly dark
  const p = pullP(t);
  const c = cameraAt(t);
  const dz = t >= F.HITD ? dollyAt(t) : null;
  const W = ctx.kits.world;
  W.preset(env, 'world');
  env.sun = { az: -40, el: 38, intensity: 1.5, dir: null };
  env.ambient = { up: 0.80, down: 0.50, bounce: 0 };
  env.fog = { density: 0.0005, height: 320, floorY: 0, air: lerp(0.00018, 0.00030, p) };
  env.ground = { albedo: [0.50, 0, 0] };
  env.post = { grain: 1.0, vignette: 0.45 };
  const sr = lerp(950, 2400, smooth01(0.0, 0.65, p));
  env.shadow = { on: !out, center: [lerp(-600, 0, p), 150, lerp(120, -200, p)], radius: sr, size: 2048, bias: 0.0005, normalBias: Math.max(1.2, sr * 0.0011) };
  const rings = [];
  const U_ = ADU;
  U_.uHit.value.set(F.HITA, F.HITD);
  U_.uMaskOn.value = out ? 1 : 0;
  U_.uAdFogK.value = out ? 0 : lerp(0.00020, 0.00005, smooth01(0, 1, p));
  U_.uSinkAD.value = 0; U_.uFlat.value = 0;
  if (out) {
    env.sun.intensity = 0; env.ambient = { up: 0.27, down: 0.18, bounce: 0 };
    // the dark world: thin air until the cadence, then it flattens and sinks into the red
    const dist = c.pos[2];
    let airMul = 1, sink = 0;
    if (dz) { airMul = (D_END * PUSH) / dz.dist; sink = smooth01(F.HITD + 30, F.ORTHO - 12, t); }
    env.fog = { density: 0.0005 * airMul * (1 + 600 * sink * sink), height: 320 + 1e5 * (dz ? dz.e : 0), floorY: 0, air: 0.00030 * airMul * (1 + 600 * sink * sink) };
    U_.uSinkAD.value = smooth01(F.HITD + 26, F.ORTHO - 10, t);
    U_.uFlat.value = smooth01(F.HITD + 4, F.ORTHO - 12, t);
    const g = 1 - smooth01(F.HITD + 6, F.ORTHO - 10, t);
    env.post = { grain: g, vignette: 0.45 * g };
    // shock rings along the plaza floor: the two hits
    const ring = (f, x, v, w, tail, k0, life) => { const dt = t - f; if (dt >= 0 && dt < life) rings.push({ x, z: 0, r: 20 + dt * v, w, tail, k: k0 * Math.pow(1 - dt / life, 1.4) }); };
    ring(F.HITA, (60 - AX) * S, 46, 7, 70, 1.0, 34);
    ring(F.HITD, (172 - AX) * S, 70, 9, 110, 1.0, 46);
  }
  cam.set({ pos: c.pos, look: c.look, fov: c.fov, roll: c.roll, near: c.near, far: c.far, ortho: c.ortho, orthoHeight: c.orthoHeight });
  if (t >= F.ORTHO - 2) cam.shake = null;
  else {
    cam.shake = shakeAt(t, util);
    if (t >= F.HITD) { const dt = t - F.HITD; cam.fov = cam.fov + 1.6 * Math.exp(-dt / 3.0) * (dt < 12 ? 1 : 0); }   // the D hit: the lens exhales
  }
  env.rings = rings;
  return { p, out, cam: c };
}

/* ═════════════════════════════════ the poster (2D, acts VIII-IX) ═════════════════════════════════
   "EVERY SKYLINE / STARTS WITH AN [AD]": two lines of Mona Sans Black, the AD set inline as the last word of line 2:
   cap-height matched, baseline aligned, optically spaced. Everything is laid out once from the font's real metrics. */

export const AD_PX_H = (1080 * HAD) / H_DZ;           // pixel height of the AD at f1503 (the end of the dolly-zoom)
const MARK_ASPECT = MARK_W / MARK_H;

let POSTER = null;
export function getPoster(ctx) {
  if (POSTER) return POSTER;
  const T = ctx.kits.type;
  const size = 164, track = -0.03, weight = 900, stretch = 100;
  const o = { size, track, weight, stretch };
  const cap = (T.measure('H', { size: 1000, weight, stretch }).ascent / 1000) * size;
  const tr = track * size, lead = 1.045 * size;
  const adW = cap * MARK_ASPECT;
  const l1 = ['EVERY', 'SKYLINE'], l2 = ['STARTS', 'WITH', 'AN'];
  const spaceAdv = T.measure('A A', o).width - T.measure('AA', o).width;       // advance of the space (tracking included)
  const gapAD = spaceAdv * 0.80;                                                // the A's raking edge leaves air at the cap line: close the word space a little
  const w1 = T.measure(l1.join(' '), o).width, w2t = T.measure(l2.join(' '), o).width;
  const W = Math.max(w1, w2t + gapAD + adW), x0 = (1920 - W) / 2;
  const blockH = cap + lead, capTop1 = 540 - blockH / 2 - 0.03 * size, base1 = capTop1 + cap, base2 = base1 + lead;
  const words = [];
  const pen = (arr, j, x) => x + (j ? T.measure(arr.slice(0, j).join(' ') + ' ', o).width + tr : 0);
  l1.forEach((w, j) => words.push({ w, line: 0, x: pen(l1, j, x0), base: base1, i: words.length }));
  l2.forEach((w, j) => words.push({ w, line: 1, x: pen(l2, j, x0), base: base2, i: words.length }));
  const ad = { left: x0 + w2t + gapAD, base: base2, h: cap, w: adW };
  ad.cx = ad.left + adW / 2; ad.cy = base2 - cap / 2;
  POSTER = { size, track, o, cap, tr, lead, x0, W, base1, base2, capTop1, words, ad, w1, w2t, spaceAdv, mask: { pad: 0.05 * size } };
  return POSTER;
}

/** Draws the words with their rise / exit offsets. state(word) -> {dy (px, +down), alpha}. Each line is clipped to its own box so type rises out of the baseline. */
export function drawWords(ctx, g, P, state) {
  const T = ctx.kits.type;
  for (const line of [0, 1]) {
    const base = line ? P.base2 : P.base1;
    g.save(); g.beginPath(); g.rect(P.x0 - 40, base - P.cap - 0.05 * P.size, P.W + 120, P.cap + 0.05 * P.size + 0.045 * P.size); g.clip();
    for (const w of P.words) {
      if (w.line !== line) continue;
      const st = state(w); if (!st || st.alpha <= 0) continue;
      T.draw(g, w.w, { ...P.o, x: w.x, y: base + st.dy, fill: '#fff', alpha: st.alpha });
    }
    g.restore();
  }
}
