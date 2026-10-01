/* S11 · The Plan Was the Mark · f1350–1499 — treatment §4 S11, hit sheet §5.3.
   f1350–1365  the whole plan draws on at CAMS.PLAN (DRAFT; poché grows inward with SET) — the canonical plan, via TA.drawPlan,
               with the S06 meaning labels (MEANING 34px, PORCH stays MEASURE). Hold to f1380.
   f1380–1410  retraction in reverse drawing order, on eighths (1380 · 1388 · 1395 · 1403 = the descending TICKs):
               labels lift · dims, north, scale + stamp draw off · door arcs draw off · interior walls + glazing draw off, gaps close.
   f1408–1440  the walls thicken inward until the plan is solid: one clipped stroke whose width runs 4.8 MU → 94.1 MU.
               94.1 MU is the exact width at which the last white point (the bay's inscribed circle, 47.05 MU deep) closes, so the plan
               becomes solid ON f1440 (BELL chord + SUB), not earlier. The gap and the porch notch stay white: they were never inside the walls.
               (The treatment's 250 MU is simply "more than enough"; with DRAFT it would have gone solid ~f1422.)
   f1410–1455  camera PLAN → HERO (HINGE 45f).  f1440 on: the solid mark (drawMark) — pixel-true; f1455–1499 hold, still.
   Contract: f1499 == S12 f1500 == solid RED mark at CAMS.HERO, nothing else. */
(function () {
  const { registerShot, SPEC, text, rise, exit, drawMark, drawPlan, planLabel, camTween, CAMS, EASE, prog, C, PLAN } = TA;

  const W_WALL = 4.8, W_SOLID = 94.1;      // MU: wall stroke at the start / at the exact moment the plan is solid
  const LABELS = ['LIVING', 'KITCHEN', 'BEDROOM', 'BATH', 'ENTRY', 'PORCH'];   // set in this order, 1f apart
  const MEANING = 34;

  registerShot({
    ...SPEC.S11,
    render(lf, ctx) {
      const f = ctx.f;
      const cam = f >= 1455 ? CAMS.HERO : camTween(f, [1410, 1455], CAMS.PLAN, CAMS.HERO, EASE.HINGE);

      /* f1440 →: the solid mark itself (no stroke tricks: this is the logo, exactly as drawn by core) */
      if (f >= 1440) return drawMark({ cam });

      /* ---- progress ---- */
      const on = prog(f, 1350, 1365, EASE.DRAFT);              // line draw-on
      const wallOn = prog(f, 1350, 1365, EASE.SET);            // poché grows inward
      const kLab = prog(f, 1380, 1386, EASE.LIFT);             // labels lift
      const kDim = prog(f, 1388, 1395, EASE.DRAFT);            // dims · north · scale draw off
      const kDoor = prog(f, 1395, 1402, EASE.DRAFT);           // door arcs draw off
      const kWall = prog(f, 1403, 1409, EASE.DRAFT);           // interior walls + glazing draw off, glazing gaps close
      const thick = prog(f, 1408, 1440, EASE.DRAFT);           // walls thicken inward

      const pocheW = f < 1408 ? W_WALL * wallOn : W_WALL + (W_SOLID - W_WALL) * thick;
      const out = [drawPlan(cam, {
        poche: pocheW > 0.005, pocheW,
        cuts: Math.max(0, f < 1380 ? 2 * on - 1 : 1 - 2 * kWall),     // a gap opens only where its window symbol has already been drawn (and closes first when retracting)
        glazing: on * (1 - kWall), walls: on * (1 - kWall),
        doors: on * (1 - kDoor),
        dims: on * (1 - kDim), north: on * (1 - kDim), scale: on * (1 - kDim),
        stamp: false, labels: false,
      })];

      /* ---- stamp (with the dims) and labels: set with a rising mask, lift out ---- */
      const ps = cam.apply(PLAN.stamp.at);
      const stamp = text(PLAN.stamp.label, { x: ps[0], y: ps[1], anchor: 'end', size: 18, fill: C.RED });
      if (f < 1395) out.push(kDim > 0 ? exit(stamp, prog(f, 1388, 1394, EASE.LIFT)) : rise(stamp, { p: prog(f, 1356, 1364, EASE.SET), baseline: ps[1], size: 18 }));

      if (f < 1386) LABELS.forEach((key, i) => {
        const L = PLAN.labels[key], p = cam.apply(L.at), meaning = key !== 'PORCH';
        let markup = planLabel(cam, key, meaning ? 'meaning' : 'measure', { size: MEANING });
        if (key === 'BATH') markup = ['Ten quiet', 'minutes'].map((t, j) => text(t, { x: p[0], y: p[1] + MEANING * 0.3 + (j - 0.5) * 32, anchor: 'middle', voice: 'meaning', size: MEANING, fill: C.RED })).join('');   // the bath is 25 MU wide: two lines keep the label inside its walls
        const base = meaning ? p[1] + MEANING * 0.3 + (key === 'BATH' ? 16 : 0) : p[1] + 6, size = meaning ? MEANING + (key === 'BATH' ? 32 : 0) : 18;   // (BATH: taller mask box for its two lines)
        out.push(kLab > 0 ? exit(markup, kLab, -12) : rise(markup, { p: prog(f, 1352 + i, 1360 + i, EASE.SET), baseline: base, size }));
      });
      return out;
    },
  });
})();
