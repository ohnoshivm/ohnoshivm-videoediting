# AdvrtizX: "TRUE ANGLE"
60-second motion-graphics brand film · 1920×1080 · 30 fps · 1800 frames (0–1799) · 120 BPM · red and white only

---

## 0. The thing we found inside the logo (read this first)

Before writing anything we measured the mark from `assets/logo-red-on-white.png` (that file is the PNG source of truth; the fitted vector is `assets/mark.svg`, IoU 0.996 against the PNG). The measurements gave us the concept:

- **The slope of the A is exactly 3:4.** It runs 75 units across for 100 units up, so the angle is **53.13°**, the hypotenuse of a **3‑4‑5 triangle**. Builders have used that triangle for about 4,000 years to set out a true right angle: a rope with 12 knots, pegged at 3, 4 and 5.
- **The base of the A is 125.5 units, which is 5 × 25: the same length as that hypotenuse.** If you swing the roof slope down to the ground like a compass arm, it lands exactly on the A's right edge, which is also where the gap (the door) starts. **The roof's angle sets where the door goes.** The mark can be drawn with a compass and a straightedge.
- **The notch is a circle whose centre sits below the baseline** (r = 21.2, centre 13.9 below, only 7.3 showing). Geometrically it is **a sun just above the horizon**.
- **The D's curve is a true semicircle (r = 50, half the mark height).** Drawn as a plan, it is **a bay window.**
- **The gap is a full-height slot, 7.6% of the mark height.** Zoom in far enough and it is **a door left ajar.** Widen it to 9:16 and it is **a phone screen.**
- **The outline works as a building footprint.** Drawn as a floor plan, the A is the living wing with a slanted glass wall, the gap is the entry, and the D is the bedroom wing with an east-facing bay.

Every scene in this film comes out of those five facts.

---

## 1. Concept: TRUE ANGLE

In building, "true" means precisely square, set out with the 3‑4‑5 rope. In advertising, "the angle" is the idea that makes someone stop. AdvrtizX's mark contains both: its roof is a 53.13° slope from the oldest measuring rule in construction, and its outline is the floor plan of a home. The film starts by drawing a rope triangle and building the A by geometry. It then shows the cold way real estate is usually sold (square feet, spec sheets, sameness). Then the same floor plan is rewritten room by room, from dimensions into reasons ("BEDROOM 14'‑0" × 13'‑2"" becomes *Sunday mornings*), and rewritten again for each buyer, at each hour. That is the agency's intelligence, shown as copy precision instead of dashboards. Next we dive through the plan's entry slot. It becomes a door, the door becomes a 9:16 screen, and a scroll of interchangeable "LUXURY LIVING" ads brakes hard on the one ad that is *true*: *"Sunday mornings face east."* A staircase pitched at the same 3:4 ratio climbs the real-estate funnel to the keys. Finally we walk back into the plan we've been exploring. Its walls thicken until it is solid, and the apartment we've been in all film turns out to **be the AdvrtizX mark**. End line: **"Every property has an angle. We find the true one."** The film can't be re-branded because each step is derived from this logo's geometry: swap the logo and the rope, the compass swing, the door, the sun and the floor plan no longer make sense.

**Acts (frames):** I MEASURE 0–329 · II MEANING 330–899 · III THE DOOR 900–1349 · IV THE MARK 1350–1799

---

## 2. Visual system

### 2.1 Mark geometry (source of truth for every shot)
Units are **MU** (mark height = 100 MU). Origin = the A's *sharp* (pre-fillet) bottom-left vertex at (0,100). y points down; top edge y = 0, baseline y = 100.

| Element | Geometry (MU) |
|---|---|
| A body | sharp polygon (0,100) → (75,0) → (125.5,0) → (125.5,100). Slope exactly 3:4 (53.13°). BL fillet r = 7.5, TL fillet r = 10.8, right corners sharp |
| Notch | circle C(68.4, 113.9), r = 21.2, subtracted from A. Chord on baseline x 52.39–84.41, apex y = 92.7 |
| Gap | x 125.5 → 133.1 (7.6 MU) |
| D | rect x 133.1 → 177.2, plus semicircle C(177.2, 50) r = 50. Rightmost x = 227.2 |
| Visible bbox | x 7.5 → 227.2 (219.7 × 100, aspect 2.197:1) |
| Construction unit | u = 25 MU: A height 4u, slope run 3u, slope length 5u ≈ A base, D radius 2u |

SVG (`assets/mark.svg`, viewBox `7.5 0 219.7 100`):
```
A: M80.4 0 L125.5 0 L125.5 100 L84.407 100 A21.2 21.2 0 0 0 52.393 100 L15 100 A7.5 7.5 0 0 1 9 88 L71.76 4.32 A10.8 10.8 0 0 1 80.4 0 Z
D: M133.1 0 L177.2 0 A50 50 0 0 1 177.2 100 L133.1 100 Z
```
Camera notation used below: `cam(s, W→P)` = scale s px/MU, with world point W placed at screen point P. Screen = P + s·(world − W).

### 2.2 Palette
| Token | Hex | Use |
|---|---|---|
| `RED` | **#E80101** | Brand red, sampled as the median of `4.png` mark pixels (#E90101) and `3.png` field pixels (#E80202); the brief's ≈#E60000 is within compression error. Use #E80101 everywhere |
| `WHITE` | **#FFFFFF** | Paper. (The PNGs' #FEFEFE is compression.) |
| `RED_40` | #F69999 | red at 40% over white: construction lines, light-wedge edges |
| `RED_25` | #F9C0C0 | red at 25% over white: dimmed construction legs |
| `RED_12` | #FCE0E0 | red at 12% over white: light wedges, hatch ghosts |
| `RED_06` | #FEF0F0 | drafting-grid crosses (≈14% alpha on thin strokes renders near this) |
| `WHITE_40` | #F16767 | white at 40% over red: secondary type on red fields |

Rules: **no black, no grey, no gradients, no shadows, no glow.** Tints exist only as red-over-white or white-over-red alpha. The film opens on white and ends on red, and no frame is ever black.

### 2.3 Typography: three voices (all Google Fonts, OFL)
The concept is the translation from *measure* to *meaning*, and each has its own typeface. The voices never swap roles.

| Voice | Family / weight | Role | Settings |
|---|---|---|---|
| **MEASURE** | **IBM Plex Mono** 500 (400 for long strings) | dimensions, specs, times, labels, tread names, numerals 3/4/5, "9:16", "square feet." | UPPERCASE, tracking +0.08em (+0.12em at ≤18px), tabular figures |
| **MEANING** | **Instrument Serif** Italic 400 | what the labels become: *Sunday mornings*, *First coffee*, the true ad | sentence case, tracking −0.01em |
| **AUTHORITY** (AdvrtizX speaking) | **Archivo** (variable) **700**, `wdth` 112; 800 for the red card | headlines, end line, wordmark | sentence case, tracking −0.02em, line-height 1.0 |
| Cliché (S09 only) | **Playfair Display** 400 caps | the generic "luxury" feed ads, parodying the usual real-estate typeface | tracking +0.2em, centred |

