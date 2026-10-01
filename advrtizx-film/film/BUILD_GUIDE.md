# TRUE ANGLE: build guide for shot builders

The creative spec is `../TREATMENT.md`. This file covers how to build a shot that fits the engine. Plain HTML + SVG (+ canvas only when needed) + vanilla JS. No frameworks and no build step.

## 1. Commands

```sh
# preview (file:// works; so does any static server, e.g. `serve film`)
film/index.html?play              # whole film in real time, loops. Space = play/pause, ←/→ = 1 frame, Shift = 1 beat
film/index.html?shot=S07          # loop one shot
film/index.html?f=420&grid        # one frame, with the 60px module grid, the safe area and the centre
film/index.html?play&audio        # also plays ../public/audio/score.wav in sync (preview only)

# render (from advrtizx-film/)
node render.mjs --stills "0,90,420"                          # full-res PNGs → out/stills/fNNNN.png
node render.mjs --from 720 --to 899 --scale 0.5 --out out/s07.mp4   # draft of one shot
node render.mjs --scale 0.5 --audio public/audio/score.wav   # whole-film draft, about 25 s (13 ms/frame)
node render.mjs --audio public/audio/score.wav               # final: PNG frames, H.264 CRF 16, AAC 320k → out/true-angle.mp4
```
Other flags: `--workers 4`, `--format png|jpeg` (the default is png at full res and jpeg q95 for drafts), `--crf`, `--preset`. Full res runs at about 50 ms/frame with 4 workers, so the whole film takes about 1.5 min.

## 2. Shot API

```js
// shots/s05.js — replace the TA.placeholder('S05') call
(function () {
  const { registerShot, SPEC, text, rise, exit, prog, EASE, C } = TA;
  registerShot({
    ...SPEC.S05,                       // id, start, end (inclusive, treatment §4), name, bg
    // end: 545,                       // extend the range for an overlap; later files draw on top (or set z)
    render(lf, ctx) {                  // lf = f − start. It can be fractional (motion-blur subsamples).
      const f = ctx.f;                 // global frame, so treatment frame numbers can be used directly
      const p = prog(f, 458, 466, EASE.SET);
      return rise(text('Nobody', { x: 180, y: 500, voice: 'card', size: 160, fill: C.WHITE }), { p, baseline: 500, size: 160 });
    },
  });
})();
```
- `render` returns SVG markup (a string or an array of strings) for the shot's own `<svg viewBox="0 0 1920 1080">`, or `undefined` if it drew into `ctx.svg` or the canvas itself.
- `bg`: `'RED' | 'WHITE' |` css colour `| (lf, ctx) => colour`. If omitted the layer is transparent. The stage underneath is white.
- `ctx`: `{id, start, end, len, f, spec, layer, svg, canvas()}`. `ctx.canvas()` returns a fresh, cleared, DPR-aware 2D context that sits below the svg. Core resets `ctx.layer.style.transform/opacity/background` on every frame. Use it for the S04 fold: `ctx.layer.style.transform = TA.fold.css(deg)`.
- An inactive shot is hidden. `seek(f)` renders every shot whose `[start, end]` contains f.

## 3. Coordinates and cameras

- Stage 1920×1080 px, y down. Module M = 60, safe margin 120, headline x 120, red card x 180, baseline grid 12.
- World units are **MU** (mark height 100). Origin = the A's sharp bottom-left vertex at (0,100). `TA.MARK` holds every number in §2.1.
- `cam(s, W, P)` follows the treatment's `cam(s, W→P)`: `screen = P + s·(world − W)`. Presets are in `TA.CAMS`: `ACT1` (4.8, (0,100)→(660,780)), `PLAN_WIDE`, `PLAN` (6.4), `SUN` (12), `BUYER` (5.4), `DOOR` (30), `HERO` (3.6).
- Moves: `camTween(f, [a,b], camA, camB, ease)` interpolates log(scale). With the same W, P travels. With the same P, W travels. Otherwise A's W slides linearly on screen. `camZoom(cam, k, about)` is a screen-space push (S02 1.00→1.03 about (961,540)).
- **Line weights are screen px** (`TA.LW`) and never scale with the camera. Draw world geometry by passing `cam` to `path / drawMark / drawPlan`. These transform the geometry into screen space, so strokes stay exact and crisp. Poché is the exception: it is world MU × `cam.s`.
- Labels are world-anchored and screen-sized: `const p = cam.apply([x, y]); text(..., {x: p[0], y: p[1]})`.
- Depth is used once (S04): `fold.css(deg, {hingeY: 780, perspective: 2000, vp: [960,540]})` for a layer, or `fold.project(pt, deg)` / `fold.segs(segs, deg)` for crisp projected linework. A positive deg tilts the part above the hinge away from the viewer.

