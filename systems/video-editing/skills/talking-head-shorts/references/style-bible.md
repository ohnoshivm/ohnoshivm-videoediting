> Historical reference analysis. The upgraded `creative-standard.md` and `SKILL.md` take precedence over the strict motion, timing, CTA and style defaults below. Observations are inspiration, not performance evidence.

# Style bible — "proof-cut" talking-head shorts

Reverse-engineered from three reference shorts (one creator, same template): 720×1280, 30 fps, h264/AAC, 29.7 s / 37.4 s / 57.5 s. Topic: AI-tool news. Evidence tags: **[M]** measured with a deterministic tool, **[O]** observed in extracted frames, **[I]** inferred, **[?]** unknown / unverified. Build at 1080×1920 (all px values below are at that size).

**Concept in one line:** the face is punctuation; the proof is the picture. About 75 % of the runtime shows a graphic that proves what is being said, and the presenter appears full-frame only for claims, punchlines and the CTA.

## 1. Structure (all three follow it) [O]

| Beat | Time | Layout | What happens |
|---|---|---|---|
| Hook | 0 – ~1.2 s | split | Topic logo/brand mark on top, face below, first words are the news ("someone released a free…", "Anthropic just launched…", "new to Claude Code?"). No intro, no title card. |
| Reveal | ~1 – 4.5 s | graphic | Names the thing in the serif headline ("IT'S CALLED / LAYA", "THEIR NEW / FREE / LEARNING…", "THESE / 5 FREE PLUGINS"). |
| Claim | 1 – 2 s | face | Value claim as a two-tier emphasis caption ("completely / free", "to instantly / 10x your setup") or semantic captions ("↑ faster ↑", "↓ cheaper ↓"). |
| Proof body | bulk | split ↔ graphic ↔ face | Every claim gets visual proof: star counter, benchmark race, course pages, terminal run, chart. Listicles use ordinal cards "THE FIRST … THE FIFTH". |
| Authority (optional) | 2 s | split | Who made it: portrait on a colour field, "made by …". |
| CTA | last 3 – 4 s | face (tight) | Two-tier caption `comment` / `"KEYWORD"` in accent gradient; spoken "comment X and I'll send you…". Ends on the CTA, no outro card. |

## 2. Layouts

Three layouts only. A layout change is always a hard cut on a word onset [O].

- **face**: a-roll fills the frame (cover). Per-shot zoom ∈ {1.00, 1.12, 1.25}. Consecutive face shots never repeat the same zoom. Framing is static within a shot: no slow push-ins (start/end frames of 3–4 s face shots match) [O]. Caption sits at y ≈ 70 % (≈1345 px).
- **split**: full-frame colour panel. Graphic is centred in the band y 6 – 44 %. **Face card**: inset 24 px left/right, top edge at y ≈ 62 % (≈1190 px), runs off the bottom, top corners radius ≈ 150 px, soft shadow `0 -8px 60px rgba(0,0,0,.18)`. The a-roll inside the card is framed on the face box: the face is ≈ 36 % of the frame width (clamped so the video always covers the card) and the eye line sits 125 px below the card's top edge. **Pop-out** [M]: the presenter's cutout (Apple Vision person segmentation, carried as VP9 + alpha `person.webm`) is drawn over the panel above the card edge with the *same* transform and the same source frames, so hair and forehead break ≈ 240 px above the card while the room background stays inside it, with no seam at the edge. Caption at y ≈ 47 % (≈900 px), between graphic and card [O].
- **graphic**: full-frame panel. Graphic centred in y 8 – 55 %, serif headline at y ≈ 67 % (≈1290 px) [O].

Measured share of runtime (video 3) [O, 0.5 s resolution]: face ≈ 25 %, split ≈ 45 %, graphic ≈ 30 %. Never two face segments back to back. Segment length runs 0.8 – 4.3 s with a median of ≈ 2.0 s. Scene-detected cuts: 10 / 21 / 27 [M]. Jump cuts inside face shots fall below the detector threshold.

## 3. Caption system (the signature)

Captions are always on. Their style is decided by layout, never chosen ad hoc.

