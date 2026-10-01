/* S04 · The Fold · f330–449 — PLACEHOLDER (canonical plan + the f370–415 camera move as an API demo). Treatment §4 S04.
   The only depth in the film: use TA.fold.css / TA.fold.project. Hard cut to red at f450. */
(function () {
  const { drawPlan, camTween, CAMS, EASE } = TA;
  TA.placeholder('S04', { extra: (lf) => drawPlan(camTween(lf, [40, 85], CAMS.PLAN_WIDE, CAMS.PLAN, EASE.DRAFT)) });
})();
