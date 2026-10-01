/* DOMINANT · kits/logo.js
   The AdvrtizX mark as exact geometry, parsed from assets/mark.svg (source of truth; nothing here is hand-drawn).
   MARK SPACE: origin = centre of the whole mark's viewBox, +y UP, units = mark units (mark height = 100, width 219.7).
   2D:  logo.draw(g, {...})            exact Path2D of the original path data.
   3D:  logo.crownGeometry('A', lod)   exact profile extruded (smooth normals on fillets/arcs, hard on corners), z in [-0.5, 0.5].
   Crown kinds: 'A' (logo orientation), 'Am' (mirrored), 'Dd' (D as a dome, arc up), 'Ds' (D in logo orientation, arc right),
                'Dsm' (arc left). Every crown profile is centred on x, bottom edge at y = 0. */
import * as THREE from 'three';

export const MARK = {
  viewBox: [7.5, 0, 219.7, 100], width: 219.7, height: 100,
  A: { fillets: { bl: 7.5, tl: 10.8 }, bite: { r: 21.2, chord: 32.0, depth: 7.3 }, slope: 0.75, angleDeg: 53.13 },
  D: { rect: 44.1, r: 50 },
  slot: 7.6,
  RED: '#E80101', RED_RGB: [232, 1, 1],
};

let SRC = null;           // { A: 'd…', D: 'd…' }
const polyCache = new Map();

/** Must be awaited once at boot (the engine does it). */
export async function loadMark(url = '/assets/mark.svg') {
  if (SRC) return SRC;
  const text = await (await fetch(url)).text();
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const a = doc.querySelector('#A'), d = doc.querySelector('#D');
  if (!a || !d) throw new Error('mark.svg: expected path#A and path#D');
  SRC = { A: a.getAttribute('d'), D: d.getAttribute('d'), viewBox: (doc.documentElement.getAttribute('viewBox') || '').split(/\s+/).map(Number) };
  return SRC;
}
export const markPaths = () => { if (!SRC) throw new Error('logo.loadMark() not awaited'); return SRC; };

/* ─────────────────────────── SVG path -> polyline (M L H V C S Q T A Z, absolute + relative) ─────────────────────────── */

function arcToPoints(x1, y1, rx, ry, phiDeg, fa, fs, x2, y2, tol) {
  if (rx === 0 || ry === 0) return [[x2, y2]];
  const phi = phiDeg * Math.PI / 180, cp = Math.cos(phi), sp = Math.sin(phi);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
  const x1p = cp * dx + sp * dy, y1p = -sp * dx + cp * dy;
  rx = Math.abs(rx); ry = Math.abs(ry);
  const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lam > 1) { const s = Math.sqrt(lam); rx *= s; ry *= s; }
  const sign = fa === fs ? -1 : 1;
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const co = sign * Math.sqrt(Math.max(0, num / den));
  const cxp = co * (rx * y1p) / ry, cyp = co * -(ry * x1p) / rx;
  const cx = cp * cxp - sp * cyp + (x1 + x2) / 2, cy = sp * cxp + cp * cyp + (y1 + y2) / 2;
  const ang = (ux, uy, vx, vy) => { const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy); return a; };
  const th1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dth = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!fs && dth > 0) dth -= 2 * Math.PI; else if (fs && dth < 0) dth += 2 * Math.PI;
  const r = Math.max(rx, ry), step = 2 * Math.acos(Math.max(0, 1 - tol / r));
  const n = Math.max(2, Math.ceil(Math.abs(dth) / Math.max(step, 0.01)));
  const out = [];
  for (let i = 1; i <= n; i++) {
    const th = th1 + dth * (i / n), c = Math.cos(th), s = Math.sin(th);
    out.push([cp * rx * c - sp * ry * s + cx, sp * rx * c + cp * ry * s + cy]);
  }
  out[out.length - 1] = [x2, y2];
  return out;
}

