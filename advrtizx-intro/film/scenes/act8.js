/* ACT VIII · THE CADENCE (f1408-1631) · owner: S4
   f1408 dominant hit: the A region FUSES (gaps close, wedge crowns complete the slope, fillets and arch-bite exact).
   f1440 tonic hit: the D region fuses: the bigger release. f1440-1503: dolly-zoom to orthographic, the fog clears, depth flattens:
   the EXACT 2D logo, white on #E80101, centred.  f1504-1535 "EVERY SKYLINE / STARTS WITH AN" sets in (2D) while the AD shrinks and
   travels to be the last word of line 2.  f1536 the AD clicks home. Hold. (3D: lib_s4.js applyClimax; 2D: this file) */
import { F, getWorld, applyClimax, readCues, getPoster, drawWords, AD_PX_H } from './lib_s4.js';

export default function act8(ctx) {
  readCues(ctx);
  const world = getWorld(ctx);
  const P = getPoster(ctx);
  const { EASE, bezier, clamp, lerp, prog } = ctx.util;
  const logo = ctx.kits.logo;
  const T_SWAP = F.ORTHO + 0.5;                          // frame 1503 is wholly 3D, frame 1504 wholly 2D
  const fly = bezier(0.62, 0.0, 0.93, 0.62);             // slow drift, then a magnetic pull: arrives at speed, ON the click frame
  const rise = (u) => 1 - Math.pow(1 - clamp(u), 4.2);   // fast attack, soft landing
  const startOf = [F.SENT + 1, F.SENT + 4, F.SENT + 9, F.SENT + 13, F.SENT + 17];      // EVERY SKYLINE STARTS WITH AN
  const DUR = 15;

  /** The AD's centre / height at time t (px, 1920x1080 logical). */
  const adAt = (t) => {
    const hero = { cx: 960, cy: 540, h: AD_PX_H };
    const u = fly(clamp((t - (F.SENT + 3)) / (F.CLICK - 0.5 - (F.SENT + 3))));
    const c = [1560, 230];
    const x = (1 - u) * (1 - u) * hero.cx + 2 * (1 - u) * u * c[0] + u * u * P.ad.cx;
    const y = (1 - u) * (1 - u) * hero.cy + 2 * (1 - u) * u * c[1] + u * u * P.ad.cy;
    const us = EASE.outCubic(clamp((t - (F.SENT + 1)) / 24));
    const h = hero.h * Math.pow(P.ad.h / hero.h, us);
    let dx = 0, dy = 0;
    if (t > F.CLICK) { const dt = t - F.CLICK; dx = -4.0 * Math.exp(-dt / 1.5) * Math.sin(dt * 1.15); }   // the click: a micro overshoot and settle
    return { cx: x + dx, cy: y + dy, h };
  };

  return {
    id: 'act8', start: F.HITA, end: F.CARD - 1,
    samples(t) {
      if (t < F.HITA - 1) return 1;
      if (t >= F.HITA - 1 && t < F.HITA + 8) return 6;
      if (t >= F.HITD - 1 && t < F.HITD + 14) return 6;
      if (t < F.ORTHO - 6) return 4;
      if (t < T_SWAP) return 2;
      if (t < F.CLICK + 7) return 6;
      return 1;
    },
    update(t) {
      if (world.group.parent !== ctx.root) ctx.root.add(world.group);
      applyClimax(ctx, t);
      world.group.visible = t < T_SWAP;
      if (t >= T_SWAP) { ctx.kits.world.preset(ctx.env, 'flat'); ctx.cam.set({ pos: [0, 0, 100], look: [0, 0, 0], fov: 40, ortho: 0, near: 1, far: 1000 }); ctx.cam.shake = null; }
    },
    overlay(t, g) {
      if (t < T_SWAP) return false;
      drawWords(ctx, g, P, (w) => { const u = (t - startOf[w.i]) / DUR; return { dy: P.cap * 1.5 * (1 - rise(u)), alpha: u > 0 ? 1 : 0 }; });
      const a = adAt(t);
      logo.draw(g, { x: a.cx, y: a.cy, height: a.h, anchor: 'center', fill: '#fff' });
    },
  };
}
