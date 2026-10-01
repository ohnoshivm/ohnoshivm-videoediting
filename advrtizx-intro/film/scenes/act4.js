/* ACT IV · EVERY CITY (f384-639) · owner: act4/act5 author
   One long continuous strip of cities (1000 m apart along +x). The camera WHIPS laterally from city to city, whips shrinking from 8 to 4 frames
   (accelerating aggression). Every skyline ERUPTS on its downbeat: shafts launch together, crowns drop and LAND on the cue frame, the name
   rises out of the ground behind the skyline and locks on the same frame, the camera takes a hard impact shake, a ground ring bursts.
   Cities: london new-york singapore mumbai miami sydney riyadh hong-kong tokyo, each built only from the A / D grammar (see lib_s2.js). */
import * as S2 from './lib_s2.js';

const IDS = ['london', 'newyork', 'singapore', 'mumbai', 'miami', 'sydney', 'riyadh', 'hongkong', 'tokyo'];
const D = 1000;                                    // strip spacing (m)
const NAMES = {
  london:    { text: 'LONDON',   lang: 'latin',      stretch: 75, wFrac: 0.84, hFrac: 0.40 },
  newyork:   { text: 'NEW YORK', lang: 'latin',      stretch: 75, wFrac: 0.84, hFrac: 0.40 },
  singapore: { text: '新加坡',     lang: 'zh',         stretch: 100, wFrac: 0.62, hFrac: 0.40, latin: 'SINGAPORE' },
  mumbai:    { text: 'मुंबई',      lang: 'devanagari', stretch: 100, wFrac: 0.78, hFrac: 0.46, latin: 'MUMBAI' },
  miami:     { text: 'MIAMI',    lang: 'latin',      stretch: 75, wFrac: 0.80, hFrac: 0.40 },
  sydney:    { text: 'SYDNEY',   lang: 'latin',      stretch: 75, wFrac: 0.84, hFrac: 0.40 },
  riyadh:    { text: 'الرياض',   lang: 'arabic',     stretch: 100, wFrac: 0.80, hFrac: 0.46, latin: 'RIYADH' },
  hongkong:  { text: '香港',       lang: 'zh',         stretch: 100, wFrac: 0.50, hFrac: 0.42, latin: 'HONG KONG' },
  tokyo:     { text: '東京',       lang: 'ja',         stretch: 100, wFrac: 0.50, hFrac: 0.42, latin: 'TOKYO' },
};
const SHAKE_AMP = [1.5, 1.5, 1.6, 1.7, 1.9, 2.0, 2.1, 2.4, 2.6];     // impact strength grows with the pace

