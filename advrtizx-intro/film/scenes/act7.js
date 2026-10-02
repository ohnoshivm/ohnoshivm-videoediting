/* ACT VII · THE CLIMAX (f1152-1407) · owner: S4
   Hard cut to street level: the endless world skyline, white towers in red fog. One continuous accelerating pull-back / crane
   to a far near-frontal view while towers keep erupting everywhere and the central strip-towers grow into a jagged envelope
   whose outline is the AD monogram in elevation. f1376: HARD SILENCE, LIGHTS OUT: only the exact AD shape stays lit. */
import { F, getWorld, applyClimax, pullSpeed, readCues } from './lib_s4.js';

export default function act7(ctx) {
  readCues(ctx);
  const world = getWorld(ctx);
  return {
    id: 'act7', start: F.A7, end: F.HITA - 1,
    samples(t) { if (t < F.A7 + 8) return 6; if (t < F.OUT) return Math.min(3, Math.round(1 + 2 * pullSpeed(t))); return 1; },
    update(t) {
      if (world.group.parent !== ctx.root) ctx.root.add(world.group);
      applyClimax(ctx, t);
      // integrator: match on motion with Act VI's whip-tilt down: open tilted up, settle down by f1160
      { const k = Math.pow(1 - ctx.util.clamp((t - F.A7 + 0.25) / 8.25), 3), sh = ctx.cam.shake || { yaw: 0, pitch: 0, roll: 0, x: 0, y: 0, z: 0 };
        if (k > 0) ctx.cam.shake = { ...sh, pitch: sh.pitch + 26 * k, roll: sh.roll + 2.5 * k }; }
    },
  };
}
