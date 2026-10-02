/* dev: construction motion test. Three towers rise floor by floor (t0 10, dur 14); one crown drops onto its shaft and lands on f30. */
export default function rise(ctx) {
  const { kits } = ctx;
  const set = new kits.towers.TowerSet({ lod: 0, shadow: true, name: 'rise' });
  set.add({ x: -150, z: 0, w: 52, d: 40, h: 300, crown: 'A', t0: 10, dur: 14, ease: 'slam' });
  set.add({ x: 0, z: -60, w: 60, d: 46, h: 380, crown: 'Dd', t0: 12, dur: 14, ease: 'slam', drop: 120, dropDur: 4, land: 30 });
  set.add({ x: 150, z: 0, w: 46, d: 40, h: 240, crown: 'Ds', t0: 14, dur: 12, ease: 'out' });
  set.build(); ctx.root.add(set.group);
  const ground = kits.world.makeGround(); ctx.root.add(ground);
  return { id: 'dev.rise', start: 0, end: 60,
    update() { kits.world.preset(ctx.env, 'city'); ctx.env.sun = { az: -36, el: 34, intensity: 1.6, dir: null };
      ctx.cam.set({ pos: [40, 60, 760], look: [0, 190, 0], fov: 46 }); } };
}
