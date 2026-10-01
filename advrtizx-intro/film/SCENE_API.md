# DOMINANT · SCENE API (frozen)

You build **one act** on this engine. Rules of the road:

- You own `film/scenes/actN.js` (and any helper files you add next to it, e.g. `film/scenes/lib_xxx.js`). **Never edit** `engine/`, `kits/`, `main.js`, `index.html`, `scenes/index.js`, `tools/` or another act's file. If you need a core change, ask the core owner; core changes from now on are additive only.
- A scene is a **pure function of time**. `window.seek(f)` can be called for any frame, in any order, any number of times, and must give the identical picture. No `Math.random`, `Date`, `performance.now`, `requestAnimationFrame`, CSS animation, or state that survives between `update` calls. Use `ctx.rng(seed)` (seeded) and `util.noise1/hash01`. `npm run lint` greps for these.
- Colour rule (the look is **RED ATMOSPHERE**): only brand red `#E80101` = **(232,1,1)**, white, and the tones that lighting and fog mix between them. No black, no grey, no other hues. No glow, bloom, lens flare, bokeh, particles, HUDs. Never an X motif, map, street grid, globe, dimension string, split-flap, sun/clock, stairs, door/phone frame. Nothing collapses, falls over, breaks; no aircraft, no debris.
- Hit frames in `cue_sheet.json` are the sync contract with the score. Visual events **must** land on exactly those integer frames. Read frames with `ctx.cue('a3.land01')`, never hard-code.

## 1. See your work (stills in seconds)

```sh
cd advrtizx-intro
node tools/stills.mjs --acts 3 --frames 256,260,264,288 --scale 0.5 --k 1     # draft look: half-res, no blur (fast)
node tools/stills.mjs --acts 3 --frames 288,376,380                          # final look: 1080p, motion blur, grain
node tools/stills.mjs --acts 3 --range 256-383 --step 8 --scale 0.5 --k 1    # every 8th frame
node tools/stills.mjs --acts 3 --frames 288 --probe "960,540;40,40"          # prints sRGB avg/min/max at points (colour checks)
```
PNGs land in `out/stills/fNNNN.png` (`--out DIR`, `--prefix NAME`). **Look at them** (open the PNG). `--acts 3,4` loads only those scene files, so another agent's broken file cannot break your stills; omit `--acts` to load all nine. Boot takes ~2 s; the first frame compiles shaders (a few s); later frames are faster.
Draft video of a range (needs `ffmpeg`, no audio unless `--audio`): `node tools/render.mjs --draft --acts 3 --from 256 --to 383 --out out/act3.mp4`.
A dev scene (kit test, not part of the film): `film/dev/NAME.js`, run with `--dev NAME --acts none --q "city=london"`.

## 2. The scene contract

`film/scenes/actN.js` default-exports a **factory** (or an array of factories if you want several scenes in one file; they register in array order):

```js
export default function act3(ctx) {
  const { kits, util, camera, THREE } = ctx;
  // ---- ONE-TIME SETUP: build geometry, text planes, towers. Add 3D objects to ctx.root (this scene's own THREE.Group). ----
  const city = kits.city.build('dubai', { hero: { x: 0, z: 0, w: 100, d: 58 }, t0: ctx.cue('a3.land01') });
  ctx.root.add(city.group);
  const ground = kits.world.makeGround(); ctx.root.add(ground);
  return {
    id: 'act3',
    start: 256, end: 383,                 // INCLUSIVE frame range. Scenes may overlap (transitions). Later-registered scenes win camera/env writes.
    update(t) {                           // t = global frame, FRACTIONAL (motion-blur sub-frames). Set ALL state from t. Called once per sub-frame.
      kits.world.preset(ctx.env, 'city');   // start every update by (re)setting env; the engine resets it to defaults before each sub-frame anyway
      ctx.cam.set({ pos: [0, 40, 600], look: [0, 150, 0], fov: 46 });
      ctx.cam.shake = util.shake(t, impacts);
    },
    overlay(t, g) { /* optional: 2D type, 1920x1080 logical px. return false if nothing drawn at t */ },
    samples(t) { return t >= 376 ? 24 : 8; },   // optional: motion-blur sub-frames at t (1..32). The engine takes the max over active scenes.
  };
}
```

