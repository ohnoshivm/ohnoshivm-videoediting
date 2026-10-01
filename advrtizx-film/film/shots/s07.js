/* S07 · Which Buyer · f720–899 (treatment §4 S07).
   The plan is locked at cam(5.4,(0,0)→(573.1,420)) and rewritten, on the 3:4:5 polyrhythm, per buyer, per reason, per hour.
   Headline (AUTHORITY 700, 96px, x120, baseline 228): f720 Which buyer. · f760 Which reason. · f800 Which hour. (SET 10f, 1f cuts).
   Header (MEASURE 18, right x1800, baselines 144/168): BUYER 01…05 on the 20f "3" grid; room labels (MEANING 34) rewrite with the
   split-flap at 0.5f per character (2 chars a frame): same wave as S06, MEASURE glyphs in the front, MEANING behind it.
   f800: a MEASURE clock sets at (120,300) and flips on the 15f "4" grid: SUN 07:40 → WED 21:10 (815) → SAT 10:05 (830) → FRI 13:30 (845).
   f820–869 acceleration: steps on the 12f "5" grid (820 · 832 · 844) then every 6f (850 · 856 · 862 · 868): headers BUYER 06…12 and the
   label pool; on 6f steps only the first 6 characters flip, the rest snap.
   f870 dead stop: in ONE frame every label, header, clock, headline (and the drawing's annotations) vanish; the plan's linework and poché stay.
   f876–899 the dive: the gap's glazing and doors are sealed (DRAFT 10f), then the camera pushes into the gap — LIFT 24f, log-scale 5.4 → 30,
   zooming about the gap centre while panning it to screen centre — and the walls either side of the gap flood solid (SET 8f, f888–896).
   f900 (S08's first frame): RED | WHITE slot x 846–1074 | RED, full height = CAMS.DOOR. The end pose is the exact CAMS.DOOR camera.

   DEVIATION (flood): the treatment floods the whole outline (stroke 4.8 → 250 MU). With LIFT the camera is still at s ≈ 6–9 during
   f888–896, so that would show the complete solid mark for ~8 frames and spend the S11 reveal. Here the flood is local: the walls
   either side of the gap thicken to 60 MU (clipped to the mark), which covers everything S08 will ever see (±32 MU at 30 px/MU)
   and keeps the logo from ever showing. */
