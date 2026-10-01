/* ACT I · THE CROWN (f0-127) · owner: core
   A white A-wedge crown plummets into a red void (f0-2), SLAMS (f3), then a jack-up construction lifts the stack one module per hit
   (f12-71, accelerating into one continuous surge) to ~1 km. f72 TOP LOCK: dead stop. Slow crane up the tower (f72-127);
   at ~f112 the camera clears the crown and looks down on one tower alone in a red void.
   The camera is framed with aimAt(): the crown is placed at a chosen screen position every frame, so the composition is exact.
   Hand-off to Act II: see ACT1_END (the camera pose at f127 is computed by camAt(127)). */
export const ACT1_END = { tower: { x: 0, z: 0, w: 100, d: 58, shaftTop: 900, crown: 'A', crownH: 85.8 }, camera: { azDeg: 40, dist: 330, y: 1140, fov: 52 } };

export default function act1(ctx) {
  const { kits, util, camera } = ctx;
  const { JackTower, jackModules } = kits.towers;
  const { EASE, track, clamp, lerp, shake, rumble, addShake, prog } = util;

  const hits = ctx.cueFrames('a1.hit');                       // the 22 hit frames from cue_sheet.json
  const SLAM = ctx.cue('a1.slam'), LOCK = ctx.cue('a1.toplock'), CLEAR = ctx.cue('a1.clear');
  const modules = jackModules(hits.length, 900, { first: 0.45, growth: 1.35 });
  const hero = new JackTower({ x: 0, z: 0, w: 100, d: 58, crown: 'A', hits, modules, dur: 4.5, pitch: 4.2, reflect: 0.46 });   // hits = LOCK frames: each thrust accelerates and locks dead ON its frame
  ctx.root.add(hero.group);
  const ground = kits.world.makeGround(); ctx.root.add(ground);
  const FOV = 52;

  // impacts that shake the camera: the slam, the 14 spaced hits, then the surge rumble (below)
  const impacts = [{ f: SLAM, amp: 2.4, decay: 3.4, freq: 0.5 }];
  hits.slice(0, 14).forEach((f, i) => impacts.push({ f, amp: 0.45 + i * 0.05, decay: 2.2, freq: 0.7, seed: i }));

  // the stack top, low-passed over ~4 frames: the camera follows the tower like a heavy rig, not the jolts
  const smoothTop = (t) => { let s = 0; const N = 7; for (let i = 0; i < N; i++) s += hero.top(t - i * 0.9); return s / N; };
  // the plummet: lift(t) = metres the crown hangs above its resting place. 90 m at f0, 45 m/frame at the slam.
  const fall = (t) => (t >= SLAM ? 0 : Math.max(0, 90 - 15 * t - 5 * t * t));

  const camAz = track([[0, 20], [SLAM, 19], [LOCK - 1, 13], [LOCK, 13], [127, 40, 'inOutCubic']]);
  const camDist = track([[0, 150], [SLAM, 158], [12, 165], [40, 160], [LOCK, 150], [127, 330, 'inOutCubic']]);
  const camY = track([[0, 6], [SLAM, 6], [12, 8], [40, 70], [LOCK, 205], [CLEAR, 1020, 'glide'], [127, 1140, 'outCubic']]);
  const ndcY = track([[0, 0.12], [SLAM, 0.0], [12, 0.10], [40, 0.34], [LOCK, 0.42], [CLEAR, 0.42, 'inOutCubic'], [127, 0.36, 'inOutCubic']]);
  // thin fog while the white crown must stay white; after the lock a red mist bank rises and swallows the base and the ground
  const fogD = track([[0, 0.0003], [LOCK, 0.0003], [127, 0.012, 'inOutCubic']]);
  const fogH = track([[0, 300], [LOCK, 300], [127, 250]]);

  // what the camera frames: the lagged stack (heavy rig) early, the EXACT stack from f50 on so that the camera stops dead with the tower at the lock
  const focus = (t) => (t < SLAM ? fall(t) : lerp(smoothTop(t), hero.top(t), prog(t, 50, 66)));
  const camAt = (t) => {
    const az = camAz(t) * Math.PI / 180, d = camDist(t), y = camY(t);
    const pos = [d * Math.sin(az), y, d * Math.cos(az)];
    const centre = focus(t) + 43;
    return { pos, look: camera.aimAt(pos, [0, centre, 0], { ndcY: ndcY(t), fov: FOV }) };
  };

  return {
    id: 'act1', start: 0, end: 127,
    samples(t) {
      if (t < 5) return 32;                    // the plummet and the slam: 45 m/frame + 2.4 deg of shake needs 32 sub-frames to blur without ghost steps
      if (t < 8) return 8;
      if (t < LOCK - 0.5) { const nearHit = hits.some((h) => t > h - 5 && t < h + 2); return t >= 56 ? 16 : nearHit ? 10 : 6; }
      if (t < LOCK + 0.6) return 4;            // the dead stop: nothing moves, 4 jittered sub-frames only antialias
      return t < 84 ? 6 : 4;
    },
    update(t) {
      const env = ctx.env, cam = ctx.cam;
      kits.world.preset(env, 'hero');
      env.fog.density = fogD(t); env.fog.height = fogH(t);
      // the slam ring + small rings on the first hits
      const rings = [];
      if (t >= SLAM) { const dt = t - SLAM; rings.push({ x: 0, z: 0, r: 8 + dt * 62, w: 7, tail: 85, k: clamp(1 - dt / 16) }); }
      for (let i = 0; i < 14; i++) { const dt = t - hits[i]; if (dt >= 0 && dt < 9 && rings.length < 4) rings.push({ x: 0, z: 0, r: 60 + dt * 46, w: 5, tail: 40, k: (0.62 - i * 0.03) * clamp(1 - dt / 9) }); }
      env.rings = rings.slice(0, 4);
      // hero tower: crown falls f0-3, then the jack-up
      hero.update(t, fall(t));
      // camera
      const c = camAt(t);
      // lens punch on the impacts: the slam squeezes the lens 3 degrees and releases over ~8 frames; every spaced hit adds a small kick
      let punch = t >= SLAM ? 3.0 * Math.exp(-(t - SLAM) / 2.6) : 0;
      for (let i = 0; i < 14; i++) { const dt = t - hits[i]; if (dt >= 0) punch += (0.5 + i * 0.03) * Math.exp(-dt / 1.6); }
      cam.set({ pos: c.pos, look: c.look, fov: FOV - punch, near: 2, far: 60000 });
      // shake: slam + hits, then a rumble that swallows the jolts (f46-71), dead still at the lock
      cam.shake = t < LOCK ? addShake(shake(t, impacts, { rollScale: 0.3 }), rumble(t, 46, 71.0, 0.05, 1.7, { freq: 0.9, seed: 5 })) : { yaw: 0, pitch: 0, roll: 0, x: 0, y: 0, z: 0 };
    },
  };
}
