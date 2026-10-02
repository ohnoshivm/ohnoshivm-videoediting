/* DOMINANT · scenes/lib_s1.js
   Shared by ACT II (THE STATEMENT, f128-255) and ACT III (DUBAI, f256-383). Owner: the act2/act3 author.
   - loadBase():   re-instantiates ACT I's own scene (hero tower, ground, fog, hand-off pose) so f127 -> f128 is continuous BY CONSTRUCTION,
                   whatever Act I becomes; it snapshots the exact camera/env Act I ends on.
   - camera maths: ndcOf / aimAt (place a world point at a chosen screen position), pure path functions for II + III.
   - typeLine():   hi-res 3D type plane (Mona Sans / Noto Kufi), fogged, depth-tested, with a "rise from a mask" uniform.
   - shake / sample (K) tables, env evolution, rings.  Conventions: camera looks toward -z, +x is screen right, y up, metres. */
import * as THREE from 'three';
import { GLSL_COMMON, makeMaterial } from '../engine/gfx.js';
import { EASE, clamp, lerp, prog, smoothstep, noise1, track, shake, addShake, rumble, hash01, DEG } from '../engine/util.js';
import * as typeKit from '../kits/type.js';

export const ASPECT = 16 / 9;
export const HERO = { x: 0, z: 0, w: 100, d: 58, top: 900, crownH: 85.8, centre: 943, tip: 985.8 };
export { EASE, clamp, lerp, prog, smoothstep, noise1, track, shake, addShake, rumble, hash01, DEG };

/* ───────────────────────────── camera maths ───────────────────────────── */

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** view basis of a pose {pos, look, fov}: forward, right, up */
export function basis(pose) {
  const f = norm(sub(pose.look, pose.pos));
  let r = cross(f, [0, 1, 0]); if (Math.hypot(...r) < 1e-6) r = [1, 0, 0]; r = norm(r);
  return { f, r, u: cross(r, f) };
}
/** world point -> [ndcX, ndcY, depth] for a pose (+ndcY is up). */
export function ndcOf(p, pose, aspect = ASPECT) {
  const b = basis(pose), v = sub(p, pose.pos), z = dot(v, b.f), th = Math.tan(pose.fov * DEG / 2);
  return [dot(v, b.r) / (z * th * aspect), dot(v, b.u) / (z * th), z];
}
/** look-at point that puts `target` at NDC (ndcX, ndcY) as seen from pos (no roll). Same maths as camera.aimAt, kept local on purpose. */
export function aimAt(pos, target, ndcX, ndcY, fov, aspect = ASPECT) {
  let d = sub(target, pos); const dist = Math.hypot(...d) || 1; d = norm(d);
  let r = cross(d, [0, 1, 0]); if (Math.hypot(...r) < 1e-6) r = [1, 0, 0]; r = norm(r);
  const th = Math.tan(fov * DEG / 2), ay = Math.atan(ndcY * th), ax = Math.atan(ndcX * th * aspect);
  d = rotAxis(d, r, -ay); d = rotAxis(d, [0, 1, 0], ax);
  return [pos[0] + d[0] * dist, pos[1] + d[1] * dist, pos[2] + d[2] * dist];
}
function rotAxis(v, k, a) { // Rodrigues
  const c = Math.cos(a), s = Math.sin(a), kv = cross(k, v), kd = dot(k, v);
  return [v[0] * c + kv[0] * s + k[0] * kd * (1 - c), v[1] * c + kv[1] * s + k[1] * kd * (1 - c), v[2] * c + kv[2] * s + k[2] * kd * (1 - c)];
}
export const cyl = (az, r, y) => { const a = az * DEG; return [r * Math.sin(a), y, r * Math.cos(a)]; };

/* ───────────────────────────── Act I re-use (continuity by construction) ───────────────────────────── */

/** Instantiates ACT I's scene factory on a private root and snapshots the pose/env it ends on (t = 127).
    base.update(t) puts Act I's final-state hero, ground, fog and camera into ctx.env / ctx.cam; the caller then overrides what it animates. */
