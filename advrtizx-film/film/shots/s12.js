/* S12 · The True Angle · f1500–1649 — treatment §4 S12, hit sheet §5.3.
   The solid mark sits at CAMS.HERO (3.6 px/MU, sharp vertex V = (537.5, 660)). The angle is *measured on it*:
   f1500–1512  construction hairlines (1.5px RED_40) grow out of the sharp vertex: the base 30 MU left of V, and the roof slope
               up past the TL vertex (the fillets hide the true corner; the hairlines show where it really is). PEN 12f.
   f1502–1512  ghost legs of the 3-4-5 (dashed RED_25) from the apex down and back along the base.
   f1505–1515  the angle arc r = 40 MU about V, 0° → −53.13° (DRAFT 10f); `53.13°` sets just outside it, `3` `4` `5` re-appear on the legs.
   f1515/1575  Every property has an angle. / We find the true one.   (AUTHORITY 52px, ink aligned to x 565)
   f1620–1648  retraction in reverse order of building, one step per descending TICK: 1620 line 2 · 1625 line 1 · 1630 value + numerals + arc ·
               1635 ghost legs · 1640 hairlines (the 1645 tick is their last frames). Mark alone from f1648; f1649 == f1650 (S13 opens on it).
   Where an annotation lies on the red mark it is drawn in WHITE (red ink would vanish); on paper it is RED / RED tints. */
