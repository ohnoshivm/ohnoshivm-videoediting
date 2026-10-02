/* DOMINANT · kits/towers.js
   TowerSet: thousands of towers in two draw calls per crown kind. Each tower = a white rectangular shaft (instanced box with an
   anti-aliased facade shader: floor lines, spandrels, mullions, mechanical bands; all fading to flat white with distance) topped by
   a crown that is one of the monogram's shapes extruded with its EXACT profile ('A','Am','Dd','Ds','Dsm').
   Rise / landing are animated ON THE GPU from the global frame time (uTime), so a scene never touches per-tower state:
   shaft rises from the ground (mode 'slide': rigid rise from below ground; 'grow': extrudes upward), then the crown either rides
   on top or DROPS onto the shaft and lands on `land`. Nothing ever falls over, breaks or collapses.
   JackTower: the Act I hero (hits that lift the whole stack one module at a time). */
import * as THREE from 'three';
import { GLSL_COMMON, GLSL_RISE, makeMaterial, makeShadowMaterial } from '../engine/gfx.js';
import { crownGeometry, crownSize, CROWN_KINDS } from './logo.js';

const EASE_KIND = { out: 0, slam: 1, back: 2, linear: 3 };
/** Floor-reflection twins: the same geometry mirrored about y = 0, drawn (layer 2) into the engine's reflection target in a pass of their own;
    makeGround()/makeWater() shaders then sample that target at the same screen position. Opaque and depth-tested, so occlusion is correct. */
export function mirrorMaterial({ vert, frag, defines = {}, uniforms = {}, reflect }) {
  return makeMaterial({ vert, frag, defines: { ...defines, MIRROR: 1 }, uniforms: { ...uniforms, uReflect: { value: reflect } }, side: THREE.BackSide });
}
const asTwin = (m) => { m.frustumCulled = false; m.renderOrder = 6; m.layers.set(2); return m; };

/* ──────────────────────────────── geometry ──────────────────────────────── */

let _box = null;
/** Unit box, x/z in [-0.5,0.5], y in [0,1], no bottom face. 30 vertices, flat normals. */
function shaftBase() {
  if (_box) return _box;
  const P = [], N = [];
  const quad = (a, b, c, d, n) => { for (const v of [a, b, c, a, c, d]) { P.push(...v); N.push(...n); } };
  quad([0.5, 0, -0.5], [0.5, 1, -0.5], [0.5, 1, 0.5], [0.5, 0, 0.5], [1, 0, 0]);       // +x
  quad([-0.5, 0, 0.5], [-0.5, 1, 0.5], [-0.5, 1, -0.5], [-0.5, 0, -0.5], [-1, 0, 0]);   // -x
  quad([-0.5, 1, -0.5], [-0.5, 1, 0.5], [0.5, 1, 0.5], [0.5, 1, -0.5], [0, 1, 0]);      // +y
  quad([-0.5, 0, 0.5], [0.5, 0, 0.5], [0.5, 1, 0.5], [-0.5, 1, 0.5], [0, 0, 1]);        // +z
  quad([0.5, 0, -0.5], [-0.5, 0, -0.5], [-0.5, 1, -0.5], [0.5, 1, -0.5], [0, 0, -1]);   // -z
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  return (_box = g);
}

let _mass = null;
/** Massing: stacked unit boxes (podium, main shaft, setback section, slim top section, entrance canopy, rooftop mast), tagged aSeg 0..5. The vertex shader maps
    every box to its height range and footprint fraction from per-instance attributes (aMassA/aMassB), so one draw call still covers thousands
    of towers. No bottom faces. 180 vertices. */