export async function loadBase(ctx) {
  const root = new THREE.Group(); root.name = 'act1-base';
  let a1 = null, from = 'act1.js';
  try {
    const mod = await import('./act1.js');
    const sctx = Object.create(ctx); sctx.root = root; sctx.name = 'act1-base';
    a1 = await mod.default(sctx);
  } catch (e) { console.error('[s1] could not re-use act1.js, falling back to a local hero: ' + e); }
  if (!a1) { from = 'fallback'; a1 = fallbackBase(ctx, root); }
  a1.update(127);
  const cam = ctx.cam, env = ctx.env;
  const pose0 = { pos: cam.pos.slice(), look: cam.look.slice(), fov: cam.fov, near: cam.near, far: cam.far };
  const env0 = JSON.parse(JSON.stringify(env));
  let ground = null; root.traverse((o) => { if (o.userData && o.userData.groundMaterial) ground = o; });
  return { root, update: (t) => a1.update(t), pose0, env0, ground, from };
}

function fallbackBase(ctx, root) {
  const { kits, util, camera } = ctx; const { JackTower, jackModules } = kits.towers;
  const hits = ctx.cueFrames('a1.hit'), modules = jackModules(hits.length, 900, { first: 0.45, growth: 1.35 });
  const hero = new JackTower({ x: 0, z: 0, w: 100, d: 58, crown: 'A', hits, modules, dur: 4.5, pitch: 4.2, reflect: 0.46 }); root.add(hero.group);
  const ground = kits.world.makeGround({ reflect: true }); root.add(ground);
  return { update(t) {
    const env = ctx.env, cam = ctx.cam; kits.world.preset(env, 'hero'); env.fog.density = 0.012; env.fog.height = 250; env.rings = []; hero.update(t, 0);
    const pos = cyl(40, 330, 1140); cam.set({ pos, look: camera.aimAt(pos, [0, HERO.centre, 0], { ndcY: 0.36, fov: 52 }), fov: 52, near: 2, far: 60000 });
  } };
}

/* ───────────────────────────── 3D type planes ───────────────────────────── */

const VERT_TYPE = /* glsl */ `
out vec3 vWorld; out vec2 vUv;
void main() { vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; vUv = uv; gl_Position = projectionMatrix * viewMatrix * w; }`;
const FRAG_TYPE = /* glsl */ `
precision highp float;
${GLSL_COMMON}
uniform sampler2D tMap; uniform vec3 uTint; uniform float uOpacity; uniform float uFogAmt; uniform float uShift;
in vec3 vWorld; in vec2 vUv; out vec4 outColor;
void main() {
  vec2 uv = vec2(vUv.x, vUv.y + uShift);                 // uShift > 0 slides the ink DOWN inside the quad: the quad's bottom edge is the mask
  if (uv.y < 0.0 || uv.y > 1.0) discard;
  float a = texture(tMap, uv).a * uOpacity;
  if (a < 0.003) discard;
  vec3 fogged = applyFog(uTint, vWorld);
  vec3 col = mix(uTint, fogged, uFogAmt);
  outColor = vec4(min(col, vec3(1.0)), a);
}`;

const texCache = new Map();
/** One line of type as a fogged plane. o: {text, em (metres per em), pxPerEm (texture px per em, default 420), stretch, track, lang, weight, fog (0..1), tint, pad (em)}.
    Returns {mesh, wM, hM, capM, baseToCentre (metres from the quad centre up to the baseline: place mesh.y = baselineY - that), setShift, setOpacity}.
    The quad spans from just under the baseline (descender + pad) to above the cap height, so a rising text is masked by its own bottom edge. */
