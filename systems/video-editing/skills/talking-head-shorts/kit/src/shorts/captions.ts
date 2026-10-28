/**
 * Pure caption helpers: word chunking, style selection and accent matching.
 * No React, no Remotion — safe to unit test.
 */
import {CAPTION, SERIF, panelInk} from './theme';
import type {Segment, Word} from './types';

export type Chunk = {
  text: string;
  words: Word[];
  startMs: number;
  endMs: number;
};

const TRAILING_PUNCT = /[\s.,!?;:]+$/;

const charLen = (word: Word): number =>
  word.text.replace(TRAILING_PUNCT, '').length;

const MAX_CHUNK_WORDS = 3;
const MAX_CHUNK_CHARS = 14;
const FUNCTION_WORD_MAX_CHARS = 3;

/**
 * One word per chunk; a word of <= 3 chars (function word) joins the NEXT word.
 * Max 3 words and ~14 chars per chunk. Chunks are gapless: each one runs until
 * the next chunk's first word.
 */
export function chunkWords(words: Word[], endMs?: number): Chunk[] {
  const chunks: Chunk[] = [];
  const lastEnd = words.length > 0 ? words[words.length - 1].endMs : 0;
  const totalMs = endMs ?? lastEnd + 400;

  let i = 0;
  while (i < words.length) {
    const group: Word[] = [words[i]];
    let chars = charLen(words[i]);
    let j = i + 1;

    if (charLen(words[i]) <= FUNCTION_WORD_MAX_CHARS) {
      while (group.length < MAX_CHUNK_WORDS && j < words.length) {
        if (!group.every((w) => charLen(w) <= FUNCTION_WORD_MAX_CHARS)) {
          break;
        }
        const next = words[j];
        if (chars + 1 + charLen(next) > MAX_CHUNK_CHARS) {
          break;
        }
        group.push(next);
        chars += 1 + charLen(next);
        j += 1;
      }
    }

    const raw = group.map((w) => w.text).join(' ');
    chunks.push({
      text: raw.replace(TRAILING_PUNCT, ''),
      words: group,
      startMs: group[0].startMs,
      endMs: totalMs,
    });
    i = j;
  }

  for (let k = 0; k < chunks.length; k += 1) {
    chunks[k].endMs =
      k + 1 < chunks.length ? chunks[k + 1].startMs : totalMs;
  }

  return chunks;
}

export const normaliseWord = (raw: string): string =>
  raw
    .toLowerCase()
    .replace(/[“”„«»"'‘’`.,!?;:()[\]{}<>/\\|—–_-]/g, '')
    .trim();

export type CaptionKind = 'word' | 'headline';

export type CaptionStyle = {
  kind: CaptionKind;
  fontSize: number;
  yCentre: number;
  /** true => chrome gradient fill (headline under an ordinal logoTile) */
  chrome: boolean;
  ink: string;
  fontWeight: number;
  letterSpacing: string;
  scaleX: number;
  entryFrames: number;
  maxWidth: string;
  lineHeight: number;
};

/** The caption style is decided by the layout of the segment, never ad hoc. */
export function captionStyleForSegment(segment: Segment | undefined): CaptionStyle {
  const layout = segment?.layout ?? 'graphic';

  if (layout === 'face' || layout === 'split') {
    const size =
      layout === 'face' ? CAPTION.word.face : CAPTION.word.split;
    return {
      kind: 'word',
      fontSize: size.fontSize,
      yCentre: size.yCentre,
      chrome: false,
      ink: CAPTION.word.color,
      fontWeight: CAPTION.word.weight,
      letterSpacing: CAPTION.word.letterSpacing,
      scaleX: 1,
      entryFrames: CAPTION.word.entryFrames,
      maxWidth: CAPTION.word.maxWidth,
      lineHeight: 1.15,
    };
  }

  const hasOrdinal =
    segment?.graphic?.kind === 'logoTile' &&
    Boolean(segment.graphic.ordinal && segment.graphic.ordinal.length > 0);

  return {
    kind: 'headline',
    fontSize: CAPTION.headline.fontSize,
    yCentre: CAPTION.headline.yCentre,
    chrome: hasOrdinal,
    ink: panelInk(segment?.panel),
    fontWeight: SERIF.headlineWeight,
    letterSpacing: CAPTION.headline.letterSpacing,
    scaleX: SERIF.scaleX,
    entryFrames: CAPTION.headline.entryFrames,
    maxWidth: CAPTION.headline.maxWidth,
    lineHeight: CAPTION.headline.lineHeight,
  };
}

/**
 * Advance widths in em for the sans-800 CTA key, uppercase. A little wide on
 * purpose: the key must never reach the frame edge, an underestimate would.
 */
const KEY_ADVANCE: Record<string, number> = {
  A: 0.7, B: 0.67, C: 0.69, D: 0.7, E: 0.61, F: 0.58, G: 0.7, H: 0.73,
  I: 0.3, J: 0.53, K: 0.67, L: 0.56, M: 0.9, N: 0.74, O: 0.74, P: 0.65,
  Q: 0.74, R: 0.67, S: 0.64, T: 0.63, U: 0.72, V: 0.66, W: 0.93, X: 0.67,
  Y: 0.64, Z: 0.62, ' ': 0.26, '\u201C': 0.34, '\u201D': 0.34, '-': 0.4,
  '.': 0.3, ',': 0.3, '!': 0.32, '?': 0.62, '&': 0.72,
};

/** Largest size ≤ baseSize whose estimated width fits maxWidth px. */
export function fitFontSize(
  text: string,
  baseSize: number,
  maxWidth: number,
): number {
  const em = [...text].reduce((sum, ch) => sum + (KEY_ADVANCE[ch] ?? 0.64), 0);
  const width = em * baseSize;
  if (width <= maxWidth) {
    return baseSize;
  }
  return Math.max(24, Math.floor((maxWidth / width) * baseSize));
}

export type AccentToken = {text: string; accented: boolean; space: boolean};

/**
 * Split chunk text into renderable tokens, flagged when they belong to
 * segment.accentWords (case-insensitive, punctuation-stripped).
 */
export function splitAccent(
  text: string,
  accentWords: string[] | undefined,
): AccentToken[] {
  const wanted = new Set((accentWords ?? []).map(normaliseWord));
  return text.split(/(\s+)/).filter((part) => part.length > 0).map((part) => {
    const space = /^\s+$/.test(part);
    return {
      text: part,
      space,
      accented: !space && wanted.has(normaliseWord(part)),
    };
  });
}

/** Start of the first word inside [fromMs, toMs) matching `phrase`'s first word. */
export function firstWordStartMs(
  words: Word[],
  phrase: string,
  fromMs: number,
  toMs: number,
): number | undefined {
  const target = normaliseWord(phrase.split(/\s+/)[0] ?? '');
  if (!target) {
    return undefined;
  }
  for (const word of words) {
    if (word.startMs < fromMs - 0.5) {
      continue;
    }
    if (word.startMs >= toMs) {
      break;
    }
    if (normaliseWord(word.text) === target) {
      return word.startMs;
    }
  }
  return undefined;
}

export function segmentAt(
  segments: Segment[],
  ms: number,
): Segment | undefined {
  return segments.find((s) => ms >= s.fromMs - 0.5 && ms < s.toMs - 0.5) ??
    segments[segments.length - 1];
}
