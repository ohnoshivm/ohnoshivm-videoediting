/* S03 · Spec Hatch · f240–329 (treatment §4 S03).
   The inked A fills with the spec sheet set as hatch: 16 rows of IBM Plex Mono 400 / 20px, each entering from alternate
   sides, then drifting as tickers; at f270 sixteen RED_40 rows interleave; at f300 everything freezes dead; f303 the
   rows collapse onto the baseline. Camera locked at the S02 push (1.03 about (961,540)).

   Layout is derived from the zoomed A itself: 16 rows × 30.9px exactly fill the A (30px × 1.03). */
(function () {
  const { registerShot, SPEC, text, prog, EASE, C, camZoom, CAMS, markA, segsToD, uid, clamp, fmt, TIME } = TA;
  const A1 = TA.act1, K = 1.03;
  const PATTERN = '860 SQ FT · 1 BED · 1 BATH · EAST-FACING · ';
  const ROW = PATTERN.repeat(6);
  const PERIOD = PATTERN.length * (0.6 * 20 + 0.08 * 20);        // Plex Mono advance 0.6em + 0.08em tracking → 584.8px
  const SIZE = 20, N = 16, DRIFT = 120 / TIME.FPS;               // 120 px/s = 4 px/frame
  const T0 = 1100 - 29 * PERIOD / PATTERN.length - 3 * PERIOD;     // text start at f299: 'E' of EAST-FACING (char 29) of repeat 3 lands on x = 1100

  const ZA = camZoom(CAMS.ACT1, K, [961, 540]);
  const yTop = ZA.apply([0, 0])[1], yBot = ZA.apply([0, 100])[1], x0 = ZA.apply([0, 100])[0], xR = ZA.apply([125.5, 0])[0];
  const pitch = (yBot - yTop) / N;
  const aClip = segsToD(markA({ notch: false }), ZA);
  const dirOf = (i) => (i % 2 === 0 ? 1 : -1);                    // 1st, 3rd… row enter from the left and drift right

  /** one hatch row. top = band top; start = entry frame; dir = +1 (left→right) / −1; squash = collapse start frame (or Infinity). */
  function row(f, i, top, start, dir, fill, cStart) {
    // first visible frame = start (SET is decisive: ~50% in on its first frame)
    const p = EASE.SET(clamp((f - start + 1) / 10));
    if (p <= 0) return '';
    // Rows drift at ±120px/s. The text phase is chosen so that at the f299 dead stop every row is in register
    // (a spreadsheet column of EAST-FACING at x = 1100): the stop lands on order. dFwd = distance travelled since f240 (reveal clip).
    const t = Math.min(f, 299), dFwd = dir * DRIFT * (t - 240), dRel = dir * DRIFT * (t - 299);
    const enter = -dir * 400 * (1 - p);
    const bandBot = top + pitch, xl = x0 + (yBot - bandBot) * 0.75;   // widest part of the row inside the roof slope
    // the text's leading end reveals the row as it slides in: right-going rows are open to the left of it, left-going to the right
    const lead = (dir > 0 ? xR : xl) + enter + dFwd;
    const cid = uid('row');
    const clip = dir > 0 ? `<rect x="0" y="${fmt(top - 2)}" width="${fmt(Math.max(0, lead))}" height="${fmt(pitch + 4)}"/>`
                         : `<rect x="${fmt(lead)}" y="${fmt(top - 2)}" width="${fmt(1920 - lead)}" height="${fmt(pitch + 4)}"/>`;
    const tx = T0 + enter + dRel;
    let inner = `<clipPath id="${cid}">${clip}</clipPath><g clip-path="url(#${cid})">` +
      text(ROW, { x: tx, y: top + pitch / 2 + SIZE * 0.698 / 2, voice: 'measureLong', size: SIZE, fill }) + '</g>';
    if (cStart !== undefined && f >= cStart) {                   // rows collapse onto the baseline (scaleY 1 → 0 about the A's base)
      const s = 1 - EASE.LIFT(clamp((f - cStart) / 6));
      if (s <= 0) return '';
      inner = `<g transform="translate(0 ${fmt(yBot)}) scale(1 ${fmt(s)}) translate(0 ${fmt(-yBot)})">${inner}</g>`;
    }
    return inner;
  }

  registerShot({
    ...SPEC.S03,
    render(lf, ctx) {
      const f = ctx.f, L = A1.layers(239, K), rows = [];
      // collapse order is top → bottom over all 32 rows (red rows even, pink rows odd), finishing at f327
      const cAt = (k) => 303 + k * (18 / 31);
      for (let i = 0; i < N; i++) rows.push(row(f, i, yTop + i * pitch, 240 + 2 * i, dirOf(i), C.RED, cAt(2 * i)));
      if (f >= 270) for (let j = 0; j < N - 1; j++)   // the 16th interleave would sit half outside the A (below the base), so it is not set
        rows.push(row(f, j, yTop + (j + 0.5) * pitch, 270 + (20 / 15) * j, -dirOf(j), C.RED_40, cAt(2 * j + 1)));
      const aId = uid('A');
      return [L.under, `<clipPath id="${aId}"><path d="${aClip}"/></clipPath><g clip-path="url(#${aId})">${rows.join('')}</g>`, L.ink, L.dims];
    },
  });
})();
