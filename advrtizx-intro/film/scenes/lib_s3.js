/* DOMINANT · ACT VI helper (film/scenes/lib_s3.js, owner: Act VI agent)
   - camera-frame maths (project / unproject / rays), so a sign can be PLACED by screen position and depth at its landing frame
   - Board: a monumental real-estate SOLD sign (white board, red keyline, red lettering shaped by the browser's text engine, on two posts),
     one merged mesh, lit by the same hard white key + red ambient as the towers, casting shadows, never receiving them on its face
   - makeFaceTexture: the board face (keyline + ink-fitted lettering) as one mip-mapped canvas texture
   - makeRows / genSkyline: a deep, self-similar world: rows receding to ~7.6 km, every tower crowned with a logo shape */
import * as THREE from 'three';
import { GLSL_COMMON, makeMaterial, makeShadowMaterial } from '../engine/gfx.js';

export const DEG = Math.PI / 180;

/* ───────────────────────────── camera frame maths ───────────────────────────── */

/** Frame of a camera pose (same convention as engine/camera.js: right = f x up). */
export function frameOf(pos, look, fovDeg, aspect = 16 / 9) {
  let fx = look[0] - pos[0], fy = look[1] - pos[1], fz = look[2] - pos[2];
  const fl = Math.hypot(fx, fy, fz) || 1; fx /= fl; fy /= fl; fz /= fl;
  let rx = -fz, rz = fx; const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl;
  return { pos, f: [fx, fy, fz], r: [rx, 0, rz], u: [-rz * fy, rz * fx - rx * fz, rx * fy], th: Math.tan(fovDeg * 0.5 * DEG), aspect };
}
/** World point -> [sx, sy, depth]; sx, sy in -1..1 across the frame (+y up). */
export function project(fr, p) {
  const dx = p[0] - fr.pos[0], dy = p[1] - fr.pos[1], dz = p[2] - fr.pos[2];
  const depth = dx * fr.f[0] + dy * fr.f[1] + dz * fr.f[2];
  const x = dx * fr.r[0] + dz * fr.r[2], y = dx * fr.u[0] + dy * fr.u[1] + dz * fr.u[2];
  return [x / (depth * fr.th * fr.aspect), y / (depth * fr.th), depth];
}
/** Ray through screen (sx, sy): direction whose forward component is 1 (so pos + ray * depth lies at that depth). */
export function rayAt(fr, sx, sy) {
  const a = sx * fr.th * fr.aspect, b = sy * fr.th;
  return [fr.f[0] + fr.r[0] * a + fr.u[0] * b, fr.f[1] + fr.u[1] * b, fr.f[2] + fr.r[2] * a + fr.u[2] * b];
}
export function unproject(fr, sx, sy, depth) { const d = rayAt(fr, sx, sy); return [fr.pos[0] + d[0] * depth, fr.pos[1] + d[1] * depth, fr.pos[2] + d[2] * depth]; }

/* ───────────────────────────── the board face texture ───────────────────────────── */

const RED_CSS = '#e80101';
const rr = (g, x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };

/** Measures the INK of `text` (shaped by the browser, drawn with the type kit's face for its script) and returns a canvas of the finished face.
    o: {lang, stretch, track, targetH (ink height as a fraction of the face height), padX, minAspect, maxAspect, px (texture width)}.
    Returns {canvas, aspect, inkAspect, ink:{w,h}}. */