export function pathToPolylines(d, tol = 0.015) {
  const toks = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) || [];
  const polys = []; let cur = null, i = 0, cmd = '', x = 0, y = 0, sx = 0, sy = 0, lcx = 0, lcy = 0, lqx = 0, lqy = 0, prev = '';
  const num = () => parseFloat(toks[i++]);
  const flag = () => { const t = toks[i++]; return t === '1' ? 1 : 0; };
  const push = (px, py) => { cur.push([px, py]); x = px; y = py; };
  while (i < toks.length) {
    if (/[a-zA-Z]/.test(toks[i])) cmd = toks[i++];
    const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase();
    const ox = rel ? x : 0, oy = rel ? y : 0;
    if (C === 'M') { x = num() + ox; y = num() + oy; sx = x; sy = y; cur = [[x, y]]; polys.push(cur); cmd = rel ? 'l' : 'L'; }
    else if (C === 'L') { push(num() + ox, num() + oy); }
    else if (C === 'H') { push(num() + ox, y); }
    else if (C === 'V') { push(x, num() + oy); }
    else if (C === 'C') {
      const x1 = num() + ox, y1 = num() + oy, x2 = num() + ox, y2 = num() + oy, x3 = num() + ox, y3 = num() + oy;
      const n = 24, x0 = x, y0 = y;
      for (let k = 1; k <= n; k++) { const t = k / n, u = 1 - t; push(u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3, u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3); }
      lcx = x2; lcy = y2;
    }
    else if (C === 'S') {
      const rx1 = /[CS]/i.test(prev) ? 2 * x - lcx : x, ry1 = /[CS]/i.test(prev) ? 2 * y - lcy : y;
      const x2 = num() + ox, y2 = num() + oy, x3 = num() + ox, y3 = num() + oy; const n = 24, x0 = x, y0 = y;
      for (let k = 1; k <= n; k++) { const t = k / n, u = 1 - t; push(u * u * u * x0 + 3 * u * u * t * rx1 + 3 * u * t * t * x2 + t * t * t * x3, u * u * u * y0 + 3 * u * u * t * ry1 + 3 * u * t * t * y2 + t * t * t * y3); }
      lcx = x2; lcy = y2;
    }
    else if (C === 'Q') {
      const x1 = num() + ox, y1 = num() + oy, x2 = num() + ox, y2 = num() + oy; const n = 16, x0 = x, y0 = y;
      for (let k = 1; k <= n; k++) { const t = k / n, u = 1 - t; push(u * u * x0 + 2 * u * t * x1 + t * t * x2, u * u * y0 + 2 * u * t * y1 + t * t * y2); }
      lqx = x1; lqy = y1;
    }
    else if (C === 'T') {
      const x1 = /[QT]/i.test(prev) ? 2 * x - lqx : x, y1 = /[QT]/i.test(prev) ? 2 * y - lqy : y;
      const x2 = num() + ox, y2 = num() + oy; const n = 16, x0 = x, y0 = y;
      for (let k = 1; k <= n; k++) { const t = k / n, u = 1 - t; push(u * u * x0 + 2 * u * t * x1 + t * t * x2, u * u * y0 + 2 * u * t * y1 + t * t * y2); }
      lqx = x1; lqy = y1;
    }
    else if (C === 'A') {
      const rx = num(), ry = num(), rot = num(), fa = flag(), fs = flag(), ex = num() + ox, ey = num() + oy;
      for (const p of arcToPoints(x, y, rx, ry, rot, fa, fs, ex, ey, tol)) push(p[0], p[1]);
    }
    else if (C === 'Z') { x = sx; y = sy; }
    else throw new Error('unsupported path command ' + cmd);
    prev = cmd;
  }
  return polys.map((p) => {
    // drop a closing duplicate and consecutive duplicates
    const out = [];
    for (const q of p) { const l = out[out.length - 1]; if (!l || Math.hypot(q[0] - l[0], q[1] - l[1]) > 1e-6) out.push(q); }
    if (out.length > 1 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) < 1e-6) out.pop();
    return out;
  });
}

/* ─────────────────────────── polygons in mark space and crown profiles ─────────────────────────── */

const area = (p) => { let a = 0; for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i][0] * q[1] - q[0] * p[i][1]; } return a / 2; };
const ccw = (p) => (area(p) > 0 ? p : p.slice().reverse());
const bbox = (p) => { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const [x, y] of p) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 }; };

/** The two shapes of the mark as CCW polygons in MARK SPACE (y up, origin = centre of viewBox). tol = chord error in mark units. */
export function markPolys(tol = 0.015) {
  const key = 'mark' + tol;
  if (polyCache.has(key)) return polyCache.get(key);
  const s = markPaths(), vb = s.viewBox, cx = vb[0] + vb[2] / 2, cy = vb[1] + vb[3] / 2;
  const conv = (d) => ccw(pathToPolylines(d, tol)[0].map(([x, y]) => [x - cx, -(y - cy)]));
  const out = { A: conv(s.A), D: conv(s.D) };
  polyCache.set(key, out);
  return out;
}

/** Crown profile: polygon (CCW, y up), x centred, y bottom = 0. Returns {pts, width, height, kind}. */
export function profile(kind, tol = 0.015) {
  const key = 'prof' + kind + tol;
  if (polyCache.has(key)) return polyCache.get(key);
  const m = markPolys(tol);
  let pts;
  if (kind === 'A') pts = m.A.map((p) => p.slice());
  else if (kind === 'Am') pts = ccw(m.A.map(([x, y]) => [-x, y]));
  else if (kind === 'Dd') pts = m.D.map(([x, y]) => [-y, x]);              // rotate +90 deg: the arc (was +x) now points up
  else if (kind === 'Ds') pts = m.D.map((p) => p.slice());
  else if (kind === 'Dsm') pts = ccw(m.D.map(([x, y]) => [-x, y]));
  else throw new Error('unknown crown kind ' + kind);
  const b = bbox(pts);
  pts = ccw(pts.map(([x, y]) => [x - b.cx, y - b.y0]));
  const out = { pts, width: b.w, height: b.h, kind };
  polyCache.set(key, out);
  return out;
}
export const CROWN_KINDS = ['A', 'Am', 'Dd', 'Ds', 'Dsm'];