| Style | Where | Spec |
|---|---|---|
| **word** | face, split | Bold grotesk sans (looks like SF Pro Display Bold [I]; free match **Inter Tight 700**). 84 px on face, 72 px on split, tracking −0.02 em, white. Shadow `0 3px 18px rgba(0,0,0,.55), 0 1px 3px rgba(0,0,0,.35)`. Case as spoken (lowercase), no end punctuation. |
| **headline** | graphic | Heavy condensed italic serif, UPPERCASE (font identity [?]; free match **Instrument Serif italic 400 + 1.5px same-colour text-stroke (scaleX 1)**, tracking −0.04 em). ≈ 130 px. White on dark panels, #111 on light panels. Words belonging to the topic brand get the accent colour ("OF **CLAUDE**", "WHILE **JEV**"). A two-part phrase stacks as two lines, second line in accent ("THESE" / "**5 FREE PLUGINS**"). |
| **twoTier** | face only | Lead line: serif italic lowercase ≈ 100 px, white (Instrument Serif italic 400 + 1.5px same-colour text-stroke (scaleX 1)). Key line: sans 800 ≈ 140 px, vertical gradient white → accent, plus dark glow. The key is wrapped in curly quotes (“POPPI” rather than "POPPI") and auto-shrinks so it never exceeds 90 % of the frame width. The key overlaps the bottom ≈ 25 % of the lead (negative gap). The lead appears first; the key fades in over 3 frames on its first spoken word [O]. Use it for the punchline of a face shot and for the CTA. |
| **semantic** | face | Comparatives: "↑ faster ↑", "↓ cheaper ↓", sans 700 in #8CF58F with arrows on both sides [O]. Use red #FF6B6B for "worse" [I]. |
| **ordinal** | graphic (list items) | "THE FIRST … THE FIFTH": serif italic uppercase ≈ 100 px above a logo tile, fill gradient accent → near-transparent white downward. The item name sits below the tile in a grey chrome gradient (#4A4A4A → #BDBDBD) [O]. |

**Chunking [O]:** one word per caption, or two when a short function word leads ("of Jev", "a free", "the exact", "to set it" → max 3 if all ≤ 3 chars). Max ≈ 14 characters per chunk. A chunk appears on its first word's onset and stays until the next chunk replaces it: no gaps, no exit animation, no per-word karaoke highlight. Entry is effectively instant (0 – 2 frame fade) [O]. Headline/ordinal entries are softer: 3 – 4 frames fade with blur 10 → 0 px and y −16 → 0 [O]. A chunk that outlives a layout cut changes style with it: the style is resolved from the segment on screen at the current frame, never from where the chunk started.

## 4. Graphic vocabulary [O]

Every graphic is a clean, faithful recreation or screenshot of the real product UI: GitHub repo card, README, terminal, course pages, plugin installer, chart. Never stock footage, never abstract decoration. Recurring primitives:

1. **Screenshot card**: rounded 24 px, shadow `0 20px 60px rgba(0,0,0,.25)`, centred. On dark or busy scenes the backdrop is a **blurred, darkened, enlarged copy of the same image** (scale 1.6, blur 40 px, brightness .45).
2. **Logo tile**: white rounded square (radius 22 % of size), shadow, icon centred, optional mono label inside ("claude-mem").
3. **Odometer counter**: digits roll in columns with vertical motion blur, 0.8 – 1.2 s ease-out, landing on the spoken number (0.0k → 28.1k stars; 24,585 → 100,000 skills). Secondary stats stagger in 4 – 6 frames later.
4. **Terminal**: dark window with traffic-light dots, mono text, lines type on.
5. **Compare race**: two side-by-side panels (cloud vs local) racing. Waffle grids fill to a percentage (91 % vs 95 %), the winner highlighted in its brand colour.
6. **Line chart**: star-history-style line drawing left → right.
7. **Wordmark**: huge black sans title ("Agent Skills") with coloured pill tags.
8. **Portrait**: person cutout on a flat warm colour (#D9A574) with a small label "made by …".
9. **Annotations**: amber rounded highlight box (#F5B83D, 4 px, radius 14) drawn on the cue word; red pen strike (#E5362C) drawn diagonally over 6 – 8 frames; dashed connector lines (file icons → output document).
10. **Mascot / sticker**: brand pixel mascot with tiny state labels ("READING…").

Graphics arrive already in place on the cut. Their *parts* animate: counters roll, lines draw, cards swap on cue words (one card per listed item while the headline names each).

## 5. Colour and surface [O]

- Panels: paper #FAFAF8, cream #F6F1EA, beige #E8E0D5, sand #D9A574, slate #232A36, navy #0B1A33, charcoal #141414, ink #0D1117. Pick per graphic so the screenshot sits on a matching surface.
- Accent = the topic's brand colour: Claude/Anthropic coral #D97757 / peach #F4A27A; a pink/magenta #E040FB for the "Jev" brand. Accent appears in headline keywords, twoTier gradients, CTA keyword and ordinals, nowhere else.
- Light panels carry a faint **leaf-shadow gobo** (blurred foliage shadow, 6 – 10 % opacity, from a top corner).
- A-roll grade: natural, slightly warm, soft daylight, desaturated sage/grey wall. No LUT look, no grain, no vignette [O].

## 6. Transitions and FX [O]

- Hard cuts only between layouts. No whips, zoom transitions or crossfades in any sampled frame.
- **Light-leak flicker** (once per video at most, at a topic pivot): 2 frames warm orange/yellow flash (screen blend), 1 clean frame, 2 flash frames, clean. Video 2 at 21.07 – 21.27 s [M scdet burst + O].
- No shake, speed ramps, freeze frames or reverses [O].

## 7. Audio [M]

- Integrated loudness −14.2 to −14.3 LUFS, loudness range 1.7 – 2.6 LU: a heavily compressed voice normalised to −14 LUFS.
- Speech is continuous: zero gaps ≥ 80 ms below −40 dBFS in any of the three. Every pause and breath is cut, or covered by a constant bed.
- Music bed, BPM and SFX: see §8.

## 8. Audio, from Gemini

_Pending: filled in from the `watch` Gemini pass._

## 9. Fonts (free stand-ins; swap if licensed originals are available)

- Sans: Inter Tight 700/800 (`@remotion/google-fonts/InterTight`)
- Serif italic: Instrument Serif italic 400 + 1.5px same-colour text-stroke (scaleX 1) (`@remotion/google-fonts/InstrumentSerif`). Headline, ordinal and twoTier lead all read the single `SERIF` token in `theme.ts` — family, weight, scaleX and an optional text stroke move together, so the editorial face can be swapped in one place.
- Mono (terminal, labels): JetBrains Mono 400/600
