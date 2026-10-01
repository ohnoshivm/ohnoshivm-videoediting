// dev scene: ?dev=views -> 4 panels, each its own skyline + camera (kit test)
export default function devViews(ctx) {
  const names = ['london', 'newyork', 'tokyo', 'riyadh'], cams = names.map(() => ctx.makeCam()), groups = [];
  names.forEach((n, i) => { const c = ctx.kits.city.build(n, { t0: 20 + i * 6, lod: 1, shadow: false }); ctx.root.add(c.group); ctx.gate(c.group); groups.push(c); });
  const ground = ctx.kits.world.makeGround(); ctx.root.add(ground); ctx.gate(ground);
  return { id: 'dev.views', start: 0, end: 1799,
    update(t) {
      ctx.kits.world.preset(ctx.env, 'city'); ctx.env.shadow.on = false;
      ctx.views = names.map((n, i) => { const c = groups[i], ex = c.extent;
        cams[i].set({ pos: [c.center[0] + (i - 1.5) * 60, ex * 0.2, c.center[1] + ex * 1.1], look: [c.center[0], 110, c.center[1] - 100], fov: 46, near: 2 });
        return { rect: [(i % 2) * 0.5, Math.floor(i / 2) * 0.5, 0.5, 0.5], cam: cams[i], only: [c.group, ground], env: { fog: { density: 0.0007, air: 0.0006 } } }; });
    } };
}
