/* S06 · Sun Study · f540–719 (treatment §4 S06).
   f540        the plan at cam(12,(180,50)→(960,540)), tight on the bedroom bay; S04's MEASURE labels are present.
               `SUN 06:12` (MEASURE 24) top-left; from f545 it counts a minute a frame to `SUN 07:40` on f633.
   f541–553    the sun's path (dashed hairline, r = 70 MU about the bay centre) draws on; the sun sets (SET 8f) at −10°.
   f545–633    the sun climbs −10° → +35° (SURVEY). The light wedge enters through the glazing (DRAFT 12f, 0 → 70 MU) and sweeps the
               floor: every 2° of bay glazing that faces the sun is projected 70 MU along the light, clipped to the bedroom interior.
   f640–655    BEDROOM `14'-0" × 13'-2"` becomes *Sunday mornings*: split-flap, a character a frame, three intermediate glyphs each
               (the next three letters of the target), the last flip switches MEASURE 18px → MEANING (SET 6f, baseline-locked).
   f660–705    the camera pulls back to the S07 framing cam(5.4,(0,0)→(573.1,420)) (HINGE 45f); KITCHEN 675, LIVING 683,
               ENTRY 690, BATH 698 rewrite the same way; the meaning labels shrink 40 → 34px on the way so they match S07.
   f700–710    sun, path and wedge are drawn off (DRAFT 10f); the clock exits (LIFT 6f).
   Contract with S07 (f719 → f720): plan at CAMS.BUYER, the five meaning labels settled at 34px, PORCH still MEASURE.

   This file also publishes TA.act2 label tools used by S07: wrapped MEANING layout, the split-flap label renderer. */