(function () {
  const { registerShot, SPEC, text, rise, exit, drawMark, path, polySegs, lineSegs, arcSegs, segsToD, markA, markD, uid,
          prog, EASE, C, LW, CAMS } = TA;
  const HERO = CAMS.HERO, S = HERO.s;
  const P = (x, y) => HERO.apply([x, y]);                  // MU → screen
  const markD_ = () => segsToD([...markA(), ...markD()], HERO);

  // line inks: on paper / on the mark
  const PAPER_GHOST = C.RED_25, MARK_GHOST = C.WHITE_40;
  const clipIn = (inner) => { const id = uid('in'); return `<clipPath id="${id}"><path d="${markD_()}"/></clipPath><g clip-path="url(#${id})">${inner}</g>`; };
  const clipOut = (inner) => { const id = uid('out'); return `<clipPath id="${id}"><path clip-rule="evenodd" d="M-50 -50H1970V1130H-50Z ${markD_()}"/></clipPath><g clip-path="url(#${id})">${inner}</g>`; };

  // ---- geometry (MU) ----
  const V0 = [0, 100], V3 = [75, 100], V7 = [75, 0];
  const slopePt = (t) => [0.6 * t, 100 - 0.8 * t];          // t = MU along the roof slope from V
  const HAIR = {                                            // every piece grows outward from where it meets the mark
    baseL:  lineSegs(V0, [-30, 100]),                       // baseline, 30 MU left of V
    baseR:  lineSegs(V0, [15, 100]),                        // …and the gap the BL fillet leaves (tangent at x = 2·r = 15)
    slopeL: lineSegs(V0, slopePt(15)),                      // roof slope from V to the fillet tangent (9, 88)
    slopeU: lineSegs(slopePt(119.6), slopePt(155)),         // from the TL fillet tangent (71.76, 4.32) to 30 MU beyond the sharp vertex
  };
  const LEGS = polySegs([V7, V3, V0]);                      // ghost legs: apex ↓ right-angle corner ← V
  const ARC = arcSegs(V0, 40, 0, -53.13);                   // r = 40 MU about V, base → slope

  // ---- annotation positions (px) ----
  const Vp = P(0, 100);
  const midA = -26.565 * Math.PI / 180, arcMid = [Vp[0] + 40 * S * Math.cos(midA), Vp[1] + 40 * S * Math.sin(midA)];
  const LBL = [arcMid[0] + 16 * Math.cos(midA), arcMid[1] + 16 * Math.sin(midA)];            // 16px outward of the arc's midpoint
  const N3 = [P(37.5, 100)[0], P(37.5, 100)[1] + 36], N4 = [P(75, 50)[0] + 26, P(75, 50)[1]], N5 = (() => { const m = P(37.5, 50); return [m[0] - 0.8 * 36, m[1] - 0.6 * 36]; })();

  // ---- headlines: ink-aligned to x 565 (E stem lsb 0.0838em, W lsb 0.0097em at 52px) ----
  const H1 = { s: 'Every property has an angle.', x: 565 - 0.083793 * 52, base: 780 };
  const H2 = { s: 'We find the true one.',        x: 565 - 0.009664 * 52, base: 852 };
  const head = (h) => text(h.s, { x: h.x, y: h.base, voice: 'authority', size: 52, fill: C.RED });
  /** type that sets (mask rise) and later exits (LIFT 6f, ≤6f opacity) */
  const line = (inner, f, tIn, tOut, baseline, size, dur = 10) => {
    const pi = prog(f, tIn, tIn + dur, EASE.SET), po = prog(f, tOut, tOut + 6, EASE.LIFT);
    return po > 0 ? exit(inner, po) : rise(inner, { p: pi, baseline, size });
  };
  const tx = (s, p, o) => text(s, { x: p[0], y: p[1] + 0.35 * (o.size ?? 16), anchor: o.anchor ?? 'middle', voice: 'measure', size: o.size ?? 16, fill: o.fill });

  registerShot({
    ...SPEC.S12,
    render(lf, ctx) {
      const f = ctx.f, out = [];
      /* ---- phase progress ---- */
      const hair  = prog(f, 1500, 1512, EASE.DRAFT);
      const legs  = prog(f, 1502, 1512, EASE.DRAFT);
      const arc   = prog(f, 1505, 1515, EASE.DRAFT);
      const kArc = prog(f, 1630, 1638, EASE.DRAFT), kLegs = prog(f, 1635, 1643, EASE.DRAFT), kHair = prog(f, 1640, 1648, EASE.DRAFT);
      const hv = hair * (1 - kHair), lv = legs * (1 - kLegs), av = arc * (1 - kArc);      // retraction = reverse of the draw-on
      const hairInk = (segs, o) => path(segs, { cam: HERO, stroke: C.RED_40, sw: LW.HAIR, cap: 'butt', draw: hv, ...o });

      /* ---- construction hairlines + ghost legs on paper (behind the mark) ---- */
      out.push(hairInk(HAIR.baseL), hairInk(HAIR.baseR), hairInk(HAIR.slopeL), hairInk(HAIR.slopeU));
      out.push(clipOut(path(LEGS, { cam: HERO, stroke: PAPER_GHOST, sw: LW.HAIR, cap: 'butt', dash: [6, 6], draw: lv })));

      /* ---- the mark (the exact pose S11 hands over) ---- */
      out.push(drawMark({ cam: HERO }));

      /* ---- on the mark: ghost legs, the arc and its value in white ---- */
      out.push(clipIn(path(LEGS, { cam: HERO, stroke: MARK_GHOST, sw: LW.HAIR, cap: 'butt', dash: [6, 6], draw: lv })));
      out.push(path(ARC, { cam: HERO, stroke: C.WHITE, sw: LW.DETAIL, cap: 'butt', draw: av }));

      const setAt = (t0, dur = 8) => prog(f, t0, t0 + dur, EASE.SET), liftAt = (t0) => prog(f, t0, t0 + 6, EASE.LIFT);
      const lab = (inner, t0, tOut, dy, size) => { const po = liftAt(tOut); return po > 0 ? exit(inner, po, -12) : rise(inner, { p: setAt(t0), baseline: dy, size }); };
      out.push(lab(text('53.13°', { x: LBL[0], y: LBL[1] + 7, anchor: 'start', voice: 'measure', size: 20, fill: C.WHITE }), 1513, 1630, LBL[1] + 7, 20));
      out.push(lab(tx('3', N3, { fill: C.RED }), 1509, 1630, N3[1] + 5.6, 16));
      out.push(lab(tx('4', N4, { fill: C.WHITE }), 1512, 1630, N4[1] + 5.6, 16));
      out.push(lab(tx('5', N5, { fill: C.RED }), 1515, 1630, N5[1] + 5.6, 16));

      /* ---- the end line ---- */
      out.push(line(head(H1), f, 1515, 1625, H1.base, 52));
      out.push(line(head(H2), f, 1575, 1620, H2.base, 52));
      return out;
    },
  });
})();
