/* S13 · Red Angle / End Card · f1650–1799 — treatment §4 S13, hit sheet §5.3.
   f1650–1670  the angle wipe: a RED field sweeps L→R, its leading edge parallel to the A's slope (53.13°), BRAKE 20f.
               Two complementary layers: red mark on white ahead of the edge, white mark on red behind it.
   f1680/1684  the wordmark's letters rise on the sonic logo's first two notes (BELL 330 → 440): `Adv` (3 letters) then `rtiz` (4)…
   f1686–1695  …and the custom X (two crossed 3:4 slopes) is drawn as the third: stroke 1 sweeps ends→centre f1686–1692,
               stroke 2 f1689–1695, so the cross completes exactly on the chord re-strike at f1695.
   f1710       AI-FIRST ADVERTISING FOR REAL ESTATE sets (TICK 2200); tracking +0.1026em (not +0.12) so the line ends exactly on the D's left edge,
               x 1016.7, i.e. it spans the A and the gap above it.  Hold, perfectly still, to f1799 — no fade.
   Everything is a pure function of the frame. Ink is optically aligned to the mark's left edge (x 565). */
(function () {
  const { registerShot, SPEC, text, rise, drawMark, g, uid, prog, EASE, C, CAMS, slopeWipe, measure } = TA;
  const HERO = CAMS.HERO;

  /* ---- lockup geometry (px) ---- */
  const X0 = 565;                           // treatment: left edge of the lockup (mark bbox starts at 564.5)
  const WM = { size: 88, base: 800, voice: 'wordmark' };
  WM.track = -0.015 * WM.size;              // −0.015em
  WM.capH = 0.68681 * WM.size;              // Archivo cap height (686.8/1000 em) = 60.44px
  WM.lsbA = 0.013015 * WM.size;             // A foot sits 1.15px inside its origin → pull the origin back so the ink starts at x 565
  WM.x = X0 - WM.lsbA;
  const TAG = { size: 18, base: 860, x: X0 - 0.020 * 18, str: 'AI-FIRST ADVERTISING FOR REAL ESTATE' };   // Plex Mono A lsb = 0.020em
// Tracking: the treatment's +0.12em lands the last letter 13px past the D's left edge (1016.7) — a near-miss that reads as an error.
// +0.1026em (0.34px/letter less) makes the line end exactly on that edge: the tagline spans the A and the gap beneath the mark.
TAG.track = ((HERO.apply([133.1, 0])[0] - 0.523 * TAG.size - TAG.x) / (TAG.str.length - 1) - 0.6 * TAG.size) / TAG.size;   // E ink right = 0.523em, advance 0.6em

  // custom X: two parallelograms on the A's slope (rise 4 : run 3), horizontal terminals at baseline and cap height.
  // stroke weight matched to Archivo 700's own diagonal (12.7px perpendicular ≈ the 13.1px d-stem) → 15.9px measured horizontally.
  const XG = { wh: 12.7 / 0.8, run: 0.75 * WM.capH };
  XG.w = XG.run + XG.wh;                    // ink width ≈ 61.2px
  const parallelogram = (xl, kind, ya, yb) => {      // slice of a stroke between two y levels (ya above yb)
    const B = WM.base, T = B - WM.capH, h = WM.capH;
    const edge = kind === '/' ? (y) => xl + XG.run * (B - y) / h : (y) => xl + XG.run * (y - T) / h;
    const a = edge(ya), b = edge(yb);
    return `M${(+a.toFixed(3))} ${(+ya.toFixed(3))}L${(+(a + XG.wh).toFixed(3))} ${(+ya.toFixed(3))}L${(+(b + XG.wh).toFixed(3))} ${(+yb.toFixed(3))}L${(+b.toFixed(3))} ${(+yb.toFixed(3))}Z`;
  };
  /** stroke swept from both ends to the centre: p 0..1 */
  const sweptStroke = (xl, kind, p) => {
    if (p <= 0) return '';
    const B = WM.base, T = B - WM.capH, h = WM.capH;
    const d = p >= 1 ? parallelogram(xl, kind, T, B)
      : parallelogram(xl, kind, T, T + h * p / 2) + parallelogram(xl, kind, B - h * p / 2, B);
    return `<path d="${d}" fill="${C.WHITE}"/>`;
  };

  let layout = null;                        // letter origins from the engine's own text measure (fonts are loaded before any seek)
  const letters = 'Advrtiz';
  function getLayout() {
    if (layout) return layout;
    const mo = { voice: 'wordmark', size: WM.size };          // (measure/text take tracking in em; WM.track is px)
    const xs = []; for (let i = 0; i < letters.length; i++) xs.push(WM.x + (i ? measure(letters.slice(0, i), mo) + WM.track : 0));
    const xX = WM.x + measure(letters, mo) + WM.track;      // origin of the X cell (where Archivo's own X would start)
    layout = { xs, xl: xX + 4.0 };                          // foot of the custom X: 4px in, so z→X reads like the other letter gaps
    return layout;
  }
  const word = (i0, i1) => { const L = getLayout(); let s = ''; for (let i = i0; i < i1; i++) s += text(letters[i], { x: L.xs[i], y: WM.base, voice: 'wordmark', size: WM.size, fill: C.WHITE }); return s; };

  registerShot({
    ...SPEC.S13,
    bg: (lf) => (lf >= 20 ? 'RED' : 'WHITE'),   // paper until the wipe has fully passed, then the red field
    render(lf, ctx) {
      const f = ctx.f, out = [];
      /* ---- the mark: red ahead of the wipe edge, white behind it ---- */
      const p = prog(f, 1650, 1670, EASE.BRAKE);
      if (p <= 0) out.push(drawMark({ cam: HERO }));
      else if (p >= 1) out.push(drawMark({ cam: HERO, fill: C.WHITE }));
      else {
        const w = slopeWipe(p), id = uid('wipe');
        out.push(drawMark({ cam: HERO }),                                  // red mark everywhere…
          `<path d="${w.d}" fill="${C.RED}"/>`,                            // …the red field paints over its passed part…
          `<clipPath id="${id}"><path d="${w.d}"/></clipPath>` + g(drawMark({ cam: HERO, fill: C.WHITE }), { clip: id }));   // …and the white mark is clipped to the field
      }
      /* ---- wordmark: Adv (f1680) · rtiz (f1684) · X (f1686–1695) ---- */
      out.push(rise(word(0, 3), { p: prog(f, 1680, 1692, EASE.SET), baseline: WM.base, size: WM.size }));
      out.push(rise(word(3, 7), { p: prog(f, 1684, 1696, EASE.SET), baseline: WM.base, size: WM.size }));
      const xl = getLayout().xl;
      out.push(sweptStroke(xl, '/', prog(f, 1686, 1692, EASE.DRAFT)));
      out.push(sweptStroke(xl, '\\', prog(f, 1689, 1695, EASE.DRAFT)));
      /* ---- the line ---- */
      out.push(rise(text([{ t: TAG.str, track: TAG.track }], { x: TAG.x, y: TAG.base, voice: 'measure', size: TAG.size, fill: C.WHITE })   /* (core: text()'s own `track` option is ignored; a run's `track` works) */,
        { p: prog(f, 1710, 1718, EASE.SET), baseline: TAG.base, size: TAG.size }));
      return out;
    },
  });
})();