## 4. Handoff contracts (the last frame of Sxx must equal the first frame of Sxx+1)

A move that ends exactly on a boundary completes **on the next shot's first frame**: tween over `[a, nextStart]`, and the next shot renders the end pose. Check every boundary with `--stills "119,120,239,240,…"`.

| Boundary | Type | Element and pose that must match |
|---|---|---|
| S01 119 → S02 120 | continuous | Full grid. Rope pegged as a 3‑4‑5 (4px RED, round caps, knot ticks 14×3) at V0 (660,780), V3 (1020,780), V7 (1020,300). 10px pegs, 24px right-angle marker, `3` `4` `5` (32px), `90°` (16px). ACT1 camera, push 1.00. |
| S02 239 → S03 240 | continuous | A outline 3px (fillets 7.5/10.8, **no notch**). RED_25 residue (legs, arc, cross, vertical). Dims `28'-2"` and `22'-5"`. Grid. Everything at `camZoom(CAMS.ACT1, 1.03, [961,540])`. |
| S03 329 → S04 330 | continuous | Hatch fully collapsed. Outline, dims, residue and grid at push 1.03. **S04 eases the push 1.03 → 1.00 inside the fold (f330–350, HINGE)** so the edge-on line lands at y 780, x 660–1262.4 as specced. |
| S04 449 → S05 450 | hard cut | None. S06 opens on the same canonical plan with S04's labels. |
| S05 539 → S06 540 | hard cut | None. |
| S06 719 → S07 720 | continuous | Plan at `CAMS.BUYER`. Labels are the S06 meaning set (*Sunday mornings, First coffee, Long dinners, Shoes off, Ten quiet minutes*) at **MEANING 34px** (S06 shrinks its 40px close-up labels to 34 during the f660–705 pull). PORCH stays MEASURE. Sun, path and wedge are gone (f710). Dims, stamp, north arrow and scale bar are the same on both sides. |
| S07 899 → S08 900 | continuous (end pose on f900) | Dive tween `[876, 900]`. f900 is RED \| WHITE slot x 846–1074 \| RED, full height (= `CAMS.DOOR`, poché 250 MU, **`cuts: 0`**, no labels). The door and glazing cuts must close before the flood, or white holes appear. |
| S08 1019 → S09 1020 | continuous | Slabs at x ≤ 656 and ≥ 1264 (a 608×1080 opening). Copy and dims gone (f1015). S09's card 0 is that blank opening. |
| S09 1169 → S10 1170 | continuous | Stop card complete: *Sunday mornings / face east.* (88px, x 696, baselines 200/290). `07:40` right-aligned at (1224,72). Horizon 2px at y 780, x 656–1264. Sun r 96, centre (1056,843), clipped above y 780. Spec line fully typed at (696,830). |
| S10 1349 → S11 1350 | white → white cut | S10 is fully white from f1342. S11 starts drawing on the plan from empty white at `CAMS.PLAN`. |
| S11 1499 → S12 1500 | continuous | Solid RED mark at `CAMS.HERO` (bbox x 564.5–1355.5, y 300–660, sharp vertex (537.5,660)). Nothing else on screen. |
| S12 1649 → S13 1650 | continuous | Same: the mark alone (annotations and lines gone by f1649). |
| S13 1799 | end | White mark on RED, `AdvrtizX` (x 565, baseline 800) and `AI-FIRST ADVERTISING FOR REAL ESTATE` (x 565, baseline 860). No fade. |

The plan must be **identical** in S04, S06, S07 and S11. Always draw it with `drawPlan(cam, opts)`. If the plan needs changing, change `TA.PLAN` / `drawPlan` in core, never inside a shot.

## 5. Core API (all on `window.TA`)