- `async` factories are fine. Everything created in the factory runs once at boot (fonts are already loaded, `kits.logo.loadMark()` already awaited, cues loaded).
- `t` may be slightly outside `[start,end]` (-0.25 / +0.25 frame, the shutter) and is fractional. Clamp progress with `util.prog/clamp`; never index arrays with `t` directly.
- Your group `ctx.root` is **visible only while the scene is active** (`start <= f < end+1`). Objects not under it never get hidden: put everything under `ctx.root` (or call `ctx.gate(obj)` for view-gated objects, section 7).
- **State rules:** before every sub-frame the engine resets `ctx.env` (top-level sections replaced by fresh defaults), `ctx.cam` (`reset()`), and `ctx.views = null`; then runs `update(t)` of every active scene in registration order. So: set camera and env **every call**; do **not** cache `ctx.env.fog` etc. across calls (re-read `ctx.env` inside `update`). Object transforms/uniforms you set on your own meshes persist but must also be set from `t` every call.
- Use `ctx.cue('id')` / `ctx.cueFrames('a1.hit')` / `ctx.cues('a3.')` (from `cue_sheet.json`, entries `{frame,id,act,desc}`). Unknown ids throw, so a typo is loud.

### `ctx` reference
`THREE`, `renderer`, `engine`, `U` (shared uniforms, advanced), `W,H` (render px), `scale`, `aspect`, `FPS=30`, `FRAMES=1800`, `root`, `cam` (CameraRig), `env`, `views` (get/set), `makeCam()` (a new CameraRig), `rng(seed)` (seeded PRNG: `rng()`, `.range(a,b)`, `.int(a,b)`, `.pick(arr)`, `.chance(p)`, `.gauss()`), `gate(obj)`, `defaultEnv()`, `util`, `camera`, `cue`, `cues`, `cueFrames`, `hasCue`, `allCues`, `kits = {logo, towers, world, type, city}`.

`ctx.util` (from `engine/util.js`): `clamp lerp invLerp remap smoothstep smootherstep mix fract DEG` · eases `EASE.{linear, inQuad..inOutQuint, inOutSine, inExpo, outExpo, inOutExpo, inCirc.., outBack, cine, glide, surge, snap, whip, slam}`, `bezier(x1,y1,x2,y2)` (true cubic-bezier), `outBack(s)`, `spring(freq,damp)`, `prog(t,a,b,ease)` (eased 0..1), `tween(t,a,b,from,to,ease)` (numbers or arrays), `track([[f,v,ease?],...])` (keyframes; the ease on a key is for the segment arriving at it), `spline([[f,vec3],...])` (Catmull-Rom path through many keys) · random `makeRng`, `hash01(i,seed)`, `noise1(x,seed)`, `fbm1` · shake `shake(t, events, opts)`, `rumble(t,a,b,amp0,amp1,opts)`, `addShake(...)` · colour `RED_LIN`, `BRAND_RED_255`, `redWhite(k)` (linear tone red→white), `deepRed(s)`.

## 3. Camera

`ctx.cam` is a plain object you overwrite each update:

```js
ctx.cam.set({ pos:[x,y,z], look:[x,y,z], fov:40 /*vertical deg*/, roll:0 /*deg*/, near:1, far:80000, shift:[0,0] /*lens shift, fraction of frustum*/, ortho:0 /*1 = true orthographic*/, orthoHeight:100 /*m visible when ortho=1*/ });
ctx.cam.shake = util.shake(t, [{f: ctx.cue('a3.land01'), amp: 1.2 /*deg*/, decay: 3 /*frames*/, freq: 0.55}, ...]);   // deterministic, hard pitch kick then noise
```
Helpers (`ctx.camera`): `orbit(center, radius, azDeg, elDeg) -> [x,y,z]`; `whip(t,a,b)` -> 0..1 eased (dead start, violent middle, dead stop) and `whipSpeed(t,a,b)` -> 0..1 (peak mid-whip; use it for roll kicks and FOV punch); `dollyZoom(p, {h, fov0, fov1}) -> {fov, dist}` keeps the visible height `h` (m) at the subject constant while the lens goes fov0→fov1 (move the camera back `dist` m from the subject); with fov1 ≤ 1.5° the image is orthographic for practical purposes and you set `ortho:1, orthoHeight:h` on the last frame(s); `distForHeight(height, fov)`.
Motion rules: real eases (`EASE.cine`, `glide`, `whip`) not linear moves; every impact gets `shake`; a whip = `samples(t) >= 24` + `whip()` + a few degrees of roll.
World: +y up, metres, the camera usually looks toward −z. Rendering is perspective with a real lens (24–35 mm feel = fov 50–65 for scale, 15–25 for compression).

