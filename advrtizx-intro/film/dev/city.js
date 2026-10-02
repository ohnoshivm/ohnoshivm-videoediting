// dev scene: ?dev=city&city=london&t0=0  -> a city preset from a standard view (kit test, not part of the film)
export default function devCity(ctx) {
  const q = new URLSearchParams(location.search), name = q.get('city') || 'dubai';
  const hero = q.has('hero') ? { x: 0, z: 0, w: 100, d: 58 } : null;
  const c = ctx.kits.city.build(name, { hero, t0: +(q.get('t0') || 0), seed: q.get('seed') || name, reflect: +(q.get('reflect') || 0) });
  ctx.root.add(c.group); const g = ctx.kits.world.makeGround(); ctx.root.add(g);
  const ex = c.extent || 800;
  return { id: 'dev.city', start: 0, end: 1799,
    update(t) {
      const env = ctx.env; ctx.kits.world.preset(env, 'city'); env.shadow.center = [c.center[0], 0, c.center[1]]; env.shadow.radius = ex * 1.5;
      if (q.has('fog')) { env.fog.density = +q.get('fog'); env.fog.air = +(q.get('air') || 0.0002); }
      const a = +(q.get('az') || 0) * Math.PI / 180, d = ex * +(q.get('dist') || 1.3), y = +(q.get('y') || 70);
      ctx.cam.set({ pos: [c.center[0] + d * Math.sin(a), y, c.center[1] + d * Math.cos(a)], look: [c.center[0], +(q.get('ly') || 110), c.center[1]], fov: +(q.get('fov') || 50), near: 2, far: 60000 });
    } };
}