(function () {
  const { registerShot, SPEC, text, path, prog, tween, clamp, lerp, EASE, C, LW, V, DEG, CAMS, PLAN, camTween, drawPlan, clipTo,
          arcSegs, lineSegs, exit, fmt, measure, splitFlap } = TA;
  const A2 = TA.kit('act2');   // shared with s04 (measureLines, read at render time) and S07
  const RED = C.RED, SIZE_SUN = 40, SIZE_BUYER = 34;

  /* ═════════════ MEANING / MEASURE label layout (shared with S07) ═════════════ */
  // anchors (MU). Same as PLAN.labels except LIVING, nudged +5 MU east so a 34px line clears the glazed slope at 5.4 px/MU.
  const MEANING_AT = { BEDROOM: [186, 62], KITCHEN: [111.5, 15], LIVING: [57, 55], ENTRY: [129.3, 108], BATH: [146.5, 19] };
  // widest clean line (px, at 34px, 5.4 px/MU): kitchen nook 132px inside its walls, bath 118px, living bounded by the slope
  const MAXW = { BEDROOM: 330, KITCHEN: 118, LIVING: 170, ENTRY: 560, BATH: 98 };
  const HYPHEN = { Lunchboxes: ['Lunch-', 'boxes'] };       // the one word wider than the kitchen
  const W34 = (s) => measure(s, { voice: 'meaning', size: SIZE_BUYER });
  const wrapCache = new Map();
  /** balanced line breaks: fewest lines that fit MAXW[key], then the narrowest widest-line */
  function wrap(key, t) {
    const ck = key + '|' + t; if (wrapCache.has(ck)) return wrapCache.get(ck);
    const maxW = MAXW[key], words = t.split(' '); let best = null;
    if (W34(t) <= maxW) best = [t];
    else if (HYPHEN[t]) best = HYPHEN[t];
    else for (let n = 2; n <= 3 && !best; n++) {
      let bw = Infinity;
      const rec = (i, left, acc) => { if (left === 1) { const ln = words.slice(i).join(' '); const m = Math.max(...acc.map(W34), W34(ln));
          if (i < words.length && m <= maxW && m < bw) { bw = m; best = [...acc, ln]; } return; }
        for (let j = i + 1; j <= words.length - (left - 1); j++) rec(j, left - 1, [...acc, words.slice(i, j).join(' ')]); };
      rec(0, n, []);
    }
    if (!best) best = words;                                 // nothing fits: one word a line
    wrapCache.set(ck, best); return best;
  }
  /** MEANING label at size S: per-character positions for the ORIGINAL text t (hyphen glyphs are extras), centred on the anchor */
  function layoutMeaning(c, key, t, S) {
    const lines = wrap(key, t), p = c.apply(MEANING_AT[key]), n = lines.length, k = S / SIZE_BUYER, lh = S * 1.0, chars = [], extras = [];
    let idx = 0;
    lines.forEach((ln0, li) => {
      const hy = ln0.endsWith('-') && HYPHEN[t], ln = hy ? ln0.slice(0, -1) : ln0, w = W34(ln0) * k, xl = p[0] - w / 2, y = p[1] + S * 0.3 + (li - (n - 1) / 2) * lh;
      for (let i = 0; i < ln.length; i++) chars.push({ ch: ln[i], x: xl + (W34(ln.slice(0, i + 1)) - W34(ln[i])) * k, y });
      if (hy) extras.push({ ch: '-', x: xl + (W34(ln0) - W34('-')) * k, y, after: idx + ln.length - 1 });
      idx += ln.length;
      if (li < n - 1 && !hy) { chars.push({ ch: ' ', x: xl + w, y }); idx++; }
    });
    return { lines, chars, extras, p, size: S };
  }
  const meaningStatic = (c, key, t, S) => { const L = layoutMeaning(c, key, t, S), k = S / SIZE_BUYER, n = L.lines.length;
    return L.lines.map((ln, li) => text(ln, { x: L.p[0], y: L.p[1] + S * 0.3 + (li - (n - 1) / 2) * S, anchor: 'middle', voice: 'meaning', size: S, fill: RED })).join(''); };
  /** the MEASURE label as drawn by S04: per-character positions */
  function layoutMeasure(c, key, shift = [0, 0]) {
    const lines = A2.measureLines(key), p = c.apply(V.add(PLAN.labels[key].at, shift)), y0 = p[1] + 6 - (lines.length - 1) * 12, chars = [];
    lines.forEach((ln, li) => { const o = { voice: li ? 'measureLong' : 'measure', size: 18 }, w = measure(ln, o), xl = p[0] - w / 2;
      for (let i = 0; i < ln.length; i++) chars.push({ ch: ln[i], x: xl + measure(ln.slice(0, i + 1), o) - measure(ln[i], o), y: y0 + li * 24, voice: o.voice, size: 18 }); });
    return chars;
  }
  const measureStatic = (c, key, shift = [0, 0]) => { const lines = A2.measureLines(key), p = c.apply(V.add(PLAN.labels[key].at, shift)), y0 = p[1] + 6 - (lines.length - 1) * 12;
    return lines.map((t, i) => text(t, { x: p[0], y: y0 + i * 24, anchor: 'middle', voice: i ? 'measureLong' : 'measure', size: 18, fill: RED })).join(''); };

  /** one label mid-rewrite. A wave sweeps left→right: character i of the NEW text flips at lf = i·rate (three intermediate glyphs in MEASURE
      caps, then the final flip lands the MEANING glyph); the OLD text is erased by the same wave, in proportion to its x.
      o: {from: 'measure' | {text}, to, S (target px), rate, cycles, grow (SET 6f from 18px) | 0, growEnd (lf), only (first N chars flip), shift} */
  function flapLabel(c, key, lf, o) {
    const S = o.S, rate = o.rate ?? 1, cycles = o.cycles ?? 3, to = o.to, n = to.length, L = layoutMeaning(c, key, to, S), out = [];
    const st = splitFlap(to, to, lf, { rate, cycles, step: 1 });
    // old text, eroded by the wave
    let old = o.from === 'measure' ? layoutMeasure(c, key, o.shift) : layoutMeaning(c, key, o.from.text, S).chars.map((q) => ({ ...q, voice: 'meaning', size: S }));
    old = old.filter((q) => q.ch.trim());
    // the old text is erased by its OWN wave, running at the same characters-per-frame and `ahead` cells in front of the flipping
    // front (a clean field for the three intermediate glyphs): old glyph j goes at lf = rate·max(0, idx_j − ahead), idx = its x in old character pitches.
    const xs = old.map((q) => q.x), x0 = Math.min(...xs), span = Math.max(1e-6, Math.max(...xs) - x0), ahead = Math.ceil(cycles / rate);
    const rows = {}; old.forEach((q) => { rows[q.y] = (rows[q.y] || 0) + 1; });
    const pitch = span / Math.max(1, Math.max(...Object.values(rows)) - 1);
    for (const q of old) {
      const idx = (q.x - x0) / pitch, snapAt = o.only !== undefined && idx >= o.only ? 0 : null;     // snapped characters replace their old glyph at once
      if (lf < (snapAt ?? Math.max(0, idx - ahead) * rate)) out.push(text(q.ch, { x: q.x, y: q.y, voice: q.voice, size: q.size, fill: RED }));
    }
    for (let i = 0; i < n; i++) {
      const g = L.chars[i], s = st[i]; if (!g || !g.ch.trim()) continue;
      const snap = o.only !== undefined && i >= o.only;
      if (!snap && !s.done && !s.flipping) continue;
      if (!snap && s.flipping) { out.push(text(s.ch.toUpperCase(), { x: g.x, y: g.y, voice: 'measure', size: 18, fill: RED })); continue; }
      const doneAt = snap ? 0 : i * rate + cycles, dur = Math.max(1, Math.min(6, (o.growEnd ?? 1e9) - doneAt)), q = o.grow ? EASE.SET(clamp((lf - doneAt + 1) / dur)) : 1;
      out.push(text(g.ch, { x: g.x, y: g.y, voice: 'meaning', size: lerp(18, S, q), fill: RED }));
    }
    for (const e of L.extras) { const s = st[e.after]; if (s && (s.done || (o.only !== undefined && e.after >= o.only))) out.push(text(e.ch, { x: e.x, y: e.y, voice: 'meaning', size: S, fill: RED })); }
    return out.join('');
  }
  Object.assign(A2, { MEANING_AT, MAXW, wrap, layoutMeaning, meaningStatic, layoutMeasure, measureStatic, flapLabel });

  /* ═════════════ the sun study ═════════════ */
  const BAY = { c: [177.2, 50], rGlass: 47.6, rPath: 70, rSun: 2.6 };
  const THROW = 140;   // MU. The treatment says 70, but the bedroom is ~90 MU deep along the light: at 70 the far edge is the translated bay arc, a curved lens inside the room. 140 runs every ray to the far wall.
  const SUN_A0 = -10, SUN_A1 = 35;
  const sunAngle = (f) => tween(f, [545, 633], [SUN_A0, SUN_A1], EASE.SURVEY);
  // bedroom interior: inner D minus the bath, minus walls (MU)
  const BEDROOM = [['M', 158.6, 2.4], ['L', 177.2, 2.4], ...arcSegs(BAY.c, BAY.rGlass, -90, 90).slice(1), ['L', 135.5, 97.6], ['L', 135.5, 38.6], ['L', 158.6, 38.6], ['Z']];

  /** the light wedge at sun angle phi, throw L (MU). Every 2° of glazing facing the sun is projected L along the light. */
  function wedge(c, phi, L) {
    if (L <= 0.01) return '';
    const d = [-Math.cos(phi * DEG), -Math.sin(phi * DEG)], P = [], Q = [];
    for (let th = PLAN.bay.a0; th <= PLAN.bay.a1 + 1e-6; th += 2) {
      if (Math.cos((th - phi) * DEG) <= 0) continue;                       // glazing facing away from the sun: dark
      const p = V.polar(BAY.c, BAY.rGlass, th); P.push(p); Q.push(V.add(p, V.mul(d, L)));
    }
    if (P.length < 2) return '';
    const pts = [...P, ...Q.slice().reverse()].map(c.apply), area = `<path d="M${pts.map((q) => fmt(q[0]) + ' ' + fmt(q[1])).join('L')}Z" fill="${C.RED_12}"/>`;
    const edge = (a, b) => path(lineSegs(a, b), { cam: c, stroke: C.RED_40, sw: 1, cap: 'butt' });
    return clipTo(area + edge(P[0], Q[0]) + edge(P[P.length - 1], Q[Q.length - 1]), BEDROOM, c);
  }

  /* ═════════════ clock ═════════════ */
  const clockText = (f) => { const m = 372 + clamp(Math.floor(f) - 545, 0, 88); return `SUN ${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };

  /* ═════════════ camera + schedule ═════════════ */
  const cameraAt = (f) => (f < 660 ? CAMS.SUN : f >= 705 ? CAMS.BUYER : camTween(f, [660, 705], CAMS.SUN, CAMS.BUYER, EASE.HINGE));
  const sizeAt = (f) => lerp(SIZE_SUN, SIZE_BUYER, EASE.HINGE(prog(f, 660, 705)));       // 40 → 34 with the pull
  const FLIPS = { BEDROOM: [640, 'Sunday mornings'], KITCHEN: [675, 'First coffee'], LIVING: [683, 'Long dinners'], ENTRY: [690, 'Shoes off'], BATH: [698, 'Ten quiet minutes'] };
  A2.S06_FINAL = { BEDROOM: 'Sunday mornings', KITCHEN: 'First coffee', LIVING: 'Long dinners', ENTRY: 'Shoes off', BATH: 'Ten quiet minutes' };
  const KITCHEN_SHIFT = [0, 9];                                                             // the stacked KITCHEN note sits 9 MU lower in the nook so the clock (120,150) clears it

  registerShot({
    ...SPEC.S06,
    render(lf, ctx) {
      const f = ctx.f, c = cameraAt(f), S = sizeAt(f), out = [];

      // ── light first (under the plan) ──
      const phi = sunAngle(f), exitP = prog(f, 700, 710, EASE.DRAFT);
      out.push(wedge(c, phi, THROW * EASE.DRAFT(prog(f, 545, 557)) * (1 - exitP)));

      // ── the plan: canonical, no labels (they are S04's, rewritten below) ──
      out.push(drawPlan(c, { labels: false, scale: 0 }));   // scale bar off: at 5.4 px/MU it would hang on the bottom edge with its numerals cut

      // ── labels ──
      out.push(measureStatic(c, 'PORCH'));
      for (const key of ['BEDROOM', 'KITCHEN', 'LIVING', 'ENTRY', 'BATH']) {
        const [t0, to] = FLIPS[key];
        if (f < t0) out.push(measureStatic(c, key, key === 'KITCHEN' ? KITCHEN_SHIFT : [0, 0]));
        else {
          const rel = f - t0, last = (to.length - 1) + 3 + 6;                               // flips + growth finish
          if (rel > last) out.push(meaningStatic(c, key, to, S));
          else out.push(flapLabel(c, key, rel, { from: 'measure', to, S, rate: 1, cycles: 3, grow: 1, growEnd: 719 - t0, shift: key === 'KITCHEN' ? KITCHEN_SHIFT : [0, 0] }));
        }
      }

      // ── sun path + sun ──
      const arcPath = arcSegs(BAY.c, BAY.rPath, -24, 46);
      out.push(path(arcPath, { cam: c, stroke: C.RED_40, sw: LW.HAIR, cap: 'butt', dash: [6, 6], draw: prog(f, 541, 553, EASE.DRAFT), from: exitP }));
      const sunS = EASE.SET(clamp((f - 541 + 1) / 8)) * (1 - exitP);
      if (sunS > 0.002) { const sp = c.apply(V.polar(BAY.c, BAY.rPath, phi));
        out.push(`<circle cx="${fmt(sp[0])}" cy="${fmt(sp[1])}" r="${fmt(BAY.rSun * c.s * sunS)}" fill="${RED}"/>`); }

      // ── the clock: screen-fixed, so the pull-back slides kitchen walls under it — a 6px paper knockout (the film's own dim-label device) keeps it legible
      const kw = measure('SUN 07:40', { voice: 'measure', size: 24 }) + 12;
      out.push(exit(`<rect x="114" y="127" width="${fmt(kw)}" height="31" fill="${C.WHITE}"/>` + text(clockText(f), { x: 120, y: 150, voice: 'measure', size: 24, fill: RED }), prog(f, 704, 710, EASE.LIFT), -24));
      return out;
    },
  });
})();
