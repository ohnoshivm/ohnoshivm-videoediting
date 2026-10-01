/* S09 · Thumb-Stop · f1020–1169 — treatment §4 S09.
   A vertical feed inside the 608×1080 opening (x 656–1264): card 0 is the blank opening, cards 1–9 are the clichés
   (the ONLY use of Playfair Display), card 10 is the true ad. Y(t) = 10800·SCROLL((t−1020)/66), brake to exactly 10800
   at f1086. Motion blur (the film's only one) is deterministic: 16 temporal subsamples across a 180° shutter, each
   copy composited with 1/(k+1) alpha (an exact running average), plus a small vertical-only Gaussian whose σ is derived
   from the sample spacing so the 16 ghosts never stair-step. f1086–1169: pure vector, no blur.
   Shares `TA.act3.card10` with S10 (S09 loads first; S10's f1170 must equal S09's last frame). */
(function () {
  const { registerShot, SPEC, text, prog, tween, EASE, C, LW, rect, g, uid, fmt } = TA;
  const A3 = TA.kit('act3');

  const OX = 656, OW = 608, H = 1080, CX = OW / 2, INK = C.RED;
  const Y_END = 10800, T0 = 1020, T1 = 1086;
  const Ycurve = (t) => Y_END * EASE.SCROLL((t - T0) / (T1 - T0));

  /* ───── the clichés: identical template, only the words change (the sameness is the joke) ───── */
  const ADS = [['LUXURY LIVING', 'REDEFINED'], ['YOUR DREAM HOME', 'AWAITS'], ['WORLD-CLASS', 'AMENITIES'], ['PREMIUM', 'LIFESTYLE'],
    ['LIMITED UNITS', 'LEFT'], ['ELEVATE', 'YOUR LIVING'], ['EXCLUSIVE', 'LAUNCH OFFER'], ['MODERN', 'LUXURY HOMES'], ['PRIME', 'LOCATION']];
  /* the brochure ornament: hairline · lozenge · hairline. The lozenge's sides run at 3:4 (6 across, 8 up), so even the
     cliché is cut from the slope. */
  const ornament = (cx, cy) =>
    `<path d="M${cx - 92} ${cy}H${cx - 16}M${cx + 16} ${cy}H${cx + 92}" stroke="${INK}" stroke-width="${LW.HAIR}" fill="none"/>` +
    `<path d="M${cx} ${cy - 8}L${cx + 6} ${cy}L${cx} ${cy + 8}L${cx - 6} ${cy}Z" fill="${INK}"/>`;
  function adCard(k) {
    const [a, b] = ADS[k - 1], P = { voice: 'cliche', size: 40, anchor: 'middle', fill: INK };
    return rect(0, 0, OW, H, C.WHITE) +
      `<rect x="24" y="24" width="560" height="1032" fill="none" stroke="${INK}" stroke-width="2"/>` +      // 2px frame inset 24
      `<rect x="36" y="36" width="536" height="1008" fill="none" stroke="${INK}" stroke-width="${LW.HAIR}"/>` +  // the double rule
      ornament(CX, 440) + text(a, { x: CX, y: 520, ...P }) + text(b, { x: CX, y: 584, ...P }) + ornament(CX, 636) +
      `<rect x="${CX - 106}" y="792" width="212" height="56" rx="28" fill="none" stroke="${INK}" stroke-width="2"/>` +   // BOOK NOW pill at y 820
      text('BOOK NOW', { x: CX, y: 826, voice: 'cliche', size: 18, anchor: 'middle', fill: INK });
  }

  /* ───── card 10: the true ad. Pieces in card-local coords (origin = card top-left) so S10 can take them apart. ───── */
  const SPEC_LINE = '860 SQ FT · 1 BED · EAST-FACING';
  const SUN = { cx: 400, r: 96, rest: 843, hidden: 880 };     // centre 63px under the horizon at rest; exact notch proportions ×4.53
  function card10(f, o = {}) {
    const clockOn = o.clock ?? f >= 1092;                                              // f1092: BELL 440 — the clock snaps to 07:40
    const sunCy = o.sunCy ?? tween(f, [1095, 1110], [SUN.hidden, SUN.rest], EASE.SET);   // f1095–1110 the sun rises (SET 15f)
    const nSpec = o.nSpec ?? (f < 1110 ? 0 : Math.min(SPEC_LINE.length, 2 * (Math.floor(f) - 1110 + 1)));   // f1110: 2 chars per frame
    const cid = uid('sun');
    return {
      headline: text('Sunday mornings', { x: 40, y: 200, voice: 'meaning', size: 88, fill: INK }) + text('face east.', { x: 40, y: 290, voice: 'meaning', size: 88, fill: INK }),
      clock: clockOn ? text('07:40', { x: 568, y: 72, anchor: 'end', voice: 'measure', size: 16, fill: INK }) : '',
      horizon: `<path d="M0 780H${OW}" stroke="${INK}" stroke-width="2" fill="none"/>`,
      // the sun is the logo's notch: a circle whose centre sits below the line, clipped above it
      sun: sunCy - SUN.r < 780 ? `<clipPath id="${cid}"><rect x="0" y="0" width="${OW}" height="780"/></clipPath><circle cx="${SUN.cx}" cy="${fmt(sunCy)}" r="${SUN.r}" fill="${INK}" clip-path="url(#${cid})"/>` : '',
      spec: nSpec > 0 ? text(SPEC_LINE.slice(0, nSpec), { x: 40, y: 830, voice: 'measure', size: 16, fill: INK }) : '',
    };
  }
  A3.card10 = card10; A3.OPEN = { x: OX, w: OW }; A3.SUN = SUN;
  const card10Markup = (f) => { const c = card10(f); return rect(0, 0, OW, H, C.WHITE) + c.headline + c.clock + c.horizon + c.sun + c.spec; };
  // 2px RED rule on every boundary: the top edge of cards 1–9, and the bottom edge of card 9 (so the true ad needs none and rests
  // clean at y 0; card 0 stays the blank opening exactly as S08 hands it over)
  const cardMarkup = (k, f) => k === 10 ? card10Markup(f) : k === 0 ? rect(0, 0, OW, H, C.WHITE)
    : adCard(k) + rect(0, 0, OW, 2, INK) + (k === 9 ? rect(0, H - 2, OW, 2, INK) : '');

  registerShot({
    ...SPEC.S09,                                          // f1020–1169, bg RED (the slabs are the bg and stay empty)
    render(lf, ctx) {
      const f = ctx.f, N = 16, SHUTTER = 0.5;             // 180°
      // temporal subsamples (blur only f1020–1086): shutter centred on f, so it collapses to nothing as velocity → 0
      let ys = [Ycurve(f)], blur = 0;
      if (f <= T1) {
        const ts = Array.from({ length: N }, (_, j) => f + (j / (N - 1) - 0.5) * SHUTTER), yy = ts.map(Ycurve);
        if (Math.abs(yy[N - 1] - yy[0]) > 0.75) {
          ys = yy; let gap = 0; for (let j = 1; j < N; j++) gap = Math.max(gap, Math.abs(yy[j] - yy[j - 1]));
          blur = 0.5 * gap;                               // σ ≈ half the ghost spacing: ripple < 1%
        }
      }
      // which cards are needed (visible rows ± filter margin), each defined once and <use>d per subsample
      const cardsAt = (Y) => { const a = Math.max(0, Math.floor((Y - 160) / H)), b = Math.min(10, Math.floor((Y + H + 160) / H)); const r = []; for (let k = a; k <= b; k++) r.push(k); return r; };
      const need = new Set(); ys.forEach((Y) => cardsAt(Y).forEach((k) => need.add(k)));
      const ids = {}; let defs = '';
      need.forEach((k) => { ids[k] = uid('card' + k); defs += `<g id="${ids[k]}">${cardMarkup(k, f)}</g>`; });
      // exact running average as a balanced tree of 50% layers: 4 rounding steps instead of 16, so 8-bit compositing
      // never posterises the ghosts (a flat 1/(k+1) chain loses every contribution below half a grey level)
      const leaves = ys.map((Y) => cardsAt(Y).map((k) => `<use href="#${ids[k]}" x="${OX}" y="${fmt(k * H - Y)}"/>`).join(''));
      const avg = (a) => { if (a.length === 1) return a[0]; const h = a.length >> 1; return avg(a.slice(0, h)) + g(avg(a.slice(h)), { op: 0.5 }); };
      const stack = avg(leaves);
      let body = stack;
      if (blur > 0.35) {
        const fid = uid('mb');
        body = `<filter id="${fid}" filterUnits="userSpaceOnUse" x="${OX}" y="-320" width="${OW}" height="1720" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="0 ${fmt(Math.min(blur, 60))}"/></filter><g filter="url(#${fid})">${stack}</g>`;
      }
      const cid = uid('open');
      return `<defs>${defs}</defs><clipPath id="${cid}"><rect x="${OX}" y="0" width="${OW}" height="${H}"/></clipPath><g clip-path="url(#${cid})">${body}</g>`;
    },
  });
})();
