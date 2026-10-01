/* S13 · Red Angle / End Card · f1650–1799 — PLACEHOLDER (end pose: white mark on red). Treatment §4 S13. Last frame = lockup, no fade. */
(function () {
  const { drawMark, CAMS, C } = TA;
  TA.placeholder('S13', { extra: () => drawMark({ cam: CAMS.HERO, fill: C.WHITE }) });
})();