Rule: whenever an AdvrtizX sentence names a measurement, the measurement switches to MEASURE mid-sentence ("Nobody buys **square feet.**" · "they open is **9:16.**").

Size scale (px @1080p): 16 · 18 · 20 · 24 · 34 · 52 · 72 · 88 · 96 · 160. Baselines snap to a 12px baseline grid.

**Wordmark "AdvrtizX":** Archivo 700, `wdth` 112, 88px, tracking −0.015em, with a **custom X** drawn as two crossed parallelograms whose strokes run at ±53.13° (rise 4 : run 3), the A's slope, with stem width matched to Archivo 700's vertical stem at 88px (measure the `d` stem; ≈ 13px). The X's crossing point sits at cap-height/2. "The X in the wordmark is two roof slopes crossed."

### 2.4 Grid
- **Module M = 60px → 32 × 18 grid.** Safe margin 2M (120px) on every side. Live area 1680 × 840.
- Headline column starts at x = 120 (red card x = 180).
- Drafting grid (Act I only): a 9px cross at each module intersection, 1px stroke, `RED` at 14% alpha.

### 2.5 Line weights (px @1080p, constant in screen space, not scaled by camera)
| Weight | px | Use |
|---|---|---|
| Rope / compass arm / primary ink | 4 | rope, hypotenuse, final A ink |
| Drawing | 3 | elevations, door frames, stair edges |
| Detail | 2 | window symbols, card rules, horizon |
| Hairline | 1.5 | construction lines (RED_25/40), dimension strings, dashed arcs (dash 6/6) |
| Poché | solid fill | cut walls in plan (2.4 MU thick), stair section, slabs |

Dimension strings use architectural 45° slash ticks, 12px long, with an 8px extension beyond each witness line.

### 2.6 Easing vocabulary
| Name | cubic-bezier | Use |
|---|---|---|
| **DRAFT** | (0.65, 0, 0.35, 1) | line draw-on/off (stroke-dashoffset), camera reframes ≤ 1.5s |
| **SET** | (0.16, 1, 0.3, 1) | type and objects landing: decisive, no overshoot; 8–14f |
| **LIFT** | (0.7, 0, 0.84, 0) | exits, pushes *into* openings |
| **HINGE** | (0.83, 0, 0.17, 1) | folds, swings, slabs, compass, rotations |
| **BRAKE** | (0.05, 0.7, 0.1, 1) | wipes and stops that must feel braked |
| **SCROLL** | (0.7, 0, 0.05, 1) | the S09 feed: long acceleration, violent brake to zero |
| **TAUT** | (0.3, 0, 0, 1) | the rope pulling tight |
| **SURVEY** | linear | constant drifts, clocks, stair-tracking camera |

Zooms always interpolate **log(scale)** with the easing applied to the log.

### 2.7 Motion rules
1. **Four directions only:** 0°, 90°, 53.13°, 36.87°, plus arcs about a named pivot. Nothing moves diagonally at any other angle.
2. **Nothing fades in.** Elements are *drawn* (stroke), *set* (mask or snap), *unfolded* (hinge) or *cut* in. Opacity is used only for (a) construction lines retreating to tint and (b) exits of ≤ 6 frames.
3. **No overshoot, bounce, wobble, or rotation for its own sake.** A drafted line doesn't wiggle.
4. **Everything lands on the grid of time:** beats every 15f, bars every 60f, and the 3:4:5 polyrhythm grid (20f/15f/12f, which all divide the 60f bar exactly). Cuts land on beats.
5. **Depth is used once:** the S04 hinge fold. Everything else is orthographic.
6. **Motion blur is used once:** the S09 scroll.
7. **Every shape traces to a primitive:** the 3‑4‑5 triangle, the slope, the gap, the notch circle or the D semicircle. If a shape can't be traced, cut it.
8. **One idea per frame**, and at most two type voices on screen, except labels inside the plan.
9. **Labels are world-anchored and screen-sized:** they follow the camera's position but keep their pixel size.
10. **No particles, no HUD, no screens-within-screens except the one 9:16 door, no stock imagery, no photography.**

---

## 3. Copy deck (on-screen words only)

| # | Frame | Voice | Words |
|---|---|---|---|
| 1 | 78–96 | MEASURE | `3` · `4` · `5` · `90°` |
| 2 | 200–239 | MEASURE | `28'-2"` · `22'-5"` (dimension strings on the elevation) |
| 3 | 240–300 | MEASURE (hatch) | `860 SQ FT · 1 BED · 1 BATH · EAST-FACING ·` (repeated) |
| 4 | 390–449 | MEASURE | `LIVING 19'-0" × 22'-5"` · `KITCHEN 6'-2" × 6'-9"` · `BEDROOM 14'-0" × 13'-2"` · `BATH 5'-7" × 8'-6"` · `ENTRY` · `PORCH` · `49'-4"` · `22'-5"` · `860 SQ FT` |
| 5 | 458–539 | AUTHORITY + MEASURE | **Nobody buys** / `square feet.` |
| 6 | 545–633 | MEASURE | `SUN 06:12` → `SUN 07:40` |
| 7 | 640–705 | MEANING | *Sunday mornings* · *First coffee* · *Long dinners* · *Shoes off* · *Ten quiet minutes* |
| 8 | 720/760/800 | AUTHORITY | **Which buyer.** · **Which reason.** · **Which hour.** |
| 9 | 720–869 | MEASURE headers + MEANING labels | buyer sets (§4, S07) |
| 10 | 950–1015 | AUTHORITY + MEASURE | **The first door** \| **they open is** `9:16.` · dims `1080` `1920` |
| 11 | 1036–1086 | Playfair caps (blurred) | `LUXURY LIVING REDEFINED` · `YOUR DREAM HOME AWAITS` · `WORLD-CLASS AMENITIES` · `PREMIUM LIFESTYLE` · `LIMITED UNITS LEFT` · `ELEVATE YOUR LIVING` · `EXCLUSIVE LAUNCH OFFER` · `MODERN LUXURY HOMES` · `PRIME LOCATION` · pill `BOOK NOW` |
| 12 | 1086–1169 | MEANING + MEASURE | *Sunday mornings / face east.* · `07:40` · `860 SQ FT · 1 BED · EAST-FACING` |
| 13 | 1185–1275 | MEASURE | `SEEN` · `STOPPED` · `TAPPED` · `ENQUIRED` · `CALLED BACK` · `VISITED` · `KEYS` |
| 14 | 1230–1320 | AUTHORITY | **We don't stop at the click.** |
| 15 | 1500–1620 | MEASURE | `53.13°` · `3` · `4` · `5` |
| 16 | 1515 / 1575 | AUTHORITY | **Every property has an angle.** / **We find the true one.** |
| 17 | 1680→ | Wordmark + MEASURE | **AdvrtizX** · `AI-FIRST ADVERTISING FOR REAL ESTATE` |

