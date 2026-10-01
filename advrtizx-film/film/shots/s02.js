/* S02 · The Compass Proof · f120–239 — PLACEHOLDER (shows the inked A + dims as an API demo). Treatment §4 S02. */
(function () {
  const { draftGrid, drawMark, dimString, camZoom, CAMS, prog, tween, EASE, LW, C } = TA;
  TA.placeholder('S02', { extra: (lf) => {
    const c = camZoom(CAMS.ACT1, tween(lf, [0, 119], [1, 1.03], EASE.SURVEY), [961, 540]);
    const fl = prog(lf, 65, 80, EASE.SET);
    return draftGrid() + drawMark({ cam: c, parts: 'A', notch: false, stroke: C.RED, sw: LW.DRAW, draw: prog(lf, 65, 80, EASE.DRAFT), filletBL: 7.5 * fl, filletTL: 10.8 * fl }) +
      dimString(c.apply([0, 100]), c.apply([125.5, 100]), { offset: 24, label: '28\'-2"', draw: prog(lf, 80, 92, EASE.DRAFT) }) +
      dimString(c.apply([125.5, 100]), c.apply([125.5, 0]), { offset: 24, label: '22\'-5"', draw: prog(lf, 92, 104, EASE.DRAFT) });
  } });
})();
