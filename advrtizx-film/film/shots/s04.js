/* S04 · The Fold · f330–449 (treatment §4 S04) — the film's only depth.

   f330–350  the elevation folds flat about its baseline, falling AWAY from the viewer (perspective 2000, HINGE 20f), while
             S03's 1.03 push eases back to 1.00 inside the same HINGE (so the edge-on line lands at y 780, x 660…1262.4).
             The grid crosses scale out along the slope (LIFT 6f, staggered 53.13°). The dim strings draw off as the sheet
             tips over, so nothing but the drawing's own base is left on the line.
   f350–360  the line extends right to the plan's full baseline, x → 1510.6 (DRAFT 10f).
   f360–385  the floor plan unfolds UP from the same hinge: rotateX −90° → 0° (HINGE 25f). The hinge line retracts under it.
   f370–449  camera cam(4.8,(62.75,50)) → cam(6.4,(117.35,50)) (DRAFT 45f) then a SURVEY drift 6.4 → 6.55.
   f390 / 405 / 420 / 435  LIVING / KITCHEN / BEDROOM / BATH set (SET 8f, MEASURE 18, name over dims); the outside notes
             (dims 420 / 432, ENTRY + PORCH + stamp 444) sit on the 12f grid.  Hard cut to red at f450.

   Crispness: no CSS 3D. Every line is projected through TA.fold.segs (exact per-vertex perspective, arcs flattened at 4°);
   type rides the local Jacobian of the same projection (an exact affine at glyph size). Eye level = the hinge (vp.y = hinge y),
   so +90° and −90° are truly edge-on (a single line) — with the default vp.y = 540 the sheet would land as a 47px trapezoid.
   From f385 (deg 0) the plan is TA.drawPlan itself; the folded drawing below only exists for the 25 frames of the unfold and
   is a line-for-line replica of drawPlan's geometry (checked against drawPlan at deg 0: only sub-pixel arc-flattening fringes differ). */