## 4. Environment (`ctx.env`) and world presets

```js
kits.world.preset(ctx.env, 'hero' | 'city' | 'world' | 'flat' | 'red');
ctx.env.sun     = { az: -34, el: 36, intensity: 1.42, dir: null };      // az: degrees from +z toward +x; negative = from the camera's left when it looks to -z; dir:[x,y,z] overrides
ctx.env.ambient = { up: 0.80, down: 0.50, bounce: 0.0 };                // multiples of brand red. `up` lowers = deeper red shade sides
ctx.env.fog     = { density: 0.0010, height: 220, floorY: 0, air: 0.00006 }; // exponential HEIGHT fog (density 1/m at floorY, scale height m) + constant `air` term. Fog colour is always brand red
ctx.env.shadow  = { on: true, center:[0,0,0], radius: 900, size: 2048, bias: 0.0005, normalBias: 0.7 }; // one hard key shadow map covering a sphere: keep radius as small as the shot allows (texel = 2*radius/size)
ctx.env.rings   = [{ x, z, r, w: 8, tail: 60, k: 1 }];                  // ground shock rings (displaced fog), max 4; animate r and k from t
ctx.env.ground  = { albedo: [0.50, 0, 0] };                              // linear
ctx.env.post    = { grain: 1.0, vignette: 0.45 };                        // grain 0 + vignette 0 => EXACT flat red (end card). `flat` preset does this
```
Look: sky/fog = exactly (232,1,1). White = lit surfaces. Shaded sides = deeper red (ambient). Everything dissolves into fog red with distance. The key is a **hard** white directional light: faces toward it go white, faces away go to the red ambient. Verify colours with `--probe`.
Presets: `hero` (Act I), `city` (skylines, fog thin enough to read towers at 1 km), `world` (far rows dissolve in layers, shadows off), `flat` (no fog/shadow/grain: type slams and the end card).

## 5. Motion blur (`samples`)

The engine renders K sub-frames across a 180° shutter centred on the frame (t ± 0.25) and averages them in linear light. You choose K per frame: `samples(t)` returns an integer 1..32 (engine takes the max over active scenes, and in final mode renders at least 4 jittered sub-frames anyway for antialiasing). Guide: static hold 1–4; slow crane 4–6; slam/impact frames 12–16 (and the frame before); whip-pans 24–32; full-frame type slams 8–12. Every extra sub-frame costs a full scene render, so do not use 32 everywhere. `--k N` forces K for a still (e.g. `--k 1` for fast draft stills).

## 6. Kits