/** Point-in-polygon (even-odd) for CCW or CW polygons. */
export function polyContains(pts, x, y) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
/** True if (x,y) in MARK SPACE is inside the A, the D, or either ('AD'). */
export const markContains = (which, x, y) => { const m = markPolys(); return (which !== 'D' && polyContains(m.A, x, y)) || (which !== 'A' && polyContains(m.D, x, y)); };

/* ─────────────────────────── prism extrusion with smooth normals ─────────────────────────── */

const geoCache = new Map();

/** Extrudes a CCW polygon (y up) along z in [-0.5, 0.5]. Corners sharper than smoothDeg keep hard normals, arcs are smooth. */
export function extrude(pts, { smoothDeg = 38 } = {}) {
  const n = pts.length, pos = [], nor = [];
  const edgeN = [];
  for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; edgeN.push([dy / l, -dx / l]); }
  const cosT = Math.cos(smoothDeg * Math.PI / 180);
  const vN = (i) => { // [normal at vertex i for the edge leaving it, normal at vertex i for the edge arriving]
    const nin = edgeN[(i - 1 + n) % n], nout = edgeN[i];
    if (nin[0] * nout[0] + nin[1] * nout[1] > cosT) { const sx = nin[0] + nout[0], sy = nin[1] + nout[1], l = Math.hypot(sx, sy) || 1; const m = [sx / l, sy / l]; return [m, m]; }
    return [nout, nin];
  };
  const tri = (a, b, c, na, nb, nc) => { pos.push(...a, ...b, ...c); nor.push(...na, ...nb, ...nc); };
  // side walls
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, a = pts[i], b = pts[j], [na] = vN(i), [, nb] = vN(j);
    const A0 = [a[0], a[1], -0.5], A1 = [a[0], a[1], 0.5], B0 = [b[0], b[1], -0.5], B1 = [b[0], b[1], 0.5];
    const nA = [na[0], na[1], 0], nB = [nb[0], nb[1], 0];
    tri(A0, B0, B1, nA, nB, nB); tri(A0, B1, A1, nA, nB, nA);
  }
  // caps (triangulated)
  const tris = THREE.ShapeUtils.triangulateShape(pts.map(([x, y]) => new THREE.Vector2(x, y)), []);
  for (const [i, j, k] of tris) {
    const a = pts[i], b = pts[j], c = pts[k];
    // front cap (+z): ensure CCW seen from +z
    const cr = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const [p, q, r] = cr > 0 ? [a, b, c] : [a, c, b];
    tri([p[0], p[1], 0.5], [q[0], q[1], 0.5], [r[0], r[1], 0.5], [0, 0, 1], [0, 0, 1], [0, 0, 1]);
    tri([p[0], p[1], -0.5], [r[0], r[1], -0.5], [q[0], q[1], -0.5], [0, 0, -1], [0, 0, -1], [0, 0, -1]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.computeBoundingSphere();
  return g;
}

/** Cached crown geometry. lod 0 = exact (chord error 0.015 units), 1 = mid, 2 = far (visually identical beyond ~200 px tall). */
export function crownGeometry(kind, lod = 0) {
  const key = kind + ':' + lod;
  if (geoCache.has(key)) return geoCache.get(key);
  const tol = [0.015, 0.12, 0.6][lod] ?? 0.6;
  const g = extrude(profile(kind, tol).pts, { smoothDeg: lod === 0 ? 38 : 50 });
  geoCache.set(key, g);
  return g;
}
export const crownSize = (kind) => { const p = profile(kind); return { width: p.width, height: p.height }; };

/* ─────────────────────────── 2D drawing (exact Path2D) ─────────────────────────── */

const p2d = {};
export function path2D(which) { if (!p2d[which]) p2d[which] = new Path2D(markPaths()[which]); return p2d[which]; }

/** Draws the exact mark. opts: {x, y, height (px; default 100), anchor: 'center'|'topleft'|'baseline-left', fill, parts: 'AD'|'A'|'D',
    fillA, fillD, alphaA, alphaD}. The mark is 2.197:1. Drawn with the original path data, so fillets/bite are exact at any size. */
export function draw(g, { x = 0, y = 0, height = 100, anchor = 'center', fill = '#fff', parts = 'AD', fillA, fillD, alpha = 1 } = {}) {
  const s = height / 100, vb = markPaths().viewBox;
  g.save();
  g.globalAlpha *= alpha;
  if (anchor === 'center') g.translate(x - (vb[2] * s) / 2, y - (height) / 2);
  else if (anchor === 'topleft') g.translate(x, y);
  else g.translate(x, y - height);
  g.scale(s, s); g.translate(-vb[0], -vb[1]);
  if (parts.includes('A')) { g.fillStyle = fillA || fill; g.fill(path2D('A')); }
  if (parts.includes('D')) { g.fillStyle = fillD || fill; g.fill(path2D('D')); }
  g.restore();
}
/** Mark width/height in px for a given pixel height. */
export const markBox = (height) => ({ width: height * MARK.width / MARK.height, height });