(function () {
  const { registerShot, SPEC, text, prog, clamp, lerp, EASE, C, V, CAMS, cam, drawPlan, clipTo, markA, markD, rise, fmt, splitFlap } = TA;
  const A2 = TA.kit('act2'), RED = C.RED, S = 34;

  /* ───────── the copy ───────── */
  const KEYS = ['BEDROOM', 'KITCHEN', 'LIVING', 'ENTRY', 'BATH'];                       // table column order (treatment) = audio order
  const BUYER = [
    [720, 'BUYER 01', 'FIRST HOME',        ['Ours', 'Learning to cook', 'Friends over', 'Our name here', 'Ten quiet minutes']],
    [740, 'BUYER 02', 'YOUNG FAMILY',      ['Nursery, for now', 'Lunchboxes', 'Floor picnics', 'Small shoes', 'Bath time']],
    [760, 'BUYER 03', 'WORKS FROM HOME',   ['Studio', 'Lunch at one', 'Calls at nine', 'Commute: 0 min', 'Reset']],
    [780, 'BUYER 04', 'EMPTY NESTERS',     ['Late breakfasts', 'Slow Sundays', "Grandkids' weekend", 'Coats off', 'Long soak']],
    [800, 'BUYER 05', 'INVESTOR, ABROAD',  ['Rental-ready', 'Low upkeep', 'Tenant-proof', 'Keyless entry', 'Easy let']],
  ];
  const POOL = ["Dog's corner", 'Piano wall', 'Night shifts', 'First Diwali here', 'Cricket on TV', 'Prayer corner', 'Plants', 'Two desks',
    'Quiet street', 'Near school', 'Walk to metro', 'Room for Ma'];                      // the audio score indexes this pool as POOL[(5k + j) % 12]
  const WHO = ['NEW TO THE CITY', 'JOINT FAMILY', 'SHIFT WORKER', 'RETURNING HOME', 'TWO INCOMES, ONE DOG', 'RETIRING NEAR FAMILY', 'SECOND HOME'];
  const ACCEL = [820, 832, 844, 850, 856, 862, 868];
  // one timeline for everything that flips: {t0, header:[l1,l2], words:[5], only}
  const STEPS = BUYER.map(([t0, a, b, w]) => ({ t0, header: [a, b], words: w }));
  ACCEL.forEach((t0, k) => STEPS.push({ t0, header: ['BUYER ' + String(6 + k).padStart(2, '0'), WHO[k]], words: KEYS.map((_, j) => POOL[(5 * k + j) % 12]), only: k >= 3 ? 6 : undefined }));
  const CLOCK = [[800, 'SUN 07:40'], [815, 'WED 21:10'], [830, 'SAT 10:05'], [845, 'FRI 13:30']];
  const HEADLINE = [[720, 'Which buyer.'], [760, 'Which reason.'], [800, 'Which hour.']];

  const stepAt = (f) => { let i = -1; STEPS.forEach((s, k) => { if (f >= s.t0) i = k; }); return i; };

  /** mono string flip for header lines / clock: right-aligned cells, left→right wave, 2 intermediate glyphs */
  function flipString(src, dst, lf, rate) {
    const m = Math.max(src.length, dst.length), a = src.padStart(m), b = dst.padStart(m);
    return splitFlap(a, b, lf, { rate, cycles: 2, step: 1 }).map((s) => (s.flipping ? s.ch.toUpperCase() : s.done ? s.ch : s.ch)).join('');
  }

  /* ───────── the dive ───────── */
  const GAP_C = TA.MARK.GAP_C, P0 = CAMS.BUYER.apply(GAP_C), P1 = [960, 540];
  const diveCam = (f) => { const p = EASE.LIFT(prog(f, 876, 900)); return cam(Math.exp(lerp(Math.log(5.4), Math.log(30), p)), GAP_C, V.lerp(P0, P1, p)); };
  const OUTLINE = [...markA({}), ...markD({})];
  /** the flood: bands either side of the gap, clipped to the mark (W MU wide, from the gap faces outward) */
  function flood(c, W) {
    const band = (x0, x1) => { const a = c.apply([x0, -10]), b = c.apply([x1, 110]);
      return `<rect x="${fmt(a[0])}" y="${fmt(a[1])}" width="${fmt(b[0] - a[0])}" height="${fmt(b[1] - a[1])}" fill="${RED}"/>`; };
    return clipTo(band(A_RIGHT - W, A_RIGHT) + band(D_LEFT, D_LEFT + W), OUTLINE, c);
  }
  const A_RIGHT = TA.MARK.A_RIGHT, D_LEFT = TA.MARK.D_LEFT, W_END = 60;

  registerShot({
    ...SPEC.S07,
    render(lf, ctx) {
      const f = ctx.f, out = [];
      const c = f < 876 ? CAMS.BUYER : diveCam(f);

      /* ── the plan: always TA.drawPlan ── */
      if (f < 870) out.push(drawPlan(c, { labels: false, scale: 0 }));
      else {                                                                                  // dead stop: linework + poché only
        const seal = EASE.DRAFT(prog(f, 876, 886));
        out.push(drawPlan(c, { labels: false, dims: 0, north: 0, scale: 0, stamp: false, cuts: 1 - seal, glazing: 1 - seal, doors: 1 - seal }));
        const w = prog(f, 888, 896, EASE.SET);
        if (w > 0) out.push(flood(c, 2.4 + (W_END - 2.4) * w));
      }
      if (f >= 870) return out;

      /* ── room labels (MEANING 34), PORCH stays MEASURE ── */
      out.push(A2.measureStatic(c, 'PORCH'));
      const k = stepAt(f), cur = k < 0 ? null : STEPS[k], prev = k <= 0 ? null : STEPS[k - 1];
      KEYS.forEach((key, j) => {
        if (!cur) { out.push(A2.meaningStatic(c, key, A2.S06_FINAL[key], S)); return; }
        const to = cur.words[j], from = prev ? prev.words[j] : A2.S06_FINAL[key], rel = f - cur.t0, rate = 0.5, n = to.length;
        const last = (Math.min(n, cur.only ?? n) - 1) * rate + 3;
        if (rel > last) out.push(A2.meaningStatic(c, key, to, S));
        else out.push(A2.flapLabel(c, key, rel, { from: { text: from }, to, S, rate, cycles: 3, grow: 0, only: cur.only }));
      });

      /* ── header, clock, headline ── */
      const P = { voice: 'measure', size: 18, anchor: 'end', fill: RED };
      const hPrev = prev ? prev.header : ['', ''], hCur = cur ? cur.header : ['', ''];
      if (cur) { const rel = f - cur.t0;
        out.push(text(flipString(hPrev[0], hCur[0], rel, 0.3), { x: 1800, y: 144, ...P }), text(flipString(hPrev[1], hCur[1], rel, 0.3), { x: 1800, y: 168, ...P })); }

      let ck = null; CLOCK.forEach((q, i) => { if (f >= q[0]) ck = i; });
      if (ck !== null) {
        const rel = f - CLOCK[ck][0], txt = ck === 0 ? CLOCK[0][1] : flipString(CLOCK[ck - 1][1], CLOCK[ck][1], rel, 0.5);
        const cm = text(txt, { x: 120, y: 300, voice: 'measure', size: 24, fill: RED });
        out.push(ck === 0 ? rise(cm, { p: EASE.SET(clamp((f - 800 + 1) / 10)), baseline: 300, size: 24, x0: 0, x1: 600 }) : cm);
      }
      let hl = null; HEADLINE.forEach((q) => { if (f >= q[0]) hl = q; });
      if (hl) out.push(rise(text(hl[1], { x: 119, y: 228, voice: 'authority', size: 96, fill: RED }), { p: EASE.SET(clamp((f - hl[0] + 1) / 10)), baseline: 228, size: 96, x0: 0, x1: 1200 }));
      return out;
    },
  });
})();