export function makeFaceCanvas(type, text, o = {}) {
  const { lang, stretch, track, targetH = 0.58, padX = 0.30, minAspect = 1.55, maxAspect = 3.05, px = 2048, weight = 900 } = o;
  const S = 300, sw = 3800, sh = 1200, ax = sw / 2, ay = 760;
  const sc = document.createElement('canvas'); sc.width = sw; sc.height = sh;
  const sg = sc.getContext('2d', { willReadFrequently: true });
  type.draw(sg, text, { x: ax, y: ay, size: S, align: 'center', fill: '#000', lang, stretch, track, weight });
  const data = sg.getImageData(0, 0, sw, sh).data;
  let x0 = sw, y0 = sh, x1 = -1, y1 = -1;
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) if (data[(y * sw + x) * 4 + 3] > 40) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) throw new Error('board text rendered empty: ' + text);
  const inkW = x1 - x0 + 1, inkH = y1 - y0 + 1, inkAspect = inkW / inkH;
  // face aspect from the ink: ink height = targetH of the face, padX on each side; clamp, then re-fit the ink if clamped
  const aspect = Math.min(maxAspect, Math.max(minAspect, inkAspect * targetH + 2 * padX));
  const fitH = Math.min(targetH, (aspect - 2 * padX) / inkAspect);
  const W = px, H = Math.round(px / aspect);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
  // keyline: a thick red border inset from the edge, softly rounded
  const kl = H * 0.030, inset = H * 0.080;
  g.strokeStyle = RED_CSS; g.lineWidth = kl; g.lineJoin = 'round'; rr(g, inset, inset, W - 2 * inset, H - 2 * inset, H * 0.040); g.stroke();
  // lettering, ink centred (a hair above the geometric centre)
  const r = (fitH * H) / inkH, cx0 = (x0 + x1) / 2 - ax, cy0 = (y0 + y1) / 2 - ay;
  type.draw(g, text, { x: W / 2 - cx0 * r, y: H * 0.495 - cy0 * r, size: S * r, align: 'center', fill: RED_CSS, lang, stretch, track, weight });
  return { canvas: cv, aspect, inkAspect, ink: { w: inkW * r / W, h: fitH } };
}
export function makeFaceTexture(type, text, o) {
  const f = makeFaceCanvas(type, text, o);
  const tex = new THREE.CanvasTexture(f.canvas);
  tex.colorSpace = THREE.NoColorSpace; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter; tex.anisotropy = 8; tex.premultiplyAlpha = false;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return { tex, aspect: f.aspect, inkAspect: f.inkAspect, ink: f.ink, canvas: f.canvas };
}

/* ───────────────────────────── the sign ───────────────────────────── */