### 6.1 `kits.towers`: `TowerSet` (the workhorse) and `JackTower`
Thousands of towers in a handful of draw calls. Rise/land is animated **on the GPU** from the global time, so you only declare timing:
```js
const set = new kits.towers.TowerSet({ lod: 0 /*0 exact crowns, 1 mid, 2 far*/, shadow: true });
set.add({ x, z, w: 40, d: 36, h: 220,            // footprint (m), shaft height. y = base elevation (default 0)
          crown: 'A',                              // 'A' | 'Am' (mirrored) | 'Dd' (D as a dome) | 'Ds' (D, arc right) | 'Dsm' (arc left) | 'S' (sphere) | null
          crownScale: 1,                           // 1 = crown exactly as wide as the shaft
          t0: 240, dur: 12, ease: 'slam',          // shaft starts rising at frame t0 for dur frames. ease: 'slam' | 'out' | 'back' | 'linear'. Default: already risen
          mode: 'slide',                           // 'slide' rigid rise from underground | 'grow' extrude up
          drop: 120, dropDur: 4, land: 256,        // crown falls from 120 m and TOUCHES DOWN exactly on frame `land` (integer). Without drop the crown rides the shaft
          riseH: 0, pitch: 4.2, rot: 0 });         // riseH: stacked tiers share t0/dur and riseH = total stack height. pitch: floor pitch (m). rot: radians about y
set.build(); ctx.root.add(set.group);   // new TowerSet({ reflect: 0.5 }) adds a glossy-floor/water reflection (see 6.3)
set.landings()   // [{f, x, z, h}] crown touch-down frames: drive camera shake, ground rings, audio-sync checks
set.addPrism(geometry, spec)   // custom extruded prism that rises (geometry from kits.logo.extrude with metres; see city.js bridges)
```
Crown geometry is the **exact logo profile** (fillets R7.5/R10.8, the r21.2 arch bite, true semicircle D) extruded; crown width = shaft width × crownScale. Nothing falls over: the only "fall" is a crown dropping onto its shaft. Group transforms (`group.position/rotation.y/scale`) are honoured, so you can offset cities along a strip or into panels. Facade lines fade with distance on their own; per-tower cost is ~zero.
`JackTower` (Act I): jack-up construction (a stack lifted one module per hit). `new JackTower({x,z,w,d,crown,hits:[frames],modules:[m per hit],dur,pitch}); hero.update(t, lift)`; `hero.top(t)`; `kits.towers.jackModules(n,total,{first,growth})`. Act I exports `ACT1_END` (hand-off pose, section 10).

### 6.2 `kits.city`: seeded skylines and the 10 signature presets
```js
const c = kits.city.build('london', {
  seed: 'london', hero: null | {x,z,w,d} /*keep clear*/, t0: ctx.cue('a4.london') /*frame ring/sweep 0's crowns LAND*/, step: 8 /*frames between waves*/,
  schedule: { mode: 'rings'|'sweep'|'random'|'instant', center:[x,z], dir:[1,0], ringW: 100, rise:[9,15], drop:[90,150], dropDur: 4, jitter: 0, span: 48 },
  lod: 0, origin: [x,z], rot: radians, scale: 1 });      // origin/rot/scale place the whole city (group transform)
ctx.root.add(c.group);          // towers + water
c.landings()                    // [{f,x,z,h}] in WORLD coordinates (honours origin/rot/scale)
c.signature                     // named hero elements: dubai.sail, london.shard/dome, singapore.skybridge, riyadh.void/sphere, sydney.sails/bridge, tokyo.mast ...  {x,z,h} local coords; c.toWorld(x,z)
c.nameAnchor                    // [x,y,z] spot behind the skyline in the fog for the city-name type plane (local coords)
c.center, c.extent, c.bounds, c.specs, c.set (TowerSet), c.water (meshes)
kits.city.generate({ seed, region:{x0,x1,z0,z1}, cell, p, hmin, hmax, hfun, keepOut, w:[a,b], crowns:{A:.3,...}, centerBias })  // raw seeded filler -> specs
kits.city.schedule(specs, opts)                    // assign t0/dur/land/drop to any specs
kits.city.presets.NAME / kits.city.NAMES           // dubai london newyork singapore mumbai miami sydney riyadh hongkong tokyo (+ 'generic')
```
Presets look toward −z from +z. Every tower is crowned with one of the monogram shapes. Crown landings are integer frames, so they can sit exactly on cue frames; `step` lets you land waves on the 8-frame grid.

