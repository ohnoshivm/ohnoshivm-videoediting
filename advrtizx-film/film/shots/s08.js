/* S08 · The Door Is 9:16 · f900–1019 — treatment §4 S08.
   f900 = RED | WHITE slot x 846–1074 | RED (S07's dive end pose, CAMS.DOOR at 30 px/MU: the gap is 7.6 MU = 228 px).
   f915–945 the slabs slide apart (HINGE 30f) to an exact 608×1080 opening (9:16). The sentence is split by the opening.
   Everything here is a pure function of the frame number. */
(function () {
  const { registerShot, SPEC, text, rise, exit, prog, tween, EASE, C, LW, rect, g, path, lineSegs, measure, fmt } = TA;

  const SLOT = [846, 1074], OPEN = [656, 1264];           // closed slot → 9:16 opening (608 × 1080)
  const BASE = 564;                                       // copy baseline (47 × 12px grid)
  const INK = C.RED;

  /* ── dimension string, local: same drafting grammar as TA.dimString (hairline 1.5, 45° ticks 12px, 8px extensions,
        6px knockout) but with the label rotation under our control (the vertical `1920` reads bottom → top, −90°).
        on: draw-on 0..1, off: draw-off 0..1 (retracts toward the far end). */
  function dim(a, b, wa, wb, o) {
    const on = o.on, off = o.off ?? 0; if (on <= 0 || off >= 1) return '';
    const ext = 8, sw = LW.HAIR, dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy), d = [dx / L, dy / L];
    const st = { stroke: INK, sw, cap: 'butt', draw: on, from: off };
    let out = path(lineSegs(wa[0], wa[1]), st) + path(lineSegs(wb[0], wb[1]), st) +
      path(lineSegs([a[0] - d[0] * ext, a[1] - d[1] * ext], [b[0] + d[0] * ext, b[1] + d[1] * ext]), st);
    const sl = [Math.cos(-45 * Math.PI / 180) * 6, Math.sin(-45 * Math.PI / 180) * 6];                      // '/' tick, 12px
    const tick = (q) => path(lineSegs([q[0] - sl[0], q[1] - sl[1]], [q[0] + sl[0], q[1] + sl[1]]), { stroke: INK, sw: LW.DETAIL, cap: 'butt' });
    if (off <= 0) out += tick(a);
    if (on >= 1 && off < 1) out += tick(b);
    if (on >= 0.5 && off < 0.5) {
      const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], w = measure(o.label, { voice: 'measure', size: 16 }) + 12, h = 16 * 0.7 + 12;
      out += `<g transform="translate(${fmt(m[0])} ${fmt(m[1])})${o.rot ? ` rotate(${o.rot})` : ''}">` + rect(-w / 2, -h / 2, w, h, C.WHITE) +
        text(o.label, { x: 0, y: 16 * 0.35, anchor: 'middle', voice: 'measure', size: 16, fill: INK }) + '</g>';
    }
    return out;
  }

  registerShot({
    ...SPEC.S08,                                          // f900–1019, bg RED (the two slabs are the bg)
    render(lf, ctx) {
      const f = ctx.f, out = [];

      // f915–945: the door opens. A slab's right edge 846 → 656, D slab's left edge 1074 → 1264.
      const l = tween(f, [915, 945], [SLOT[0], OPEN[0]], EASE.HINGE), r = tween(f, [915, 945], [SLOT[1], OPEN[1]], EASE.HINGE);
      out.push(rect(l, 0, r - l, 1080, C.WHITE));

      // f950 / f958: the sentence, split by the opening (each SET starts one frame early so the hit frame itself already shows type: audio lands on f950 / f958). Exits f1005–1015 (LIFT 6f, 24px up).
      // The spec's single right-hand line ("they open is 9:16." = 688px from x 1304) runs 72px past the frame,
      // so it breaks after "is": line 1 shares the left line's baseline, `9:16.` drops one 72px line (AUTHORITY leading 1.0).
      const exL = EASE.LIFT(prog(f, 1005, 1011)), exR = EASE.LIFT(prog(f, 1009, 1015));
      const W = { voice: 'authority', size: 72, fill: C.WHITE };
      const left = rise(text('The first door', { x: 616, y: BASE, anchor: 'end', ...W }), { p: prog(f, 949, 959, EASE.SET), baseline: BASE, size: 72 });
      const right = rise(text('they open is', { x: 1304, y: BASE, ...W }), { p: prog(f, 957, 967, EASE.SET), baseline: BASE, size: 72 }) +
        (f >= 958 ? text('9:16.', { x: 1304, y: BASE + 96, voice: 'measure', size: 96, fill: C.WHITE }) : '');   // the cold voice snaps (dry TICK on f958)
      out.push(exit(left, exL), exit(right, exR));

      // f970–990: dimension strings inside the opening (RED 1.5px, DRAFT 10f each); draw off f1007–1015 (DRAFT 8f).
      const off = prog(f, 1007, 1015, EASE.DRAFT);
      out.push(dim([680, 48], [1240, 48], [[680, 6], [680, 56]], [[1240, 6], [1240, 56]],
        { on: prog(f, 970, 980, EASE.DRAFT), off, label: '1080' }));
      out.push(dim([1236, 72], [1236, 1032], [[1258, 72], [1228, 72]], [[1258, 1032], [1228, 1032]],
        { on: prog(f, 980, 990, EASE.DRAFT), off, label: '1920', rot: -90 }));
      return out;
    },
  });
})();