function massingBase() {
  if (_mass) return _mass;
  const b = shaftBase(), P = b.attributes.position.array, N = b.attributes.normal.array, nv = P.length / 3;
  const NB = 6, pos = new Float32Array(nv * NB * 3), nor = new Float32Array(nv * NB * 3), seg = new Float32Array(nv * NB);
  for (let k = 0; k < NB; k++) { pos.set(P, k * nv * 3); nor.set(N, k * nv * 3); seg.fill(k, k * nv, (k + 1) * nv); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('aSeg', new THREE.Float32BufferAttribute(seg, 1));
  return (_mass = g);
}
let _crane = null;
/** Tower crane: mast, jib, counter-jib, counterweight (unit boxes tagged aSeg 0..3), placed and slewed in the vertex shader. */
function craneBase() {
  if (_crane) return _crane;
  const b = shaftBase(), P = b.attributes.position.array, N = b.attributes.normal.array, nv = P.length / 3, NB = 4;
  const pos = new Float32Array(nv * NB * 3), nor = new Float32Array(nv * NB * 3), seg = new Float32Array(nv * NB);
  for (let k = 0; k < NB; k++) { pos.set(P, k * nv * 3); nor.set(N, k * nv * 3); seg.fill(k, k * nv, (k + 1) * nv); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('aSeg', new THREE.Float32BufferAttribute(seg, 1));
  return (_crane = g);
}
const hash = (a, b, k) => { const v = Math.sin(a * 12.9898 + b * 78.233 + k * 37.719) * 43758.5453; return v - Math.floor(v); };
/** Per-tower massing (deterministic from position/seed). Returns [aMassA, aMassB]:
    A = [podium height, main footprint fraction, setback height, setback fraction], B = [top-section height, top fraction, facade style, random]. */
export function massingOf(s) {
  const r = (k) => hash(s.x * 0.0137 + s.seed * 1.31, s.z * 0.0191, k), h = s.h, style = Math.floor(r(9) * 3) % 3;
  const plain = [[0, 1, h, 1], [0, 1, style, r(8)]];
  if (s.massing === false || h < 40 || Math.min(s.w, s.d) < 6) return plain;
  if (s.riseH > 0) {   // a tier of an authored stack: keep its footprint (the author already made the setbacks)
    const hp = s.y < 0.5 && h > 60 ? Math.min(20, Math.max(5, 0.07 * h)) : 0, tH = s.crown ? Math.min(16, Math.max(4, 0.05 * h)) : 0;
    return [[hp, hp ? 0.9 : 1, h, hp ? 0.9 : 1], [tH, hp ? 0.8 : 0.9, style, r(8)]];
  }
  const hp = h > 70 ? Math.min(22, Math.max(6, 0.06 * h)) : 0;
  const wm = 0.84 + 0.09 * r(1);
  const tH = s.crown ? Math.min(18, Math.max(4, 0.045 * h)) : Math.min(10, Math.max(3, 0.03 * h));
  let ys = h - tH, ws = wm;
  if (h > 110 && r(2) < 0.62) { ys = h * (0.52 + 0.22 * r(3)); ws = wm * (0.80 + 0.10 * r(4)); }
  const wt = ws * (0.86 + 0.07 * r(5));
  const mast = !s.crown && h > 90 && r(6) < 0.65 ? Math.round(Math.min(40, Math.max(8, 0.12 * h))) : 0;   // spire/mast on crown-less roofs
  return [[hp, wm, Math.min(ys, h - tH), ws], [tH, wt, style + 3 * mast, r(8)]];
}

/* ──────────────────────────────── shaders ──────────────────────────────── */

/* construction motion shared by shafts and crowns: the stack grows FLOOR BY FLOOR (segments snap up in quick succession on the spec's ease),
   then the top lands with a short heavy settle (a dip and a damped rebound over ~3 frames). Crowns ride the top or drop onto it on 'land'. */
const GLSL_BUILD = /* glsl */ `
float bhash(float x) { return fract(sin(x * 12.9898 + 4.1414) * 43758.5453); }
float towerSeed(vec2 xz) { return fract(sin(dot(xz, vec2(0.1371, 0.0973))) * 43758.5453); }
// segments of floors snap up one after another; each segment starts after a small random hold (time-lapse jitter), never goes down
float growStep(float e, float stackH, float pitch, float seed) {
  float n = clamp(floor(stackH / max(pitch * 5.0, 8.0)), 3.0, 14.0);
  float g = clamp(e, 0.0, 1.0) * n, k = floor(g), f = g - k;
  float a = 0.32 * bhash(k * 7.13 + seed * 91.7);
  return min((k + smoothstep(a, min(a + 0.5, 1.0), f)) / n, 1.0);
}
float settleAt(float dt, float stackH) {
  if (dt <= 0.0) return 0.0;
  float A = min(0.006 * stackH, 3.2);
  return -A * sin(3.14159265 * min(dt, 6.0) / 1.4) * exp(-dt / 0.9);
}
// visible height of THIS spec's shaft (tiers of a stack share the stack's growth); complete = 1 once the stack has topped out
float visHeight(float h, float stackH, float stackBase, float baseY, float p, float e, float pitch, float tSettle, float seed, out float complete) {
  float G = stackH * growStep(e, stackH, pitch, seed);
  complete = p >= 1.0 ? 1.0 : 0.0;
  float hv = clamp(stackBase + G - baseY, 0.0, h);
  bool isTop = baseY + h >= stackBase + stackH - 0.5;
  if (isTop && complete > 0.5) hv = h + settleAt(uTime - tSettle, stackH);
  return hv;
}`;

/* ──────────────────────────────── shaders ──────────────────────────────── */

const VERT_SHAFT = /* glsl */ `
in vec4 aPos; in vec4 aDim; in vec4 aRise; in vec4 aDrop; in vec4 aCrown;
uniform float uTime;
#ifdef JACK
uniform float uTop;
#else
in float aSeg; in vec4 aMassA; in vec4 aMassB;
#endif
out vec3 vWorld; out vec3 vN; out vec3 vLoc; out vec4 vInfo; out vec4 vMass; out vec2 vSeg; flat out float vFace;
${GLSL_RISE}
${GLSL_BUILD}
void main() {
  vFace = abs(normal.x) > 0.5 ? 0.0 : (abs(normal.z) > 0.5 ? 1.0 : 2.0);
  vInfo = vec4(aDim.x, aDim.y, aDim.w, aDrop.z);
  float h = aDim.z;
  float kind = mod(aRise.w, 10.0), mode = floor(aRise.w / 10.0);
  float yoff = 0.0, hh = h, fr = 1.0, ly;
  vMass = vec4(0.0, 1e5, 0.0, 0.5); vSeg = vec2(0.0);
  vec2 xzOff = vec2(0.0); vec2 xzS = vec2(1.0);
#ifdef JACK
  hh = max(uTop, 0.001);
  ly = position.y * hh;
#else
  vec4 OFF = vec4(2.0, 2.0, 2.0, 1.0);
  if (uTime < aRise.x) { vWorld = vec3(0.0); vN = vec3(0.0, 1.0, 0.0); vLoc = vec3(0.0); gl_Position = OFF; return; }
  float p = clamp((uTime - aRise.x) / max(aRise.y, 0.001), 0.0, 1.0);
  float e = min(easeKind(p, kind), 1.0);
  float stackH = aCrown.w > 0.0 ? aCrown.w : h, stackBase = aCrown.w > 0.0 ? 0.0 : aPos.y;
  float tSettle = aDrop.x > 0.0 ? max(aRise.z, aRise.x + aRise.y) : aRise.x + aRise.y;
  float complete;
  float hv = visHeight(h, stackH, stackBase, aPos.y, p, e, max(aDim.w, 0.5), tSettle, towerSeed(aPos.xz), complete);
  // massing segment: podium / main shaft / setback / slim top section
  float hp = aMassA.x, ys = aMassA.z, tH = aMassB.x, yA, yB;
  if (aSeg < 0.5) { yA = 0.0; yB = hp; fr = 1.0; }
  else if (aSeg < 1.5) { yA = hp; yB = ys; fr = aMassA.y; }
  else if (aSeg < 2.5) { yA = ys; yB = h - tH; fr = aMassA.w; }
  else if (aSeg < 3.5) { yA = h - tH; yB = h; fr = aMassB.y; }
  else if (aSeg < 4.5) { yA = min(hp * 0.42, 7.0); yB = hp > 0.0 ? yA + 0.9 : yA; xzS = vec2(0.34, 0.14); xzOff = vec2(0.0, 0.57 * aDim.y); fr = 1.0; }   // entrance canopy on the podium front
  else { float mH = floor(aMassB.z / 3.0); yA = h; yB = complete > 0.5 ? h + mH : h; float mw = max(1.2, 0.045 * aDim.x); xzS = vec2(mw / aDim.x, mw / aDim.y); fr = 1.0; }   // rooftop mast
  bool over = aSeg < 4.5 ? yA >= hv - 0.005 : (aSeg < 4.5 ? false : complete < 0.5);
  if (yB - yA < 0.01 || over) { vWorld = vec3(0.0); vN = vec3(0.0, 1.0, 0.0); vLoc = vec3(0.0); gl_Position = OFF; return; }
  ly = mix(yA, yB, position.y);
  if (aSeg < 4.5) ly = (complete > 0.5 && aSeg > 2.5 && aSeg < 3.5 && position.y > 0.5) ? hv : min(ly, hv);
  else ly += hv - h;
  vMass = vec4(mod(aMassB.z, 3.0), hv - ly, complete > 0.5 ? 0.0 : 1.0, aMassB.w);
  vSeg = vec2(yA, aSeg);
#endif
  float ca = cos(aPos.w), sa = sin(aPos.w);
  vec2 xz = vec2(position.x * aDim.x * fr * xzS.x, position.z * aDim.y * fr * xzS.y) + xzOff;
  vec3 wp = vec3(aPos.x + ca * xz.x + sa * xz.y, aPos.y + yoff + ly, aPos.z - sa * xz.x + ca * xz.y);
  vN = mat3(modelMatrix) * vec3(ca * normal.x + sa * normal.z, normal.y, -sa * normal.x + ca * normal.z);
#ifdef JACK
  vLoc = vec3(xz.x, hh - ly, xz.y);      // y = distance BELOW the stack top: the facade rides with the crown
#else
  vLoc = vec3(xz.x, ly, xz.y);           // y = height above the tower's own base
#endif
  vec4 W = modelMatrix * vec4(wp, 1.0);
  vWorld = W.xyz;
#ifdef MIRROR
  W.y = -W.y;                              // planar reflection about the ground plane y = 0
#endif
  gl_Position = projectionMatrix * viewMatrix * W;
}`;

/* final colour: fog, clamp; the MIRROR variant is the floor reflection (fogged along the reflected ray, fresnel-ish strength, fading with height) */
const GLSL_OUT = /* glsl */ `
#ifdef MIRROR
  vec3 mp = vec3(vWorld.x, -vWorld.y, vWorld.z);
  col = applyFog(col, mp);
  float cosT = abs(normalize(mp - cameraPosition).y);
  float refl = uReflect * (0.50 + 0.50 * pow(1.0 - cosT, 2.0)) * exp(-vWorld.y / 520.0);
  outColor = vec4(min(col, vec3(1.0)) * refl, refl);   // premultiplied
#else
  col = applyFog(col, vWorld);
  outColor = vec4(min(col, vec3(1.0)), 1.0);
#endif`;
const REFL_UNI = /* glsl */ `
#ifdef MIRROR
uniform float uReflect;
#endif`;

const FRAG_SHAFT = (/* glsl */ `
precision highp float;
${GLSL_COMMON}
${REFL_UNI}
in vec3 vWorld; in vec3 vN; in vec3 vLoc; in vec4 vInfo; in vec4 vMass; in vec2 vSeg; flat in float vFace;
out vec4 outColor;
#ifdef JACK
uniform float uSeam[24];
#endif
void main() {
  vec3 n = normalize(vN);
  float pitch = max(vInfo.z, 0.5);
  float hc = vFace < 0.5 ? vLoc.z : vLoc.x;
  float yc = vLoc.y;
  float alb = 1.0;
  vec3 albC = vec3(1.0);
  float litE = 0.0, reflAmt = 0.0, aoS = 1.0;
  vec3 V = normalize(cameraPosition - vWorld);
  if (vFace < 1.5 && vSeg.y < 3.5) {
#ifdef JACK
    float flo = aaLine(yc, pitch, 0.34);
    float spn = aaBand(yc + pitch * 0.5, pitch, 0.30);
    float mul = aaLine(hc, max(pitch * 0.46, 1.2), 0.15);
    float mech = aaBand(yc, pitch * 22.0, 0.075);
    alb = 1.0 - 0.17 * flo - 0.055 * spn - 0.075 * mul * (1.0 - spn) - 0.10 * mech;
#else
    // curtain wall: mullions + floor spandrels; style 0 grid, 1 vertical fins, 2 horizontal bands. Every darkening tints toward red
    // (albedo (1,a,a)), so the palette stays red/white; all detail fades to its average before it can alias.
    float style = vMass.x, rnd = vMass.w;
    float panW = pitch * (style > 1.5 ? 1.3 : (style > 0.5 ? 0.85 : 1.0));
    float fwy = max(fwidth(yc), 1e-4), fwx = max(fwidth(hc), 1e-4);
    float det = 1.0 - smoothstep(0.18, 0.62, max(fwy / pitch, fwx / panW));
    float flo = aaLine(yc, pitch, 0.36);
    float spn = aaBand(yc + pitch * 0.5, pitch, style > 1.5 ? 0.46 : 0.24);
    float mul = aaLine(hc, panW, style > 0.5 && style < 1.5 ? 0.30 : 0.12);
    float mech = aaBand(yc, pitch * 22.0, 0.07);
    vec2 cell = vec2(floor(hc / panW), floor(yc / pitch));
    float ph = hash12(cell + vec2(rnd * 97.0, rnd * 13.0));
    float fres = pow(1.0 - clamp(abs(dot(n, V)), 0.0, 1.0), 4.0);
    float g = 0.78 + 0.05 * rnd + 0.12 * mix(0.5, ph, det);
    float lit = step(0.988, hash12(vec2(floor(cell.x / 3.0), cell.y) * 1.37 + vec2(11.0 + rnd * 31.0, 5.0))) * det;   // a few lit runs of 3 panels
    vec3 glass = vec3(1.0, g, g);
    float gm = (1.0 - spn) * (1.0 - mul);
    // structure first: while rising, the top ~2-3.5 floors are exposed frame (slab edges, columns, the concrete core behind); the cladding
    // climbs behind it panel by panel (ragged edge)
    float open = vMass.z * (1.0 - step(2.0 + 1.5 * ph, vMass.y / pitch));
    float W = (vFace < 0.5 ? vInfo.y : vInfo.x) * 0.85;
    float cols = aaLine(hc, panW * 2.0, 0.9), slab = aaLine(yc, pitch, 0.7);
    float core = 1.0 - smoothstep(0.13 * W, 0.15 * W, abs(hc));
    vec3 frameAlb = mix(mix(vec3(1.0, 0.14, 0.14), vec3(1.0, 0.86, 0.86), core), vec3(1.0), max(cols, slab));
    vec3 frameC = style > 1.5 ? vec3(1.0) : vec3(1.0, 0.97, 0.97);
    vec3 near = mix(frameC, glass, gm) * vec3(1.0, 1.0 - 0.16 * flo, 1.0 - 0.16 * flo);
    vec3 far = vec3(1.0, 0.86 + 0.06 * rnd, 0.86 + 0.06 * rnd);
    albC = mix(far, near, det) * vec3(1.0, 1.0 - 0.08 * mech, 1.0 - 0.08 * mech);
    albC = mix(albC, frameAlb, open);
    litE = lit * gm * (1.0 - open);
    reflAmt = mix(0.55, gm, det) * (0.08 + 0.50 * fres) * (1.0 - open);
    if (vSeg.y > 0.5 && vSeg.x > 0.5) aoS = mix(0.62, 1.0, smoothstep(0.0, 9.0, yc - vSeg.x));     // occlusion above podium / setback terraces
#endif
#ifdef JACK
    float dmin = 1e5;
    for (int i = 0; i < 24; i++) dmin = min(dmin, abs(yc - uSeam[i]));
    float fw = max(fwidth(yc), 1e-4);
    float seam = 1.0 - smoothstep(0.55 - 0.5 * fw, 0.55 + 0.5 * fw, dmin);
    alb -= 0.30 * seam;
#endif
  }
  float ao = mix(0.42, 1.0, smoothstep(0.0, 45.0, vWorld.y)) * aoS;                // contact darkening at the base and at terraces
  vec3 col = lightSurface(albC * alb, n, vWorld, ao);
  // glass reflects the red sky: lighter toward the horizon, deeper overhead, the ground below; Fresnel-weighted (stays red/white)
  vec3 Rr = reflect(-V, n);
  vec3 skyC = Rr.y < 0.0 ? BRAND_RED * 0.55 : mix(mix(BRAND_RED, vec3(1.0), 0.30), BRAND_RED * 0.70, smoothstep(0.0, 0.65, Rr.y));
  col = mix(col, skyC, reflAmt) + vec3(0.30) * litE;
  REFLECT_OUT
}`).replace('REFLECT_OUT', GLSL_OUT);

const VERT_CROWN = /* glsl */ `
in vec4 aPos; in vec4 aDim; in vec4 aRise; in vec4 aDrop; in vec4 aCrown;
uniform float uTime;
#ifdef HERO
uniform float uBaseY;
#endif
out vec3 vWorld; out vec3 vN;
${GLSL_RISE}
${GLSL_BUILD}
void main() {
  float h = aDim.z;
  float kind = mod(aRise.w, 10.0), mode = floor(aRise.w / 10.0);
  float baseY;
  float drop = 0.0;
#ifdef HERO
  baseY = uBaseY;
#else
  float cdur = max(aDrop.y, 0.001);
  bool dropping = aDrop.x > 0.0;
  if (uTime < aRise.x || (dropping && uTime < aRise.z - cdur)) { vWorld = vec3(0.0); vN = vec3(0.0, 1.0, 0.0); gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  float p = clamp((uTime - aRise.x) / max(aRise.y, 0.001), 0.0, 1.0);
  float e = easeKind(p, kind);
  float rh = aCrown.w > 0.0 ? aCrown.w : h;
  float top;
  if (h <= 0.0) top = (mode < 0.5) ? (h - rh * (1.0 - e)) : (h * e);                 // custom prisms (bridges, sails, voids): rigid rise
  else {                                                                              // crowns ride the floor-by-floor top, then settle with it
    float stackBase = aCrown.w > 0.0 ? 0.0 : aPos.y, complete;
    float tSettle = dropping ? max(aRise.z, aRise.x + aRise.y) : aRise.x + aRise.y;
    float sd = towerSeed(aPos.xz);
    top = visHeight(h, rh, stackBase, aPos.y, p, min(e, 1.0), max(aDim.w, 0.5), tSettle, sd, complete);
    if (stackBase + rh * growStep(min(e, 1.0), rh, max(aDim.w, 0.5), sd) < aPos.y - 0.01) { vWorld = vec3(0.0); vN = vec3(0.0, 1.0, 0.0); gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
    // a crown that does not drop is built last: hidden while the crane works, then LOWERED onto the top, touching down at completion
    if (!dropping && aRise.y > 2.5) {
      if (p < 0.7) { vWorld = vec3(0.0); vN = vec3(0.0, 1.0, 0.0); gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
      drop = (14.0 + 0.3 * aDim.x) * (1.0 - smoothstep(0.7, 1.0, p));
    }
  }
  baseY = aPos.y + top + aCrown.z;
  if (dropping) { float pc = clamp((uTime - (aRise.z - cdur)) / cdur, 0.0, 1.0); drop = aDrop.x * (1.0 - pc * pc); }
#endif
  float s = aCrown.x, cz = aCrown.y;
  vec3 lp = vec3(position.x * s, position.y * s, position.z * cz);
  float ca = cos(aPos.w), sa = sin(aPos.w);
  vec3 wp = vec3(aPos.x + ca * lp.x + sa * lp.z, baseY + drop + lp.y, aPos.z - sa * lp.x + ca * lp.z);
  vec3 nl = normalize(vec3(normal.x / s, normal.y / s, normal.z / cz));
  vN = mat3(modelMatrix) * vec3(ca * nl.x + sa * nl.z, nl.y, -sa * nl.x + ca * nl.z);
  vec4 W = modelMatrix * vec4(wp, 1.0);
  vWorld = W.xyz;
#ifdef MIRROR
  W.y = -W.y;                              // planar reflection about the ground plane y = 0
#endif
  gl_Position = projectionMatrix * viewMatrix * W;
}`;

const FRAG_CROWN = (/* glsl */ `
precision highp float;
${GLSL_COMMON}
${REFL_UNI}
in vec3 vWorld; in vec3 vN;
out vec4 outColor;
void main() {
  vec3 n = normalize(vN);
  float ao = mix(0.55, 1.0, smoothstep(0.0, 60.0, vWorld.y));
  vec3 col = lightSurface(vec3(1.0), n, vWorld, ao);
  REFLECT_OUT
}`).replace('REFLECT_OUT', GLSL_OUT);

const VERT_CRANE = /* glsl */ `
in vec4 aPos; in vec4 aDim; in vec4 aRise; in vec4 aDrop; in vec4 aCrown; in vec4 aMassA; in vec4 aMassB; in float aSeg;
uniform float uTime;
out vec3 vWorld; out vec3 vN; out vec3 vL;
${GLSL_RISE}
${GLSL_BUILD}
void main() {
  vec4 OFF = vec4(2.0, 2.0, 2.0, 1.0);
  float h = aDim.z, kind = mod(aRise.w, 10.0);
  float p = clamp((uTime - aRise.x) / max(aRise.y, 0.001), 0.0, 1.0);
  if (uTime < aRise.x || p >= 0.96) { vWorld = vec3(0.0); vN = vec3(0.0, 1.0, 0.0); vL = vec3(0.0); gl_Position = OFF; return; }
  float e = min(easeKind(p, kind), 1.0), sd = towerSeed(aPos.xz), complete;
  float stackH = aCrown.w > 0.0 ? aCrown.w : h, stackBase = aCrown.w > 0.0 ? 0.0 : aPos.y;
  float hv = visHeight(h, stackH, stackBase, aPos.y, p, e, max(aDim.w, 0.5), 1e9, sd, complete);
  float Hm = clamp(0.10 * stackH, 22.0, 55.0), Lj = clamp(0.9 * aDim.x, 34.0, 70.0);
  float base = aPos.y + hv - (Hm + 6.0) * smoothstep(0.74, 0.95, p);              // the crane climbs with the building, then retracts into it
  float slew = sd * 6.2832 + 0.035 * uTime;
  vec3 c; vec3 sz; vec3 lp = position;                                               // unit box x,z in [-0.5,0.5], y in [0,1]
  if (aSeg < 0.5) { sz = vec3(2.4, Hm, 2.4); c = vec3(0.0, 0.0, 0.0); }
  else if (aSeg < 1.5) { sz = vec3(Lj, 2.2, 1.6); c = vec3(0.5 * Lj - 1.2, Hm, 0.0); }
  else if (aSeg < 2.5) { sz = vec3(0.32 * Lj, 1.8, 1.6); c = vec3(-0.16 * Lj - 1.2, Hm, 0.0); }
  else { sz = vec3(4.0, 3.2, 3.0); c = vec3(-0.30 * Lj, Hm - 3.4, 0.0); }
  vec3 q = lp * sz + c;
  float cs = cos(slew), ss = sin(slew);
  if (aSeg > 0.5) q = vec3(cs * q.x + ss * q.z, q.y, -ss * q.x + cs * q.z);
  vL = vec3(aSeg < 0.5 ? q.y : lp.x * sz.x, aSeg < 0.5 ? lp.x * sz.x : lp.y * sz.y, aSeg);
  float ca = cos(aPos.w), sa = sin(aPos.w);
  vec2 off = vec2(0.18 * aDim.x * aMassB.y, -0.12 * aDim.y * aMassB.y);
  vec3 lq = vec3(q.x + off.x, q.y, q.z + off.y);
  vec3 wp = vec3(aPos.x + ca * lq.x + sa * lq.z, base + lq.y, aPos.z - sa * lq.x + ca * lq.z);
  vec3 nl = normal;
  if (aSeg > 0.5) nl = vec3(cs * nl.x + ss * nl.z, nl.y, -ss * nl.x + cs * nl.z);
  vN = mat3(modelMatrix) * vec3(ca * nl.x + sa * nl.z, nl.y, -sa * nl.x + ca * nl.z);
  vec4 W = modelMatrix * vec4(wp, 1.0);
  vWorld = W.xyz;
#ifdef MIRROR
  W.y = -W.y;
#endif
  gl_Position = projectionMatrix * viewMatrix * W;
}`;
const FRAG_CRANE = (/* glsl */ `
precision highp float;
${GLSL_COMMON}
${REFL_UNI}
in vec3 vWorld; in vec3 vN; in vec3 vL;
out vec4 outColor;
void main() {
  vec3 n = normalize(vN);
  // lattice: diagonal bracing in red over white members; fades to its average with distance
  float lat = max(aaLine(vL.x + vL.y, 3.0, 0.45), aaLine(vL.x - vL.y, 3.0, 0.45));
  vec3 alb = vL.z > 2.5 ? vec3(1.0, 0.25, 0.25) : mix(vec3(1.0), vec3(1.0, 0.2, 0.2), 0.75 * lat);
  vec3 col = lightSurface(alb, n, vWorld, 1.0);
  REFLECT_OUT
}`).replace('REFLECT_OUT', GLSL_OUT);

/* ──────────────────────────────── TowerSet ──────────────────────────────── */

const DEFAULT_SPEC = { x: 0, z: 0, y: 0, w: 60, d: 40, h: 200, rot: 0, crown: null, crownScale: 1, crownDepth: null, crownLift: 0,
  t0: -1e6, dur: 14, land: null, ease: 'slam', mode: 'slide', pitch: 4.2, seed: 0, tint: 0, drop: 0, dropDur: 4, riseH: 0 };

export class TowerSet {
  /** opts: {lod: 0|1|2 crown mesh detail, shadow: cast shadows (default true), name, reflect: 0..1 glossy-floor reflection strength (needs makeGround({reflect:true}); costs a second draw),
      massing: true (podium / setback / slim top section per tower; spec.massing:false opts one tower out)} */
  constructor({ lod = 0, shadow = true, name = 'towers', reflect = 0, massing = true } = {}) {
    this.massing = massing; this.reflect = reflect; this.lod = lod; this.castShadow = shadow; this.specs = []; this.group = new THREE.Group(); this.group.name = name;
    this.built = false; this.meshes = [];
  }
  /** Add one tower. Returns its index. Spec fields (all optional): x,z,y, w (width, m), d (depth, m), h (shaft height, m), rot (rad about y),
      crown ('A'|'Am'|'Dd'|'Ds'|'Dsm'|null), crownScale (1 = crown exactly as wide as the shaft), crownDepth (default d), crownLift (m),
      t0 (frame the shaft starts rising; default already risen), dur (frames to rise), ease ('slam'|'out'|'back'|'linear'),
      mode ('slide' rigid rise from underground | 'grow' extrude up), land (frame the crown touches down; default t0+dur),
      drop (m the crown falls from) + dropDur (frames, default 4): crown plummets and lands exactly on `land`,
      riseH (m; stacked tiers: the rigid rise travels this far, so tiers of one tower share t0/dur/mode and riseH = total stack height),
      pitch (floor pitch m), seed, tint. */
  add(spec) { const s = { ...DEFAULT_SPEC, ...spec }; if (s.land == null) s.land = s.t0 + s.dur; this.specs.push(s); return this.specs.length - 1; }
  addAll(list) { for (const s of list) this.add(s); return this; }
  /** A custom extruded prism that rises like a tower (bridges, crowns with voids...). geometry: THREE.BufferGeometry from logo.extrude() with
      x,y in METRES and z thickness 1 (scaled by depth). spec: {x,y,z,rot,depth,t0,dur,ease,mode,riseH,land,drop,dropDur,h (rise travel height)}. */
  addPrism(geometry, spec) { (this.prisms ||= []).push({ geometry, s: { ...DEFAULT_SPEC, w: 1, d: 1, h: 0, ...spec } }); return this; }
  get count() { return this.specs.length; }
  /** frames where crowns/shafts touch down, sorted: [{f, i, x, z, h}] (use for impacts: camera shake, ground rings, audio sync checks). */
  landings() { return this.specs.map((s, i) => ({ f: s.crown ? s.land : s.t0 + s.dur, i, x: s.x, z: s.z, h: s.h })).filter((l) => l.f > -1e5).sort((a, b) => a.f - b.f); }
  bounds() { const b = { minX: 1e9, maxX: -1e9, minZ: 1e9, maxZ: -1e9, maxH: 0 }; for (const s of this.specs) { b.minX = Math.min(b.minX, s.x - s.w / 2); b.maxX = Math.max(b.maxX, s.x + s.w / 2); b.minZ = Math.min(b.minZ, s.z - s.d / 2); b.maxZ = Math.max(b.maxZ, s.z + s.d / 2); b.maxH = Math.max(b.maxH, s.h); } return b; }

  /** Builds GPU buffers. Call once after add(); call again after adding more (it rebuilds). */
  build() {
    for (const m of this.meshes) { this.group.remove(m); m.geometry.dispose(); }
    this.meshes = [];
    const n = this.specs.length;
    const mk = (idx) => {
      const N = idx.length, aPos = new Float32Array(N * 4), aDim = new Float32Array(N * 4), aRise = new Float32Array(N * 4), aDrop = new Float32Array(N * 4), aCrown = new Float32Array(N * 4);
      const aMassA = new Float32Array(N * 4), aMassB = new Float32Array(N * 4);
      idx.forEach((si, k) => {
        const s = this.specs[si], o = k * 4, [mA, mB] = this.massing ? massingOf(s) : [[0, 1, s.h, 1], [0, 1, 0, 0.5]];
        aMassA.set(mA, o); aMassB.set(mB, o);
        aPos.set([s.x, s.y, s.z, s.rot], o); aDim.set([s.w, s.d, s.h, s.pitch], o);
        aRise.set([s.t0, Math.max(s.dur, 0.001), s.land, (s.mode === 'grow' ? 10 : 0) + (EASE_KIND[s.ease] ?? 1)], o);
        aDrop.set([s.drop, s.dropDur, s.seed, s.tint], o);
        let cs = 1, cd = s.crownDepth ?? s.d;
        if (s.crown) cs = (s.w * mB[1] / crownSize(s.crown).width) * s.crownScale;   // the crown sits on the (slimmer) top section
        cd *= mB[1];
        if (s.crown === 'S') cd = cs;   // sphere: z is native size
        aCrown.set([cs, cd, s.crownLift, s.riseH || 0], o);
      });
      return { N, aPos, aDim, aRise, aDrop, aCrown, aMassA, aMassB };
    };
    const attach = (g, d, withCrown) => {
      g.instanceCount = d.N;
      g.setAttribute('aPos', new THREE.InstancedBufferAttribute(d.aPos, 4));
      g.setAttribute('aDim', new THREE.InstancedBufferAttribute(d.aDim, 4));
      g.setAttribute('aRise', new THREE.InstancedBufferAttribute(d.aRise, 4));
      g.setAttribute('aDrop', new THREE.InstancedBufferAttribute(d.aDrop, 4));
      g.setAttribute('aCrown', new THREE.InstancedBufferAttribute(d.aCrown, 4));
      if (!withCrown) { g.setAttribute('aMassA', new THREE.InstancedBufferAttribute(d.aMassA, 4)); g.setAttribute('aMassB', new THREE.InstancedBufferAttribute(d.aMassB, 4)); }
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1e7);
    };
    const instGeo = (base) => { const g = new THREE.InstancedBufferGeometry(); g.index = base.index; for (const k of Object.keys(base.attributes)) g.setAttribute(k, base.attributes[k]); return g; };
    const mesh = (geo, mat, shadowMat, order, mirrorOf) => {
      const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; m.renderOrder = order;
      if (this.castShadow) { m.userData.shadowMaterial = shadowMat; m.layers.enable(1); }
      this.group.add(m); this.meshes.push(m);
      if (this.reflect > 0 && mirrorOf) { const mm = asTwin(new THREE.Mesh(geo, mirrorMaterial({ vert: mirrorOf[0], frag: mirrorOf[1], reflect: this.reflect }))); this.group.add(mm); this.meshes.push(mm); }
      return m;
    };
    // shafts
    const all = this.specs.map((_, i) => i);
    if (n) { const dS = mk(all), gS = instGeo(massingBase()); attach(gS, dS, false);
      mesh(gS, makeMaterial({ vert: VERT_SHAFT, frag: FRAG_SHAFT }), makeShadowMaterial({ vert: VERT_SHAFT }), 1, [VERT_SHAFT, FRAG_SHAFT]); }
    // tower cranes: only for towers that actually rise on screen and are tall enough to need one
    const craneIdx = this.massing ? all.filter((i) => { const s = this.specs[i]; return s.t0 > -1e5 && s.h > 80 && s.dur > 2.5 && s.massing !== false && !(s.riseH > 0 && s.y > 0.5); }) : [];
    if (craneIdx.length) { const dC = mk(craneIdx), gC = instGeo(craneBase()); attach(gC, dC, false);
      mesh(gC, makeMaterial({ vert: VERT_CRANE, frag: FRAG_CRANE }), makeShadowMaterial({ vert: VERT_CRANE }), 3, null); }
    // crowns, one instanced mesh per kind
    for (const kind of n ? CROWN_KINDS : []) {
      const idx = all.filter((i) => this.specs[i].crown === kind); if (!idx.length) continue;
      const d = mk(idx), g = instGeo(crownGeometry(kind, this.lod)); attach(g, d, true);
      mesh(g, makeMaterial({ vert: VERT_CROWN, frag: FRAG_CROWN }), makeShadowMaterial({ vert: VERT_CROWN }), 2, [VERT_CROWN, FRAG_CROWN]);
    }
    for (const pr of this.prisms || []) {
      const s = pr.s; if (s.land == null || s.land === DEFAULT_SPEC.land) s.land = s.t0 + s.dur;
      const g = new THREE.InstancedBufferGeometry(); g.index = pr.geometry.index; for (const k of Object.keys(pr.geometry.attributes)) g.setAttribute(k, pr.geometry.attributes[k]); g.instanceCount = 1;
      const one = (a) => new THREE.InstancedBufferAttribute(new Float32Array(a), 4);
      const riseH = s.riseH || s.h || 0;
      g.setAttribute('aPos', one([s.x, s.y, s.z, s.rot])); g.setAttribute('aDim', one([1, 1, 0, s.pitch]));
      g.setAttribute('aRise', one([s.t0, Math.max(s.dur, 0.001), s.land ?? s.t0 + s.dur, (s.mode === 'grow' ? 10 : 0) + (EASE_KIND[s.ease] ?? 1)]));
      g.setAttribute('aDrop', one([s.drop, s.dropDur, s.seed, s.tint])); g.setAttribute('aCrown', one([1, s.depth ?? 20, 0, riseH]));
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);
      const m = new THREE.Mesh(g, makeMaterial({ vert: VERT_CROWN, frag: FRAG_CROWN })); m.frustumCulled = false; m.renderOrder = 2;
      if (this.castShadow) { m.userData.shadowMaterial = makeShadowMaterial({ vert: VERT_CROWN }); m.layers.enable(1); }
      this.group.add(m); this.meshes.push(m);
      if (this.reflect > 0) { const mm = asTwin(new THREE.Mesh(g, mirrorMaterial({ vert: VERT_CROWN, frag: FRAG_CROWN, reflect: this.reflect }))); this.group.add(mm); this.meshes.push(mm); }
    }
    this.built = true;
    return this;
  }
  dispose() { for (const m of this.meshes) m.geometry.dispose(); this.meshes = []; }
}

