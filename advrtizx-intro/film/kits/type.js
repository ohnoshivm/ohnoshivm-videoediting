/* DOMINANT · kits/type.js
   One premium heavy grotesk for Latin (Mona Sans Variable, wght 900, wdth up to 125%), weight-matched Noto Black faces for the
   other scripts. All text goes through the browser's text engine (HarfBuzz) so Arabic, Devanagari and Thai SHAPE correctly.
   2D:  type.draw(g, text, {...})   draws into the overlay context (1920x1080 logical px): full-frame slams, masks, end card.
   3D:  type.plane(text, {...})     a lit-free, fogged plane with a high-res mip-mapped texture: type standing in the fog,
                                    occluded by towers (depth-tested). Scenes position/scale/animate mesh.* in update(t). */
import * as THREE from 'three';
import { GLSL_COMMON, makeMaterial } from '../engine/gfx.js';

/* ───────────────────────────── scripts and font stacks ───────────────────────────── */

export const FAMILY = {
  display: '"Mona Sans Variable"',
  latin: '"Mona Sans Variable", "Noto Sans"',
  cyrillic: '"Noto Sans"', greek: '"Noto Sans"',
  arabic: '"Noto Kufi Arabic"', devanagari: '"Noto Sans Devanagari"', thai: '"Noto Sans Thai"',
  zh: '"Noto Sans SC"', ja: '"Noto Sans JP"', ko: '"Noto Sans KR"',
};
const SHAPED = new Set(['arabic', 'devanagari', 'thai']);   // never apply letter-spacing: it breaks joining and conjuncts
const STRETCH_KW = [[75, 'condensed'], [87.5, 'semi-condensed'], [100, 'normal'], [112.5, 'semi-expanded'], [125, 'expanded']];

/** Script of a string: 'latin'|'cyrillic'|'greek'|'arabic'|'devanagari'|'thai'|'ko'|'ja'|'zh'. Kana -> ja, Hangul -> ko, Han -> zh (pass lang:'ja' to override). */
export function scriptOf(text) {
  for (const ch of text) {
    const c = ch.codePointAt(0);
    if (c >= 0x0600 && c <= 0x06ff || c >= 0x0750 && c <= 0x077f || c >= 0xfb50 && c <= 0xfdff || c >= 0xfe70 && c <= 0xfeff) return 'arabic';
    if (c >= 0x0900 && c <= 0x097f) return 'devanagari';
    if (c >= 0x0e00 && c <= 0x0e7f) return 'thai';
    if (c >= 0xac00 && c <= 0xd7af || c >= 0x1100 && c <= 0x11ff || c >= 0x3130 && c <= 0x318f) return 'ko';
    if (c >= 0x3040 && c <= 0x30ff) return 'ja';
    if (c >= 0x4e00 && c <= 0x9fff || c >= 0x3400 && c <= 0x4dbf) return 'zh';
    if (c >= 0x0400 && c <= 0x052f) return 'cyrillic';
    if (c >= 0x0370 && c <= 0x03ff) return 'greek';
  }
  return 'latin';
}
export const isRTL = (text) => scriptOf(text) === 'arabic';

/** CSS font shorthand pieces for a script. */
export function familyFor(lang) { return FAMILY[lang] || FAMILY.latin; }

