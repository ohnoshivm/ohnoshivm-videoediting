> Current implementation contract, not the full upgraded creative direction. Arbitrary video inserts, keyed motion and a ducked music bed are not implemented here. The validator requires a CTA even when none is spoken; never fabricate one to pass. Report the limitation.

# edit.json — the edit decision list

The agent's whole creative job is to write this file. The Remotion kit (`ShortsEdit` composition) renders it, and `shorts-validate.mjs` checks it. All times are **milliseconds on the tightened timeline** (the timeline of `aroll.mp4` / `words.json` produced by `shorts-prep.mjs`). Asset paths are relative to the project's `public/` folder.

```ts
type Edit = {
  aroll: string;              // "shorts/<slug>/aroll.mp4"
  words: string;              // "shorts/<slug>/words.json"  → Word[]
  matte?: string;             // "shorts/<slug>/person.webm" — VP9 + alpha person cutout
  face?: Face;                // median face box; frames the split card
  accent: string;             // topic brand colour, e.g. "#D97757"
  accentSoft?: string;        // twoTier gradient end (default accent)
  durationMs?: number;        // default: last word end + 400
  segments: Segment[];        // contiguous, ordered, cover [0, duration]
  emphasis?: Emphasis[];      // caption overrides on face segments
  fx?: Fx[];
};

type Word = { text: string; startMs: number; endMs: number };

// Normalized to the frame, top-left origin; eyeY is the eye line (measured from
// the pupils, else top + 0.38 h). shorts-prep writes both fields for you.
type Face = { cx: number; cy: number; w: number; h: number; eyeY: number };

type Segment = {
  fromMs: number; toMs: number;              // fromMs = a word's startMs (except the first, 0)
  layout: "face" | "split" | "graphic";
  zoom?: 1 | 1.12 | 1.25;                    // face only; adjacent face shots must differ
  panel?: "paper" | "cream" | "beige" | "sand" | "slate" | "navy" | "charcoal" | "ink";
  gobo?: boolean;                            // leaf shadow; light panels only
  graphic?: Graphic;                         // required for split and graphic
  accentWords?: string[];                    // headline words drawn in accent ("CLAUDE")
  popOut?: boolean;                          // split only; false keeps the head inside the card
};

type Graphic =
  | { kind: "image"; src: string | { atMs: number; src: string }[];   // sequence = swap on cue words
      widthPct?: number; backdrop?: "none" | "blur"; annotations?: Annotation[] }
  | { kind: "logoTile"; src?: string; glyph?: string; label?: string; ordinal?: string }  // ordinal: "THE FIRST"
  | { kind: "counter"; from: number; to: number; format?: "k" | "comma" | "percent";
      label?: string; icon?: string; startMs?: number; durMs?: number;
      sub?: { label: string; from: number; to: number }[] }
  | { kind: "terminal"; title?: string; lines: { atMs: number; text: string; color?: string }[] }
  | { kind: "compare"; left: Side; right: Side; startMs?: number; durMs?: number }
  | { kind: "lineChart"; points: number[]; color?: string; label?: string; startMs?: number; durMs?: number }
  | { kind: "wordmark"; text: string; tags?: { label: string; color: string }[] }
  | { kind: "portrait"; src: string; label?: string };

type Side = { label: string; color: string; value: number; icon?: string };   // value 0–100
type Annotation = { kind: "box" | "strike"; atMs: number; rect: [number, number, number, number]; color?: string }; // rect in 0–1 of the graphic

type Emphasis =
  | { style: "twoTier"; fromMs: number; toMs: number; lead: string; key: string }  // key fades in at keyMs (default: first word of key)
  | { style: "semantic"; fromMs: number; toMs: number; text: string; dir: "up" | "down" };

type Fx =
  | { kind: "lightLeak"; atMs: number }
  | { kind: "sfx"; atMs: number; name: "whoosh" | "pop" | "click" | "tick" | "ding"; gainDb?: number };
```

## Captions are automatic

They come from `words.json`, so never write captions by hand. Chunking and styling follow the style bible: `word` on face/split, `headline` on graphic, chrome-gradient headline under an ordinal `logoTile`. An `emphasis` entry replaces the automatic captions inside its window. A caption chunk that outlives a layout cut re-resolves its style from the segment on screen at that frame, so it moves with the cut.

## The split pop-out

`matte` + `face` are what let the presenter's head break out above the face card. Both come from `shorts-prep.mjs` (step 5, `scripts/shorts-matte.swift` via Apple Vision) and are skipped with `--no-matte`. With them present every `split` segment draws the person cutout above the card edge; set `popOut: false` on a segment to keep that one inside the card. Without a matte the same face-based framing applies, minus the pop-out. Treat `face` as measured data: re-running the matte is the only reason to change it.

## Rules the validator enforces

1. Segments are contiguous, ordered and cover `[0, durationMs]`. Every boundary except 0 sits within ±1 frame of a word `startMs`.
2. No two adjacent `face` segments. (Jump cuts inside one face segment come from the tightening, not from extra segments.)
3. `split` and `graphic` need a `graphic`. `face` must not have one.
4. Segment length is 600 – 4500 ms, and the median target is ≈ 2000 ms (warning only).
5. Face share of runtime is 15 – 40 % (warning).
6. The last segment is `face` and has a `twoTier` emphasis (the CTA).
7. Referenced assets exist under `public/` (including `matte`).
8. At most one `lightLeak`.
9. Ordinal labels are a list, not a flourish: `ordinal` may only appear as a sequence starting at `THE FIRST`, in order, with at least two items. One lone "THE FIRST" on a clip that is not a list fails.
