/* S02 · The Compass Proof · f120–239 (treatment §4 S02).
   The legs retreat to pencil, the hypotenuse becomes a compass arm pivoting on the V0 peg, swings down onto the
   baseline (slope length = base), a pencil vertical and top line close the rectangle, and the true A is inked over
   the construction. Two dimension strings measure it. SURVEY push 1.00 → 1.03 about (961,540) across the shot.

   Also publishes TA.act1.layers(f, k): the whole Act I drawing (grid / construction / ink / dims) at any frame of
   S02 or later, so S03 renders the identical pose and S04 can reuse it. */
(function () {
  const { registerShot, SPEC, text, path, prog, tween, keys, EASE, C, LW, V, lerp, clamp, camZoom, CAMS, dimString, pathLength,
          lineSegs, polySegs, arcSegs, fmt } = TA;
  const A1 = TA.act1;
  const { V0, V3, V7, knotPos, tint, Zc, Zpt, scaleAbout, grid, tick, peg, pegScale, numeral, degLabel, marker, NUM, CAP, ANG0,
          fiveCentre, CORNER_VANISH, tickTimes, ropeTo } = A1;

  const S = 4.8, R = 600, TIP_END = [1260, 780], TOP_END = [660 + 125.5 * S, 300];     // pencil vertical x=1260, true edge x=1262.4

  /** the true A as a pen would ink it: base left→right, up the right edge, along the top, down the roof slope.
      Fillet radii (MU) are parameters so they can form while the pen is moving. No notch yet (held back for the sun). */
  function inkSegs(rBL, rTL) {
    const dBL = 2 * rBL, dTL = rTL / 2, s = [['M', dBL, 100], ['L', 125.5, 100], ['L', 125.5, 0], ['L', 75 + dTL, 0]];
    if (rTL > 1e-6) s.push(['A', rTL, 0, 0, 75 - 0.6 * dTL, 0.8 * dTL]); else s.push(['L', 75, 0]);
    s.push(['L', 0.6 * dBL, 100 - 0.8 * dBL]);
    if (rBL > 1e-6) s.push(['A', rBL, 0, 0, dBL, 100]); else s.push(['L', 0, 100]);
    return s;
  }

  /** The Act I drawing at frame f (≥ 120), push k. Returns { under, ink, dims } — hatch (S03) slots between under and ink. */
  function layers(f, k) {
    const Z = Zc(k), ZA = camZoom(CAMS.ACT1, k, [961, 540]), P = knotPos(119);
    const under = [grid(k)];

    // ── construction state ──
    const ret = prog(f, 120, 132, EASE.SET);                         // legs retreat to pencil (SET: starts on the f120 bar line)
    const exitS = 1 - prog(f, 120, 128, EASE.LIFT);                  // ticks / 3 / 4 / 90° / marker / V3+V7 pegs scale to 0
    const theta = tween(f, [135, 165], [ANG0, 0], EASE.HINGE);       // compass arm angle (deg)
    const tipA = V.polar(V0, R, theta);
    const penc = keys(f, [[185, 0.4], [191, 0.25, EASE.DRAFT]]);     // pencil hairlines settle to RED_25 as the ink starts
    const crossA = keys(f, [[165, 1], [182, 0.4, EASE.DRAFT], [185, 0.4], [191, 0.25, EASE.DRAFT]]);
    const hair = { cam: Z, sw: LW.HAIR, cap: 'butt' };

    // pencil: dashed trace of the tip, vertical, top line, base extension
    if (theta - ANG0 > 0.01) under.push(path(arcSegs(V0, R, ANG0, theta), { ...hair, stroke: tint(penc), dash: [6, 6] }));
    under.push(path(lineSegs(TIP_END, [TIP_END[0], 300]), { ...hair, stroke: tint(penc), draw: prog(f, 165, 177, EASE.DRAFT) }));
    under.push(path(lineSegs(V7, TOP_END), { ...hair, stroke: tint(penc), draw: prog(f, 177, 185, EASE.DRAFT) }));
    if (f >= 165) under.push(path(lineSegs(V3, TIP_END), { ...hair, stroke: tint(0.25) }));

    // inking progress (also drives how far the ink has "eaten" the heavy arm)
    const inkP = prog(f, 185, 200, EASE.DRAFT), fl = prog(f, 185, 200, EASE.SET), rBL = 7.5 * fl, rTL = 10.8 * fl;
    const inkS = inkSegs(rBL, rTL);

    // rope → legs + compass arm
    const legs = [], arm = [];
    if (ret <= 0) {
      legs.push(ropeTo(P, 12, k));                                   // f120 is literally the S01 f119 drawing
    } else {
      legs.push(path(polySegs([V0, V3, V7]), { cam: Z, stroke: tint(lerp(1, 0.25, ret)), sw: lerp(LW.ROPE, LW.HAIR, ret), cap: 'round', join: 'round' }));
      // from f185 the pen "eats" the heavy arm left→right: only the part ahead of the ink front stays 4px RED
      let a = V0, show = true;
      if (f >= 185) { a = [Math.min(TIP_END[0], V0[0] + 2 * rBL * S + inkP * pathLength(inkS) * S), 780]; show = a[0] < TIP_END[0] - 0.01; }
      if (show) arm.push(path(lineSegs(a, tipA), { cam: Z, stroke: C.RED, sw: LW.ROPE, cap: 'round' }));
    }
    under.push(...legs, ...arm);

    // ticks, pegs, cross, marker, numerals
    for (let i = 0; i <= 12; i++) if (!(i in CORNER_VANISH)) under.push(tick(i, P, exitS, k));
    under.push(peg(V3, pegScale(f, 60) * exitS, k), peg(V7, pegScale(f, 75) * exitS, k));
    under.push(peg(V0, 1 - prog(f, 185, 191, EASE.LIFT), k));
    if (f >= 165) {
      const c = Zpt(k, TIP_END), h = 8 * (1 + 0.5 * (1 - EASE.SET(clamp((f - 165) / 4))));
      under.push(path(lineSegs([c[0] - h, c[1]], [c[0] + h, c[1]]), { stroke: tint(crossA), sw: LW.HAIR, cap: 'butt' }) +
                 path(lineSegs([c[0], c[1] - h], [c[0], c[1] + h]), { stroke: tint(crossA), sw: LW.HAIR, cap: 'butt' }));
    }
    under.push(marker(1, exitS, k));
    under.push(scaleAbout(numeral('3', NUM.three, 1, k), Zpt(k, NUM.three), exitS));
    under.push(scaleAbout(numeral('4', NUM.four, 1, k), Zpt(k, NUM.four), exitS));
    under.push(scaleAbout(degLabel(1, k), Zpt(k, [NUM.deg[0] - 17, NUM.deg[1] - 6]), exitS));
    under.push(scaleAbout(numeral('5', fiveCentre(theta), 1, k), Zpt(k, fiveCentre(theta)), 1 - prog(f, 185, 191, EASE.LIFT)));

    // ── ink: 3px RED, exact mark coordinates, fillets forming as the pen travels ──
    const ink = path(inkS, { cam: ZA, stroke: C.RED, sw: LW.DRAW, cap: 'round', join: 'round', draw: inkP });

    // ── dimension strings: 24px off the base and the right edge, 18px MEASURE with a 6px knockout. Drawn from f199/f211 so the
    //    first tick is on screen exactly on the TICK frames 200 and 212 ──
    const dims = dimString(ZA.apply([0, 100]), ZA.apply([125.5, 100]), { offset: 24, label: "28'-2\"", draw: prog(f, 199, 211, EASE.DRAFT) }) +
                 dimString(ZA.apply([125.5, 100]), ZA.apply([125.5, 0]), { offset: 24, label: "22'-5\"", draw: prog(f, 211, 223, EASE.DRAFT) });
    return { under: under.join(''), ink, dims, inkSegs };
  }
  A1.layers = layers;
  A1.inkSegs = inkSegs;

  registerShot({
    ...SPEC.S02,
    render(lf, ctx) {
      const f = ctx.f, k = tween(f, [120, 240], [1, 1.03], EASE.SURVEY);
      const L = layers(f, k);
      return [L.under, L.ink, L.dims];
    },
  });
})();
