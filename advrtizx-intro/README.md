# DOMINANT: AdvrtizX intro (60 s, 1920x1080, 30 fps, 1800 frames)

A real-3D film rendered from code: three.js (WebGL2, software SwiftShader) driven frame by frame from headless Chromium, piped to ffmpeg. No GPU needed. Spec: `TREATMENT.md`. Sync: `cue_sheet.json`. Scene authoring: `film/SCENE_API.md`.

## Setup (once; vendored output is committed, so a fresh clone already renders)
```
npm install && node tools/setup.mjs     # re-vendors three, fonts, logo assets
```
Needs Node 22, ffmpeg, and Playwright resolved from the global npm root with the headless shell at `/opt/pw-browsers/chromium_headless_shell-1194` (never `playwright install`).

## Commands (run from `advrtizx-intro/`)
```
node tools/probe.mjs                                          # WebGL2 renderer string + ms/frame
node tools/stills.mjs --acts 1 --frames 0,3,12,72,127         # final-quality PNGs -> out/stills/   (--scale 0.5 --k 1 = fast draft look)
node tools/stills.mjs --frames 288 --probe "960,540;40,40"    # print sRGB samples
node tools/contact.mjs                                        # 6x6 key-frame sheet -> renders/contact-sheet.png
node tools/render.mjs --draft                                 # half-res, K=1 -> renders/advrtizx-intro-draft.mp4
node tools/render.mjs --draft --from 0 --to 127 --acts 1 --out out/act1.mp4
node tools/render.mjs --final                                 # 1080p, motion blur, grain -> renders/advrtizx-intro-1080p.mp4 (muxes audio/out/score.wav if present)
node tools/qa.mjs                                             # flat red == (232,1,1); every crown profile == the logo path
node tools/lint.mjs                                           # determinism lint (no Math.random/Date/rAF/timers)
node tools/bench.mjs [--final]                                # worker scaling
```
Render flags: `--from/--to`, `--acts`, `--workers N`, `--k N` (force sub-frames), `--kmin/--kmax`, `--crf`, `--preset`, `--maxrate/--bufsize` (bitrate cap keeps the 1080p file under 95 MB despite grain), `--audio FILE|none`, `--strict`. Final: libx264 slow, crf 17, maxrate 10M, yuv420p, bt709 tags, AAC 320k 48 kHz. Per-frame timings land in `out/render-stats.json`. Chunked rendering for long finals: render ranges to separate files with `--from/--to` and join them with ffmpeg's concat demuxer (`-c copy`).

## Layout
`film/engine` renderer, camera rig, env, shaders, cues, util · `film/kits` logo, towers, city, world, type · `film/scenes/act1..act9.js` one file per act · `film/dev` kit tests · `film/fonts` Mona Sans Variable + Noto Black faces (SIL OFL) · `film/vendor` three r186 · `tools` pipeline · `assets` mark.svg, 3.png, 4.png · `audio/` score (separate).

## Engine in one paragraph
`window.seek(f)` is a pure function of time (fractional OK). Per frame K sub-frames are rendered across a 180-degree shutter (K chosen by each scene), every one MSAA-4, jittered, shadowed (one hard key shadow map), optionally with a planar floor/water reflection and a 2D overlay composited inside the pipeline, accumulated in float32 linear light; post adds a palette-safe vignette and grain and does the one sRGB encode, so sky and fog read exactly (232,1,1) (end card with grain 0: exactly #E80101).
