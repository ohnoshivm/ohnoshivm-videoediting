/* S03 · Spec Hatch · f240–329 — PLACEHOLDER. Treatment §4 S03. Camera locked at the S02 push (1.03 about (961,540)). */
(function () {
  const { draftGrid, drawMark, dimString, camZoom, CAMS, LW, C } = TA;
  TA.placeholder('S03', { extra: () => { const c = camZoom(CAMS.ACT1, 1.03, [961, 540]);
    return draftGrid() + drawMark({ cam: c, parts: 'A', notch: false, stroke: C.RED, sw: LW.DRAW }) +
      dimString(c.apply([0, 100]), c.apply([125.5, 100]), { offset: 24, label: '28\'-2"' }) +
      dimString(c.apply([125.5, 100]), c.apply([125.5, 0]), { offset: 24, label: '22\'-5"' }); } });
})();
