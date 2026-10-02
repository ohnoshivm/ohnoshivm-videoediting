// dev scene for tools/qa.mjs: ?dev=qa&mode=flat|crown|crowns
export default function devQA(ctx) {
  const q = new URLSearchParams(location.search), mode = q.get('mode') || 'flat';
  const T = ctx.kits.towers;
  const kinds = ['A', 'Am', 'Dd', 'Ds', 'Dsm'];
  const set = new T.TowerSet({ shadow: false });
  if (mode === 'crown') { const k = q.get('kind') || 'A'; set.add({ x: 0, z: 0, w: ctx.kits.logo.crownSize(k).width, d: 30, h: 0.001, crown: k, pitch: 100 }); }   // natural size: 1 mark unit = 1 m
  set.build(); ctx.root.add(set.group);
  return { id: 'dev.qa', start: 0, end: 1799,
    update(t) {
      const env = ctx.env; ctx.kits.world.preset(env, 'flat');
      if (mode === 'crown') {
        // straight-on orthographic view; light from the camera so the front face is pure white
        env.sun = { az: 0, el: 0, intensity: 1.6, dir: [0, 0, 1] }; env.ambient = { up: 1, down: 1, bounce: 0 };
        ctx.cam.set({ pos: [0, 50, 500], look: [0, 50, 0], ortho: 1, orthoHeight: 200, near: 1, far: 2000 });
      } else ctx.cam.set({ pos: [0, 5, 20], look: [0, 5, 0] });
    } };
}
