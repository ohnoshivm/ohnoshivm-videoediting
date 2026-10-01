# TRUE ANGLE

A 60-second brand film for AdvrtizX (AI-first advertising for real estate). 1920×1080, 30 fps, 1800 frames, 120 BPM, red `#E80101` and white only.

**Final cut:** [`renders/true-angle-1080p.mp4`](renders/true-angle-1080p.mp4) · contact sheet: [`renders/contact-sheet.png`](renders/contact-sheet.png) · spec: [`TREATMENT.md`](TREATMENT.md)

## The concept in three lines

- The A's roof is a 3:4 slope (53.13°), the 3-4-5 triangle builders have used to set out a true right angle for 4,000 years.
- The mark's outline is also the floor plan of a home, and the notch in its base is a sun on the horizon.
- The film measures a home, then gives it meaning (*Sunday mornings face east.*), and ends on the agency's promise: every property has an angle, we find the true one.

## Preview

Open `film/index.html` in a browser (file:// works):

```
film/index.html?play           # whole film, real time, loops (Space play/pause, ←/→ one frame, Shift one beat)
film/index.html?play&audio     # with the score in sync
film/index.html?shot=S07       # loop one shot
film/index.html?f=420&grid     # one frame, with the 60px module grid and safe area
```

## Render

Needs Node, `playwright-core` (with a Chromium headless shell) and ffmpeg. Run from `advrtizx-film/`:

```
node render.mjs --audio public/audio/score.wav --out renders/true-angle-1080p.mp4   # final: 1080p, H.264 CRF 16, AAC 320k (about 1 min)
node render.mjs --scale 0.5 --audio public/audio/score.wav                         # half-res draft → out/
node render.mjs --stills "119,120,899,900"                                          # full-res PNG stills → out/stills/
```

Other flags: `--from/--to`, `--workers`, `--crf`, `--preset`, `--format png|jpeg`. Build rules for shots are in `film/BUILD_GUIDE.md`.

## Regenerate the score

```
python3 audio/score.py              # writes public/audio/score.wav (-14 LUFS, 60.000 s) plus stems, then verifies
python3 audio/score.py --no-verify
```

Needs Python 3 with numpy and scipy. Every hit is keyed to a frame (frame f = sample f × 1600); the full list is `audio/cue_sheet.md`.

## Credits

Everything is generated from code: the picture is plain HTML/SVG and vanilla JS (`film/`), and the score is synthesised with numpy/scipy (`audio/`). There is no stock footage, no stock imagery and no samples. Fonts: IBM Plex Mono, Instrument Serif, Archivo, Playfair Display (SIL OFL, `film/fonts/`).