export function typeLine(o) {
  const text = o.text, pxPerEm = o.pxPerEm ?? 420, padEm = o.pad ?? 0.12;
  const opt = { size: pxPerEm, weight: o.weight ?? 900, stretch: o.stretch ?? 125, track: o.track ?? -0.035, lang: o.lang };
  const m = typeKit.measure(text, opt);
  const key = JSON.stringify([text, opt]);
  let rec = texCache.get(key);
  if (!rec) {
    const pad = Math.round(pxPerEm * padEm), asc = Math.ceil(m.ascent), desc = Math.ceil(Math.max(m.descent, 1));
    const W = Math.min(8192, Math.ceil(m.width) + pad * 2), H = asc + desc + pad * 2, sc = W / (Math.ceil(m.width) + pad * 2);
    const cv = document.createElement('canvas'); cv.width = W; cv.height = Math.ceil(H * sc);
    const g = cv.getContext('2d'); g.scale(sc, sc);
    typeKit.draw(g, text, { ...opt, x: (Math.ceil(m.width) + pad * 2) / 2, y: pad + asc, align: 'center', fill: '#fff' });
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.NoColorSpace; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter; tex.anisotropy = 8; tex.premultiplyAlpha = false; tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    rec = { tex, W: cv.width, H: cv.height, pad, asc, desc, k: sc };
    texCache.set(key, rec);
  }
  const mpp = o.em / pxPerEm;                    // metres per texture px (at scale 1)
  const wM = rec.W * mpp / rec.k, hM = rec.H * mpp / rec.k;
  const mat = makeMaterial({ vert: VERT_TYPE, frag: FRAG_TYPE, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { tMap: { value: rec.tex }, uTint: { value: new THREE.Vector3(...(o.tint || [1, 1, 1])) }, uOpacity: { value: 1 }, uFogAmt: { value: o.fog ?? 1 }, uShift: { value: 0 } } });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(wM, hM), mat); mesh.renderOrder = 10; mesh.frustumCulled = false;
  // the quad's top edge is (pad + asc) px above the baseline; its centre is hM/2 below the top  =>  the centre sits this far ABOVE the baseline
  const centreAboveBaseline = (rec.pad + rec.asc) * mpp - hM / 2;
  return { mesh, wM, hM, capM: m.ascent * mpp, descM: m.descent * mpp, centreAboveBaseline,
    setShift: (v) => { mat.uniforms.uShift.value = v; }, setOpacity: (v) => { mat.uniforms.uOpacity.value = v; }, setFog: (v) => { mat.uniforms.uFogAmt.value = v; }, material: mat };
}

/* ───────────────────────────── impacts / shake ───────────────────────────── */

export const zeroShake = () => ({ yaw: 0, pitch: 0, roll: 0, x: 0, y: 0, z: 0 });

/* ───────────────────────────── ACT II: the statement ───────────────────────────── */

/** Justified type block. lines: [{text, stretch, track, lang}], widthM = width every line is scaled to, gapEm (gap as a fraction of the SMALLEST line's em).
    Returns [{...line, em, baseline (local y, metres, block centred on y=0), cap}] and the block height. */
export function justify(lines, widthM, gapM, o = {}) {
  const meas = lines.map((l) => typeKit.measure(l.text, { size: 100, weight: 900, stretch: l.stretch ?? 125, track: l.track ?? -0.035, lang: l.lang }));
  const em = meas.map((m) => widthM / (m.width / 100));
  const cap = meas.map((m, i) => (m.ascent / 100) * em[i]);
  let y = 0; const tops = [];
  lines.forEach((_, i) => { tops.push(y); y += cap[i] + gapM; });
  const H = y - gapM;
  return { H, lines: lines.map((l, i) => ({ ...l, w: widthM, em: em[i], cap: cap[i], baseline: H / 2 - tops[i] - cap[i] })) };
}

