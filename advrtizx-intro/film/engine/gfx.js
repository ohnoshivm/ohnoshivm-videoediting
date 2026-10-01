/* DOMINANT · engine/gfx.js
   Shared GPU state and the GLSL every kit material is built from.
   COLOUR MODEL: all shading happens in LINEAR light, display-referred, clamped to 1.0 per sub-frame. The post pass accumulates the
   sub-frames in linear light and does the only sRGB encode (so brand red #E80101 = (232,1,1) survives exactly). three.js colour
   management and tone mapping are OFF (ColorManagement.enabled = false, NoToneMapping): nothing but our shaders touches colour. */
import * as THREE from 'three';
import { RED_LIN } from './util.js';

THREE.ColorManagement.enabled = false;

const V3 = (a, b, c) => new THREE.Vector3(a, b, c);
const V4 = (a, b, c, d) => new THREE.Vector4(a, b, c, d);

/** Uniforms shared (by reference) by every kit material. The engine rewrites them per sub-frame. */
export const U = {
  uTime: { value: 0 },                          // frames, sub-frame accurate (fractional)
  uSunDir: { value: V3(0, 1, 0) },              // unit vector pointing TO the sun
  uSunColor: { value: V3(1, 1, 1) },            // linear, intensity included
  uAmbUp: { value: V3(...RED_LIN) },            // linear ambient from above (the red bounce)
  uAmbDown: { value: V3(...RED_LIN) },          // linear ambient from below
  uFogColor: { value: V3(...RED_LIN) },
  uFog: { value: V4(0.0009, 220, 0, 0.0001) },  // x density at floorY (1/m), y scale height (m), z floorY (m), w constant air density (1/m)
  uShadowMat: { value: new THREE.Matrix4() },
  uShadowParams: { value: V4(0.0006, 0.8, 1 / 2048, 0) }, // x depth bias, y normal offset (m), z texel, w enabled
  uShadowMap: { value: null },
  uRing: { value: [V4(0, 0, 0, 0), V4(0, 0, 0, 0), V4(0, 0, 0, 0), V4(0, 0, 0, 0)] },   // x, z, radius, strength
  uRingP: { value: [V4(1, 0, 0, 0), V4(1, 0, 0, 0), V4(1, 0, 0, 0), V4(1, 0, 0, 0)] },  // width, tail, 0, 0
  uGround: { value: V3(0.5, 0, 0) },            // ground albedo (linear)
  uReflTex: { value: null },                    // planar reflection of the skyline (premultiplied rgb, a = strength); sampled at the same screen position
  uReflOn: { value: 0 },                        // 1 when this sub-frame rendered a reflection pass
  uRes: { value: new THREE.Vector2(1920, 1080) }, // render resolution in px (current viewport)
};

const f9 = (x) => x.toFixed(9);

/* ──────────────────────────────── GLSL CHUNKS ──────────────────────────────── */

