/* S05 · Nobody Buys Square Feet · f450–539 (treatment §4 S05).
   Full RED, silent for 8 frames. One sentence in two voices, white, left edge on the red-card margin x = 180:
     f458  **Nobody**   AUTHORITY 800 (wdth 112) 160px, baseline 500, set by a mask rising from the baseline (SET 8f)
     f465  **buys**     same line, same mask
     f473  `square feet.`  MEASURE 500 150px, baseline 672 — one frame, a hard snap: the cold voice does not ease
   f525–531: all type exits 24px up with opacity → 0 (LIFT 6f). Hard cut to the plan at f540.

   Every landing is visible on its hit frame (first visible frame == the audio frame).
   Optical alignment: Archivo's N and Plex Mono's s carry different left side-bearings, so each line is shifted by its own
   measured bearing (ALIGN) — the *ink* of both lines starts exactly on x = 180, not their text origins. */
(function () {
  const { registerShot, SPEC, text, rise, exit, prog, EASE, C, measure } = TA;
  const X = 180, WHITE = C.WHITE;
  const L1 = { voice: 'card', size: 160, fill: WHITE }, L2 = { voice: 'measure', size: 150, fill: WHITE };
  const ALIGN = { l1: -13, l2: -9 };               // px added to x so the ink (not the origin) sits on X: measured from f500 (N ink 193 → 180, s ink 189 → 180)

  registerShot({
    ...SPEC.S05,
    render(lf, ctx) {
      const f = ctx.f;
      // 'buys' sits exactly where it would in the continuous string "Nobody buys" (kerning and tracking included)
      const xBuys = X + ALIGN.l1 + measure('Nobody buys', L1) - measure('buys', L1);
      const nobody = rise(text('Nobody', { x: X + ALIGN.l1, y: 500, ...L1 }), { p: prog(f, 457, 465, EASE.SET), baseline: 500, size: 160, x0: 0, x1: 1920 });
      const buys = rise(text('buys', { x: xBuys, y: 500, ...L1 }), { p: prog(f, 464, 472, EASE.SET), baseline: 500, size: 160, x0: 0, x1: 1920 });
      const feet = f >= 473 ? text('square feet.', { x: X + ALIGN.l2, y: 672, ...L2 }) : '';
      return [exit(nobody + buys + feet, prog(f, 525, 531, EASE.LIFT), -24)];
    },
  });
})();