The word "AI" appears exactly once, at the very end, as a fact. Everything before it *shows* intelligence (measurement, sun studies, per-buyer rewriting, timing, a funnel to keys) instead of claiming it.

---

## 4. Shot list

**At a glance**

| Shot | Frames | Sec | Name | Act |
|---|---|---|---|---|
| S01 | 0–119 | 0.0–4.0 | Twelve Knots | I MEASURE |
| S02 | 120–239 | 4.0–8.0 | The Compass Proof | I |
| S03 | 240–329 | 8.0–11.0 | Spec Hatch | I |
| S04 | 330–449 | 11.0–15.0 | The Fold | II MEANING |
| S05 | 450–539 | 15.0–18.0 | Nobody Buys Square Feet | II |
| S06 | 540–719 | 18.0–24.0 | Sun Study | II |
| S07 | 720–899 | 24.0–30.0 | Which Buyer | II |
| S08 | 900–1019 | 30.0–34.0 | The Door Is 9:16 | III THE DOOR |
| S09 | 1020–1169 | 34.0–39.0 | Thumb-Stop | III |
| S10 | 1170–1349 | 39.0–45.0 | The Stair | III |
| S11 | 1350–1499 | 45.0–50.0 | The Plan Was the Mark | IV THE MARK |
| S12 | 1500–1649 | 50.0–55.0 | The True Angle | IV |
| S13 | 1650–1799 | 55.0–60.0 | Red Angle / End Card | IV |

Fixed construction camera for Act I: `s1 = 4.8 px/MU`, world (0,100) → screen (660,780). So V0 = (660,780), V3 (right angle) = (1020,780), V7 (apex) = (1020,300), A right edge x = 1262.4, mark top y = 300. The A is centred (its centre x 62.75 MU lands at x = 961).

---

### S01 · Twelve Knots · f0–119
**On screen.** White paper. f0–24: the drafting grid crosses pop on (each scales 0→1 over 4f, SET), sweeping in along the 53.13° direction: each cross's delay is proportional to its projection onto the slope's normal, so the grid "prints" at the logo's angle. f6–36: a red rope (4px, round caps) draws on left→right (DRAFT, 30f). It lies slack: 13 knots i = 0..12 at x_i = 240 + 120·i, y_i = 540 + 40·(1 − ((x_i − 960)/720)²) (a 40px parabolic sag), joined by straight segments. Each knot is a 14px × 3px tick perpendicular to the rope and pops on (scaleY 0→1, 4f, SET) as the pen passes it.
f45–75: **the rope is pegged into a 3‑4‑5 triangle.** Targets: knots 0–3 → (660 + 120i, 780); knots 3–7 → (1020, 780 − 120(i−3)); knots 7–12 → (1020 − 72(i−7), 300 + 96(i−7)), so knot 12 meets knot 0 at V0. Groups animate with TAUT: knots 0–3 over f45–60, 4–7 over f52–67, 8–12 over f60–75. Pegs (small filled squares, 10px) drop at V0 f45, V3 f60, V7 f75.
f75: a right-angle marker (24px square, 1.5px) draws into the V3 corner (6f). Numerals in MEASURE 500, 32px, are set with SET 8f: `3` centred 36px under the base at f78, `4` 36px right of the vertical at f83, `5` 36px up-left of the hypotenuse midpoint (upright, not rotated) at f88. f96: `90°` (16px) sets inside the corner. Hold to f119.
**Camera.** Locked.
**Transition.** Continuous into S02 (same drawing).
**Steal-worthy.** The oldest construction tool on earth becomes a logo construction. The 3‑4‑5 rope doubles as the film's sonic motif (§5).

### S02 · The Compass Proof · f120–239
**On screen.** f120–132: base and vertical legs retreat to RED_25 at 1.5px; ticks scale to 0 (LIFT 8f). The hypotenuse stays 4px RED: it is now a compass arm.
f135–165: **the arm swings down** clockwise about V0, from −53.13° to 0° (HINGE, 30f). Its tip leaves a dashed arc trace (1.5px, RED_40, dash 6/6, r = 600px). The `5` rides at the arm's midpoint. At f165 the tip lands at (1260,780) and a 16px cross mark snaps there.
f165–177: a vertical construction line shoots up from (1260,780) to (1260,300) (DRAFT 12f). f177–185: the top edge draws from V7 (1020,300) to (1262,300) (DRAFT 8f).
f185–200: **inking:** the true A outline (3px RED, exact mark coordinates, right edge at x 1262.4) draws over the construction (DRAFT 15f). The fillets *form*: radii animate 0 → 7.5 MU (BL) and 0 → 10.8 MU (TL), SET. Construction (legs, arc, cross, the 2.4px-off pencil vertical) stays at RED_25 as an honest drafting residue. **No notch yet** (it is held back for the sun).
f200–239: two dimension strings draw (DRAFT 12f each): along the base, 24px below, `28'-2"` (f200), and up the right side, 24px out, `22'-5"` (f212). They are MEASURE 18px, centred on the string with a 6px white knockout.
**Camera.** Locked, plus a SURVEY push from 1.00 → 1.03 about (961,540) across the shot.
**Transition.** Continuous into S03.
**Steal-worthy.** The logo is *proved* rather than revealed: the roof slope swung down sets exactly where the door begins (slope length = base = 5u). This one move shows "intelligence" without stating it.

### S03 · Spec Hatch · f240–329
**On screen.** f240 (downbeat): the A outline fills with **type as hatch**: 16 rows of MEASURE 400, 20px, RED, clipped to the A shape, row pitch 30px from y = 300 to 780. Each row repeats `860 SQ FT · 1 BED · 1 BATH · EAST-FACING · `. Rows enter alternately (odd from the left, even from the right) with a 2f stagger top→bottom, each sliding 400px with SET 10f. They then drift as tickers at ±120 px/s (SURVEY), alternating direction by row.
f270–300: density doubles. 16 interleaved rows (offset 15px, RED_40) set the same way, so the A becomes a pink-red texture of identical facts.
f300: **everything freezes** (one frame, dead stop).
f303–327: rows collapse onto the baseline: each row scaleY 1 → 0 toward y = 780, with a 1.5f stagger top → bottom (LIFT 6f each). Only the A outline and the dimension strings remain.
**Camera.** Locked at 1.03.
**Transition.** Continuous into S04 (the baseline becomes the hinge).
**Steal-worthy.** Typographic hatching: the spec sheet *is* the building's material. It is boring by design, so the next sentence lands. `EAST-FACING` is planted here and pays off in S09.