export const GLSL_COMMON = /* glsl */ `
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uAmbUp;
uniform vec3 uAmbDown;
uniform vec3 uFogColor;
uniform vec4 uFog;
uniform vec4 uShadowParams;
uniform mat4 uShadowMat;
uniform highp sampler2DShadow uShadowMap;
const vec3 BRAND_RED = vec3(${f9(RED_LIN[0])}, ${f9(RED_LIN[1])}, ${f9(RED_LIN[2])});

float hash11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float sat(float x) { return clamp(x, 0.0, 1.0); }

// Optical depth along the ray camera -> p through exponential height fog (analytic) plus a constant "air" term.
float fogTau(vec3 camPos, vec3 p) {
  vec3 d = p - camPos;
  float len = length(d);
  float k = 1.0 / max(uFog.y, 1.0);
  float dens0 = uFog.x * exp(-k * (camPos.y - uFog.z));
  float kd = k * d.y;
  float integ = abs(kd) > 1e-3 ? (1.0 - exp(-kd)) / kd : (1.0 - 0.5 * kd);
  return max(dens0 * len * integ, 0.0) + uFog.w * len;
}
vec3 applyFog(vec3 col, vec3 wp) { return mix(uFogColor, col, exp(-fogTau(cameraPosition, wp))); }

// Hard key shadow: orthographic shadow map, hardware 2x2 PCF + 4 rotated taps.
float shadowAt(vec3 wp, vec3 n) {
  if (uShadowParams.w < 0.5) return 1.0;
  vec4 sc = uShadowMat * vec4(wp + n * uShadowParams.y, 1.0);
  vec3 q = sc.xyz * 0.5 + 0.5;
  if (q.x < 0.0 || q.x > 1.0 || q.y < 0.0 || q.y > 1.0 || q.z > 1.0) return 1.0;
  q.z -= uShadowParams.x;
  float t = uShadowParams.z * 0.75;
  float s = texture(uShadowMap, q) * 0.4;
  s += texture(uShadowMap, vec3(q.xy + vec2( t,  0.4 * t), q.z)) * 0.15;
  s += texture(uShadowMap, vec3(q.xy + vec2(-t, -0.4 * t), q.z)) * 0.15;
  s += texture(uShadowMap, vec3(q.xy + vec2(-0.4 * t,  t), q.z)) * 0.15;
  s += texture(uShadowMap, vec3(q.xy + vec2( 0.4 * t, -t), q.z)) * 0.15;
  return s;
}

// Hard white key + red ambient bounce. albedo is linear. Result clamped to the display range.
vec3 lightSurface(vec3 albedo, vec3 n, vec3 wp, float ao) {
  float ndl = dot(n, uSunDir);
  float sh = ndl > 0.0 ? shadowAt(wp, n) : 0.0;
  vec3 amb = mix(uAmbDown, uAmbUp, 0.5 + 0.5 * n.y) * ao;
  vec3 key = uSunColor * (max(ndl, 0.0) * sh);
  return albedo * (amb + key);
}

// anti-aliased line pattern: x in metres, period/width in metres. Fades to the average coverage when the pixel footprint nears the period.
float aaLine(float x, float period, float width) {
  float fw = max(fwidth(x), 1e-5);
  float d = abs(x - period * floor(x / period + 0.5));
  float cov = 1.0 - smoothstep(0.5 * width - 0.5 * fw, 0.5 * width + 0.5 * fw, d);
  float fade = smoothstep(0.30 * period, 0.85 * period, fw);
  return mix(cov, min(width / period, 1.0), fade);
}
// anti-aliased band: 1 where frac(x/period) < duty
float aaBand(float x, float period, float duty) {
  float fw = max(fwidth(x), 1e-5);
  float u = x / period - floor(x / period);
  float e = fw / period;
  float cov = smoothstep(0.0, e, u) * (1.0 - smoothstep(duty, duty + e, u));
  float fade = smoothstep(0.30, 0.85, e * 1.6);
  return mix(cov, duty, fade);
}
`;

/** Rise / landing curves shared by shafts and crowns. kind: 0 outCubic, 1 slam (hard stop, tiny overshoot), 2 back, 3 linear. */
export const GLSL_RISE = /* glsl */ `
float easeKind(float p, float kind) {
  if (kind < 0.5) { float u = 1.0 - p; return 1.0 - u * u * u; }
  if (kind < 1.5) { // fast launch, hard lock with a 1.2% overshoot that settles in the last 25%
    float u = 1.0 - p; float e = 1.0 - u * u * u * u;
    float o = sin(clamp((p - 0.62) / 0.38, 0.0, 1.0) * 3.14159265) * 0.012;
    return e + o * (1.0 - p);
  }
  if (kind < 2.5) { float s = 1.35; float u = p - 1.0; return 1.0 + (s + 1.0) * u * u * u + s * u * u; }
  return p;
}
`;

export const GLSL_SRGB = /* glsl */ `
vec3 srgbEncode(vec3 c) { c = clamp(c, 0.0, 1.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
vec3 srgbDecode(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
`;

/** Build a ShaderMaterial on the shared uniforms. Always GLSL3. */
export function makeMaterial({ vert, frag, uniforms = {}, defines = {}, side = THREE.FrontSide, transparent = false, depthWrite = true, depthTest = true, blending = THREE.NormalBlending, extra = null }) {
  const m = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: Object.assign({}, U, uniforms),
    vertexShader: vert, fragmentShader: frag, defines, side, transparent, depthWrite, depthTest, blending,
  });
  m.toneMapped = false; m.fog = false;
  if (extra) Object.assign(m, extra);
  return m;
}

/** Depth-only material for the shadow pass (same vertex code as the visible one). */
export function makeShadowMaterial({ vert, uniforms = {}, defines = {}, side = THREE.DoubleSide }) {
  const m = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: Object.assign({}, U, uniforms),
    vertexShader: vert, fragmentShader: `precision highp float; out vec4 outColor; void main() { outColor = vec4(1.0); }`,
    defines: { ...defines, SHADOW_PASS: 1 }, side, colorWrite: false,
  });
  m.toneMapped = false; m.fog = false;
  return m;
}
