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
  const RAIL = { azEnd: 14, yOrbit: 1070, yCrown: 1000, nxOrbit: 0.42 };
  const rail = L.rail2(P0, RAIL);
  const railAt = (t) => rail.at(t);
  const BLOCK_W = 1040, place = L.blockPlacement(P0, rail, { dist: 1293, y: 304, shiftX: -430, tiltDeg: 34.3 });   // integrator: narrower + further left so UNSOLD. clears the tower
  const block = new THREE.Group(); block.position.set(...place.C); block.rotation.set(-place.tilt, place.yaw, 0, 'YXZ'); ctx.root.add(block);
  const lay = L.justify([{ text: 'NO TOWER' }, { text: 'RISES' }, { text: 'UNSOLD.' }], BLOCK_W, BLOCK_W * 0.04);
  const lines = lay.lines.map((ln) => {
    const tl = L.typeLine({ text: ln.text, em: ln.em, stretch: ln.stretch, track: ln.track, fog: 0.55, pxPerEm: ln.em > 250 ? 300 : 420 });
    tl.mesh.position.set(0, ln.baseline + tl.centreAboveBaseline, 0); block.add(tl.mesh); return { ...ln, tl };
  });

  const dub = L.buildDubai(ctx, L.rail3(P0, RAIL)); ctx.root.add(dub.group);

  // low podium blocks around the base: the ground reference that rushes past in the dive (they stay as the plaza in Act III)
  const rr0 = ctx.rng('s1-plaza'), plaza = new kits.towers.TowerSet({ lod: 1, shadow: true, name: 'plaza' });
  for (let i = 0; i < 34; i++) { const ang = i / 34 * Math.PI * 2 + rr0.range(-0.08, 0.08), r = rr0.range(150, 520), x = r * Math.sin(ang), z = r * Math.cos(ang);
    if (z > 40 && x > -260 && x < 80) continue; const w = rr0.range(24, 46); plaza.add({ x, z, w, d: w * 0.8, h: rr0.range(28, 85), crown: rr0() < 0.5 ? 'Dd' : 'A', crownScale: 1.3, t0: -1e6, dur: 1, land: -1e6, pitch: 3.6 }); }
  plaza.build(); ctx.root.add(plaza.group);

  /* ── impacts ── */
  const IMPACTS = [{ f: 128, amp: 2.0, decay: 3.2, freq: 0.5, seed: 1 }, { f: 160, amp: 1.5, decay: 3.0, freq: 0.55, seed: 2 }, { f: 224, amp: 3.8, decay: 4.2, freq: 0.5, seed: 3 }];

  return {
    id: 'act2', start: 128, end: 255,
    samples(f) { if (f < 136) return 6; if (f < 200) return 3; return 6; },
    update(t) {
      const env = ctx.env, cam = ctx.cam;
      base.update(127);                                   // Act I's final-state hero/ground/fog/camera, then override what Act II animates
      const R = railAt(t);
      cam.set({ pos: R.pos, look: R.look, fov: R.fov, near: P0.near, far: P0.far });
      cam.shake = t < 240 ? addShake(shake(t, IMPACTS, { rollScale: 0.3 })) : addShake(shake(t, IMPACTS, { rollScale: 0.3 }), rumble(t, 240, 256, 0.25, 2.2, { freq: 0.95, seed: 9 }));
      // type: line 1+2 land on f128 (scale pulse), line 3 rises from its mask on f160
      const p128 = clamp((t - 127.5) / 6.5), s128 = 1 + 0.08 * Math.pow(1 - EASE.outExpo(p128), 1.0);
      env.fog.density = lerp(env.fog.density, 0.0016, EASE.inOutSine(prog(t, 232, 252)));   // integrator: thinner so the plaza/ground reads in the dive
      plaza.group.visible = t >= 236;                     // seen from crown height they read as debris; they only serve the dive
      block.scale.setScalar(s128); block.visible = t < 221;
      lines[0].tl.mesh.visible = lines[1].tl.mesh.visible = t >= 127.5;
      const rise = EASE.outExpo(clamp((t - 159.5) / 8));
      lines[2].tl.mesh.visible = t >= 159.5; lines[2].tl.setShift(1 - rise);
    },
    overlay(t, g) {
      const T0 = 221.0, HIT = 224;
      if (t < T0 || t > 244) return false;
      const T = ctx.kits.type, sh = shake(t, IMPACTS, { rollScale: 0.3 });
      let s = 1;
      if (t < HIT) s = lerp(1.22, 1, EASE.slam(clamp((t - T0) / (HIT - T0))));
      else s = 1 - 0.035 * Math.sin(clamp((t - HIT) / 4) * Math.PI) * Math.exp(-(t - HIT) / 3);
      const dy = t > 239.5 ? -1500 * EASE.inCubic(clamp((t - 239.5) / 4)) : 0;
      const ppd = 1080 / 52;
      g.translate(960 + sh.yaw * -ppd * 1.0, 540 + sh.pitch * ppd + dy); g.rotate(sh.roll * L.DEG); g.scale(s, s);
      const W = 1760, lines = [['WE SELL', 0], ['THEM.', 1]];
      const m = lines.map(([tx]) => T.measure(tx, { size: 100, stretch: 125, track: -0.02 }));
      const em = m.map((q) => W / (q.width / 100)), cap = m.map((q, i) => q.ascent / 100 * em[i]);
      const gap = 56, H = cap[0] + cap[1] + gap; let y = -H / 2;
      for (const pass of [0, 1]) { let yy = -H / 2; lines.forEach(([tx], i) => {
        yy += cap[i];
        T.draw(g, tx, pass ? { x: 0, y: yy, size: em[i], stretch: 125, track: -0.02, align: 'center', fill: '#fff', stroke: '#fff', strokeWidth: 3 } : { x: 0, y: yy, size: em[i], stretch: 125, track: -0.02, align: 'center', fill: '#E80101', stroke: '#E80101', strokeWidth: 18 });
        yy += gap; }); }
      return true;
    },
  };
}