### S04 · The Fold · f330–449
**On screen.** f330–350: **the elevation folds flat.** The A outline (with dims and residue) rotates in X from 0° → 90° about the baseline y = 780, falling *away* from the viewer (perspective 2000px, HINGE 20f). It ends edge-on as a single line from x 660 to 1262. Drafting grid crosses scale out (LIFT 6f, staggered along 53.13°).
f350–360: the line extends right to the plan's full baseline, x 660 → 1510 (D base end, 177.2 MU) (DRAFT 10f).
f360–385: **the floor plan unfolds up** from the same hinge: a plane at rotateX −90° (edge-on) rises to 0° (HINGE 25f). Its contents are canonical mark coordinates at `cam(4.8, (0,100)→(660,780))`. Plan contents (all MU):
- **Exterior walls:** RED poché 2.4 MU inside the mark outline (stroke 4.8 MU clipped to the mark shape).
- **Glazing on the slope** (t = 0.12 → 0.88 along the slope): the poché is replaced by the window symbol, 3 lines (2px) parallel to the slope at inward offsets 0 / 1.2 / 2.4 MU.
- **Bay glazing** on the D arc from −55° to +55° about (177.2,50): arcs at r 50 / 48.8 / 47.6.
- **Interior walls** (1.2 MU solid RED): kitchen (98,0)→(98,30)→(110,30); bath (133.1,38)→(158,38)→(158,0).
- **Door swings** (1.5px leaf + 1.5px quarter arc):
  - entry at the bottom of the gap: hinge (125.5,100), leaf to (125.5,92.4), arc from (133.1,100);
  - A-side opening in wall x = 125.5, y 60–72, arc r 12 into the A;
  - D-side opening in wall x = 133.1, y 60–72, arc r 12 into the D;
  - bath door on y = 38, x 140–150, arc r 9 into the bedroom.
- **North arrow** at (−8,112): r 5 hairline circle with a 3:4 needle pointing up; `N` 16px.
- **Scale bar** under the plan: `0 1 2 5 M`, 16px.

f370–449: **camera** `cam(4.8, (62.75,50)→(960,540))` → `cam(6.4, (117.35,50)→(960,540))` (DRAFT 45f, f370–415), then SURVEY drift 6.4 → 6.55 to f449.
f390 / 405 / 420 / 435 (beats): labels set (SET 8f, MEASURE 18px, two lines: name / dims): LIVING at (52,55), KITCHEN (111.5,15), BEDROOM (186,62), BATH (145.5,19), then ENTRY (129.3,108) and PORCH (68.4,110) outside the baseline, plus overall dims `49'-4"` (y −10) and `22'-5"` (x −4), and the stamp `860 SQ FT` right-aligned at (227.2,118).
**Transition.** Hard cut on f450 to red.
**Steal-worthy.** An orthographic projection animated as a hinge: the elevation lies down and the plan stands up from the same line. It is the only depth in the film, and it is architecture's own way of folding drawings. The plan's outline already *is* the mark; the attentive viewer half-recognises it, and the full payoff comes in S11.