/* ──────────────────────────────── JackTower (Act I hero) ──────────────────────────────── */

/** Jack-up construction. At each hit a new floor module thrusts up out of the ground BENEATH the stack and locks, lifting the
    stack above it by one module. The thrust accelerates and LOCKS (stops dead) exactly ON the hit frame, so the impact lands on the
    audio transient; nothing moves after the last lock. The shaft is one box whose top is top(t); its facade is anchored to the top so it
    rides up with the crown, and the module seams (grooves) show the construction rhythm. */
export class JackTower {
  /** opts: {x,z,w,d, crown, hits: [LOCK frames], modules: [metres per hit], dur: [frames of thrust per hit] | number (max), pitch, crownScale} */
  constructor({ x = 0, z = 0, w = 100, d = 60, crown = 'A', hits, modules, dur = 4, pitch = 4.2, crownScale = 1, crownDepth = null, accel = 2.2, reflect = 0 } = {}) {
    this.x = x; this.z = z; this.w = w; this.d = d; this.crownKind = crown; this.hits = hits.slice(); this.modules = modules.slice(); this.pitch = pitch; this.accel = accel;
    // thrust duration: at most `dur`, never longer than the gap to the previous lock (so fast hits merge into one continuous surge)
    this.durs = Array.isArray(dur) ? dur.slice() : this.hits.map((f, i) => Math.min(dur, i > 0 ? Math.max(1, (f - this.hits[i - 1]) * 1.0) : dur));
    this.crownScale = crownScale; this.crownDepth = crownDepth ?? d;
    this.crownS = (w / crownSize(crown).width) * crownScale;
    this.crownH = crownSize(crown).height * this.crownS;
    this.total = this.modules.reduce((a, b) => a + b, 0);
    this.group = new THREE.Group();
    this._seam = new Float32Array(24).fill(-1e5);
    const one = (a) => new THREE.InstancedBufferAttribute(new Float32Array(a), 4);
    const mkGeo = (base, crown) => { const g = new THREE.InstancedBufferGeometry(); g.index = base.index; for (const k of Object.keys(base.attributes)) g.setAttribute(k, base.attributes[k]); g.instanceCount = 1;
      g.setAttribute('aPos', one([x, 0, z, 0])); g.setAttribute('aDim', one([w, d, 1, pitch])); g.setAttribute('aRise', one([-1e6, 1, 0, 3])); g.setAttribute('aDrop', one([0, 1, 0, 0]));
      g.setAttribute('aCrown', one(crown ? [this.crownS, this.crownDepth, 0, 0] : [1, 1, 0, 0]));
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7); return g; };
    this.uTop = { value: 0 }; this.uBaseY = { value: 0 }; this.uSeam = { value: this._seam };
    const shaftMat = makeMaterial({ vert: VERT_SHAFT, frag: FRAG_SHAFT, defines: { JACK: 1 }, uniforms: { uTop: this.uTop, uSeam: this.uSeam } });
    const shaftSh = makeShadowMaterial({ vert: VERT_SHAFT, defines: { JACK: 1 }, uniforms: { uTop: this.uTop } });
    const crownMat = makeMaterial({ vert: VERT_CROWN, frag: FRAG_CROWN, defines: { HERO: 1 }, uniforms: { uBaseY: this.uBaseY } });
    const crownSh = makeShadowMaterial({ vert: VERT_CROWN, defines: { HERO: 1 }, uniforms: { uBaseY: this.uBaseY } });
    this.shaft = new THREE.Mesh(mkGeo(shaftBase(), false), shaftMat); this.shaft.frustumCulled = false; this.shaft.renderOrder = 1;
    this.crown = new THREE.Mesh(mkGeo(crownGeometry(crown, 0), true), crownMat); this.crown.frustumCulled = false; this.crown.renderOrder = 2;
    for (const [m, s] of [[this.shaft, shaftSh], [this.crown, crownSh]]) { m.userData.shadowMaterial = s; m.layers.enable(1); this.group.add(m); }
    if (reflect > 0) {   // floor reflection twins (need makeGround({reflect:true}))
      const ms = new THREE.Mesh(this.shaft.geometry, mirrorMaterial({ vert: VERT_SHAFT, frag: FRAG_SHAFT, defines: { JACK: 1 }, uniforms: { uTop: this.uTop, uSeam: this.uSeam }, reflect }));
      const mc = new THREE.Mesh(this.crown.geometry, mirrorMaterial({ vert: VERT_CROWN, frag: FRAG_CROWN, defines: { HERO: 1 }, uniforms: { uBaseY: this.uBaseY }, reflect }));
      for (const m of [ms, mc]) { asTwin(m); this.group.add(m); }
    }
  }
  /** Height of the stack top (crown base) at frame t. Pure. Module i thrusts over [hit_i - dur_i, hit_i] (accelerating) and locks on hit_i. */
  top(t) {
    let y = 0;
    for (let i = 0; i < this.hits.length; i++) {
      const p = Math.min(1, Math.max(0, (t - (this.hits[i] - this.durs[i])) / this.durs[i]));
      if (p <= 0) break;
      y += this.modules[i] * Math.pow(p, this.accel);
    }
    return y;
  }
  /** Sets uniforms for time t. lift = extra metres the crown hangs above the stack (the f0-2 plummet). Returns {top, crownBase}. */
  update(t, lift = 0) {
    const top = this.top(t);
    this.uTop.value = top; this.uBaseY.value = top + lift;
    // seams: distance below the top at which each module ends (module 0 = first hit = right under the crown)
    let s = 0; this._seam.fill(-1e5);
    for (let i = 0; i < Math.min(this.modules.length, 24); i++) { s += this.modules[i]; this._seam[i] = s; }
    return { top, crownBase: top + lift };
  }
  get height() { return this.total + this.crownH; }
}

/** Convenience: module heights that grow so the sum is `total`. growth > 1 makes later modules taller (a surge). */
export function jackModules(count, total, { first = 0.4, growth = 1.0 } = {}) {
  const w = Array.from({ length: count }, (_, i) => Math.pow(first + (1 - first) * (i / Math.max(1, count - 1)), growth) );
  const s = w.reduce((a, b) => a + b, 0);
  return w.map((v) => (v / s) * total);
}
