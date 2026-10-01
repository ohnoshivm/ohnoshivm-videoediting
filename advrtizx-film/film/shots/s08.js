/* S08 · The Door Is 9:16 · f900–1019 — PLACEHOLDER (slab opening only). Treatment §4 S08. */
(function () {
  const { rect, tween, EASE, C } = TA;
  TA.placeholder('S08', { extra: (lf) => { const l = tween(lf, [15, 45], [846, 656], EASE.HINGE), r = tween(lf, [15, 45], [1074, 1264], EASE.HINGE);
    return rect(l, 0, r - l, 1080, C.WHITE); } });
})();
