/* S10 · The Stair · f1170–1349 — treatment §4 S10.
   The funnel as a staircase in section, pitched 3:4 (rise 72, run 96 — the logo's own triangle, complementary 36.87°).
   World coords: stair starts (300,780). Camera = SURVEY drift of (−576,+432) over f1200–1290 (−96,+72 per beat: it climbs the
   pitch, smoothly, while the treads land in steps), then the push through the door slot f1320–1349.
   f1170 equals S09's last frame (slabs at 656 / 1264, the complete stop card). S10 is pure white from f1342. */
(function () {
  const { registerShot, SPEC, text, rise, exit, prog, tween, EASE, C, LW, path, polySegs, rect, g, fmt } = TA;
  const { card10 } = TA.act3;
  const INK = C.RED, WHITE = C.WHITE;

  const G = 780, X0 = 300, RISE = 72, RUN = 96, N = 7, T0 = 1185, BEAT = 15;
  const SOFF = 50;                          // soffit: parallel to the pitch, 40px (perpendicular) under the valley line = 50px vertical
  const LABELS = ['SEEN', 'STOPPED', 'TAPPED', 'ENQUIRED', 'CALLED BACK', 'VISITED', 'KEYS'];
  const LAND = { x0: X0 + N * RUN, x1: X0 + N * RUN + 400, y: G - N * RISE };            // 972 → 1372 at y 276
  const BLK = { x0: 1000, x1: 1320, yb: LAND.y, h: 480 };                                  // door block 1000–1320, 276 up to −204
  const DRIFT = [-576, 432], SLOT = [584, 468], K_PUSH = 1e6;

  const soffit = (x) => G + SOFF - 0.75 * (x - X0);
  /** polygon ∩ {y ≤ ymax} (Sutherland–Hodgman, one half-plane) */
  function clipBelow(pts, ymax) {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length], ain = a[1] <= ymax, bin = b[1] <= ymax;
      if (ain) out.push(a);
      if (ain !== bin) { const t = (ymax - a[1]) / (b[1] - a[1]); out.push([a[0] + (b[0] - a[0]) * t, ymax]); }
    }
    return out;
  }
  const clampv = (v) => Math.max(-6000, Math.min(8000, v));

  /** world → screen at frame f: SURVEY climb, then the LIFT push about the slot centre (584,468) panning it to (960,540). */
  function camera(f) {
    const u = prog(f, 1200, 1290), off = [DRIFT[0] * u, DRIFT[1] * u];
    const e = prog(f, 1320, 1349, EASE.LIFT), s = Math.exp(e * Math.log(K_PUSH));
    const ep = prog(f, 1320, 1342, EASE.LIFT), P = [SLOT[0] + (960 - SLOT[0]) * ep, SLOT[1] + (540 - SLOT[1]) * ep];   // the pan lands exactly as the slot fills the frame
    return (p) => [P[0] + s * (p[0] + off[0] - SLOT[0]), P[1] + s * (p[1] + off[1] - SLOT[1])];
  }

  registerShot({
    ...SPEC.S10,                                          // f1170–1349, bg WHITE
    render(lf, ctx) {
      const f = ctx.f, out = [], T = camera(f);
      if (f >= 1342) return '';                           // white fills the frame: the cut to S11 is white into white

      /* ── f1170–1195: the stop card dissolves into the ground line ── */
      const sunCy = tween(f, [1185, 1195], [843, 880], EASE.LIFT);                 // the sun sinks below the line
      const c = card10(f, { clock: true, nSpec: 99, sunCy });
      const ex = (a, b) => EASE.LIFT(prog(f, a, b));
      out.push(`<g transform="translate(656 0)">` + exit(c.headline, ex(1172, 1178)) + exit(c.clock, ex(1170, 1176)) + exit(c.spec, ex(1170, 1176)) + `</g>`);

      // the card's horizon extends from the card edges to the screen edges (DRAFT 15f) and becomes the ground line y 780
      const eh = prog(f, 1170, 1185, EASE.DRAFT), gy = T([0, G])[1];
      out.push(`<path d="M${fmt(656 * (1 - eh))} ${fmt(gy)}H${fmt(1264 + 656 * eh)}" stroke="${INK}" stroke-width="2" fill="none"/>`);
      out.push(`<g transform="translate(656 0)">${c.sun}</g>`);          // drawn after the line, as in S09 (identical pixels at f1170)

      // the slabs slide fully offscreen (LIFT 15f)
      const sl = tween(f, [1170, 1185], [656, -2], EASE.LIFT), sr = tween(f, [1170, 1185], [1264, 1922], EASE.LIFT);
      if (sl > 0) out.push(rect(0, 0, sl, 1080, INK));
      if (sr < 1920) out.push(rect(sr, 0, 1920 - sr, 1080, INK));

      /* ── the stair: riser up 4f, tread out 4f, both ending ON the beat; the poché mass SET 6f from the beat ── */
      for (let k = 1; k <= N; k++) {
        const b = T0 + BEAT * (k - 1), xk = X0 + RUN * (k - 1), yf = G - RISE * (k - 1), yt = G - RISE * k;
        const pr = prog(f, b - 8, b - 4, EASE.DRAFT), pt = prog(f, b - 4, b, EASE.DRAFT);
        const pm = prog(f, b - 1, b + 5, EASE.SET);               // the mass is already half-set ON frame b: that frame is the hit
        if (pm > 0) {           // solid sawtooth mass: this tread's trapezoid, dropping from the tread to the soffit
          const quad = clipBelow([[xk, yt], [xk + RUN, yt], [xk + RUN, soffit(xk + RUN)], [xk, soffit(xk)]], G);
          out.push(path(polySegs(quad.map((q) => T([q[0], yt + pm * (q[1] - yt)])), true), { fill: INK, join: 'miter' }));
        }
        if (pr > 0) out.push(path(polySegs([T([xk, yf]), T([xk, yt]), T([xk + RUN, yt])]), { stroke: INK, sw: LW.DRAW, cap: 'butt', join: 'miter', draw: (RISE * pr + RUN * pt) / (RISE + RUN) }));
        const pl = prog(f, b - 1, b + 7, EASE.SET);
        if (pl > 0) {           // label hugs the inside corner (tread end − 8px), 12px above the tread; long words hang left over the open air
          const q = T([xk + RUN - 8, yt - 12]);
          out.push(rise(text(LABELS[k - 1], { x: q[0], y: q[1], anchor: 'end', voice: 'measure', size: 18, fill: INK }), { p: pl, baseline: q[1], size: 18 }));
        }
      }
      // f1275–1285: the landing (400px) and its slab
      const pLand = prog(f, 1275, 1285, EASE.DRAFT), pLandM = prog(f, 1285, 1291, EASE.SET);
      if (pLandM > 0) { const y0 = LAND.y, y1 = soffit(LAND.x0); out.push(path(polySegs([[LAND.x0, y0], [LAND.x1, y0], [LAND.x1, y1], [LAND.x0, y1]].map((q) => T([q[0], y0 + pLandM * (q[1] - y0)])), true), { fill: INK, join: 'miter' })); }
      const landLine = pLand > 0 ? path(polySegs([T([LAND.x0, LAND.y]), T([LAND.x1, LAND.y])]), { stroke: INK, sw: LW.DRAW, cap: 'butt', draw: pLand }) : '';

      /* ── the door block: rises from the landing (SET 12f), the keys cut the seams, the leaf swings (HINGE 15f) ── */
      const hB = BLK.h * prog(f, 1284, 1296, EASE.SET);                     // starts a frame early: the KNOCK on f1285 meets a visible block
      if (hB > 0) {
        const yT = BLK.yb - hB, pw = prog(f, 1305, 1320, EASE.HINGE);
        const R = (x0, x1) => { const a = T([x0, yT]), b = T([x1, BLK.yb]); return rect(clampv(a[0]), clampv(a[1]), clampv(b[0]) - clampv(a[0]), clampv(b[1]) - clampv(a[1]), INK); };
        out.push(R(BLK.x0, 1060), R(1260, BLK.x1));                                         // jambs
        out.push(R(1059, pw <= 0 ? 1261 : 1060 + 200 * (1 - pw)));                          // leaf: scaleX 1 → 0, anchored at the hinge x 1060
        // f1300 KEYS: two 3px white seams are cut into the solid block, top → bottom (2f stagger)
        [[1060, 1299], [1260, 1301]].forEach(([x, a]) => {
          const d = prog(f, a, a + 4, EASE.DRAFT); if (d <= 0) return;
          out.push(path(polySegs([T([x, yT]), T([x, yT + BLK.h * d])]), { stroke: WHITE, sw: LW.DRAW, cap: 'butt' }));
        });
      }

      out.push(landLine);     // on top of the block: the slot's floor is a crisp 3px line

      // f1230: screen-fixed headline (SET 10f), exits f1320 (LIFT 6f)
      const head = rise(text("We don't stop at the click.", { x: 120, y: 200, voice: 'authority', size: 72, fill: INK }), { p: prog(f, 1229, 1239, EASE.SET), baseline: 200, size: 72 });
      out.push(exit(head, ex(1320, 1326)));
      return out;
    },
  });
})();