/** Waits until EVERY declared @font-face is loaded (all unicode-range slices), so no frame can ever render a fallback glyph. */
export async function loadAllFonts() {
  const faces = [...document.fonts];
  const errors = [];
  await Promise.all(faces.map((f) => f.load().catch((e) => errors.push(`${f.family} ${f.unicodeRange.slice(0, 30)}: ${e && e.message}`))));
  await document.fonts.ready;
  const bad = faces.filter((f) => f.status !== 'loaded');
  return { total: faces.length, loaded: faces.length - bad.length, errors, families: [...new Set(faces.map((f) => f.family.replace(/"/g, '')))] };
}

/* ───────────────────────────── measuring and 2D drawing ───────────────────────────── */

let _mc = null;
const mctx = () => (_mc ||= document.createElement('canvas').getContext('2d'));

function applyFont(g, text, o) {
  const lang = o.lang || scriptOf(text);
  const size = o.size ?? 100, weight = o.weight ?? 900;
  g.font = `${weight} ${size}px ${o.family || familyFor(lang)}`;
  const st = o.stretch ?? (lang === 'latin' ? 100 : 100);
  g.fontStretch = (STRETCH_KW.reduce((a, b) => (Math.abs(b[0] - st) < Math.abs(a[0] - st) ? b : a))[1]);
  g.fontKerning = 'normal';
  const tr = SHAPED.has(lang) || o.track == null ? 0 : o.track * size;
  g.letterSpacing = tr + 'px';
  g.direction = lang === 'arabic' ? 'rtl' : 'ltr';
  g.textRendering = 'geometricPrecision';
  return lang;
}

/** Measure one line. Returns {width, ascent, descent, lang}. opts as draw(). Width excludes the trailing letter-spacing. */
export function measure(text, o = {}) {
  const g = mctx(); g.save(); const lang = applyFont(g, text, o);
  const m = g.measureText(text); const tr = parseFloat(g.letterSpacing) || 0; g.restore();
  return { width: m.width - (tr > 0 || tr < 0 ? tr : 0), ascent: m.actualBoundingBoxAscent, descent: m.actualBoundingBoxDescent, fontAscent: m.fontBoundingBoxAscent, fontDescent: m.fontBoundingBoxDescent, lang };
}

/** Draw one line of type into a 2D context.
    opts: {x, y (baseline), size (px), weight (default 900), stretch (75..125 %, Mona Sans only), track (em, e.g. -0.035),
           align 'left'|'center'|'right', fill ('#fff'), stroke, strokeWidth, lang (override script), family, maxWidth (shrinks size to fit), alpha}
    Returns {width, size}. Latin is uppercase by convention (pass text already uppercased). */
export function draw(g, text, o = {}) {
  let size = o.size ?? 100;
  if (o.maxWidth) { const w = measure(text, { ...o, size }).width; if (w > o.maxWidth) size = size * (o.maxWidth / w); }
  g.save();
  const lang = applyFont(g, text, { ...o, size });
  g.textAlign = o.align || 'left'; g.textBaseline = 'alphabetic';
  if (o.alpha != null) g.globalAlpha *= o.alpha;
  const tr = parseFloat(g.letterSpacing) || 0;
  let x = o.x ?? 0;
  if (tr && (o.align === 'center')) x += tr / 2;          // canvas adds trailing spacing; recentre
  if (tr && (o.align === 'right')) x += tr;
  if (o.stroke) { g.strokeStyle = o.stroke; g.lineWidth = o.strokeWidth ?? 4; g.lineJoin = 'round'; g.strokeText(text, x, o.y ?? 0); }
  g.fillStyle = o.fill || '#fff'; g.fillText(text, x, o.y ?? 0);
  const width = g.measureText(text).width;
  g.restore();
  return { width, size, lang };
}

/** Draw several lines. lineHeight in em (default 0.92: tight display leading). Returns total height. */
export function drawLines(g, lines, o = {}) {
  const size = o.size ?? 100, lh = (o.lineHeight ?? 0.92) * size; let y = o.y ?? 0;
  for (const l of lines) { draw(g, l, { ...o, y }); y += lh; }
  return lines.length * lh;
}

/** Clip to a rectangle (for "rises out of a mask"): g.save(); type.clipRect(g, x,y,w,h); ...draw...; g.restore(). */
export const clipRect = (g, x, y, w, h) => { g.beginPath(); g.rect(x, y, w, h); g.clip(); };

/* ───────────────────────────── 3D type planes ───────────────────────────── */

const VERT_TYPE = /* glsl */ `
out vec3 vWorld; out vec2 vUv;
void main() { vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; vUv = uv; gl_Position = projectionMatrix * viewMatrix * w; }`;
const FRAG_TYPE = /* glsl */ `
precision highp float;
${GLSL_COMMON}
uniform sampler2D tMap; uniform vec3 uTint; uniform float uOpacity; uniform float uFogAmt; uniform float uLit;
in vec3 vWorld; in vec2 vUv; out vec4 outColor;
void main() {
  float a = texture(tMap, vUv).a * uOpacity;
  if (a < 0.003) discard;
  vec3 col = uTint;
  if (uLit > 0.5) col = lightSurface(uTint, normalize(cross(dFdx(vWorld), dFdy(vWorld))) * (gl_FrontFacing ? 1.0 : -1.0), vWorld, 1.0);
  vec3 fogged = applyFog(col, vWorld);
  col = mix(col, fogged, uFogAmt);
  outColor = vec4(min(col, vec3(1.0)), a);
}`;

const planeCache = new Map();

/** A plane of type. opts: {size (texture px per em, default 320), weight, stretch, track, lang, family, align ('center'), lines (array of strings instead of text),
    lineHeight (em, 0.92), height (world metres of ONE em-box line... see below), worldHeight (metres: cap-ish height of the whole block), worldWidth, tint ([r,g,b] linear, default white),
    fogAmount (0..1, default 1), lit (false), opacity (1), pad (px)}.
    Size the plane with worldHeight (metres of the full texture height) or worldWidth. Returns {mesh, width, height (world metres), texW, texH, texture}.
    mesh.position is the plane centre; it faces +z (rotate it; add to ctx.root). */
export function plane(text, o = {}) {
  const lines = o.lines || [text];
  const size = Math.min(o.size ?? 320, 512);
  const key = JSON.stringify([lines, o.weight, o.stretch, o.track, o.lang, o.family, o.align, o.lineHeight, size, o.pad]);
  let rec = planeCache.get(key);
  if (!rec) {
    const lh = (o.lineHeight ?? 0.92) * size, pad = o.pad ?? Math.round(size * 0.12);
    const meas = lines.map((l) => measure(l, { ...o, size }));
    let tw = Math.max(...meas.map((m) => m.width)) + pad * 2, th = lh * (lines.length - 1) + size * 1.1 + pad * 2;
    let sc = 1; const maxDim = 8192; if (tw > maxDim) sc = maxDim / tw; if (th * sc > maxDim) sc = Math.min(sc, maxDim / th);
    const cv = document.createElement('canvas'); cv.width = Math.ceil(tw * sc); cv.height = Math.ceil(th * sc);
    const g = cv.getContext('2d'); g.scale(sc, sc);
    const align = o.align || 'center';
    const ax = align === 'left' ? pad : align === 'right' ? tw - pad : tw / 2;
    lines.forEach((l, i) => draw(g, l, { ...o, size, x: ax, y: pad + size * 0.86 + i * lh, align, fill: '#fff' }));
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.NoColorSpace; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter; tex.anisotropy = 8; tex.premultiplyAlpha = false;
    rec = { tex, texW: cv.width, texH: cv.height, aspect: cv.width / cv.height, emFrac: size / th };
    planeCache.set(key, rec);
  }
  let hgt = o.worldHeight, wid = o.worldWidth;
  if (hgt == null && wid == null) hgt = 100;
  if (hgt == null) hgt = wid / rec.aspect; wid = hgt * rec.aspect;
  const m = makeMaterial({ vert: VERT_TYPE, frag: FRAG_TYPE, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { tMap: { value: rec.tex }, uTint: { value: new THREE.Vector3(...(o.tint || [1, 1, 1])) }, uOpacity: { value: o.opacity ?? 1 }, uFogAmt: { value: o.fogAmount ?? 1 }, uLit: { value: o.lit ? 1 : 0 } } });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(wid, hgt), m); mesh.renderOrder = 10; mesh.frustumCulled = false;
  return { mesh, width: wid, height: hgt, texW: rec.texW, texH: rec.texH, texture: rec.tex, setOpacity: (v) => { m.uniforms.uOpacity.value = v; }, setTint: (rgb) => m.uniforms.uTint.value.set(...rgb) };
}
