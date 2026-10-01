/* ACT I · THE CROWN (f0-127) · owner: core
   A white A-wedge crown plummets into a red void (f0-2), SLAMS (f3), then a jack-up construction lifts the stack one module per hit
   (f12-71, accelerating into one continuous surge) to ~1 km. f72 TOP LOCK: dead stop. Slow crane up the tower (f72-127);
   at ~f112 the camera clears the crown and looks down on one tower alone in a red void.
   EXPORTS the hand-off pose for Act II (end pose, see ACT1_END). */
export const ACT1_END = { tower: { x: 0, z: 0, w: 100, d: 58, shaftTop: 900, crown: 'A' }, note: 'see update() at t = 127: camera 330 m out, ~1130 m up, looking down at the crown' };

export default function act1(ctx) {
  const { kits, util, camera } = ctx;
  const { JackTower, jackModules } = kits.towers;
  const { EASE, track, clamp, lerp, shake, rumble, addShake, prog, smoothstep } = util;

  const hits = ctx.cueFrames('a1.hit');                       // 22 frames from cue_sheet.json
  const SLAM = ctx.cue('a1.slam'), LOCK = ctx.cue('a1.toplock'), CLEAR = ctx.cue('a1.clear');
  const modules = jackModules(hits.length, 900, { first: 0.45, growth: 1.35 });
  const hero = new JackTower({ x: 0, z: 0, w: 100, d: 58, crown: 'A', hits, modules, dur: 4.2, pitch: 4.2 });
  ctx.root.add(hero.group);
  const ground = kits.world.makeGround(); ctx.root.add(ground);

  // impacts that shake the camera: the slam, 14 spaced hits, then the surge rumble
  const impacts = [{ f: SLAM, amp: 2.6, decay: 3.4, freq: 0.5 }];
  hits.slice(0, 14).forEach((f, i) => impacts.push({ f, amp: 0.5 + i * 0.05, decay: 2.2, freq: 0.7, seed: i }));

  const smoothTop = (t) => { let s = 0; const N = 7; for (let i = 0; i < N; i++) s += hero.top(t - i * 0.8); return s / N; };
  const fall = (t) => { if (t >= SLAM) return 0; const L0 = 140, v0 = 34, g = (L0 - 3 * v0) / 4.5; const u = t + 0; return Math.max(0, L0 - v0 * u - 0.5 * g * u * u); };

  const camAz = track([[0, -17], [LOCK - 1, -13], [LOCK, -13], [127, -40, 'inOutCubic']]);
  const camDist = track([[0, 168], [SLAM, 190], [LOCK, 235], [127, 330, 'inOutCubic']]);
  const camY = track([[0, 7], [SLAM, 5], [12, 6], [40, 70], [LOCK, 255], [CLEAR, 1010, 'glide'], [127, 1135, 'outCubic']].map((k) => k));
  const camYlate = track([[LOCK, 255], [CLEAR, 1010, 'glide'], [127, 1135, 'outCubic']]);
  const lookLate = track([[LOCK, 960], [CLEAR, 930, 'inOutCubic'], [127, 905, 'inOutCubic']]);

  return {
    id: 'act1', start: 0, end: 127,
    samples(t) {
      if (t < 6) return 16;
      if (t < 12) return 6;
      if (t <= LOCK + 0.5) { const nearHit = hits.some((h) => Math.abs(t - h) < 3); return t >= 60 ? 16 : nearHit ? 8 : 4; }
      return t < 84 ? 8 : 4;
    },
    update(t) {
      const env = ctx.env, cam = ctx.cam;
      kits.world.preset(env, 'hero');
      // fog thickens as the camera climbs out of the haze
      env.fog.density = lerp(0.0011, 0.0034, prog(t, LOCK, 125, EASE.cine));
      // the slam ring + small rings on the first hits
      const rings = [];
      if (t >= SLAM) { const dt = t - SLAM; rings.push({ x: 0, z: 0, r: 8 + dt * 62, w: 7, tail: 85, k: clamp(1 - dt / 16) * 1.0 }); }
      for (let i = 0; i < 4; i++) { const f = hits[i], dt = t - f; if (dt >= 0 && dt < 9) rings.push({ x: 0, z: 0, r: 60 + dt * 46, w: 5, tail: 40, k: 0.55 * clamp(1 - dt / 9) }); }
      env.rings = rings.slice(0, 4);

      // hero tower: crown falls f0-3, then the jack-up
      const lift = fall(t);
      hero.update(t, lift);

      // camera
      let pos, look, fov = 52;
      const top = smoothTop(t);
      if (t < LOCK) {
        const az = camAz(t) * Math.PI / 180, d = camDist(t);
        // f0-3: the camera tilts DOWN with the plunge (looking up at the crown at f0, at the ground it lands on at f3); after that it tilts UP with the stack
        const y = camY(t);
        const ly = t < SLAM ? lerp(105, 38, prog(t, 0, SLAM, EASE.inQuad)) : lerp(38, 38 + 0.5 * (top + 43), prog(t, SLAM, SLAM + 6, EASE.outQuad)) + (top > 0 ? (top) * 0.5 : 0);
        pos = [d * Math.sin(az), y, d * Math.cos(az)];
        look = [0, t < SLAM ? ly : Math.max(38, 0.62 * (top + 43)) + 8, 0];
      } else {
        const az = camAz(t) * Math.PI / 180, d = camDist(t);
        pos = [d * Math.sin(az), camYlate(t), d * Math.cos(az)];
        look = [0, lookLate(t), 0];
      }
      cam.set({ pos, look, fov, near: 2, far: 60000 });
      // shake: slam + hits, then a rumble that swallows the jolts (f46-71), dead still at the lock
      const sh = t < LOCK ? addShake(shake(t, impacts, { rollScale: 0.35 }), rumble(t, 46, 71.9, 0.05, 1.9, { freq: 0.9, seed: 5 })) : { yaw: 0, pitch: 0, roll: 0, x: 0, y: 0, z: 0 };
      cam.shake = sh;
    },
  };
}
