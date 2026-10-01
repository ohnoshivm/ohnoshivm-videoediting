/* S05 · Nobody Buys Square Feet · f450–539 — PLACEHOLDER (copy at spec positions as a type test). Treatment §4 S05. */
(function () {
  const { text, C } = TA;
  TA.placeholder('S05', { extra: () =>
    text('Nobody buys', { x: 180, y: 500, voice: 'card', size: 160, fill: C.WHITE }) +
    text('square feet.', { x: 180, y: 672, voice: 'measure', size: 150, fill: C.WHITE }) });
})();
