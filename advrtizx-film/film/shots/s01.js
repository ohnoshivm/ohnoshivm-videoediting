/* S01 · Twelve Knots · f0–119 (treatment §4 S01).
   A slack 13-knot rope draws on, is pegged into a 3-4-5 triangle, and is annotated 3 · 4 · 5 · 90°.
   Hands off (continuous) to S02 at f120 — the f119 pose is held, so S02 f120 is the same drawing.

   This file also publishes the small shared kit used by S02 and S03 (TA.act1): everything in "ACT1 px"
   space (the construction camera, 4.8 px/MU, sharp vertex at (660,780)) mapped through a screen-space
   push k about (961,540), so line weights and type stay constant while positions follow the camera. */
(function () {
  const { registerShot, SPEC, text, rise, path, rect, g, lineSegs, polySegs, prog, tween, EASE, C, LW, V, lerp, clamp,
          slopeOrder, easeInv, cam, camZoom, CAMS, fmt } = TA;
  const A1 = (TA.act1 = TA.act1 || {});

  /* ─── geometry (ACT1 px) ─── */
  const V0 = [660, 780], V3 = [1020, 780], V7 = [1020, 300];
  const slack = (i) => { const x = 240 + 120 * i; return [x, 540 + 40 * (1 - Math.pow((x - 960) / 720, 2))]; };
  const target = (i) => (i <= 3 ? [660 + 120 * i, 780] : i <= 7 ? [1020, 780 - 120 * (i - 3)] : [1020 - 72 * (i - 7), 300 + 96 * (i - 7)]);
  // groups: [first knot, last knot, pull start, pull end] — TAUT
  const GROUPS = [[0, 3, 45, 60], [4, 7, 52, 67], [8, 12, 60, 75]];
  const knotPos = (f) => Array.from({ length: 13 }, (_, i) => {
    const gr = GROUPS.find((q) => i >= q[0] && i <= q[1]);
    return V.lerp(slack(i), target(i), prog(f, gr[2], gr[3], EASE.TAUT));
  });
  // the hypotenuse hands the compass its midpoint: the "5" sits 36px off it on the outer (up-left) normal
  const FIVE_R = 300, FIVE_OFF = 36;
  const fiveCentre = (thetaDeg) => {
    const t = thetaDeg * TA.DEG, d = [Math.cos(t), Math.sin(t)], n = [Math.sin(t), -Math.cos(t)];
    return V.add(V.add(V0, V.mul(d, FIVE_R)), V.mul(n, FIVE_OFF));
  };
  const ANG0 = -Math.atan2(4, 3) / TA.DEG;                 // −53.1301°
  const NUM = {                                            // numeral / 90° anchors (36px off the legs)
    three: [840, 816], four: [1056, 540], five: fiveCentre(ANG0), deg: [984, 744],   // deg: right edge x, baseline y
  };
  const CAP = 0.698;                                       // Plex Mono cap height / em — centres digits on their anchor

  /* ─── helpers shared with S02/S03 ─── */
  const hex2 = (v) => Math.round(v).toString(16).padStart(2, '0');
  /** red over white at alpha a (a=.4 → RED_40 #F69999, a=.25 → RED_25 #F9C0C0) — opaque, so overlaps never darken. */
  const tint = (a) => ('#' + [232, 1, 1].map((v) => hex2(255 + (v - 255) * a)).join('')).toUpperCase();
  /** screen-space push k about (961,540), as a camera over ACT1 px: Zc(k).apply(px) → screen. */
  const Zc = (k = 1) => camZoom(cam(1, [0, 0], [0, 0]), k, [961, 540]);
  const Zpt = (k, p) => [961 + k * (p[0] - 961), 540 + k * (p[1] - 540)];
  /** scale an svg group about a screen point (text and tick marks scale to 0 and back without leaving the pixel grid). */
  const scaleAbout = (inner, c, s) => (!inner || s <= 0 ? '' : s >= 1 ? inner :
    `<g transform="translate(${fmt(c[0])} ${fmt(c[1])}) scale(${fmt(s)}) translate(${fmt(-c[0])} ${fmt(-c[1])})">${inner}</g>`);
  /** drafting grid crosses at the module lattice, pushed by k; each cross scales by scaleFn(i,j,x,y) (0..1) about its centre. */
  function grid(k, scaleFn) {
    let d = '';
    for (let i = 1; i < 32; i++) for (let j = 1; j < 18; j++) {
      const x0 = i * 60 + 0.5, y0 = j * 60 + 0.5, s = scaleFn ? clamp(scaleFn(i, j, x0, y0)) : 1; if (s <= 0) continue;
      const x = 961 + k * (x0 - 961), y = 540 + k * (y0 - 540), r = 4.5 * s;
      d += `M${fmt(x - r)} ${fmt(y)}h${fmt(2 * r)}M${fmt(x)} ${fmt(y - r)}v${fmt(2 * r)}`;
    }
    return d ? `<path d="${d}" fill="none" stroke="${C.RED}" stroke-opacity="0.14" stroke-width="1"/>` : '';
  }
  /** the rope as a polyline through P, drawn on by KNOT INDEX (u = 0..12) so knot i is reached exactly when the audio TICK fires. */
  function ropeTo(P, u, k) {
    if (u <= 0) return '';
    const n = Math.min(12, Math.floor(u)), segs = [['M', ...P[0]]];
    for (let i = 1; i <= n; i++) segs.push(['L', ...P[i]]);
    if (u < 12 && u > n) segs.push(['L', ...V.lerp(P[n], P[n + 1], u - n)]);
    if (segs.length === 1) segs.push(['L', P[0][0] + 0.01, P[0][1]]);
    return path(segs, { cam: Zc(k), stroke: C.RED, sw: LW.ROPE, cap: 'round', join: 'round' });
  }
  /** 14 × 3 knot tick, perpendicular to the rope (chord through the neighbouring knots), scaled s along its length. */
  function tick(i, P, s, k) {
    if (s <= 0) return '';
    const a = P[Math.max(0, i - 1)], b = P[Math.min(12, i + 1)], d = V.norm(V.sub(b, a)), n = [-d[1], d[0]], h = 7 * s;
    const c = Zpt(k, P[i]);
    return path(lineSegs([c[0] - n[0] * h, c[1] - n[1] * h], [c[0] + n[0] * h, c[1] + n[1] * h]), { stroke: C.RED, sw: 3, cap: 'butt' });
  }
  /** 10px peg, stamped in: 15px → 10px over ~3f so it reads as driven into the paper. First visible frame is `hit`. */
  const pegScale = (f, hit) => (f < hit ? 0 : 1 + 0.5 * (1 - EASE.SET(clamp((f - hit) / 4))));
  function peg(c, s, k) {
    if (s <= 0) return '';
    const p = Zpt(k, c);
    return `<rect x="-5" y="-5" width="10" height="10" fill="${C.RED}" transform="translate(${fmt(p[0])} ${fmt(p[1])}) scale(${fmt(s)})"/>`;
  }
  /** numeral set (MEASURE 500, 32px) from the baseline mask; centred on its anchor. */
  function numeral(ch, c, p, k, size = 32) {
    const q = Zpt(k, c), base = q[1] + size * CAP / 2;
    return rise(text(ch, { x: q[0], y: base, anchor: 'middle', voice: 'measure', size, fill: C.RED }), { p, baseline: base, size });
  }
  /** `90°` (MEASURE 16px): right edge at x, baseline y. */
  function degLabel(p, k) {
    const q = Zpt(k, NUM.deg);
    return rise(text('90°', { x: q[0], y: q[1], anchor: 'end', voice: 'measure', size: 16, fill: C.RED }), { p, baseline: q[1], size: 16 });
  }
  /** right-angle marker: the two inner sides of a 24px square in the V3 corner, drawn base→up→across; scaled about V3. */
  function marker(draw, s, k) {
    if (draw <= 0 || s <= 0) return '';
    const pts = [[996, 780], [996, 756], [1020, 756]].map((p) => Zpt(k, V.add(V3, V.mul(V.sub(p, V3), s))));
    return path(polySegs(pts), { stroke: C.RED, sw: LW.HAIR, cap: 'butt', join: 'miter', draw });
  }
  // knot arrival frames: ticks sitting under a peg are tied off as the peg lands (knot 7 waits for its peg at f75)
  const CORNER_VANISH = { 0: 60, 3: 60, 7: 75, 12: 75 };
  const tickTimes = Array.from({ length: 13 }, (_, i) => 6 + 30 * easeInv(EASE.DRAFT, i / 12));

  Object.assign(A1, { V0, V3, V7, slack, target, knotPos, fiveCentre, FIVE_R, FIVE_OFF, ANG0, NUM, CAP, tint, Zc, Zpt, scaleAbout,
    grid, ropeTo, tick, peg, pegScale, numeral, degLabel, marker, CORNER_VANISH, tickTimes });

  registerShot({
    ...SPEC.S01,
    render(lf, ctx) {
      const f = ctx.f, P = knotPos(f), out = [];
      // grid prints along the slope normal: delay ∝ projection onto (0.8, 0.6), 4f SET per cross
      out.push(grid(1, (i, j, x, y) => EASE.SET(clamp((f - slopeOrder(x, y) * 20) / 4))));

      // rope draws on left→right (DRAFT 30f), by knot index
      out.push(ropeTo(P, 12 * prog(f, 6, 36, EASE.DRAFT), 1));
      // knot ticks pop as the pen passes (scaleY 0→1, 4f SET); the four corner knots are tied off under their pegs
      for (let i = 0; i <= 12; i++) {
        let s = EASE.SET(clamp((f - tickTimes[i]) / 4));
        if (i in CORNER_VANISH) s *= 1 - prog(f, CORNER_VANISH[i] - 3, CORNER_VANISH[i], EASE.LIFT);
        out.push(tick(i, P, s, 1));
      }
      // pegs knock in at V0 f45, V3 f60, V7 f75
      out.push(peg(V0, pegScale(f, 45), 1), peg(V3, pegScale(f, 60), 1), peg(V7, pegScale(f, 75), 1));
      // right angle, then 3 · 4 · 5 (first visible frame = the BELL frame), then 90°
      out.push(marker(prog(f, 75, 81, EASE.DRAFT), 1, 1));
      out.push(numeral('3', NUM.three, EASE.SET(clamp((f - 77) / 8)), 1));
      out.push(numeral('4', NUM.four, EASE.SET(clamp((f - 82) / 8)), 1));
      out.push(numeral('5', NUM.five, EASE.SET(clamp((f - 87) / 8)), 1));
      out.push(degLabel(EASE.SET(clamp((f - 95) / 8)), 1));
      return out;
    },
  });
})();