export default function act4(ctx) {
  const { kits, util, camera, THREE } = ctx;
  const { EASE, clamp, lerp, prog, shake, addShake, smoothstep, noise1 } = util;
  const T = kits.type;
  const START = ctx.cue('act4'), END = ctx.cue('act5') - 1;

  // ───────────── timeline from the cue sheet ─────────────
  const cities = IDS.map((id, i) => {
    const hit = ctx.cue('a4.' + id);
    const w0 = i === 0 ? ctx.cue('a3.whip') : ctx.cue('a4.whip.' + id);
    return { id, i, hit, w0, X: i * D, nm: NAMES[id] };
  });
  cities.forEach((c, i) => { c.holdEnd = i < cities.length - 1 ? cities[i + 1].w0 : END + 1; c.holdLen = c.holdEnd - c.hit; c.whipLen = c.hit - c.w0; });

  // ───────────── world ─────────────
  const ground = kits.world.makeGround(); ctx.root.add(ground);
  const built = cities.map((c) => {
    const b = S2.buildCity(kits, c.id, { hit: c.hit, seed: c.id, lod: 0, shadow: true });
    b.group.position.set(c.X, 0, 0); ctx.root.add(b.group);
    c.b = b;
    // the name: huge, standing in the fog behind the skyline
    const nm = c.nm, g = b.def.cam, nz = b.def.name.z, dist = g.pos[2] - nz, vh = 2 * dist * Math.tan(g.fov * Math.PI / 360), vw = vh * 16 / 9;
    const N = S2.makeName(kits, nm.text, { lang: nm.lang, stretch: nm.stretch, track: -0.035, fog: 0.35, tint: [1, 1, 1] });
    const k = Math.min((nm.wFrac * vw) / N.inkW, (nm.hFrac * vh) / N.inkH);
    N.mesh.scale.setScalar(k / N.k0); N.k = k;
    N.yb = b.def.name.y; N.yc = N.yb + (N.baseT - N.texH / 2) * k;
    const tt = (g.pos[2] - nz) / (g.pos[2] - g.look[2]), nx = b.def.name.x ?? (g.pos[0] + (g.look[0] - g.pos[0]) * tt); N.nx = nx;
    N.mesh.position.set(nx, N.yc, nz); N.mesh.rotation.y = Math.atan2(g.pos[0] - nx, g.pos[2] - nz);
    N.mistU.y0.value = N.yb - 0.1 * N.inkH * k; N.mistU.y1.value = N.yb + 0.62 * N.inkH * k; N.mistU.lo.value = 0.12;
    b.group.add(N.mesh); c.N = N; c.planeH = N.texH * k;
    return b;
  });
  const tmpV = new THREE.Vector3();

  // ───────────── camera ─────────────
  const rotY = (v, a) => { const c = Math.cos(a), s = Math.sin(a); return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c]; };
  function holdPose(c, t) {
    const g = c.b.def.cam, u = clamp((t - c.hit) / Math.max(1, c.holdLen)), e = EASE.inOutSine(u);
    const p = [c.X + g.pos[0] + g.push[0] * e, g.pos[1] + g.push[1] * e, g.pos[2] + g.push[2] * e];
    const l = [c.X + g.look[0] + g.push[0] * e * 0.5, g.look[1] + g.push[1] * e * 0.3, g.look[2]];
    return { pos: p, look: l, fov: g.fov * (1 - 0.035 * e), roll: 0 };
  }
  const TAIL = { R: 235, T: 4.6 };                                         // London arrives out of Act III's whip: it is still decelerating at f384
  function poseAt(t) {
    // whip into city i?
    for (let i = 1; i < cities.length; i++) {
      const c = cities[i];
      if (t >= c.w0 && t < c.hit) {
        const A = holdPose(cities[i - 1], c.w0), B = holdPose(c, c.hit);
        const u = camera.whip(t, c.w0, c.hit), sp = camera.whipSpeed(t, c.w0, c.hit), uy = smoothstep(0, 1, u);
        const pos = [lerp(A.pos[0], B.pos[0], u), lerp(A.pos[1], B.pos[1], uy), lerp(A.pos[2], B.pos[2], uy)];
        const look = [lerp(A.look[0], B.look[0], u), lerp(A.look[1], B.look[1], uy), lerp(A.look[2], B.look[2], uy)];
        // the head whips ahead of the body: yaw toward travel, a roll kick and a lens punch at peak speed
        const dir = [look[0] - pos[0], look[1] - pos[1], look[2] - pos[2]], yaw = -(0.20 + 0.10 * (c.whipLen <= 4 ? 1 : 0)) * sp;
        const rd = rotY(dir, yaw);
        return { pos, look: [pos[0] + rd[0], pos[1] + rd[1], pos[2] + rd[2]], fov: lerp(A.fov, B.fov, u) + 7 * sp, roll: -3.0 * sp };
      }
    }
    // hold: the city whose downbeat has passed
    let j = 0; for (let i = 0; i < cities.length; i++) if (t >= cities[i].hit) j = i;
    const P = holdPose(cities[j], t);
    if (j === 0) {                                                           // the tail of the whip that Act III ends with
      const u = clamp((t - cities[0].hit) / TAIL.T), off = TAIL.R * Math.pow(1 - u, 3), sp = Math.pow(1 - u, 2);
      P.pos[0] -= off; P.look[0] -= off * 0.9; P.fov += 7 * sp * 0.8; P.roll = -2.2 * sp;
    }
    return P;
  }

  // ───────────── impacts: shake events + rings ─────────────
  const events = [], ringEv = [];
  cities.forEach((c) => {
    events.push({ f: c.hit, amp: SHAKE_AMP[c.i], decay: 3.4, freq: 0.55, seed: c.i * 7 });
    ringEv.push({ f: c.hit, x: c.X, z: -140, k: 1.0 });
    const waves = [...new Set(c.b.towers.map((T_) => T_.wave || 0))].filter((w) => w > 0);
    waves.forEach((w) => { events.push({ f: c.hit + w, amp: SHAKE_AMP[c.i] * 0.34, decay: 2.6, freq: 0.7, seed: c.i * 7 + w }); ringEv.push({ f: c.hit + w, x: c.X, z: -140, k: 0.55 }); });
  });

  // ───────────── type: name rise ─────────────
  const riseFrames = 6;
  const nameRise = (c, t) => {                                              // 0 = hidden under the ground, 1 = locked; lands exactly on the downbeat, then a tiny kick
    if (t < c.hit) return EASE.inCubic(clamp((t - (c.hit - riseFrames)) / riseFrames));
    const dt = t - c.hit; return 1 + 0.045 * Math.exp(-dt / 1.7) * Math.sin(dt * 1.6);
  };

  // ───────────── blur budget ─────────────
  function K(f) {
    let k = 3;
    for (const c of cities) {
      if (f >= c.w0 - 0.6 && f <= c.hit) { const sp = Math.max(camera.whipSpeed(f - 0.25, c.w0, c.hit), camera.whipSpeed(f, c.w0, c.hit), camera.whipSpeed(f + 0.25, c.w0, c.hit)); k = Math.max(k, 4 + Math.round(sp * 28)); }
      if (f >= c.hit - 1.5 && f <= c.hit + 3.5) k = Math.max(k, c.i === 0 ? 20 : 14);
    }
    const c0 = cities[0]; if (f >= c0.hit && f < c0.hit + 6) k = Math.max(k, Math.round(22 * (1 - (f - c0.hit) / 6)) + 4);
    return Math.min(k, 32);
  }

  return {
    id: 'act4', start: START, end: END,
    samples: K,
    update(t) {
      const env = ctx.env, cam = ctx.cam;
      kits.world.preset(env, 'city');
      env.sun = { az: -46, el: 33, intensity: 1.62, dir: null };
      env.ambient = { up: 0.60, down: 0.38, bounce: 0 };
      env.fog = { density: 0.00012, height: 450, floorY: 0, air: 0.00001 };
      env.ground = { albedo: [0.47, 0, 0] };
      const P = poseAt(t);
      const sh = shake(t, events, { rollScale: 0.35 });
      cam.set({ pos: P.pos, look: P.look, fov: P.fov, roll: P.roll, near: 2, far: 60000 }); cam.shake = sh;
      // shadow volume follows the action
      env.shadow = { on: true, center: [P.look[0], 60, -180], radius: 640, size: 2048, bias: 0.0005, normalBias: 1.0 };
      // visibility: only the cities near the camera are drawn
      for (const c of cities) {
        const near = Math.abs(P.pos[0] - c.X) < D * 0.78;
        c.b.group.visible = near;
        if (near) {
          const e = nameRise(c, t), travel = c.planeH + c.N.yb + 40;
          c.N.mesh.position.y = c.N.yc - travel * (1 - e);
        }
      }
      // rings: displaced fog bursting off the ground at every landing
      const rings = [];
      for (const r of ringEv) { const dt = t - r.f; if (dt >= 0 && dt < 14) rings.push({ x: r.x, z: r.z, r: 30 + dt * 85, w: 7, tail: 80, k: r.k * (1 - dt / 14), dt }); }
      rings.sort((a, b) => a.dt - b.dt); env.rings = rings.slice(0, 4);
    },
    overlay(t, g) {
      let drawn = false;
      for (const c of cities) {
        const nm = c.nm; if (!nm.latin) continue;
        if (t < c.hit - riseFrames || t > c.holdEnd + 0.5) continue;
        const e = clamp(nameRise(c, t), 0, 1.02), P = S2.projectToScreen(ctx, tmpV, [c.X + c.N.nx, 0, 40]);
        if (P[0] < -400 || P[0] > 2320) continue;
        const size = 40, y = c.b.def.label.y;
        g.save(); T.clipRect(g, P[0] - 700, y - size * 1.1, 1400, size * 1.5);
        T.draw(g, nm.latin, { x: P[0], y: y + (1 - e) * size * 1.5, size, weight: 800, stretch: 100, track: 0.46, align: 'center', fill: '#fff' });
        g.restore(); drawn = true;
      }
      return drawn;
    },
  };
}