(function () {
  const { registerShot, SPEC, text, path, prog, tween, logTween, keys, clamp, EASE, C, LW, V, DEG, CAMS, PLAN, SLOPE, MARK,
          fold, camZoom, camLerp, camTween, drawPlan, dimString, slopeOrder, slopeAt, markA, markD, segsToD,
          arcSegs, lineSegs, polySegs, circleSegs, trimSegs, rise, uid, fmt, measure } = TA;
  const A1 = TA.kit('act1'), A2 = TA.kit('act2');   // A1 from s01/s02 (read lazily, on the first render); A2 is shared with S06/S07
  const PERSPECTIVE = 2000, RED = C.RED, WHITE = C.WHITE;

  /* ───────────── geometry helpers ───────────── */
  const toScreen = (segs, c) => segs.map((s) => (s[0] === 'A' ? ['A', s[1] * c.s, s[2], s[3], ...c.apply([s[4], s[5]])] : s[0] === 'Z' ? s : [s[0], ...c.apply([s[1], s[2]])]));
  const foldOpts = (hy, vx = 960) => ({ hingeY: hy, perspective: PERSPECTIVE, vp: [vx, hy] });
  /** folded polyline `d` of screen-space segs */
  const fd = (segs, deg, o) => segsToD(fold.segs(segs, deg, o));
  /** a stroke of screen-space segs, projected */
  const fstroke = (segs, deg, o, st) => (segs && segs.length ? path(fold.segs(segs, deg, o), st) : '');
  /** local Jacobian of the fold at screen point pt → svg matrix() (glyph-sized exact affine) */
  function jac(pt, deg, o) {
    const p0 = fold.project(pt, deg, o), ex = fold.project([pt[0] + 1, pt[1]], deg, o), ey = fold.project([pt[0], pt[1] + 1], deg, o);
    return { p: p0, m: `matrix(${fmt(ex[0] - p0[0])} ${fmt(ex[1] - p0[1])} ${fmt(ey[0] - p0[0])} ${fmt(ey[1] - p0[1])} 0 0)` };
  }
  /** wrap markup (absolute screen coords) so it rides the fold around anchor point `at` */
  function foldMark(markup, at, deg, o) {
    if (!markup) return '';
    const j = jac(at, deg, o);
    return `<g transform="translate(${fmt(j.p[0])} ${fmt(j.p[1])}) ${j.m} translate(${fmt(-at[0])} ${fmt(-at[1])})">${markup}</g>`;
  }

  /* ───────────── S03's end pose, as screen-space pieces (identical constants to S02's TA.act1.layers) ───────────── */
  let V0, V3, V7, ANG0, tint, Zc, Zpt, PENCIL, EDGE;   // bound by init() on the first render, so S04 does not depend on load order
  function init() {
    if (EDGE) return;
    ({ V0, V3, V7, ANG0, tint, Zc, Zpt } = TA.need('act1', ['V0', 'V3', 'V7', 'ANG0', 'tint', 'Zc', 'Zpt', 'inkSegs', 'layers', 'grid'], 'S04'));
    PENCIL = tint(0.25);                                                  // RED_25 residue
    // the edge-on line: left end of the folded ink (its fillet), right end = the A's edge at 1262.4
    const E = elevationParts(1), xs = fold.segs(E.ink, 90, foldOpts(780)).filter((s) => s[0] !== 'Z').map((s) => s[1]);
    EDGE = { x0: Math.min(...xs), x1: Math.max(...xs) };
  }
  const R = 600, TIP_END = [1260, 780], TOP_END = [660 + 125.5 * 4.8, 300];
  function elevationParts(k) {
    const Z = Zc(k), ZA = camZoom(CAMS.ACT1, k, [961, 540]), hair = { sw: LW.HAIR, cap: 'butt' };
    const tx = (segs) => toScreen(segs, Z);
    const cc = Zpt(k, TIP_END), h = 8;
    return {
      Z, ZA,
      hair: [  // [segs (screen), style] in S02's draw order
        [tx(arcSegs(V0, R, ANG0, 0)), { ...hair, stroke: PENCIL, dash: [6, 6] }],
        [tx(lineSegs(TIP_END, [TIP_END[0], 300])), { ...hair, stroke: PENCIL }],
        [tx(lineSegs(V7, TOP_END)), { ...hair, stroke: PENCIL }],
        [tx(lineSegs(V3, TIP_END)), { ...hair, stroke: PENCIL }],
        [tx(polySegs([V0, V3, V7])), { sw: LW.HAIR, cap: 'round', join: 'round', stroke: PENCIL }],
        [lineSegs([cc[0] - h, cc[1]], [cc[0] + h, cc[1]]), { ...hair, stroke: PENCIL }],
        [lineSegs([cc[0], cc[1] - h], [cc[0], cc[1] + h]), { ...hair, stroke: PENCIL }],
      ],
      ink: toScreen(A1.inkSegs(7.5, 10.8), ZA),
      base: [ZA.apply([0, 100]), ZA.apply([125.5, 100])], right: [ZA.apply([125.5, 100]), ZA.apply([125.5, 0])],
    };
  }
  /** dimString's geometry (TA.dimString), as parts that can be projected */
  function dimParts(a, b, off, label, size = 18) {
    const dir = V.norm(V.sub(b, a)), n = [-dir[1], dir[0]], ext = 8, gap = 6, sg = Math.sign(off) || 1;
    const a2 = V.add(a, V.mul(n, off)), b2 = V.add(b, V.mul(n, off));
    const wit = (q) => lineSegs(V.add(q, V.mul(n, gap * sg)), V.add(q, V.mul(n, off + ext * sg)));
    let ang = Math.atan2(dir[1], dir[0]) / DEG; if (ang > 90) ang -= 180; if (ang <= -90) ang += 180;
    const sl = V.mul([Math.cos((ang - 45) * DEG), Math.sin((ang - 45) * DEG)], 6);
    return { strokes: [wit(a), wit(b), lineSegs(V.sub(a2, V.mul(dir, ext)), V.add(b2, V.mul(dir, ext)))],
             ticks: [a2, b2].map((q) => lineSegs(V.sub(q, sl), V.add(q, sl))), ang, m: V.lerp(a2, b2, 0.5), label, size };
  }
  function foldDim(parts, p, deg, o) {
    if (p <= 0) return '';
    const st = { stroke: RED, sw: LW.HAIR, cap: 'butt' }, tk = { stroke: RED, sw: LW.DETAIL, cap: 'butt' };
    let out = parts.strokes.map((s) => fstroke(trimSegs(s, 0, p), deg, o, st)).join('');
    out += fstroke(parts.ticks[0], deg, o, tk) + (p >= 1 ? fstroke(parts.ticks[1], deg, o, tk) : '');
    if (p >= 0.5) {
      const w = measure(parts.label, { voice: 'measure', size: parts.size }) + 12, h = parts.size * 0.7 + 12, j = jac(parts.m, deg, o);
      out += `<g transform="translate(${fmt(j.p[0])} ${fmt(j.p[1])}) ${j.m} rotate(${fmt(parts.ang)})"><rect x="${fmt(-w / 2)}" y="${fmt(-h / 2)}" width="${fmt(w)}" height="${fmt(h)}" fill="${WHITE}"/>` +
        text(parts.label, { x: 0, y: parts.size * 0.35, anchor: 'middle', voice: 'measure', size: parts.size, fill: RED }) + '</g>';
    }
    return out;
  }

  /** the elevation at fold angle deg (0 → 90), push k (S03's pose at deg 0) */
  function foldedElevation(k, deg, dimP) {
    const E = elevationParts(k), hy = 540 + 240 * k, o = foldOpts(hy), out = [];
    for (const [segs, st] of E.hair) out.push(fstroke(segs, deg, o, st));
    out.push(fstroke(E.ink, deg, o, { stroke: RED, sw: LW.DRAW, cap: 'round', join: 'round' }));
    out.push(foldDim(dimParts(E.base[0], E.base[1], 24, "28'-2\""), dimP[0], deg, o));
    out.push(foldDim(dimParts(E.right[0], E.right[1], 24, "22'-5\""), dimP[1], deg, o));
    return out.join('');
  }
  const PLAN_END = 660 + 177.2 * 4.8;                                      // 1510.56: D base end

  /* ───────────── the plan, folded (replica of TA.drawPlan's geometry; used f360–385 only) ───────────── */
  // inner edge of the 2.4 MU wall band (the visible half of the 4.8 MU stroke clipped to the mark)
  function innerRing(w = 2.4) {
    const dBL = 15, dTL = 5.4, cBL = [15, 92.5], cTL = [80.4, 10.8];
    const dirBL = [(9 - 15) / 7.5, (88 - 92.5) / 7.5], dirTL = [(71.76 - 80.4) / 10.8, (4.32 - 10.8) / 10.8];
    const rBL = 7.5 - w, rTL = 10.8 - w, N = MARK.NOTCH, ri = N.r + w, yb = 100 - w, hc = Math.sqrt(ri * ri - (N.cy - yb) ** 2);
    const A = [['M', cTL[0], w], ['L', 125.5 - w, w], ['L', 125.5 - w, yb], ['L', N.cx + hc, yb], ['A', ri, 0, 0, N.cx - hc, yb], ['L', cBL[0], yb],
      ['A', rBL, 0, 1, cBL[0] + rBL * dirBL[0], cBL[1] + rBL * dirBL[1]], ['L', cTL[0] + rTL * dirTL[0], cTL[1] + rTL * dirTL[1]], ['A', rTL, 0, 1, cTL[0], w], ['Z']];
    const x0 = 133.1 + w, x1 = 177.2, ro = 50 - w, D = [['M', x0, w], ['L', x1, w], ['A', ro, 0, 1, x1, 100 - w], ['L', x0, 100 - w], ['Z']];
    return [...A, ...D];
  }
  const INNER = innerRing();
  /** the glazing / door cut shapes of drawPlan's poché mask, in MU (cuts = 1) */
  function cutShapes() {
    const n = SLOPE.normal, P0 = slopeAt(0.5 - 0.38), P1 = slopeAt(0.5 + 0.38), B = PLAN.bay;
    const par = polySegs([V.add(P0, V.mul(n, -1)), V.add(P1, V.mul(n, -1)), V.add(P1, V.mul(n, 3)), V.add(P0, V.mul(n, 3))], true);
    const sector = [...arcSegs(B.c, 51.5, B.a0, B.a1), ['L', ...V.polar(B.c, 46.5, B.a1)], ...arcSegs(B.c, 46.5, B.a1, B.a0).slice(1), ['Z']];
    const doors = PLAN.doors.filter((dr) => dr.cut).map((dr) => { const [x, y, w, h] = dr.cut, cy = y + h / 2, hh = h / 2;
      return polySegs([[x - 0.5, cy - hh], [x + w + 0.5, cy - hh], [x + w + 0.5, cy + hh], [x - 0.5, cy + hh]], true); });
    return [par, sector, ...doors];
  }
  const CUTS = cutShapes();

  function foldedPlan(c, deg) {
    const hy = c.apply([0, 100])[1], o = foldOpts(hy, c.apply([117.35, 50])[0]), S = (segs) => toScreen(segs, c), out = [];   // eye level = the hinge, centred on the plan
    const outline = S([...markA({}), ...markD({})]);
    // poché ring: outer − inner (even-odd), with the glazing / door gaps masked out
    const mid = uid('cut'), cutD = CUTS.map((s) => fd(S(s), deg, o)).join('');
    out.push(`<mask id="${mid}" maskUnits="userSpaceOnUse" x="-20000" y="-20000" width="40000" height="40000"><rect x="-20000" y="-20000" width="40000" height="40000" fill="#fff"/><path d="${cutD}" fill="#000"/></mask>`);
    out.push(`<path d="${fd(outline, deg, o)}${fd(S(INNER), deg, o)}" fill="${RED}" fill-rule="evenodd" mask="url(#${mid})"/>`);
    // glazing: 3 lines parallel to the slope, 3 bay arcs
    for (const off of PLAN.glazeOff) { const n = V.mul(SLOPE.normal, off);
      out.push(fstroke(S(lineSegs(V.add(slopeAt(PLAN.glazeT[0]), n), V.add(slopeAt(PLAN.glazeT[1]), n))), deg, o, { stroke: RED, sw: LW.DETAIL, cap: 'butt' })); }
    for (const r of PLAN.bay.r) out.push(fstroke(S(arcSegs(PLAN.bay.c, r, PLAN.bay.a0, PLAN.bay.a1)), deg, o, { stroke: RED, sw: LW.DETAIL, cap: 'butt' }));
    // interior walls: 1.2 MU solid, mitred joins = a rectangle per leg, extended by half the wall at free ends and corners only
    // (= drawPlan's butt-capped TA.wallLine: flush where a wall meets the outline)
    const hw = PLAN.wallW / 2, onOutline = (q) => q[1] === 0 || q[0] === 133.1;
    for (const w of PLAN.walls) for (let i = 0; i + 1 < w.length; i++) {
      const a = w[i], b = w[i + 1], d = V.norm(V.sub(b, a)), nn = [-d[1], d[0]], a2 = V.sub(a, V.mul(d, onOutline(a) ? 0 : hw)), b2 = V.add(b, V.mul(d, onOutline(b) ? 0 : hw));
      out.push(`<path d="${fd(S(polySegs([V.add(a2, V.mul(nn, hw)), V.add(b2, V.mul(nn, hw)), V.sub(b2, V.mul(nn, hw)), V.sub(a2, V.mul(nn, hw))], true)), deg, o)}" fill="${RED}"/>`); }
    // door swings: leaf + quarter arc, hairline
    for (const dr of PLAN.doors) {
      const r = V.dist(dr.hinge, dr.from), a0 = Math.atan2(dr.from[1] - dr.hinge[1], dr.from[0] - dr.hinge[0]) / DEG;
      let a1 = Math.atan2(dr.leaf[1] - dr.hinge[1], dr.leaf[0] - dr.hinge[0]) / DEG; if (a1 - a0 > 180) a1 -= 360; if (a1 - a0 < -180) a1 += 360;
      const st = { stroke: RED, sw: LW.HAIR, cap: 'butt' };
      out.push(fstroke(S(lineSegs(dr.hinge, dr.leaf)), deg, o, st), fstroke(S(arcSegs(dr.hinge, r, a0, a1)), deg, o, st));
    }
    // north arrow and scale bar (below the hinge: they swing the other way)
    const N = PLAN.north, np = c.apply(N.c), st = { stroke: RED, sw: LW.HAIR, cap: 'round' };
    out.push(fstroke(S(circleSegs(N.c, N.r)), deg, o, st));
    out.push(`<path d="${fd(polySegs([[N.c[0], N.c[1] - 4], [N.c[0] + 3, N.c[1] + 4], [N.c[0] - 3, N.c[1] + 4]].map(c.apply), true), deg, o)}" fill="${RED}"/>`);
    const nTxt = [np[0], np[1] - N.r * c.s - 10];
    out.push(foldMark(text('N', { x: nTxt[0], y: nTxt[1], anchor: 'middle', size: 16, fill: RED }), nTxt, deg, o));
    const SB = PLAN.scaleBar, ticks = [0, 1, 2, 5], bs = { stroke: RED, sw: LW.HAIR, cap: 'butt' };
    out.push(fstroke(S(lineSegs([SB.x, SB.y], [SB.x + 5 * SB.m, SB.y])), deg, o, bs));
    for (const t of ticks) { const p = c.apply([SB.x + t * SB.m, SB.y]), lab = t === 5 ? '5 M' : String(t), at = [p[0], p[1] + 24];
      out.push(fstroke([['M', p[0], p[1] - 5], ['L', p[0], p[1] + 5]], deg, o, bs));
      out.push(foldMark(text(lab, { x: at[0], y: at[1], anchor: t ? 'middle' : 'start', size: 16, fill: RED }), at, deg, o)); }
    return out.join('');
  }

  /* ───────────── plan labels, dims, stamp (set on the beats, once the plan stands) ───────────── */
  const setP = (f, hit, dur = 8) => EASE.SET(clamp((f - hit + 1) / dur));       // first visible frame == the hit frame
  /** the MEASURE label's lines. The bath (22 MU) and the kitchen (24.5 MU) are only ~145–160px wide here: their one-line dims
      (`5'-7" × 8'-6"`, `6'-2" × 6'-9"`) run through both walls at 18px, so they stack on two lines (shared with S06).
      Everything else is PLAN.labels[key].measure. */
  const measureLines = (key) => (key === 'BATH' ? ['BATH', "5'-7\"", "× 8'-6\""] : key === 'KITCHEN' ? ['KITCHEN', "6'-2\"", "× 6'-9\""] : PLAN.labels[key].measure);
  A2.measureLines = measureLines;
  /** planLabel's MEASURE label, one rise per line (name, then dims 2f later) */
  function measureLabel(c, key, f, hit) {
    const L = PLAN.labels[key], p = c.apply(L.at), lines = measureLines(key), y0 = p[1] + 6 - (lines.length - 1) * 12;
    return lines.map((t, i) => rise(text(t, { x: p[0], y: y0 + i * 24, anchor: 'middle', voice: i ? 'measureLong' : 'measure', size: 18, fill: RED }),
      { p: setP(f, hit + 2 * i), baseline: y0 + i * 24, size: 18, x0: p[0] - 120, x1: p[0] + 120 })).join('');
  }
  const LABEL_AT = { LIVING: 390, KITCHEN: 405, BEDROOM: 420, BATH: 435, ENTRY: 444, PORCH: 444 };
  const DIM_AT = { width: 420, height: 432 }, STAMP_AT = 444;

  /* ───────────── camera ───────────── */
  function planCam(f) {
    if (f < 370) return camLerp(CAMS.ACT1, CAMS.PLAN_WIDE, prog(f, 360, 370, EASE.DRAFT));      // ACT1 and PLAN_WIDE differ by 1.2px: ease it out
    if (f <= 415) return camTween(f, [370, 415], CAMS.PLAN_WIDE, CAMS.PLAN, EASE.DRAFT);
    return TA.cam(logTween(f, [415, 449], [6.4, 6.55], EASE.SURVEY), CAMS.PLAN.W, CAMS.PLAN.P);  // SURVEY drift
  }

  registerShot({
    ...SPEC.S04,
    render(lf, ctx) {
      const f = ctx.f, out = []; init();

      /* ── f330–350: the elevation folds flat ── */
      if (f < 350) {
        const p = EASE.HINGE(prog(f, 330, 350)), k = Math.exp(TA.lerp(Math.log(1.03), 0, p));
        if (p <= 0) { const L = A1.layers(239, 1.03); return [L.under, L.ink, L.dims]; }       // f330 == S03's last frame, to the pixel
        const deg = 90 * p, dp = 1 - EASE.DRAFT(prog(f, 337, 346));
        out.push(A1.grid(k, (i, j, x, y) => 1 - EASE.LIFT(clamp((f - 330 - slopeOrder(x, y) * 10) / 6))));
        out.push(foldedElevation(k, deg, [dp, dp]));
        return out;
      }

      /* ── f350–: the hinge line (the folded sheet's own base), extended to the plan's baseline, retracted under the rising plan ── */
      const ext = prog(f, 350, 360, EASE.DRAFT), gone = prog(f, 362, 374, EASE.DRAFT);
      if (gone < 1) {
        const hair = { stroke: PENCIL, sw: LW.HAIR, cap: 'butt' };
        out.push(path(lineSegs([660, 780], [1268, 780]), { ...hair, from: gone }));
        const red = lineSegs([EDGE.x0, 780], [PLAN_END, 780]), t = (EDGE.x1 - EDGE.x0) / (PLAN_END - EDGE.x0);
        out.push(path(red, { stroke: RED, sw: LW.DRAW, cap: 'round', from: gone, draw: t + (1 - t) * ext }));
      }

      /* ── f360–385: the plan unfolds up from the hinge (−90° → 0°) ── */
      const c = planCam(f), q = EASE.HINGE(prog(f, 360, 385)), deg = -90 * (1 - q);
      if (f >= 360) {
        if (deg < -1e-6) out.push(foldedPlan(c, deg));
        else out.push(drawPlan(c, { labels: false, dims: 0, stamp: false }));
      }

      /* ── f390–: labels on the beats, dims and stamp on the 12f grid ── */
      if (f >= 385) {
        for (const key of ['LIVING', 'KITCHEN', 'BEDROOM', 'BATH', 'ENTRY', 'PORCH']) if (f >= LABEL_AT[key]) out.push(measureLabel(c, key, f, LABEL_AT[key]));
        for (const key of ['width', 'height']) { const D = PLAN.dims[key], d = prog(f, DIM_AT[key], DIM_AT[key] + 12, EASE.DRAFT);
          if (d > 0) out.push(dimString(c.apply(D.a), c.apply(D.b), { offset: D.off * c.s, label: D.label, draw: d, ink: RED, knock: WHITE })); }
        if (f >= STAMP_AT) { const ps = c.apply(PLAN.stamp.at);
          out.push(rise(text(PLAN.stamp.label, { x: ps[0], y: ps[1], anchor: 'end', size: 18, fill: RED }), { p: setP(f, STAMP_AT), baseline: ps[1], size: 18, x0: ps[0] - 200, x1: ps[0] + 20 })); }
      }
      return out;
    },
  });
})();
