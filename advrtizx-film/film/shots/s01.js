/* S01 · Twelve Knots · f0–119 — PLACEHOLDER. Replace TA.placeholder(...) with TA.registerShot({...TA.SPEC.S01, render(lf, ctx) {...}}).
   Treatment §4 S01. Hands off (continuous) to S02 at f120: see BUILD_GUIDE.md §4. */
(function () {
  const { draftGrid, slopeOrder, prog, EASE } = TA;
  TA.placeholder('S01', { extra: (lf) => draftGrid((i, j, x, y) => prog(lf, slopeOrder(x, y) * 20, slopeOrder(x, y) * 20 + 4, EASE.SET)) });
})();