/** The Act II camera rail, a pure function of t (f127..f256), built from Act I's final pose P0 = {pos, look, fov}. */
export function rail2(P0, o = {}) {
  const T = [0, HERO.centre, 0];
  const az0 = Math.atan2(P0.pos[0], P0.pos[2]) / DEG, r0 = Math.hypot(P0.pos[0], P0.pos[2]), y0 = P0.pos[1];
  const ndc0 = ndcOf(T, P0);
  const K = Object.assign({ azEnd: 6, yOrbit: 1050, nxOrbit: 0.30, nyOrbit: ndc0[1], yCrown: 984, rIn: 168 }, o);
  const orbit = (t) => EASE.inOutSine(prog(t, 128, 224));
  const az = (t) => (t < 240 ? lerp(az0, K.azEnd, orbit(t)) : lerp(K.azEnd, -14, EASE.inQuad(prog(t, 240, 256))));
  const rr = track([[127, r0], [196, r0 + 6], [224, K.rIn, 'inQuart'], [240, K.rIn - 4], [248, 112, 'inOutSine'], [256, 165, 'outCubic']]);
  const yy = track([[127, y0], [156, K.yOrbit, 'glide'], [224, K.yCrown, 'inOutSine'], [240, K.yCrown], [256, 7, 'inOutCubic']]);
  const nX = track([[127, ndc0[0]], [158, K.nxOrbit, 'cine'], [224, K.nxOrbit], [240, K.nxOrbit], [250, 0.0, 'inOutSine']]);
  const nY = track([[127, ndc0[1]], [158, K.nyOrbit], [224, 0.12, 'inOutSine'], [240, 0.12], [256, 0.0, 'inOutSine']]);
  const tYb = track([[127, HERO.centre], [240, HERO.centre]]);
  const tY = (t) => (t < 240 ? tYb(t) : yy(t) + lerp(-40, 150, EASE.inOutSine(prog(t, 240, 256))));
  const fovT = track([[127, P0.fov], [240, P0.fov], [256, 88, 'inQuad']]);
  return { az0, r0, y0, ndc0, at(t) {
    const pos = cyl(az(t), rr(t), yy(t)), fov = fovT(t);
    return { pos, look: aimAt(pos, [0, tY(t), 0], nX(t), nY(t), fov), fov };
  } };
}
/** Act I's documented end pose (fallback / planning): az 40, 330 m, 1140 m, crown at ndcY 0.36, fov 52. */
export function pose0Default() { const pos = cyl(40, 330, 1140); return { pos, look: aimAt(pos, [0, HERO.centre, 0], 0, 0.36, 52), fov: 52, near: 2, far: 60000 }; }

/** Where the type block stands: centre C (world), yaw, tilt, from the Act I pose. */
export function blockPlacement(P0, rail, o = {}) {
  const K = Object.assign({ dist: 1060, y: 450, yawAz: null, tiltDeg: 24, shiftX: 0 }, o);
  const d = [P0.look[0] - P0.pos[0], P0.look[2] - P0.pos[2]], l = Math.hypot(...d), h = [d[0] / l, d[1] / l], side = [-h[1], h[0]];   // side = to the RIGHT on screen
  const C = [P0.pos[0] + h[0] * K.dist + side[0] * K.shiftX, K.y, P0.pos[2] + h[1] * K.dist + side[1] * K.shiftX];
  const meanAz = K.yawAz ?? (rail.az0 * 0.55 + 6 * 0.45), meanCam = cyl(meanAz, rail.r0, 1050);
  const yaw = Math.atan2(meanCam[0] - C[0], meanCam[2] - C[2]);
  return { C, yaw, tilt: K.tiltDeg * DEG };
}
/** Screen rectangles (NDC) of each line's INK box at pose. lay = justify() result, place = blockPlacement(). */
export function blockNdc(lay, place, pose) {
  const cy = Math.cos(place.yaw), sy = Math.sin(place.yaw), ct = Math.cos(place.tilt), st = Math.sin(place.tilt);
  // group rotation is Euler 'YXZ' (yaw about Y after tilt about X by -tilt): local (x,y,0) -> (x, y cos t, -y sin t) -> yaw
  const toWorld = (x, y) => { const y1 = y * ct, z1 = -y * st; return [place.C[0] + cy * x + sy * z1, place.C[1] + y1, place.C[2] - sy * x + cy * z1]; };
  return lay.lines.map((ln) => {
    const w = ln.w, top = ln.baseline + ln.cap, bot = ln.baseline;
    const pts = [[-w / 2, top], [w / 2, top], [w / 2, bot], [-w / 2, bot]].map(([x, y]) => ndcOf(toWorld(x, y), pose));
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    return { text: ln.text, x0: +Math.min(...xs).toFixed(2), x1: +Math.max(...xs).toFixed(2), y0: +Math.min(...ys).toFixed(2), y1: +Math.max(...ys).toFixed(2) };
  });
}

