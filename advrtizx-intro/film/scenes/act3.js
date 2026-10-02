/* ACT III · DUBAI (f256-383) · owner: act2/act3 author
   f256 the beat drops: the mist bank blows off, towers erupt around the hero in expanding rings (crowns land on 256,264,272,280,288, then lighter on 8ths to 368).
   The camera pulls back and rises (wide, low), f288 "دبي" rises from a mask behind the skyline, f320-375 the camera trucks right past a D sail on the
   waterfront, f376-383 whip-pan right into pure lateral blur (Act IV arrives from it). */
import * as L from './lib_s1.js';

export default async function act3(ctx) {
  const { THREE } = ctx;
  const { EASE, clamp, lerp, prog, shake, addShake, rumble } = L;
  const base = await L.loadBase(ctx); ctx.root.add(base.root);
  const P0 = base.pose0;
  const rail = L.rail3(P0, { azEnd: 14, yOrbit: 1070, yCrown: 1000 });
  const city = L.buildDubai(ctx, rail); ctx.root.add(city.group);
  const water = ctx.kits.world.makeWater({ x0: -12000, x1: 12000, z0: L.COAST_Z, z1: 12000 }); ctx.root.add(water);

  const ar = L.typeLine({ text: 'دبي', em: 1050, lang: 'arabic', pxPerEm: 700, fog: 0.5, stretch: 100 });
  const lat = L.typeLine({ text: 'DUBAI', em: 250, track: 0.4, stretch: 125, pxPerEm: 600, fog: 0.5 });
  const TZ = -3400, AB = 1560;
  ar.mesh.position.set(900, AB + ar.centreAboveBaseline, TZ); lat.mesh.position.set(900, 880 + lat.centreAboveBaseline, TZ);
  ctx.root.add(ar.mesh); ctx.root.add(lat.mesh);

  const IMP = [{ f: 256, amp: 3.6, decay: 4.2, seed: 1 }, { f: 264, amp: 2.8, decay: 3.4, seed: 2 }, { f: 272, amp: 2.4, decay: 3.2, seed: 3 }, { f: 280, amp: 2.0, decay: 3, seed: 4 }, { f: 288, amp: 2.6, decay: 3.6, seed: 5 },
    ...L.LIGHT.map((f, i) => ({ f, amp: 0.8, decay: 2.4, seed: 10 + i }))];
  return {
    id: 'act3', start: 256, end: 383,
    samples(f) { if (f >= 376) return 12; return (f < 290 || L.LIGHT.some((l) => f >= l - 1 && f <= l + 1)) ? 6 : 4; },
    update(t) {
      const env = ctx.env, cam = ctx.cam;
      base.update(127);
      const c = rail.at(t);
      cam.set({ pos: c.pos, look: c.look, fov: c.fov, roll: c.roll || 0, near: 2, far: 60000 });
      cam.shake = addShake(shake(t, IMP, { rollScale: 0.3 }), t < 376 ? { yaw: 0, pitch: 0, roll: 0, x: 0, y: 0, z: 0 } : rumble(t, 376, 384, 0, 0));
      // mist bank blows off on the drop; air thickens gently so the skyline layers into the red
      env.fog.density = lerp(0.012, 0.0004, EASE.outCubic(prog(t, 255.5, 275)));
      env.fog.height = lerp(250, 300, prog(t, 256, 280));
      env.fog.air = lerp(0.00004, 0.00011, prog(t, 256, 300));
      { const k = EASE.inOutSine(prog(t, 256, 280)); env.ambient = { up: lerp(0.72, 0.5, k), down: lerp(0.46, 0.22, k), bounce: 0 }; env.sun = { az: lerp(-38, -52, k), el: lerp(33, 30, k), intensity: lerp(1.62, 1.95, k), dir: null }; }
      env.shadow = { on: true, center: [100, 0, -250], radius: 2300, size: 2048, bias: 0.0005, normalBias: 2.2 };
      const rings = [];
      L.HEAVY.forEach((f, k) => { const dt = t - f; if (dt >= -1 && dt < 16) rings.push({ x: 0, z: 40, r: [230, 480, 760, 1060, 1400][k] + dt * 45, w: 9, tail: 90, k: clamp(1 - dt / 16) }); });
      env.rings = rings.slice(0, 4);
      // type rises from its mask on 288
      const rise = EASE.outExpo(clamp((t - 287.5) / 9));
      ar.mesh.visible = lat.mesh.visible = t >= 287.5; ar.setShift(1 - rise); lat.setShift(1 - EASE.outExpo(clamp((t - 288.5) / 9)));
    },
  };
}