### S05 · Nobody Buys Square Feet · f450–539
**On screen.** f450: full RED. Silent for 8 frames. White type, left-aligned at x = 180:
- f458: **Nobody** (AUTHORITY 800, `wdth` 112, 160px, baseline 500), SET 8f via a mask rising from the baseline;
- f465: **buys** (same line);
- f473: `square feet.` (MEASURE 500, 150px, baseline 672), set in one frame (a hard snap: the cold voice doesn't ease).

Hold. At f525 all type exits upward 24px with opacity → 0 (LIFT 6f).
**Camera.** Locked.
**Transition.** Hard cut f540 back to white plan (S06).
**Steal-worthy.** One sentence in two voices. The typeface change carries the argument: "square feet" is literally set in the spec-sheet voice.

### S06 · Sun Study · f540–719
**On screen.** f540: the plan at `cam(12, (180,50)→(960,540))`, tight on the bedroom. The bay window arc fills the right of frame, and labels from S04 are present. Top-left screen (120,150): MEASURE 24px `SUN 06:12`, which counts one minute per frame from f545 to f633, landing on `SUN 07:40`.
- **Sun path:** a dashed hairline arc (RED_40, dash 6/6) of radius 70 MU about the bay centre (177.2,50).
- **The sun:** a filled RED circle, r 2.6 MU, travelling the arc from angle −10° (just north of east) at f545 to +35° at f633 (SURVEY).
- **Light wedge:** for each sample on the glazing arc (every 2°) whose outward normal faces the sun, project a point into the room along the light direction by L = 70 MU. Fill the polygon (glazing points plus projections, clipped to bedroom interior = D minus bath minus walls) with RED_12, edges 1px RED_40. It sweeps across the floor as the sun climbs.

f633: the clock lands.
f640–655: **the label rewrite.** `BEDROOM 14'-0" × 13'-2"` turns into *Sunday mornings*. Characters flip left → right, 1 char per frame. Each character cycles through 3 deterministic intermediate glyphs (the next 3 letters of the target string, split-flap style, seeded and never random-looking). On its final flip, each character switches face from MEASURE 18px to MEANING 40px (SET 6f per char, baseline-locked).
f660–705: **camera pulls back** to the S07 framing `cam(5.4, (0,0)→(573.1,420))` (plan visible x 613.6–1800, y 420–960) with HINGE 45f. During the pull, more labels rewrite on beats and half-beats: f675 KITCHEN → *First coffee*, f683 LIVING → *Long dinners*, f690 ENTRY → *Shoes off*, f698 BATH → *Ten quiet minutes*. The sun, path and wedge stay with the bay, drawn off (DRAFT 10f) at f700–710.
**Transition.** Continuous into S07.
**Steal-worthy.** An architect's sun study used as a copywriting tool: the agency knows where the light falls at 07:40 on a Sunday, and writes *that*. The label rewrite is the whole concept (measure → meaning) in one gesture.

### S07 · Which Buyer · f720–899
**On screen.** Plan locked at `cam(5.4, (0,0)→(573.1,420))`. Top-left headline (AUTHORITY 700, 96px, x = 120, baseline 228) sets with SET 10f and is replaced each time with a 1f cut: f720 **Which buyer.** · f760 **Which reason.** · f800 **Which hour.**. Top-right buyer header (MEASURE 18px, right-aligned x = 1800, baselines 144/168): `BUYER 01` / `FIRST HOME`. Room labels (MEANING 34px) rewrite with the split-flap mechanic, compressed to 0.5f per char (2 chars per frame).

Relabel sets land on the "3" grid (every 20f):

| Frame | Header | BEDROOM | KITCHEN | LIVING | ENTRY | BATH |
|---|---|---|---|---|---|---|
| 720 | BUYER 01 / FIRST HOME | *Ours* | *Learning to cook* | *Friends over* | *Our name here* | *Ten quiet minutes* |
| 740 | BUYER 02 / YOUNG FAMILY | *Nursery, for now* | *Lunchboxes* | *Floor picnics* | *Small shoes* | *Bath time* |
| 760 | BUYER 03 / WORKS FROM HOME | *Studio* | *Lunch at one* | *Calls at nine* | *Commute: 0 min* | *Reset* |
| 780 | BUYER 04 / EMPTY NESTERS | *Late breakfasts* | *Slow Sundays* | *Grandkids' weekend* | *Coats off* | *Long soak* |
| 800 | BUYER 05 / INVESTOR, ABROAD | *Rental-ready* | *Low upkeep* | *Tenant-proof* | *Keyless entry* | *Easy let* |

With **Which hour.** (f800), a MEASURE clock at (120,300) flips on the "4" grid (every 15f): `SUN 07:40` → `WED 21:10` (f815) → `SAT 10:05` (f830) → `FRI 13:30` (f845).
**Acceleration f820–869:** on the "5" grid (every 12f: f820, 832, 844), then every 6f (850, 856, 862, 868). Each step brings a new header `BUYER 06…12` and new labels (pool: *Dog's corner* · *Piano wall* · *Night shifts* · *First Diwali here* · *Cricket on TV* · *Prayer corner* · *Plants* · *Two desks* · *Quiet street* · *Near school* · *Walk to metro* · *Room for Ma*). At 6f steps only the first 6 characters flip; the rest snap.
f870: **dead stop.** In one frame, every label, header, clock and headline vanishes. Only the plan's linework and poché remain.
f876–899: **the dive.** Camera pushes into the entry gap with LIFT 24f, log-scale: s 5.4 → 30, zooming about the gap centre while panning it to screen centre: P(t) = lerp((1271.3,690), (960,540)), screen = P + s·(world − (129.3,50)). f888–896: the exterior walls flood solid (clipped stroke width 4.8 → 250 MU, SET 8f). At this zoom only the gap and its flanking walls are in frame, so the logo is not revealed.
**Transition.** Continuous into S08: at f900 the frame is RED | WHITE slot 228px (x 846–1074) | RED.
**Steal-worthy.** Audience intelligence with no dashboards: one floor plan, rewritten per buyer, per reason, per hour. The rewrites land on a 3:4:5 polyrhythm, so the targeting has a sound. Then the camera dives *into the logo's gap* without the logo ever showing.

### S08 · The Door Is 9:16 · f900–1019
**On screen.** RED | white slot | RED. The two red fields are the A and D bodies at 30 px/MU, and we are inside the mark.
f915–945: **the door opens.** The slabs slide apart with HINGE 30f: the A slab's right edge goes 846 → 656, the D slab's left edge 1074 → 1264. The white opening becomes 608 × 1080, an exact 9:16 portrait.
f950: on the left slab, right-aligned to x = 616, baseline 564, white: **The first door** (AUTHORITY 700, 72px, SET 10f).
f958: on the right slab, left-aligned at x = 1304, baseline 564: **they open is** `9:16.` (the "9:16." in MEASURE 500, 68px).
f970–990: dimension strings draw inside the opening (RED, 1.5px, DRAFT 10f each): horizontal at y = 48 from x 680 → 1240, labelled `1080`; vertical at x = 1236 from y 72 → 1032, labelled `1920` (rotated −90°). MEASURE 16px.
f1005–1015: copy on slabs exits (LIFT 6f, 24px up). Dims draw off (DRAFT 8f).
**Camera.** Locked.
**Transition.** Continuous: the opening becomes the feed (S09).
**Steal-worthy.** The logo's gap is a door, the door opens to exactly 9:16, and the sentence is split by the opening. In real estate today the first front door a buyer opens is a phone screen, and the logo already contains it.

### S09 · Thumb-Stop · f1020–1169
**On screen.** Inside the 608 × 1080 opening (x 656–1264), a vertical feed of cards. Card k (k = 0..10) has top = k·1080 − Y(t) and is separated by 2px RED rules. Card 0 is the blank opening we already see.
**Cards 1–9 (the clichés):**
- white, 2px RED frame inset 24px;
- Playfair Display caps 40px RED, centred, two lines, in this order: LUXURY LIVING / REDEFINED · YOUR DREAM HOME / AWAITS · WORLD-CLASS / AMENITIES · PREMIUM / LIFESTYLE · LIMITED UNITS / LEFT · ELEVATE / YOUR LIVING · EXCLUSIVE / LAUNCH OFFER · MODERN / LUXURY HOMES · PRIME / LOCATION;
- an outlined `BOOK NOW` pill (2px, fully rounded, Playfair 18px caps) at card y 820.

**Scroll:** Y(t) = 10800 · SCROLL((t − 1020)/66) for f1020–1086. Peak ≈ 500 px/frame, then a brake to exactly 10800 with zero velocity at f1086. **Motion blur on (the only time):** 16 temporal subsamples across a 180° shutter, f1020–1086 only.
**Card 10 (the stop card)**, local coords on 608 × 1080:
- *Sunday mornings* / *face east.* in MEANING 88px RED, left x = 40, baselines 200 / 290;
- `07:40` in MEASURE 16px, right-aligned at (568,72);
- a horizon line (2px RED, full width) at local y = 780;
- **the sun, which is the notch:** a RED circle r = 96px whose centre sits 63px below the horizon at local x = 400, clipped above the line (exact notch proportions ×4.53). It rises from fully hidden to that position f1095–1110 (SET 15f);
- `860 SQ FT · 1 BED · EAST-FACING` in MEASURE 16px at (40,830), typed 2 chars per frame from f1110.

The slabs outside stay pure red and empty. Hold to f1169.
**Transition.** Continuous into S10.
**Steal-worthy.** Real-estate advertising's clichés, in real-estate advertising's favourite typeface, scrolled into a blur. The feed brakes on the one ad with a fact in it: "EAST-FACING" (S03) turned into *Sunday mornings face east.* Its sun is the logo's notch.

### S10 · The Stair · f1170–1349
**On screen.**
f1170–1185:
- the slabs slide fully offscreen (A slab to x < 0, D slab to x > 1920, LIFT 15f), so the world is white;
- the card's horizon extends from the card edges to the screen edges (DRAFT 15f) and becomes the **ground line at y = 780**;
- the headline, clock and spec exit (LIFT 6f);
- the sun sinks below the line (LIFT 10f, f1185–1195).

**The stair, in section, pitched 3:4** (rise 72px, run 96px: the same triangle, complementary angle 36.87°). World coords with the stair start at (300,780). Tread k (1..7): the riser draws up from (300 + 96(k−1), 780 − 72(k−1)) by 72px (4f, DRAFT), then the tread extends 96px right (4f). The red poché fills behind it as a solid sawtooth mass down to a soffit parallel to the pitch, 40px below the nosings (SET 6f). Treads land on beats f1185, 1200, 1215, 1230, 1245, 1260, 1275. Labels (MEASURE 500, 18px, RED, tread start + 8px, baseline 12px above the tread) read `SEEN` · `STOPPED` · `TAPPED` · `ENQUIRED` · `CALLED BACK` · `VISITED` · `KEYS`.
**Camera:** SURVEY drift f1200 → 1290 by (−576, +432) total, so (−96, +72) per beat: it climbs at the stair's pitch, smoothly, while the treads land in steps.
f1230: screen-fixed at x = 120, baseline 200: **We don't stop at the click.** (AUTHORITY 700, 72px, RED, SET 10f). Exits f1320 (LIFT 6f).
f1275–1285: a landing extends 400px from the last tread.
f1285–1297: **the door block** rises from the landing (SET 12f): a solid RED block (world x 1000–1320, from the landing top y 276 up to −204) with two 3px white seams at x = 1060 and 1260. At this point it is left jamb | leaf | right jamb (screen x 424–744, y 228–708).
f1305–1320: the leaf (x 1060–1260) swings open: scaleX 1 → 0 anchored at x = 1060 (HINGE 15f). This reveals a **white slot between two red jambs**, the gap motif again.
f1320–1349: camera pushes through the slot (LIFT 29f, log-scale 1 → 7) about the slot centre (584,468), panning it to (960,540). White fills the frame by f1342.
**Transition.** White into white: cut on f1350 to the plan (S11).
**Steal-worthy.** The funnel drawn as a staircase at the logo's own pitch, climbing from *seen* to *keys*. The music doesn't stop at the click either (§5). Also a quiet flex: the agency's work continues past the lead, to the site visit and the keys.

### S11 · The Plan Was the Mark · f1350–1499
**On screen.** f1350–1365: the complete plan draws on in 15f at `cam(6.4, (117.35,50)→(960,540))` (DRAFT; all strokes at once, poché SET), shown whole and canonical for the first time. It carries the S06 meaning labels (*Sunday mornings*, *First coffee*, *Long dinners*, *Shoes off*, *Ten quiet minutes*), dims, door arcs, glazing, north arrow, scale bar. Hold f1365–1380.
f1380–1408: **retraction in reverse drawing order**, on eighths (f1380, 1388, 1395, 1403):
- labels lift (−12px, opacity → 0, LIFT 6f);
- dims and north arrow draw off;
- door arcs draw off;
- interior walls and glazing lines draw off. The glazing gaps in the poché close up.

f1408–1440: **the walls thicken inward** until the plan is solid. Outline stroke width 4.8 → 250 MU, clipped to the mark shape, DRAFT 32f. The entry gap stays white because it was never inside the walls. The porch recess becomes the notch, and the bay becomes the D.
f1410–1455: camera `cam(6.4, (117.35,50)→(960,540))` → `cam(3.6, (117.35,50)→(960,480))` (HINGE 45f). Hero mark: visible x 564.5–1355.5, y 300–660 (360px tall).
f1440: solid mark, RED on WHITE. Hold, still, to f1499.
**Transition.** Continuous into S12.
**Steal-worthy.** The reveal is a *poché fill*: an architect's convention (cut walls are solid) turns the apartment into the logo. The viewer realises they have been inside the mark for 30 seconds. There is no logo animation, only a drawing convention.

### S12 · The True Angle · f1500–1649
**On screen.** Mark fixed at hero position. At 3.6 px/MU the sharp vertex V = (537.5, 660).
f1500–1515: construction hairlines (1.5px, RED_40) draw at the sharp vertex (DRAFT 12f): the baseline extended 30 MU left of V, and the slope extended 30 MU beyond the TL vertex. Ghost legs (dashed RED_25) run from (75,0) down to (75,100) and along the base. An angle arc of r 40 MU about V, from 0° to −53.13°, draws (DRAFT 10f). `53.13°` (MEASURE 500, 20px) sets at the arc midpoint, offset 16px outward. `3`, `4`, `5` (MEASURE 16px) reappear on the ghost legs as a callback to S01.
f1515: **Every property has an angle.** (AUTHORITY 700, 52px, RED, left-aligned at x = 565, baseline 780; SET 10f via mask).
f1575: **We find the true one.** (same, baseline 852).
f1620–1649: annotations draw off (DRAFT 10f) and both lines exit (LIFT 6f, staggered 4f). Mark alone by f1649.
**Transition.** Continuous into S13.
**Steal-worthy.** The end line is *measured*: "angle" is said while its exact value is drawn on the logo. A double meaning that can be proved.

### S13 · Red Angle / End Card · f1650–1799
**On screen.** f1650–1670: **the angle wipe.** A RED field sweeps left → right. Its leading edge is a straight line at 53.13° (parallel to the slope) and it travels 2730px horizontally (offscreen-left to offscreen-right) with BRAKE 20f. Wherever the field has passed, the mark renders WHITE (two complementary masked layers). Result: white mark on red.
f1680: **AdvrtizX** wordmark (white, Archivo 700 `wdth` 112, 88px, tracking −0.015em, left-aligned at x = 565, baseline 800) sets via a mask rising from the baseline (SET 12f). The letters `Advrtiz` arrive first. The custom X draws as two strokes, each sweeping from its ends to the centre (6f, DRAFT, f1686–1692), and **crosses at f1695**.
f1710: `AI-FIRST ADVERTISING FOR REAL ESTATE` (MEASURE 500, 18px, tracking +0.12em, white) sets at x = 565, baseline 860 (SET 8f).
Hold, perfectly still, to f1799. The last frame is the white-on-red lockup, with no fade.
**Steal-worthy.** The palette inversion is a wipe *at the logo's angle*, and the wordmark's X is built from that angle. The sonic logo is the 3‑4‑5 triangle played as a chord.

---

## 5. Sound design score (procedural, no samples, deterministic seeds)

### 5.1 Global
- 48 kHz, stereo, 32-bit float. Length exactly 60.000 s = 2,880,000 samples. **Frame f ↔ sample f × 1600.**
- **120 BPM**: beat = 15 frames = 24,000 samples; bar (4/4) = 60 frames = 2.0 s; 30 bars. The bar divides into 3, 4 and 5 exactly (20f / 15f / 12f), which gives the 3:4:5 polyrhythm.
- **Tuning = the triangle.** f₀ = 110 Hz (A2). The logo's chord is harmonics **3 : 4 : 5 = 330 / 440 / 550 Hz**, a just-intoned A major. Everything pitched in the film comes from the harmonic series of 110 Hz (sub at 55).
- **The room is built as the building is built.** One synthetic reverb per act, with decay rising across the film. Each impulse response is stereo, exponentially decaying Gaussian noise, low-passed at 7 kHz, with 12 ms predelay. T60 = **0.35 s** (Act I), **0.9 s** (Act II), **1.5 s** (Act III), **2.6 s** (Act IV). Sends crossfade over one beat at f330, f900, f1350.
- Master: HP 28 Hz → 2:1 bus compression (threshold −18 dBFS, attack 10 ms, release 120 ms) → `tanh(1.2x)/tanh(1.2)` soft clip → normalise to −1.0 dBFS peak. Target ≈ −14 LUFS integrated (check with `ffmpeg -af loudnorm=print_format=summary`). Seeds: `numpy.random.default_rng(345)` for everything stochastic.

### 5.2 Instrument recipes
Levels are peak dBFS before the master.

| ID | Name | Recipe |
|---|---|---|
| I1 | **PEN** | pink noise → biquad BP fc 3200 Hz Q 1.4 (+ parallel BP 6500 Hz Q 3 at 30%). Amp = 0.06·v(t)^0.7, where v = normalised draw-speed (derivative of the stroke's eased progress). fc drifts +15% over each stroke. Pan = 0.6·(2x/1920 − 1) following the pen tip. ≈ −30 |
| I2 | **TICK(f)** | 1-sample impulse → resonant BP at f, Q 30, decay τ = 25 ms, plus a 1.5 ms white burst HP 4 kHz at −18 dB relative. −20 |
| I3 | **KNOCK(f=180)** | sine with pitch env f·(1 + e^(−t/0.012)), amp e^(−t/0.09); + partial at 2.3f, −14 dB; + 3 ms noise click HP 2 kHz. −12 |
| I4 | **TWANG** | Karplus–Strong at 110 Hz, loop gain 0.996, excitation = 8 ms LP-noise burst, 1.6 s long; + sine glide 55→110 Hz under the pull (f45–75) at −26. −16 |
| I5 | **SUB** | sine 55·(1 + e^(−t/0.03)) Hz, attack 2 ms, decay e^(−t/0.35); + 110 Hz at −12 dB; drive tanh(2x). Big = −6, normal = −10, soft = −24 |
| I6 | **HINGE** | white noise → SVF low-pass with fc mapped exponentially from fc0 → fc1 *by the shot's easing curve*, Q 0.9; amp = sin(π·p)^1.5; pan follows motion direction. −18 |
| I7 | **SET** | sine 90·(1 + e^(−t/0.01)) Hz, decay 80 ms at −16 + TICK(880) at −24 |
| I8 | **FLAP** | 0.6 ms noise burst → BP at fc ∈ {2.2, 2.9, 3.6, 4.4} kHz (chosen by char index mod 4), decay 8 ms. One per character flip. −30 |
| I9 | **PAD** | additive partials n·55 Hz, n ∈ {1,2,3,4,5,6,8}, amp 1/n^1.2. Each partial has its own AM LFO (0.05–0.15 Hz, depth 30%, seeded phases) and ±0.8 cent L/R detune → LP fc 900 Hz (Act II), 2400 Hz (Act IV). −28 → −24 |
| I10 | **POLY** | TICK at 330 / 440 / 550 Hz (τ 40 / 30 / 24 ms) firing every 20 / 15 / 12 frames from bar starts (multiples of 60f). The triangle as rhythm. −26 each |
| I11 | **RISER** | 6 detuned additive saws (10 harmonics each, ±7 cents) gliding exponentially 110 → 880 Hz + white noise with HP sweeping 500 → 9000 Hz; amp rising exponentially −40 → −12 dB. "Noise-only" variant omits the saws |
| I12 | **BELL(f)** | FM: carrier f, modulator 1.4f, index 4·e^(−t/0.35), amp e^(−t/1.2). −14 |
| I13 | **MARIMBA(f)** | sine f + sine 4f (−22 dB) + sine 10f (−36 dB, τ 30 ms); attack 1 ms, τ 0.25 s. −14 |
| I14 | **HAT** | white noise HP 7 kHz, decay 18 ms. −30 |
| I15 | **CLICK** | two transients 70 ms apart (press/release): TICK(2500 Hz, Q 8, τ 5 ms). −14 |
| I16 | **KEYS** | 7 FM pings, carriers seeded in 2.8–6.5 kHz, ratio 2.76, index 2, decay 60–140 ms, onsets spaced 18–55 ms (seeded). −22 |
| I17 | **SLAB** | brown noise → BP 120 Hz Q 0.8 + BP 240 Hz Q 2, amp ∝ slab velocity (derivative of HINGE) → end-stop KNOCK(90). −16 |
| I18 | **WIPE** | white noise → BP sweeping 400 → 5000 Hz along the BRAKE curve, Q 1.2, pan −0.8 → +0.8. −14 |
| I19 | **ROOM** | pink noise LP 300 Hz, −48, constant from f0 (the paper's air). Ducks −6 dB under hard-silence moments, but is never cut, so silence still sounds like a room |

### 5.3 Hit sheet (frame-keyed)

| Frame(s) | Picture | Sound |
|---|---|---|
| 0 | white | ROOM only |
| 6–36 | rope draws | PEN; TICK(2200) at each knot as the pen passes (knot i at f = 6 + 30·DRAFT⁻¹(i/12)) |
| 45 / 60 / 75 | pegs V0 / V3 / V7 | KNOCK ×3 (180 / 200 / 220 Hz); TWANG glide under 45–75; TWANG pluck at 75 |
| 78 / 83 / 88 | `3` `4` `5` | **BELL 330 / 440 / 550**: first statement of the logo chord, arpeggiated |
| 96 | `90°` | TICK(880) |
| 135–165 | compass swing | HINGE (fc 400→3000) + sine glide 165→220 Hz at −30 |
| 165 | tip lands | KNOCK(160) + TICK(660) |
| 165–200 | vertical, top, inking | PEN |
| 180–329 | — | SUB soft on every beat (pulse begins) |
| 200 / 212 | dims | TICK(1320) ×2 |
| 240 | hatch floods | SUB normal + 16 FLAPs at 2f stagger |
| 240–300 | tickers | granular TICKs at partials 12–24 of 110, density ramping 8 → 32 per s |
| **300** | **freeze** | **hard silence 300–303** (ROOM ducked) |
| 303–327 | rows collapse | 20 TICKs descending 2 kHz → 200 Hz |
| 330–350 | fold down | HINGE fc 6000→300 |
| 360–385 | plan unfolds | HINGE fc 300→6000; **PAD enters** −28 |
| 390 / 405 / 420 / 435 | labels | SET ×4 |
| **450** | **cut to red** | **PAD and pulse cut in 1 frame; 8f silence** |
| 458 / 465 | "Nobody" / "buys" | SUB normal + SET; SET |
| 473 | `square feet.` | SUB big + dry TICK cluster (1760 + 2200 Hz, τ 10 ms, no reverb send: the cold voice is dry) |
| 540 | sun study | PAD returns, LP opening to 1400 Hz, partials 3/4/5 lifted +3 dB |
| 545–633 | clock counts | TICK(3500) at −38 every 2 frames |
| 633 | 07:40 | **BELL 440** |
| 640–655 | BEDROOM → *Sunday mornings* | FLAP ×15 |
| 660 | — | POLY voice 3 enters (−32) |
| 675 / 683 / 690 / 698 | relabels | FLAP clusters + TICK(550) |
| 720 | **Which buyer.** | SUB normal + SET; POLY voices 3 + 4 |
| 740 / 780 | sets | FLAP clusters |
| 760 | **Which reason.** | SUB normal + SET |
| 800 | **Which hour.** | SUB normal + SET; POLY voice 5 enters: full 3:4:5 |
| 815 / 830 / 845 | clock flips | TICK(440) |
| 820–869 | acceleration | POLY + FLAPs densify; PAD LP opens 1400 → 4000 Hz; master +3 dB ramp |
| **870** | **dead stop** | **silence 870–876** |
| 876–899 | dive into gap | RISER (noise-only), ends exactly at 899 |
| **900** | red \| slot \| red | **SUB big** + KNOCK(70) |
| 915–945 | door opens | SLAB; end-stop KNOCK(90) at 945 |
| 950 / 958 | copy | SET; SET + dry TICK(880) on `9:16.` |
| 970–990 | dims | PEN + TICK(1320) ×2 |
| 1020–1086 | feed scroll | RISER full; TICK(1760) each time a card rule crosses screen centre (computed from Y(t)) |
| **1086** | **brake** | **hard silence 1086–1092** |
| 1092 | stop card holds | **BELL 440**, long |
| 1095–1110 | sun rises | PAD partials 3 + 4 + 5 swell over 15f (−30 → −24) |
| 1110–1124 | spec types | FLAP ×28 |
| 1170–1185 | slabs out | SLAB (reverse) + HINGE |
| 1185 / 1200 / 1215 / 1230 / 1245 / 1260 / 1275 | treads | **MARIMBA 330 / 440 / 550 / 660 / 880 / 1100 / 1320**: harmonics 3, 4, 5, 6, 8, 10, 12 of 110, climbing the logo chord + SUB soft on each; HAT on every off-beat (every 15 frames from 1192.5, audio-exact) |
| 1215 | `TAPPED` | **CLICK**, and the groove carries straight on ("we don't stop at the click") |
| 1230 | copy | SET |
| 1285–1297 | door block rises | KNOCK(70) |
| 1300 | — | KEYS |
| 1305–1320 | leaf swings | HINGE (fc 500→2500) |
| 1320–1349 | push into white | RISER (noise-only, short), cut dead at 1349 |
| 1350 | plan redraws | PAD as chord 110 + 330 + 440 + 550 (attack 30 ms) + PEN burst 15f |
| 1380 / 1388 / 1395 / 1403 | retraction | TICK descending 1320 / 880 / 550 / 330 |
| 1408–1440 | walls thicken | sine 55 + 110 crescendo −36 → −14, LP 200 → 2000 Hz |
| **1440** | **solid mark** | **SUB big + BELL 330 + 440 + 550 together, soft** |
| 1455–1499 | still mark | Act IV reverb (2.6 s) tail; ROOM |
| 1500–1515 | annotations | PEN soft |
| 1515 / 1575 | end line ×2 | SET + TICK(440); SET + TICK(550) |
| 1620–1649 | retract | TICKs descending soft |
| 1650–1670 | angle wipe | WIPE |
| 1680 / 1684 / 1688 | wordmark sets | **Sonic logo: BELL 330 → 440 → 550 (3 → 4 → 5)** |
| **1695** | **X crosses** | **all three re-struck + SUB soft (55, τ 2 s) + PAD 110** |
| 1710 | line | TICK(2200) at −28 |
| 1710–1799 | hold | chord rings in the 2.6 s room; linear master fade over f1785–1799 (the film's only fade, and it is audio) |

---

## 6. Self-critique: what was average in the first draft, and what replaced it

1. **First draft:** the logo draws itself as a line, extrudes into a house, and the camera flies over a city of A‑D buildings. **Why it failed:** every agency reel has a logo-to-building extrude, and a city fly-through is the "meaningless 3D" the brief bans. **Replaced with:** the floor plan *is* the mark, revealed by a poché fill (S11). There is no 3D city, and the only depth is a single architectural fold (S04).
2. **First draft:** "AI" shown as thin node-lines connecting buyers to buildings, with percentages ticking up. **Why it failed:** that's a dashboard, and any data company could swap its logo in. **Replaced with:** one plan rewritten per buyer, per reason, per hour (S07). The intelligence is in the *copy*, and it's in the agency's own medium.
3. **First draft:** the safe second idea, "the gap is a door, we walk through it into a beautiful home." **Why it was too soft:** it's literal and sentimental, and the home has no reason to be this home. **Replaced with:** the door opens to *9:16*, the real front door of property marketing (S08). The home's sentiment is earned by measurement (the sun study) instead of asserted.
4. **First draft:** discovering "the logo has a 53° slope" and using it as decoration. **Replaced with:** measuring it as **exactly 3:4**, and finding that the slope length equals the A's base. That became the opening proof (S01–S02), the stair pitch (S10), the wipe angle, the custom X, and the end line. One fact, used five ways.
5. **First draft end line:** "Real estate, reimagined." / "Built different." **Why it failed:** interchangeable. **Replaced with:** "Every property has an angle. We find the true one.", said while the logo's real angle is annotated on screen.
6. **First draft:** glitchy random text-scramble for label changes. **Why it failed:** template motion that reads as "tech." **Replaced with:** deterministic split-flap rewrites whose final flip switches *typeface* (mono → serif italic). The concept is carried by typography.
7. **First draft:** 12 red dots for the rope's knots. **Why it failed:** dots read as particles. **Replaced with:** perpendicular ticks on a rope, like survey tape, with pegs at the corners.
8. **First draft score:** a four-on-the-floor bed with risers. **Why it failed:** stock-feeling and unrelated to the brand. **Replaced with:** a just-intoned 3:4:5 chord as the sonic logo, a 3:4:5 polyrhythm under the intelligence section, stair tones climbing the harmonic series, and a reverb that grows as the building gets built.
9. **First draft funnel:** an actual funnel shape with stages. **Replaced with:** a section-drawn staircase at the logo's 3:4 pitch, a mouse-click that the groove ignores, and "We don't stop at the click."
10. **First draft logo reveal:** fade-up plus a light sweep on the final mark. **Replaced with:** the mark arrives at f1440 by drawing convention (walls thickening). The end card's only move is a wipe at 53.13° that inverts the palette.
11. **Considered and rejected:** rotating the plan 90° to hide the mark until S11. It broke the vertical-gap → door → 9:16 continuity. **Kept instead:** "half-recognition". The plan is busy with drawing conventions, so the mark is felt before it is seen, and the poché fill confirms it.
12. **Cut lines:** "Machine precision. Human desire." (cliché), "Real estate is sold in numbers." (the hatch shows it, so saying it was redundant), and an on-screen "thumb-stop 0.4s" stat (fabricated metric). The S09 parody is kept fast and blurred so it reads as category commentary, not as mocking a competitor.

**Risks for the build team**
- The S04 fold is the only 3D. Implement it as two CSS/Three planes with a shared hinge line and perspective 2000px. Keep the plan's linework as SVG textures, or render orthographic SVG per frame with a 2D projective transform.
- Wall-thickening in S11: draw the mark outline with stroke width w (MU) inside a `clipPath` of the mark itself, and animate w. That is cheaper and more exact than offsetting paths.
- Label rewrites must be deterministic (same seed, same frames) so audio FLAPs line up. Generate the character-flip schedule once and share it between the renderer and the audio script.
- All interpolation in **frames**, not seconds. Easing curves are given as cubic-beziers and must be solved as such (x→t Newton solve), not approximated.