### 6.3 `kits.world`
`makeGround({radius,y,tint})` (receives shadows, shock rings, fog), `makeWater({x0,x1,z0,z1,y})`, `makeRiver(points,width)`, `makeBay(cx,cz,r)` (deep red with white sun glints; water sits 0.25 m above the ground plane), `preset(env,name)`, `presets`.
**Reflections (opt-in, additive):** `new TowerSet({ reflect: 0.5 })`, `new JackTower({ reflect: 0.46 })` or `kits.city.build(name, { reflect: 0.7 })` render a mirrored twin of the towers into a reflection target that the ground and water shaders sample (fresnel-ish strength, fogged along the reflected ray, rippled on water). It costs a second geometry pass, so use it on hero shots and water cities, not on 64 panels. The ground/water must be in the frame to show it. Act I uses it for the glossy floor.

### 6.4 `kits.type`: type (2D slams and 3D planes)
Display = **Mona Sans Variable** (weight up to 900, width 75–125%), scripts = Noto Black (Kufi Arabic, Devanagari, Thai, SC/JP/KR, Noto Sans for Cyrillic/Greek). All text goes through the browser's text engine, so Arabic joins and Indic conjuncts shape correctly. **Every face is loaded before the first frame.** Script is auto-detected (Han → SC; pass `lang:'ja'|'ko'|'zh'` to force). Letter-spacing is ignored for Arabic/Indic/Thai (it breaks shaping).
```js
// 2D (inside overlay(t, g)): coordinates are 1920x1080 logical px, baseline y.
kits.type.draw(g, 'WE SELL THEM.', { x: 960, y: 640, size: 220, weight: 900, stretch: 112.5, track: -0.035, align: 'center', fill: '#fff', maxWidth: 1700, lang?, alpha? });
kits.type.drawLines(g, ['EVERY SKYLINE', 'STARTS WITH AN'], { x, y, size, lineHeight: 0.92, ... });
kits.type.measure(text, opts) -> {width, ascent, descent}; kits.type.clipRect(g, x, y, w, h)  // masks ("rises out of a mask")
kits.logo.draw(g, { x, y, height: 400, anchor: 'center'|'topleft'|'baseline-left', fill: '#fff', parts: 'AD'|'A'|'D', fillA, fillD, alpha }) // the EXACT mark (Path2D from mark.svg)
// 3D: a plane of type standing in the world (fogged, depth-tested: towers occlude it, the fog dissolves it)
const p = kits.type.plane('دبي', { worldHeight: 260 /*or worldWidth*/, weight: 900, stretch: 112.5, track: -0.03, lines?: [...], tint?: [r,g,b linear], fogAmount: 1, opacity: 1, lit: false });
p.mesh.position.set(x, y, z); p.mesh.rotation.y = ...; p.mesh.scale; p.setOpacity(v); ctx.root.add(p.mesh);
```
Hero type never limply fades in: it slams (overlay scale/translate with `EASE.snap`/`slam` + samples ≥ 8), rises out of a `clipRect` mask, or is revealed by architecture (a plane behind towers). Uppercase Latin, tight tracking (`track` −0.02…−0.05), massive. SOLD boards are red letters on white boards (`fill:'#E80101'` on a white rect). Overlay text is composited **inside** the pipeline per sub-frame, so blur and grain apply to it uniformly.

### 6.5 `kits.logo`
`MARK` (numbers), `markPolys()` (A and D as exact CCW polygons in MARK SPACE: origin = viewBox centre, +y up, height 100; for envelopes, `markContains('A'|'D'|'AD', x, y)`), `profile(kind)`, `crownGeometry(kind, lod)`, `extrude(pts, {holes, smoothDeg})`, `path2D('A'|'D')`, `draw(g, opts)`, `markBox(height)`. mark.svg: A = counterless half-A (3:4 slope = 53.13°, R7.5 / R10.8 fillets, r21.2 arch bite), D = 44.1 rect + r50 semicircle, 7.6 slot. Brand red `#E80101`.

## 7. Views (split screen, Act V)

