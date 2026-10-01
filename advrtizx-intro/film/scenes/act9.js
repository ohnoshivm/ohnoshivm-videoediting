/* ACT IX · END CARD (f1632-1799) · owner: S4
   f1632-1663 the sentence clears (kinetic exit: each word rises out through its mask); the AD returns to hero size, centred slightly
   above the middle, and the wordmark "AdvrtizX" appears beneath it. f1664 "THE AI-FIRST AGENCY FOR THE WORLD'S REAL ESTATE" lands.
   f1664-1799 hold with an imperceptible push-in. The red is exactly #E80101 (232,1,1) with no grain or vignette; the mark is pure white. */
import { F, getPoster, drawWords, readCues } from './lib_s4.js';

export default function act9(ctx) {
  readCues(ctx);
  const P = getPoster(ctx);
  const T = ctx.kits.type, logo = ctx.kits.logo;
  const { EASE, bezier, clamp, lerp } = ctx.util;
  const glide = bezier(0.45, 0, 0.15, 1);
  const rise = (u) => 1 - Math.pow(1 - clamp(u), 4.2);
  const cardAD = { cx: 960, cy: 400, h: 340 };
  const wmO = { size: 164, weight: 900, stretch: 100, track: 0.012 };
  const wmW = T.measure('AdvrtizX', wmO).width;
  const wmBase = cardAD.cy + cardAD.h / 2 + 70 + 0.734 * 164;
  const tagO = { size: 21, weight: 700, stretch: 100, track: 0.30 };
  const tagText = 'THE AI-FIRST AGENCY FOR THE WORLD’S REAL ESTATE';
  const tagBase = wmBase + 72 + 0.734 * 21;
  const exitStart = [F.CARD + 6, F.CARD + 3, F.CARD + 0, F.CARD + 12, F.CARD + 9];      // EVERY SKYLINE STARTS WITH AN: line 2 right to left, then line 1
  // word index order: 0 EVERY, 1 SKYLINE, 2 STARTS, 3 WITH, 4 AN  -> AN first, WITH, STARTS, then SKYLINE, EVERY
  const exitAt = [F.CARD + 14, F.CARD + 11, F.CARD + 6, F.CARD + 3, F.CARD + 0];
  const EXIT = 15;
  const settle = (dt) => (dt > 0 ? -3.0 * Math.exp(-dt / 1.6) * Math.sin(dt * 1.1) : 0);

  return {
    id: 'act9', start: F.CARD, end: F.END,
    samples(t) { return t < F.TAG + 10 ? 10 : 1; },
    update(t) {
      ctx.kits.world.preset(ctx.env, 'flat');
      ctx.cam.set({ pos: [0, 0, 100], look: [0, 0, 0], fov: 40, near: 1, far: 1000 }); ctx.cam.shake = null;
    },
    overlay(t, g) {
      // imperceptible push-in over the hold
      const push = 1 + 0.012 * EASE.inOutSine(clamp((t - F.TAG) / (F.END - F.TAG)));
      g.save(); g.translate(960, 540); g.scale(push, push); g.translate(-960, -540);
      // the sentence leaves: every word rises out through the top of its line mask
      drawWords(ctx, g, P, (w) => { const u = (t - exitAt[w.i]) / EXIT; return u >= 1 ? null : { dy: -P.cap * 1.5 * (u > 0 ? Math.pow(u, 2.2) : 0), alpha: 1 }; });
      // the AD returns to hero size
      const u = glide(clamp((t - F.CARD - 2) / (F.CARD + 31 - (F.CARD + 2))));
      const cx = lerp(P.ad.cx, cardAD.cx, u), cy = lerp(P.ad.cy, cardAD.cy, u), h = P.ad.h * Math.pow(cardAD.h / P.ad.h, u);
      logo.draw(g, { x: cx, y: cy, height: h, anchor: 'center', fill: '#fff' });
      // the wordmark rises out of a mask beneath the AD
      const wu = (t - (F.CARD + 17)) / 16;
      if (wu > 0) {
        g.save(); g.beginPath(); g.rect(960 - wmW / 2 - 60, wmBase - 0.8 * 164 - 6, wmW + 120, 0.8 * 164 + 0.05 * 164 + 6); g.clip();
        T.draw(g, 'AdvrtizX', { ...wmO, x: 960, y: wmBase + 164 * 0.95 * (1 - rise(wu)), align: 'center', fill: '#fff' });
        g.restore();
      }
      // the tagline lands on the downbeat
      const tu = (t - F.TAG) / 10;
      if (tu > 0) {
        const tw = T.measure(tagText, tagO).width;
        T.draw(g, tagText, { ...tagO, x: 960, y: tagBase + 12 * (1 - rise(tu)), align: 'center', fill: '#fff', alpha: clamp(tu * 3) });
      }
      g.restore();
    },
  };
}
