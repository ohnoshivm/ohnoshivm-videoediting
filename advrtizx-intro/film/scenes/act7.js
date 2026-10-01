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
    samples(t) { if (t < F.OUT) return Math.round(3 + 21 * pullSpeed(t)); return 4; },
    update(t) {
      if (world.group.parent !== ctx.root) ctx.root.add(world.group);
      applyClimax(ctx, t);
    },
  };
}