```js
const panels = ctx.views = [ { rect: [0, 0, 0.5, 1],        // x,y,w,h as fractions of the frame, origin TOP-left
                               cam: camLeft,                 // a CameraRig (ctx.makeCam()) for this panel
                               only: [groupLeft, ground],    // objects to show in this panel (must be registered with ctx.gate(obj)); others are hidden for this view
                               env: { fog: { density: 0.002 }, shadow: { on: false } },  // optional partial env override for this panel
                               bg: [r,g,b] /*linear clear colour, default brand red*/ }, ... ];   // set ctx.views EVERY update
```
Register each panel's group once with `ctx.gate(group)`. Each view renders its own shadow pass (turn shadows off or use `shadow.size: 512` for many panels). Panel borders/gutters: draw them in `overlay()` or leave 1–2 px gaps with `bg`. Budget: 64 panels x ~300 towers is fine; 64 panels with shadows on is not.

## 8. 2D overlay details
`overlay(t, g)` is called per sub-frame **after** the 3D pass; `g` is a 2D context pre-scaled to 1920×1080 logical px and cleared transparent. Return `false` if you drew nothing (saves an upload). Use it for full-frame slams, SOLD boards in 2D, the end card, the AD logo drawn with `kits.logo.draw`. Colours: only `#fff` and `#E80101` (and `rgba` of them). Large type is cheap; avoid giant blurs or `shadowBlur`.

## 9. Performance rules (SwiftShader, 4 cores, no GPU)
- Budget per sub-frame at 1080p is roughly 0.5-1.5 s for a heavy skyline; final frames cost `K x` that. Plan K accordingly: a 1-second whip at K=24 is 30 x 24 = 720 scene renders.
- Instance counts: up to ~20,000 towers per scene is OK; prefer `lod: 1/2` (cheaper crowns) for far/small towers (e.g. panels, Act VII rows). One `TowerSet` = ~3 draw calls; do not create hundreds of sets in `update`. Build in the factory, animate by time.
- Shadows: one 2048² map per sub-frame (cheap: depth-only). Keep `shadow.radius` tight; turn shadows **off** for pull-backs/far views (`preset 'world'`).
- Overdraw: the ground is a single disc. Do not stack hundreds of transparent type planes.
- Never allocate big objects in `update` (it runs K x frames times). Never build textures in `update` (the type kit caches by content, but build planes in the factory).
- Large-scale numbers are fine (km): the camera is float32 with near=1/far=80000; raise `near` for high-altitude shots (z-fighting ≈ d²/(near·2²⁴)).

## 10. Hand-offs and shared facts
- **Act I → II**: Act I ends at f127 with one tower alone in the red void: hero tower at the origin, shaft top at y=900, crown 'A' (width 100 m, depth 58 m) on top, total ~986 m; at f127 the camera is ~330 m out (azimuth −40°) at y≈1135 looking down at the crown. `import { ACT1_END } from './act1.js'` has the numbers; for an exact match, copy the camera expressions at the bottom of `act1.js`. Continue the move from that pose; the first frame of Act II must be the continuation, not a cut.
- Hero tower dims (Acts II, III, V, VI): shaft 100 × 58 m, 900 m tall, A-crown 86 m. Key light from the camera's left-front (`sun.az −34..−40, el 31..38`). Keep this consistent so the world reads as one place.
- The audio score lives in `audio/` (other agent). Frames in `cue_sheet.json` are final; if you need a new cue, ask the core owner.

## 11. Rendering the whole film
`node tools/render.mjs --draft` (half-res, K=1, all acts, mux score.wav if present) → `renders/advrtizx-intro-draft.mp4`. `node tools/render.mjs --final` → `renders/advrtizx-intro-1080p.mp4`. Ranges: `--from 640 --to 895`. See `README.md`.

## 12. Troubleshooting
- Black/blank frame or `FATAL` in the stills output: open `window.__fatal` text printed by the tool; a GLSL error prints the shader log with line numbers.
- `SCENE ERRORS:` lists scene files that threw while loading (the rest still render).
- Colours wrong? `--probe x,y` should show the sky as `232,1,1` ±1. Tinted by fog? Lower `env.fog.density`/`air`.
- Towers invisible at `t` early: their `t0` has not started (they are hidden until then, by design). Use `landings()` to see when things appear.
- Text blurry: `kits.type.plane` caps texture size at 8192 px; shorten the string or raise `worldHeight`/lower `size`.
