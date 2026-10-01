/* DOMINANT · engine/env.js
   The environment (sun, red ambient, fog, shadows, ground rings, post) as plain data. The engine resets ctx.env to defaultEnv()
   before every sub-frame and the scenes' update(t) mutate it. Presets live in kits/world.js. */
import * as THREE from 'three';
import { U } from './gfx.js';
import { RED_LIN, DEG } from './util.js';

export function defaultEnv() {
  return {
    sun: { az: -34, el: 36, intensity: 1.42, dir: null },     // az: deg from +z toward +x (negative = from the camera's left when looking at -z); dir overrides
    ambient: { up: 0.80, down: 0.50, bounce: 0.0 },           // multiples of brand red (linear); bounce adds white from below (0..1)
    fog: { density: 0.0010, height: 220, floorY: 0, air: 0.00006 },  // see gfx.js uFog; colour is always brand red
    shadow: { on: true, center: [0, 0, 0], radius: 900, size: 2048, bias: 0.0005, normalBias: 0.7 },
    rings: [],                                                // ground shockwave rings: {x, z, r, w, k, tail} (k = strength 0..1), max 4
    ground: { albedo: [0.50, 0, 0] },                         // ground albedo (linear)
    post: { grain: 1.0, vignette: 0.45 },
  };
}

const _d = new THREE.Vector3();
export function sunVector(sun) {
  if (sun.dir) return _d.set(...sun.dir).normalize();
  const a = sun.az * DEG, e = sun.el * DEG;
  return _d.set(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)).normalize();
}

/** Writes env into the shared uniforms. */
export function applyEnv(env) {
  U.uSunDir.value.copy(sunVector(env.sun));
  const si = env.sun.intensity; U.uSunColor.value.set(si, si, si);
  const au = env.ambient.up, ad = env.ambient.down, b = env.ambient.bounce;
  U.uAmbUp.value.set(RED_LIN[0] * au, RED_LIN[1] * au, RED_LIN[2] * au);
  U.uAmbDown.value.set(RED_LIN[0] * ad + b, RED_LIN[1] * ad + b, RED_LIN[2] * ad + b);
  U.uFogColor.value.set(...RED_LIN);
  U.uFog.value.set(env.fog.density, Math.max(env.fog.height, 1), env.fog.floorY, env.fog.air);
  U.uGround.value.set(...env.ground.albedo);
  for (let i = 0; i < 4; i++) {
    const r = env.rings[i];
    if (r) { U.uRing.value[i].set(r.x, r.z, r.r, r.k ?? 1); U.uRingP.value[i].set(r.w ?? 8, r.tail ?? 60, 0, 0); }
    else { U.uRing.value[i].set(0, 0, 0, 0); U.uRingP.value[i].set(1, 0, 0, 0); }
  }
}

/** Merge a partial env override (view.env) into a base env (shallow per-section). */
export function mergeEnv(base, over) {
  if (!over) return base;
  const out = { ...base };
  for (const k of Object.keys(over)) out[k] = (over[k] && typeof over[k] === 'object' && !Array.isArray(over[k]) && base[k] && !Array.isArray(base[k])) ? { ...base[k], ...over[k] } : over[k];
  return out;
}
