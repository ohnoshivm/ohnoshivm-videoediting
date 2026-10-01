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

/* ──────────────────────────────── shaders ──────────────────────────────── */

const VERT_SHAFT = /* glsl */ `
in vec4 aPos; in vec4 aDim; in vec4 aRise; in vec4 aDrop; in vec4 aCrown;
uniform float uTime;
#ifdef JACK
uniform float uTop;
#endif
out vec3 vWorld; out vec3 vN; out vec3 vLoc; out vec4 vInfo; flat out float vFace;
${GLSL_RISE}
void main() {
  vFace = abs(normal.x) > 0.5 ? 0.0 : (abs(normal.z) > 0.5 ? 1.0 : 2.0);
  vInfo = vec4(aDim.x, aDim.y, aDim.w, aDrop.z);
  float h = aDim.z;
  float kind = mod(aRise.w, 10.0), mode = floor(aRise.w / 10.0);
  float yoff = 0.0, hh = h;
#ifdef JACK
  hh = max(uTop, 0.001);
#else
  if (uTime < aRise.x) { vWorld = vec3(0.0); vN = vec3(0.0, 1.0, 0.0); vLoc = vec3(0.0); gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  float p = clamp((uTime - aRise.x) / max(aRise.y, 0.001), 0.0, 1.0);
  float e = easeKind(p, kind);
  float rh = aCrown.w > 0.0 ? aCrown.w : h;
  if (mode < 0.5) yoff = -rh * (1.0 - e); else hh = h * max(e, 0.0005);
#endif
  float ca = cos(aPos.w), sa = sin(aPos.w);
  vec2 xz = vec2(position.x * aDim.x, position.z * aDim.y);
  float ly = position.y * hh;
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
in vec3 vWorld; in vec3 vN; in vec3 vLoc; in vec4 vInfo; flat in float vFace;
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
  if (vFace < 1.5) {
    float flo = aaLine(yc, pitch, 0.34);
    float spn = aaBand(yc + pitch * 0.5, pitch, 0.30);
    float mul = aaLine(hc, max(pitch * 0.46, 1.2), 0.15);
    float mech = aaBand(yc, pitch * 22.0, 0.075);
    alb = 1.0 - 0.17 * flo - 0.055 * spn - 0.075 * mul * (1.0 - spn) - 0.10 * mech;
#ifdef JACK
    float dmin = 1e5;
    for (int i = 0; i < 24; i++) dmin = min(dmin, abs(yc - uSeam[i]));
    float fw = max(fwidth(yc), 1e-4);
    float seam = 1.0 - smoothstep(0.55 - 0.5 * fw, 0.55 + 0.5 * fw, dmin);
    alb -= 0.30 * seam;
#endif
  }
  float ao = mix(0.50, 1.0, smoothstep(0.0, 60.0, vWorld.y));
  vec3 col = lightSurface(vec3(alb), n, vWorld, ao);
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
  float top = (mode < 0.5) ? (h - rh * (1.0 - e)) : (h * e);
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

/* ──────────────────────────────── TowerSet ──────────────────────────────── */

const DEFAULT_SPEC = { x: 0, z: 0, y: 0, w: 60, d: 40, h: 200, rot: 0, crown: null, crownScale: 1, crownDepth: null, crownLift: 0,
  t0: -1e6, dur: 14, land: null, ease: 'slam', mode: 'slide', pitch: 4.2, seed: 0, tint: 0, drop: 0, dropDur: 4, riseH: 0 };

export class TowerSet {
  /** opts: {lod: 0|1|2 crown mesh detail, shadow: cast shadows (default true), name, reflect: 0..1 glossy-floor reflection strength (needs makeGround({reflect:true}); costs a second draw)} */
  constructor({ lod = 0, shadow = true, name = 'towers', reflect = 0 } = {}) {
    this.reflect = reflect; this.lod = lod; this.castShadow = shadow; this.specs = []; this.group = new THREE.Group(); this.group.name = name;
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
      idx.forEach((si, k) => {
        const s = this.specs[si], o = k * 4;
        aPos.set([s.x, s.y, s.z, s.rot], o); aDim.set([s.w, s.d, s.h, s.pitch], o);
        aRise.set([s.t0, Math.max(s.dur, 0.001), s.land, (s.mode === 'grow' ? 10 : 0) + (EASE_KIND[s.ease] ?? 1)], o);
        aDrop.set([s.drop, s.dropDur, s.seed, s.tint], o);
        let cs = 1, cd = s.crownDepth ?? s.d;
        if (s.crown) cs = (s.w / crownSize(s.crown).width) * s.crownScale;
        if (s.crown === 'S') cd = cs;   // sphere: z is native size
        aCrown.set([cs, cd, s.crownLift, s.riseH || 0], o);
      });
      return { N, aPos, aDim, aRise, aDrop, aCrown };
    };
    const attach = (g, d, withCrown) => {
      g.instanceCount = d.N;
      g.setAttribute('aPos', new THREE.InstancedBufferAttribute(d.aPos, 4));
      g.setAttribute('aDim', new THREE.InstancedBufferAttribute(d.aDim, 4));
      g.setAttribute('aRise', new THREE.InstancedBufferAttribute(d.aRise, 4));
      g.setAttribute('aDrop', new THREE.InstancedBufferAttribute(d.aDrop, 4));
      g.setAttribute('aCrown', new THREE.InstancedBufferAttribute(d.aCrown, 4));
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
    if (n) { const dS = mk(all), gS = instGeo(shaftBase()); attach(gS, dS, false);
      mesh(gS, makeMaterial({ vert: VERT_SHAFT, frag: FRAG_SHAFT }), makeShadowMaterial({ vert: VERT_SHAFT }), 1, [VERT_SHAFT, FRAG_SHAFT]); }
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