const VERT_BOARD = /* glsl */ `
out vec3 vWorld; out vec3 vN; out vec2 vUv;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz; vN = mat3(modelMatrix) * normal; vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const FRAG_BOARD = /* glsl */ `
precision highp float;
${GLSL_COMMON}
uniform sampler2D tMap; uniform float uFogAmt; uniform float uInv; uniform float uTint;
in vec3 vWorld; in vec3 vN; in vec2 vUv; out vec4 outColor;
void main() {
  vec3 n = normalize(vN);
  bool face = vUv.x >= 0.0;
  float ink = 1.0 - texture(tMap, vUv).g;               // red ink coverage (canvas: white ground, red lettering)
  ink = face ? mix(ink, 1.0 - ink, uInv) : 0.0;
  vec3 lit;
  if (face) {   // the sign face: hard key + red ambient, never shadowed (legibility)
    float ndl = max(dot(n, uSunDir), 0.0);
    lit = mix(uAmbDown, uAmbUp, 0.5 + 0.5 * n.y) + uSunColor * ndl;
  } else {
    float ao = mix(0.50, 1.0, smoothstep(0.0, 60.0, vWorld.y));
    lit = lightSurface(vec3(1.0), n, vWorld, ao);
  }
  vec3 col = mix(min(lit, vec3(1.0)), BRAND_RED, ink);
  col = mix(col, applyFog(col, vWorld), uFogAmt * (face ? 1.0 : 1.0));
  outColor = vec4(min(col, vec3(1.0)), 1.0);
}`;
const VERT_BOARD_SH = /* glsl */ `void main() { gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0); }`;

function boxInto(A, cx, cy, cz, sx, sy, sz, textured) {
  const hx = sx / 2, hy = sy / 2, hz = sz / 2;
  const F = [
    [[0, 0, 1], [[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]]],
    [[0, 0, -1], [[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]]],
    [[1, 0, 0], [[hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz]]],
    [[-1, 0, 0], [[-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz]]],
    [[0, 1, 0], [[-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz]]],
    [[0, -1, 0], [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz]]],
  ];
  const UV = [[0, 0], [1, 0], [1, 1], [0, 1]];
  F.forEach(([n, v], fi) => {
    for (const k of [0, 1, 2, 0, 2, 3]) {
      A.p.push(cx + v[k][0], cy + v[k][1], cz + v[k][2]); A.n.push(n[0], n[1], n[2]);
      if (textured && fi === 0) A.uv.push(UV[k][0], UV[k][1]); else A.uv.push(-1, -1);
    }
  });
}

/** Overall board aspect (W/H) for a face texture aspect. */
export const boardAspect = (faceAspect, rim = 0.045) => faceAspect * (1 - 2 * rim) + 2 * rim;

export class Board {
  /** opts: {tex, faceAspect, H (metres, outer height), yc (centre height above the ground, for the posts), fogAmt, name}.
      Local frame: origin = board centre, +z = face normal, units = metres. Place with set(). */
  constructor({ tex, faceAspect, H, yc, fogAmt = 0.5, name = 'board' }) {
    const rim = 0.045 * H, T = 0.050 * H, Tr = 0.095 * H;
    const fh = H - 2 * rim, fw = faceAspect * fh, W = fw + 2 * rim;
    this.W = W; this.H = H; this.yc = yc;
    const A = { p: [], n: [], uv: [] };
    boxInto(A, 0, 0, 0, fw, fh, T, true);                                        // recessed panel, textured front
    boxInto(A, -(fw / 2 + rim / 2), 0, 0, rim, H, Tr, false);                    // raised rim
    boxInto(A, (fw / 2 + rim / 2), 0, 0, rim, H, Tr, false);
    boxInto(A, 0, fh / 2 + rim / 2, 0, fw, rim, Tr, false);
    boxInto(A, 0, -(fh / 2 + rim / 2), 0, fw, rim, Tr, false);
    // two posts behind the board, from deep in the ground to a little above the top edge
    const pw = Math.min(0.040 * W, 0.36 * H), pd = 0.075 * H, top = H / 2 + 0.17 * H, bot = -(yc + 90);
    for (const sx of [-1, 1]) boxInto(A, sx * (W / 2 - 0.085 * W), (top + bot) / 2, -(Tr / 2 + pd / 2), pw, top - bot, pd, false);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(A.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(A.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(A.uv, 2));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, -yc / 2, 0), W + yc);
    this.uInv = { value: 0 };
    const mat = makeMaterial({ vert: VERT_BOARD, frag: FRAG_BOARD, uniforms: { tMap: { value: tex }, uFogAmt: { value: fogAmt }, uInv: this.uInv, uTint: { value: 0 } } });
    this.mesh = new THREE.Mesh(g, mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 3; this.mesh.name = name;
    this.mesh.userData.shadowMaterial = makeShadowMaterial({ vert: VERT_BOARD_SH }); this.mesh.layers.enable(1);
    this.group = new THREE.Group(); this.group.name = name; this.group.add(this.mesh); this.group.visible = false;
  }
  /** pos: world centre [x,y,z]; scale about the centre; roll in radians about the face normal; inv 0..1 inverts red/white. */
  set(visible, pos, scale = 1, roll = 0, inv = 0) {
    const g = this.group; g.visible = visible;
    if (!visible) return;
    g.position.set(pos[0], pos[1], pos[2]); g.scale.setScalar(scale); g.rotation.set(0, 0, roll); this.uInv.value = inv;
  }
}

/** The stamp. For a board landing on frame L: returns null before the approach, else {q, drop, roll}: the board's position is
    C + (P - C) * q (along the line of sight: it comes from the lens and is stamped into the world), y offset +drop * H, roll (rad).
    Approach: A frames, accelerating (slam), hard stop ON frame L, then a small recoil that settles. */
export function slamState(t, L, { A = 4.5, q0 = 0.60, drop = 0.16, roll0 = 2.6, power = 2.2 } = {}) {
  const tau = t - L;
  if (tau < -A) return null;
  if (tau <= 0) { const p = (tau + A) / A, e = Math.pow(p, power); return { q: q0 + (1 - q0) * e, drop: drop * (1 - e), roll: roll0 * DEG * (1 - e), after: 0 }; }
  const d = Math.exp(-tau / 2.5);
  return { q: 1 + 0.050 * d * Math.sin(tau * 2 * Math.PI / 6.6), drop: 0, roll: 0.55 * DEG * d * Math.sin(tau * 2 * Math.PI / 5.2), after: tau };
}

/* ───────────────────────────── the world: rows and towers ───────────────────────────── */

/** Rows receding from depth d0 to dMax; spacing grows with distance, so every row keeps a similar visual density. */
export function makeRows(d0 = 400, dMax = 7600) {
  const rows = []; let d = d0;
  while (d <= dMax) { const gap = 34 + 0.092 * d; rows.push({ d, gap }); d += gap; }
  rows.forEach((r, k) => { r.k = k; r.room = Math.min(k ? rows[k - 1].gap : r.gap, r.gap); });
  return rows;
}
/** World z of the alley between row k and k+1 (a corridor wide enough for a sign). */
export const alleyZ = (rows, k) => -(rows[k].d + rows[k].gap * 0.5);

const CROWNS = [['A', 0.25], ['Am', 0.19], ['Dd', 0.20], ['Ds', 0.18], ['Dsm', 0.18]];
function pickCrown(r) { let a = r(); for (const [k, w] of CROWNS) { if ((a -= w) <= 0) return k; } return 'A'; }

/** Generates the skyline. o: {rng, util, rows, xMin(d), xMax(d), camY, crownSize(kind), exclude: [{x0,x1,z0,z1}], ang0, ang1, wBase, wPer}.
    Tower top elevation (as seen from the camera height) climbs gently with row depth, so crowns of every row stand above the one in front. */
export function genSkyline({ rng, util, rows, xMin, xMax, camY, crownSize, exclude = [], ang0 = 3.2, ang1 = 8.5, wBase = 12, wPer = 0.022 }) {
  const out = [];
  for (const row of rows) {
    const { d, room, k } = row;
    const wMean = wBase + wPer * d;
    let x = xMin(d) + rng() * wMean;
    const base = ang0 + ang1 * (1 - Math.exp(-k / 8));            // degrees: typical crown-top elevation of the row
    const xEnd = xMax(d);
    while (x < xEnd) {
      const wide = rng() < 0.06 ? 1.4 + rng() * 0.6 : 1;
      const w = wMean * (0.62 + 0.9 * rng()) * wide;
      const cx = x + w / 2;
      const next = w + wMean * (0.14 + 0.62 * rng() * rng() * 2.0) + (rng() < 0.07 ? wMean * (1.2 + 1.6 * rng()) : 0);   // street gaps, a few wide
      const vacant = rng() < 0.10;
      const dep = Math.max(14, room * 0.5 * (0.8 + 0.35 * rng()));
      const z = -(d + (rng() - 0.5) * 0.28 * room);
      const kind = pickCrown(rng);
      const cs = rng() < 0.72 ? 1 : 0.78 + 0.34 * rng();
      const cz = crownSize(kind), crownH = (cz.height / cz.width) * w * cs;
      const district = 1 + 0.24 * util.noise1(cx / (300 + 0.30 * d) + k * 0.31, 11);
      let f = district * Math.exp(0.14 * rng.gauss());
      const r = rng();
      if (r < 0.09) f *= 0.55 + 0.2 * rng(); else if (r > 0.93) f *= 1.3 + 0.4 * rng();       // low blocks, tall landmarks
      f = Math.min(2.0, Math.max(0.45, f));
      const hTop = camY + d * Math.tan(base * f * DEG);
      const h = Math.max(34, hTop - crownH);
      const ex = vacant || exclude.some((e) => cx + w / 2 > e.x0 && cx - w / 2 < e.x1 && z + dep / 2 > e.z0 && z - dep / 2 < e.z1);
      if (!ex) out.push({ x: cx, z, w, d: dep, h, crown: kind, crownScale: cs, crownH, row: k, depth: d, pitch: 4.2 });
      x += next;
    }
  }
  return out;
}
