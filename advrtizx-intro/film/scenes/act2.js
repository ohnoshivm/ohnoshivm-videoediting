/* ACT II · THE STATEMENT (f128-255) · owner: act2/act3 author
   f128  "NO TOWER RISES" stands in the red fog beyond the hero tower (hi-res 3D type, depth-tested: the tower occludes it), the camera
         descends to crown height and orbits slowly: the far type slides behind the near tower (parallax).
   f160  "UNSOLD." rises out of a mask and completes the block.
   f200-223 the camera is sucked in toward the crown (accelerating), f224 it stops dead: "WE SELL THEM." SLAMS full-frame (2D overlay, motion-blurred,
         shaken with the same impact). f240-255 the camera dives down the facade and arrives low and wide at the tower's base on f256.
   Act I is re-instantiated (lib_s1.loadBase) so f127 -> f128 is continuous by construction. */
import * as L from './lib_s1.js';

export default async function act2(ctx) {
  const { THREE, kits, util } = ctx;
  const { EASE, clamp, lerp, prog, track, shake, addShake, rumble } = L;
  const base = await L.loadBase(ctx); ctx.root.add(base.root);
  const P0 = base.pose0, T = [0, L.HERO.centre, 0];

  /* ── the camera rail (pure function of t) and the block of type standing in the fog ── */
  const RAIL = { azEnd: 14, yOrbit: 1070, yCrown: 1000 };
  const rail = L.rail2(P0, RAIL);
  const railAt = (t) => rail.at(t);
  const BLOCK_W = 1316, place = L.blockPlacement(P0, rail, { dist: 1112, y: 413, shiftX: -189, tiltDeg: 13.4 });
  const block = new THREE.Group(); block.position.set(...place.C); block.rotation.set(-place.tilt, place.yaw, 0, 'YXZ'); ctx.root.add(block);
  const lay = L.justify([{ text: 'NO TOWER' }, { text: 'RISES' }, { text: 'UNSOLD.' }], BLOCK_W, BLOCK_W * 0.04);
  const lines = lay.lines.map((ln) => {
    const tl = L.typeLine({ text: ln.text, em: ln.em, stretch: ln.stretch, track: ln.track, fog: 0.55, pxPerEm: ln.em > 250 ? 300 : 420 });
    tl.mesh.position.set(0, ln.baseline + tl.centreAboveBaseline, 0); block.add(tl.mesh); return { ...ln, tl };
  });

  /* ── impacts ── */
  const IMPACTS = [{ f: 128, amp: 2.0, decay: 3.2, freq: 0.5, seed: 1 }, { f: 160, amp: 1.5, decay: 3.0, freq: 0.55, seed: 2 }, { f: 224, amp: 3.8, decay: 4.2, freq: 0.5, seed: 3 }];

  return {
    id: 'act2', start: 128, end: 255,
    samples(f) {
      if (f < 136) return 14; if (f < 160) return 5; if (f < 168) return 12; if (f < 200) return 5;
      if (f < 224) return 8 + Math.round((f - 200) / 24 * 8); if (f < 232) return 28; if (f < 240) return 10; return 32;
    },
    update(t) {
      const env = ctx.env, cam = ctx.cam;
      base.update(127);                                   // Act I's final-state hero/ground/fog/camera, then override what Act II animates
      const R = railAt(t);
      cam.set({ pos: R.pos, look: R.look, fov: R.fov, near: P0.near, far: P0.far });
      cam.shake = t < 240 ? addShake(shake(t, IMPACTS, { rollScale: 0.3 })) : addShake(shake(t, IMPACTS, { rollScale: 0.3 }), rumble(t, 240, 256, 0.25, 2.2, { freq: 0.95, seed: 9 }));
      // type: line 1+2 land on f128 (scale pulse), line 3 rises from its mask on f160
      const p128 = clamp((t - 127.5) / 6.5), s128 = 1 + 0.17 * Math.pow(1 - EASE.outExpo(p128), 1.0);
      block.scale.setScalar(s128);
      lines[0].tl.mesh.visible = lines[1].tl.mesh.visible = t >= 127.5;
      const rise = EASE.outExpo(clamp((t - 159.5) / 8));
      lines[2].tl.mesh.visible = t >= 159.5; lines[2].tl.setShift(1 - rise);
    },
    overlay(t, g) { return false; },
  };
}