/* ───────────────────────────── ACT III: Dubai ───────────────────────────── */

export const HEAVY = [256, 264, 272, 280, 288];
export const LIGHT = [296, 304, 312, 320, 328, 336, 344, 352, 360, 368];
export const COAST_Z = 380;
/** pan of the k-th light landing (same golden walk as audio/cues.py): screen x in -1..1 */
export const lightPan = (k) => { const g = ((k + 1) * 0.6180339887) % 1; return (2 * g - 1) * 0.86; };

/** Camera rail for ACT III (f256..383). Starts exactly on rail2's pose at 256 (continuity) and pulls back, rises, trucks right, whips right. */
export function rail3(P0, o = {}) {
  const r2 = rail2(P0, o), s0 = r2.at(256);
  const x0 = s0.pos[0], z0 = s0.pos[2];
  const zEnd = 1350, yEnd = 230;
  const zf = (t) => lerp(z0, zEnd, EASE.glide(prog(t, 256, 334)));
  const xf = (t) => lerp(x0, -90, EASE.glide(prog(t, 256, 300)));
  const yf = (t) => lerp(s0.pos[1], yEnd, EASE.inOutSine(prog(t, 256, 326)));
  const truck = (t) => 1250 * (EASE.inOutSine(prog(t, 318, 376)) * 0.55 + prog(t, 318, 376) * 0.45);
  const fov = track([[256, s0.fov], [290, 64, 'outCubic'], [330, 58, 'inOutSine'], [383, 58]]);
  const lyT = track([[256, 125], [262, 150, 'outCubic'], [290, 420, 'inOutSine'], [320, 470]]);
  const nyT = track([[256, 0], [290, 0.05, 'inOutSine'], [320, 0.10, 'inOutSine']]);
  const dir320 = (() => { const p = [lerp(x0, -90, 1), yf(320), zEnd]; const lk = aimAt(p, [0, 470, 0], 0, 0.10, 58); const d = norm(sub(lk, p)); return d; })();
  return { at(t) {
    if (t < 256) return r2.at(t);
    const pos = [xf(t) + (t > 318 ? truck(t) : 0), yf(t), zf(t)];
    let look, roll = 0;
    if (t < 320) look = aimAt(pos, [0, lyT(t), 0], 0, nyT(t), fov(t));
    else {
      const w = t > 376 ? 74 * EASE.inQuart(prog(t, 376, 384)) : 0, a = w * DEG;
      const d0 = dir320, d = [d0[0] * Math.cos(a) + d0[2] * Math.sin(a), d0[1], -d0[0] * Math.sin(a) + d0[2] * Math.cos(a)];
      const drift = 0.03 * (t - 320) / 56;  // gentle yaw drift to the right during the truck
      look = [pos[0] + d[0] * 1000 + 1000 * drift * (t < 376 ? 1 : 0), pos[1] + d[1] * 1000, pos[2] + d[2] * 1000];
      roll = t > 376 ? 4 * EASE.inQuad(prog(t, 376, 384)) : 0;
    }
    return { pos, look, fov: fov(t), roll };
  } };
}

