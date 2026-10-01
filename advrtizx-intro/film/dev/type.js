// dev scene: ?dev=type  -> overlay type in every script + a 3D type plane in fog (kit test)
export default function devType(ctx) {
  const T = ctx.kits.type, logo = ctx.kits.logo;
  const p1 = T.plane('NO TOWER RISES', { worldHeight: 180, weight: 900, stretch: 112.5, track: -0.03 });
  p1.mesh.position.set(0, 120, -600); ctx.root.add(p1.mesh);
  const p2 = T.plane('دبي', { worldHeight: 260 }); p2.mesh.position.set(-300, 140, -900); ctx.root.add(p2.mesh);
  const g0 = ctx.kits.world.makeGround(); ctx.root.add(g0);
  const set = new ctx.kits.towers.TowerSet(); set.add({ x: 40, z: -300, w: 60, d: 40, h: 260, crown: 'A' }); set.add({ x: -120, z: -420, w: 80, d: 50, h: 200, crown: 'Dd' }); set.build(); ctx.root.add(set.group);
  return { id: 'dev.type', start: 0, end: 1799,
    update(t) {
      ctx.kits.world.preset(ctx.env, 'hero'); ctx.cam.set({ pos: [0, 90, 200], look: [0, 110, -400], fov: 46 });
    },
    overlay(t, g) {
      const rows = [['EVERY SKYLINE STARTS WITH AN', 'latin'], ['ÉÜİÇÃ ŞĞ ŁŻ', 'latin'], ['دبي  الرياض  مُباع', 'arabic'], ['मुंबई  बिक गया', 'devanagari'], ['ขายแล้ว', 'thai'],
        ['新加坡 香港 已售', 'zh'], ['東京 成約済', 'ja'], ['계약완료', 'ko'], ['ПРОДАНО', 'cyrillic']];
      let y = 90;
      for (const [txt] of rows) { const r = T.draw(g, txt, { x: 60, y, size: 78, track: -0.02 }); y += 92; }
      T.draw(g, 'AdvrtizX', { x: 1860, y: 150, size: 140, align: 'right', stretch: 125, track: -0.04 });
      logo.draw(g, { x: 1500, y: 600, height: 220, fill: '#fff' });
      T.draw(g, 'THE AI-FIRST AGENCY FOR THE WORLD’S REAL ESTATE', { x: 1860, y: 980, size: 30, weight: 700, track: 0.18, align: 'right' });
    } };
}