- **Tokens**: `C` (RED, WHITE, RED_40/25/12/06, WHITE_40), `LW` (ROPE 4, DRAW 3, DETAIL 2, HAIR 1.5), `GRID`, `SIZES`, `TIME`, `ACTS`, `SPEC`, `VOICE`, `MARK`, `PLAN`, `CAMS`, `SLOPE` (deg 53.13, dir, normal, comp 36.87).
- **Time**: `EASE.{DRAFT,SET,LIFT,HINGE,BRAKE,SCROLL,TAUT,SURVEY}` (true cubic-bezier solves), `easeInv`, `prog(f,a,b,ease)`, `tween(f,[a,b],[from,to],ease)` (numbers or arrays), `logTween`, `keys(f,[[f0,v0],[f1,v1,ease]…])`, `stagger(f,[a,b],i,step,ease)`, `beat(n)`=15n, `bar(n)`=60n, `onGrid`, `prng(seed)`, `hash01(a,b)`.
- **Geometry**: path segments `['M',x,y] ['L',x,y] ['A',r,large,sweep,x,y] ['Z']`. `markA({filletBL, filletTL, notch, notchCx/Cy/R, aDx})`, `markD({gap, dDx})`, `parseD`, `segsToD(segs, cam)`, `pathLength`, `pointAt(segs,t)→{p,ang}`, `trimSegs(segs,t0,t1)`, `arcSegs(c,r,a0°,a1°)`, `circleSegs`, `polySegs`, `lineSegs`, `tri345(V0,u)`, `slopeAt(t)`, `V.*` vector maths, `cam/camLerp/camTween/camZoom`, `fold`.
- **Markup**: `path(segs,{cam,draw,from,stroke,sw,fill,cap,join,dash,op,clip,mask})` (`draw`/`from` = stroke draw-on/off by exact trimming), `line`, `poly`, `circle`, `rect`, `g`, `clipTo`, `uid()` (deterministic ids for clipPath/mask).
- **Type**: `text(content,{x,y,voice,size,anchor,fill,op,rotate,track})`. Voices: `measure` (Plex Mono 500, +0.08em or +0.12em at ≤18px, tnum), `measureLong` (400), `meaning` (Instrument Serif Italic, −0.01em), `authority` (Archivo 700 wdth 112, −0.02em), `card` (800), `wordmark` (700, −0.015em), `cliche` (Playfair 400, +0.2em, S09 only). Pass runs `[{t:'they open is '},{t:'9:16.',voice:'measure',size:68}]` to switch voice mid-sentence. Text is never auto-uppercased (`square feet.` is lowercase MEASURE). `measure(content,opts)` returns the px width. `rise(markup,{p,baseline,size})` is SET via a mask rising from the baseline. `exit(markup,p,dy=-24)` is the ≤6f exit.
- **Primitives**: `drawMark({cam,parts,fill,stroke,sw,draw,from,poche,filletBL,filletTL,notch,notchCy,notchR,gap,aDx,dDx,op})`. `drawPlan(cam,{poche,pocheW,cuts,glazing,walls,doors,dims,north,scale,labels:'measure'|'meaning'|false|{KEY:text},labelSize,stamp})`: each group takes 0..1 draw progress. `planLabel(cam,key,kind,{text,size})`. `dimString(a,b,{offset,label,draw,knock})` (45° ticks 12px, 8px extensions, 6px knockout). `draftGrid(scaleFn)` with `slopeOrder(x,y)` for the 53.13° print order. `slopeWipe(p)→{x,d}` (S13, 2730px travel). `splitFlap(src,dst,lf,{rate,cycles,step})→[{ch,done,flipping}]` and `splitFlap.events(dst,opts)` (share them with the audio FLAPs).

## 6. Quality rules (non-negotiable)

1. **Deterministic.** `render(lf)` is a pure function of `lf`. Never use `Date`, `performance.now`, `Math.random` (use `prng`/`hash01`), CSS transitions/animations, async work, or state carried between frames. `seek` is called out of order by 4 parallel workers.
2. **No crossfades** unless the spec says so. Opacity is allowed only for construction lines retreating to tint and for exits of ≤6 frames. Cuts are cuts and land on beats.
3. **Overshoot < 2%.** None of the 8 easings overshoot. Do not add spring/back/elastic curves, wobble or rotation for its own sake.
4. **Vector-crisp.** Draw in SVG in screen space through the camera. Never CSS-scale or transform a raster except the S04 fold layer. Use canvas only where the spec needs it (S09 motion blur: average 16 subsamples of `render(lf + k/32)` with globalAlpha 1/(k+1)).
5. **Spec-exact.** Use the treatment's frames, coordinates, sizes and tokens. Only red/white tokens: no black, grey, gradients, shadows or glow. At most two type voices on screen (plan labels excepted). Directions are 0°, 90°, 53.13° and 36.87° only.
6. **Check your boundaries** (§4) with stills, and keep a full-res frame under about 40 ms of render time.
