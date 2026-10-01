/* DOMINANT · kits/world.js
   The RED ATMOSPHERE world: ground, water, and lighting/fog presets.
   Look: sky and fog are brand red #E80101 (flat). Architecture is white, lit by a hard white key with a red ambient bounce, and
   distance dissolves into red. Presets write into ctx.env (call one at the top of update(t), then tweak). */
import * as THREE from 'three';
import { GLSL_COMMON, makeMaterial } from '../engine/gfx.js';
import { defaultEnv } from '../engine/env.js';
import { RED_LIN, lerp } from '../engine/util.js';

const VERT_GROUND = /* glsl */ `
out vec3 vWorld;
void main() { vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;

const FRAG_GROUND = /* glsl */ `
precision highp float;
${GLSL_COMMON}
uniform vec3 uGround;
uniform vec4 uRing[4];
uniform vec4 uRingP[4];
uniform vec3 uGroundTint;
uniform sampler2D uReflTex; uniform float uReflOn; uniform vec2 uRes;
in vec3 vWorld; out vec4 outColor;
void main() {
  vec3 n = vec3(0.0, 1.0, 0.0);
  vec3 col = lightSurface(uGround * uGroundTint, n, vWorld, 1.0);
  if (uReflOn > 0.5) { vec4 rf = texture(uReflTex, gl_FragCoord.xy / uRes); col = col * (1.0 - rf.a) + rf.rgb; }   // glossy floor: premultiplied skyline reflection
  // shock rings: displaced fog. Crisp outer edge, long soft tail inside, a hairline of white at the front.
  for (int i = 0; i < 4; i++) {
    float R = uRing[i].z;
    if (R > 0.0) {
      float d = length(vWorld.xz - uRing[i].xy) - R;
      float w = uRingP[i].x, tail = uRingP[i].y, k = uRing[i].w;
      float fw = max(fwidth(d), 0.01);
      float front = 1.0 - smoothstep(0.0, w * 0.35 + fw, d);       // sharp outside
      float body = d < 0.0 ? exp(d / tail) : 1.0;                     // soft inside tail
      float prof = front * body;
      float hair = (1.0 - smoothstep(0.0, w * 0.18 + fw, abs(d + w * 0.12)));
      col = mix(col, uFogColor, clamp(prof * 0.75 * k, 0.0, 1.0));
      col = mix(col, vec3(1.0), clamp(hair * 0.55 * k, 0.0, 1.0));
    }
  }
  col = applyFog(col, vWorld);
  outColor = vec4(min(col, vec3(1.0)), 1.0);
}`;

/** The ground: a huge flat disc at y = 0 that receives the key's shadows, takes shock rings from ctx.env.rings, and dissolves into fog. */
export function makeGround({ radius = 40000, y = 0, tint = [1, 1, 1] } = {}) {
  // The ground always shows the planar reflection when the engine rendered one this sub-frame, i.e. when a TowerSet/JackTower was built with reflect > 0.
  const g = new THREE.CircleGeometry(radius, 64); g.rotateX(-Math.PI / 2);
  const m = makeMaterial({ vert: VERT_GROUND, frag: FRAG_GROUND, uniforms: { uGroundTint: { value: new THREE.Vector3(...tint) } } });
  const mesh = new THREE.Mesh(g, m); mesh.position.y = y; mesh.frustumCulled = false; mesh.renderOrder = 3;   // after the towers: early-z skips covered ground
  mesh.userData.groundMaterial = m;
  return mesh;
}

const FRAG_WATER = /* glsl */ `
precision highp float;
${GLSL_COMMON}
uniform vec3 uWaterTint; uniform float uGlint; uniform float uSkyMix;
uniform sampler2D uReflTex; uniform float uReflOn; uniform vec2 uRes;
in vec3 vWorld; out vec4 outColor;
float ripple(vec2 p, float t) {
  return sin(p.x * 0.9 + t * 0.21) * 0.5 + sin(p.y * 1.3 - t * 0.17 + p.x * 0.4) * 0.3 + sin((p.x + p.y) * 2.1 + t * 0.33) * 0.2;
}
void main() {
  vec2 p = vWorld.xz;
  float e = 0.35;
  float h0 = ripple(p, uTime), hx = ripple(p + vec2(e, 0.0), uTime), hz = ripple(p + vec2(0.0, e), uTime);
  vec3 n = normalize(vec3((h0 - hx) * 0.18, 1.0, (h0 - hz) * 0.18));
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 base = uWaterTint * mix(uAmbDown, uAmbUp, 0.8);
  float fres = pow(1.0 - max(dot(V, n), 0.0), 2.0);
  vec3 col = mix(base, uFogColor, clamp(0.25 + fres * 0.75, 0.0, 1.0) * uSkyMix);
  if (uReflOn > 0.5) { vec2 duv = (gl_FragCoord.xy + vec2(n.x, n.z) * 90.0 * vec2(1.0, 1.0)) / uRes; vec4 rf = texture(uReflTex, duv); col = col * (1.0 - rf.a) + rf.rgb; }   // skyline reflected in the water, rippled
  vec3 R = reflect(-V, n);
  float spec = pow(max(dot(R, uSunDir), 0.0), 380.0) * uGlint;
  float dist = length(cameraPosition - vWorld);
  col += vec3(spec) * exp(-dist / 900.0);
  col = applyFog(col, vWorld);
  outColor = vec4(min(col, vec3(1.0)), 1.0);
}`;

/** Water from any flat geometry (y is baked into the geometry). */
export function makeWaterMesh(geometry, { tint = [0.40, 0, 0], glint = 1, reflect = false, skyMix = 0.8 } = {}) {
  const m = makeMaterial({ vert: VERT_GROUND, frag: FRAG_WATER, uniforms: { uWaterTint: { value: new THREE.Vector3(...tint) }, uGlint: { value: glint }, uSkyMix: { value: skyMix } } });
  m.side = THREE.DoubleSide;
  const mesh = new THREE.Mesh(geometry, m); mesh.frustumCulled = false; mesh.renderOrder = 0.5; m.polygonOffset = true; m.polygonOffsetFactor = -2; m.polygonOffsetUnits = -2;
  return mesh;
}
/** A rectangle of water (x0..x1, z0..z1) at y: deep red with white sun glints. Draws just above the ground. */
export function makeWater({ x0 = -500, x1 = 500, z0 = -500, z1 = 500, y = 0.25, tint, glint, reflect, skyMix } = {}) {
  const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0); g.rotateX(-Math.PI / 2); g.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
  return makeWaterMesh(g, { tint, glint, reflect, skyMix });
}
/** A river: a ribbon of constant width along a polyline [[x,z],...] (smooth with many points). */
export function makeRiver(points, width = 120, { y = 0.25, tint, glint, reflect, skyMix } = {}) {
  const P = [], I = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
    let dx = b[0] - a[0], dz = b[1] - a[1]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    P.push(points[i][0] - dz * width / 2, y, points[i][1] + dx * width / 2, points[i][0] + dz * width / 2, y, points[i][1] - dx * width / 2);
    if (i) { const k = (i - 1) * 2; I.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(I);
  return makeWaterMesh(g, { tint, glint, reflect, skyMix });
}
/** A disc of water (a bay). */
export function makeBay(cx, cz, r, { y = 0.25, tint, glint, reflect, skyMix } = {}) {
  const g = new THREE.CircleGeometry(r, 96); g.rotateX(-Math.PI / 2); g.translate(cx, y, cz);
  return makeWaterMesh(g, { tint, glint });
}

/* ───────────────────────────── presets ───────────────────────────── */

/** Environment presets. Usage: world.preset(ctx.env, 'hero') at the top of update(t), then override fields. */
export const presets = {
  /** Default look: red void, key from camera-left, moderate ground fog. */
  red: (env) => Object.assign(env, defaultEnv()),
  /** Act I hero: low red void; fog thin enough to read the crown at ~300 m, thick enough to melt the horizon. */
  hero: (env) => {
    Object.assign(env, defaultEnv());
    env.sun = { az: -38, el: 33, intensity: 1.62, dir: null };
    env.ambient = { up: 0.72, down: 0.46, bounce: 0 };
    env.fog = { density: 0.0012, height: 300, floorY: 0, air: 0.00004 };
    env.shadow = { on: true, center: [0, 0, 0], radius: 1700, size: 2048, bias: 0.0005, normalBias: 1.6 };
    env.ground = { albedo: [0.46, 0, 0] };
    return env;
  },
  /** Dense city: shorter fog, softer ground, shadow volume around the origin (set shadow.center/radius to your city). */
  city: (env) => {
    Object.assign(env, defaultEnv());
    env.sun = { az: -42, el: 33, intensity: 1.5, dir: null };
    env.ambient = { up: 0.72, down: 0.48, bounce: 0.02 };
    env.fog = { density: 0.0007, height: 260, floorY: 0, air: 0.00045 };
    env.shadow = { on: true, center: [0, 0, 0], radius: 800, size: 2048, bias: 0.0005, normalBias: 1.2 };
    env.ground = { albedo: [0.48, 0, 0] };
    return env;
  },
  /** Far, deep skyline views (Act VII): heavy air term so rows dissolve in layers. */
  world: (env) => {
    Object.assign(env, defaultEnv());
    env.sun = { az: -40, el: 38, intensity: 1.5, dir: null };
    env.fog = { density: 0.0004, height: 400, floorY: 0, air: 0.0011 };
    env.shadow = { on: false, center: [0, 0, 0], radius: 2500, size: 2048, bias: 0.0005, normalBias: 2 };
    env.ground = { albedo: [0.50, 0, 0] };
    return env;
  },
  /** Flat, unlit-feeling backdrop for type slams and end cards: no shadows, no fog. */
  flat: (env) => {
    Object.assign(env, defaultEnv());
    env.fog = { density: 0, height: 100, floorY: 0, air: 0 };
    env.shadow.on = false; env.post = { grain: 0, vignette: 0 };
    return env;
  },
};
export function preset(env, name) { const p = presets[name]; if (!p) throw new Error('unknown world preset ' + name); return p(env); }
export { RED_LIN };
