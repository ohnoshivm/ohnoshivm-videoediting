/**
 * edit.json contract — see skills/talking-head-shorts/references/edit-schema.md
 *
 * All times are milliseconds on the tightened timeline (the timeline of
 * aroll.mp4 / words.json produced by shorts-prep.mjs). Asset paths are
 * relative to the Remotion project's public/ folder.
 */

export type Word = {text: string; startMs: number; endMs: number};

export type PanelName =
  | 'paper'
  | 'cream'
  | 'beige'
  | 'sand'
  | 'slate'
  | 'navy'
  | 'charcoal'
  | 'ink';

export type SegmentLayout = 'face' | 'split' | 'graphic';

export type Side = {label: string; color: string; value: number; icon?: string};

export type Annotation = {
  kind: 'box' | 'strike';
  atMs: number;
  /** [x, y, w, h] in 0–1 of the image box */
  rect: [number, number, number, number];
  color?: string;
};

export type ImageGraphic = {
  kind: 'image';
  src: string | {atMs: number; src: string}[];
  widthPct?: number;
  backdrop?: 'none' | 'blur';
  annotations?: Annotation[];
};

export type LogoTileGraphic = {
  kind: 'logoTile';
  src?: string;
  glyph?: string;
  label?: string;
  /** e.g. "THE FIRST" */
  ordinal?: string;
};

export type CounterGraphic = {
  kind: 'counter';
  from: number;
  to: number;
  format?: 'k' | 'comma' | 'percent';
  label?: string;
  icon?: string;
  startMs?: number;
  durMs?: number;
  sub?: {label: string; from: number; to: number}[];
};

export type TerminalGraphic = {
  kind: 'terminal';
  title?: string;
  lines: {atMs: number; text: string; color?: string}[];
};

export type CompareGraphic = {
  kind: 'compare';
  left: Side;
  right: Side;
  startMs?: number;
  durMs?: number;
};

export type LineChartGraphic = {
  kind: 'lineChart';
  points: number[];
  color?: string;
  label?: string;
  startMs?: number;
  durMs?: number;
};

export type WordmarkGraphic = {
  kind: 'wordmark';
  text: string;
  tags?: {label: string; color: string}[];
};

export type PortraitGraphic = {
  kind: 'portrait';
  src: string;
  label?: string;
};

export type Graphic =
  | ImageGraphic
  | LogoTileGraphic
  | CounterGraphic
  | TerminalGraphic
  | CompareGraphic
  | LineChartGraphic
  | WordmarkGraphic
  | PortraitGraphic;

export type Segment = {
  /** fromMs = a word's startMs (except the first, 0) */
  fromMs: number;
  toMs: number;
  layout: SegmentLayout;
  /** face only; adjacent face shots must differ */
  zoom?: 1 | 1.12 | 1.25;
  panel?: PanelName;
  /** leaf shadow; light panels only */
  gobo?: boolean;
  /** required for split and graphic */
  graphic?: Graphic;
  /** headline words drawn in accent ("CLAUDE") */
  accentWords?: string[];
  /** split only: false keeps the head inside the card even when a matte exists */
  popOut?: boolean;
};

/**
 * Median face box written by scripts/shorts-matte.swift, normalized to the
 * frame with a TOP-LEFT origin. eyeY is the eye line (top + 0.38 h).
 */
export type Face = {
  cx: number;
  cy: number;
  w: number;
  h: number;
  eyeY: number;
};

export type Emphasis =
  | {
      style: 'twoTier';
      fromMs: number;
      toMs: number;
      lead: string;
      key: string;
    }
  | {
      style: 'semantic';
      fromMs: number;
      toMs: number;
      text: string;
      dir: 'up' | 'down';
    };

export type SfxName = 'whoosh' | 'pop' | 'click' | 'tick' | 'ding';

export type Fx =
  | {kind: 'lightLeak'; atMs: number}
  | {kind: 'sfx'; atMs: number; name: SfxName; gainDb?: number};

export type Edit = {
  aroll: string;
  words: string;
  /** VP9 + alpha person cutout over the same timeline (shorts-prep --matte) */
  matte?: string;
  /** median face box for the split layout's framing (shorts-prep --matte) */
  face?: Face;
  accent: string;
  /** twoTier gradient end (default accent) */
  accentSoft?: string;
  /** default: last word end + 400 */
  durationMs?: number;
  /** contiguous, ordered, cover [0, duration] */
  segments: Segment[];
  /** caption overrides on face segments */
  emphasis?: Emphasis[];
  fx?: Fx[];
};

/**
 * Runtime props of the composition: the edit plus the resolved Word[] that
 * calculateMetadata fetches from <public>/<edit.words>.
 */
export type ShortsEditProps = Edit & {wordsData?: Word[]};

export const FPS = 30;
export const FRAME_MS = 1000 / 30;

export const msToFrame = (ms: number): number => Math.round(ms / FRAME_MS);
export const frameToMs = (frame: number): number => frame * FRAME_MS;