/** The Dubai skyline as TowerSet specs (deterministic). rail3 is needed so landings sit where the camera looks. */
export function dubaiSpecs(rng, rail) {
  const specs = [], crownPick = () => { const r = rng(); return r < 0.3 ? 'A' : r < 0.45 ? 'Am' : r < 0.72 ? 'Dd' : r < 0.87 ? 'Ds' : 'Dsm'; };
  const free = (x, z, w) => !(Math.hypot(x, z) < 130) && z < COAST_Z - 25 && !(x > -230 && x < 70 && z > 40) && !specs.some((s) => Math.hypot(s.x - x, s.z - z) < (s.w + w) * 0.8);
  const mk = (x, z, h, L, big) => {
    const w = rng.range(28, 48) * (big ? 1.15 : 1), d = w * rng.range(0.7, 1.0), crown = crownPick(), cs = rng.range(1.45, 1.9);
    const tiers = h > 300 && rng() < 0.5 ? [{ f: 0.62, wf: 1 }, { f: 0.38, wf: 0.72 }] : [{ f: 1, wf: 1 }];
    const dur = Math.round(6 + h / 120), drop = rng.range(70, 140); let y = 0;
    tiers.forEach((tr, i) => { const last = i === tiers.length - 1, hh = h * tr.f;
      specs.push({ x, z, w: w * tr.wf, d: d * tr.wf, h: hh, y, crown: last ? crown : null, crownScale: cs, crownDepth: d * tr.wf * 1.1, riseH: h, t0: L - dur, dur, land: L, drop: last ? drop : 0, dropDur: 4, ease: 'slam', pitch: rng.range(3.8, 4.8) }); y += hh; });
  };
  const R = [[230, 10, 120, 260, 0], [480, 20, 180, 340, 0], [760, 28, 200, 380, 0], [1060, 36, 200, 400, 0], [1400, 46, 180, 400, 4], [1800, 36, 160, 380, 4], [2300, 28, 150, 360, 4]];
  R.forEach(([r, n, h0, h1, kk], k) => { let placed = 0, tries = 0;
    while (placed < n && tries++ < n * 40) { const a = rng.range(0, Math.PI * 2), x = r * Math.sin(a) * rng.range(0.92, 1.08), z = -r * Math.cos(a) * rng.range(0.92, 1.08) + 40;
      if (!free(x, z, 40)) continue; mk(x, z, rng.range(h0, h1), HEAVY[Math.min(k, 4)], false); placed++; } });
  // lighter landings on 8ths, in front of the trucking camera, primary at the audio pan position
  LIGHT.forEach((L, k) => { const pan = lightPan(k), cp = rail.at(L).pos;
    for (let j = 0; j < 4; j++) { let tries = 0; while (tries++ < 40) { const z = rng.range(-450, 280), depth = cp[2] - z, x = cp[0] + (j === 0 ? pan : pan + rng.range(-0.25, 0.25)) * depth * 0.80;
      if (free(x, z, 40) && x > -1500) { mk(x, z, j === 0 ? rng.range(380, 500) : rng.range(200, 380), L, j === 0); break; } } } });
  return specs;
}

export function buildDubai(ctx, rail) {
  const rng = ctx.rng('s1-dubai'), specs = dubaiSpecs(rng, rail);
  const set = new ctx.kits.towers.TowerSet({ lod: 0, shadow: true, name: 'dubai' });
  for (const s of specs) set.add(s);
  // the D sail: the exact D profile stretched tall (arc to the sea), turned so its thickness and curve read, rising with the 3rd light wave
  { const { profile, extrude } = ctx.kits.logo, D = profile('Ds'), pts = D.pts.map(([x, y]) => [x * 1.9, y * 3.6]);
    set.addPrism(extrude(pts, { smoothDeg: 38 }), { x: 640, y: 0, z: 320, rot: -0.55, depth: 46, t0: 305, dur: 7, land: 312, riseH: 380, drop: 0, ease: 'slam', pitch: 6 }); }
  set.build();
  return { set, group: set.group, specs };
}
