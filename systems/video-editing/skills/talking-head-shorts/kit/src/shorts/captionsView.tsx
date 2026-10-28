/**
 * Caption rendering: automatic word / headline captions plus the two emphasis
 * overrides (twoTier and semantic).
 */
import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';
import {CANVAS, CAPTION, FONTS, GRAPHIC, SERIF, SERIF_STROKE} from './theme';
import {
  captionStyleForSegment,
  fitFontSize,
  firstWordStartMs,
  segmentAt,
  splitAccent,
} from './captions';
import type {Chunk} from './captions';
import type {Emphasis, Segment, Word} from './types';
import {FRAME_MS} from './types';

const clampOpts = {
  extrapolateLeft: 'clamp' as const,
  extrapolateRight: 'clamp' as const,
};

export const CaptionChunkView: React.FC<{
  chunk: Chunk;
  segments: Segment[];
  accent: string;
}> = ({chunk, segments, accent}) => {
  const frame = useCurrentFrame();
  // The caption belongs to the chunk, but its voice belongs to the layout that
  // is on screen RIGHT NOW: a chunk that survives a cut has to move with it.
  const nowMs = chunk.startMs + frame * FRAME_MS;
  const segment = segmentAt(segments, nowMs);
  const style = captionStyleForSegment(segment);
  const entry = interpolate(frame, [0, Math.max(1, style.entryFrames)], [0, 1], clampOpts);

  const wrapper: React.CSSProperties = {
    position: 'absolute',
    left: 0,
    right: 0,
    top: style.yCentre,
    transform: 'translateY(-50%)',
    display: 'flex',
    justifyContent: 'center',
    padding: '0 5%',
    pointerEvents: 'none',
  };

  if (style.kind === 'word') {
    return (
      <div style={{...wrapper, opacity: entry}}>
        <div
          style={{
            maxWidth: style.maxWidth,
            textAlign: 'center',
            fontFamily: FONTS.sans,
            fontWeight: style.fontWeight,
            fontSize: style.fontSize,
            letterSpacing: style.letterSpacing,
            lineHeight: style.lineHeight,
            color: CAPTION.word.color,
            textShadow: CAPTION.word.shadow,
          }}
        >
          {chunk.text}
        </div>
      </div>
    );
  }

  const text = chunk.text.toUpperCase();
  const tokens = splitAccent(text, segment?.accentWords);
  const chromeStyle: React.CSSProperties = style.chrome
    ? {
        backgroundImage: `linear-gradient(180deg, ${GRAPHIC.chromeFrom} 0%, ${GRAPHIC.chromeTo} 100%)`,
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        color: 'transparent',
        WebkitTextFillColor: 'transparent',
      }
    : {color: style.ink};

  return (
    <div
      style={{
        ...wrapper,
        opacity: entry,
        transform: `translateY(calc(-50% + ${CAPTION.headline.yFrom * (1 - entry)}px))`,
      }}
    >
      <div
        style={{
          maxWidth: style.maxWidth,
          textAlign: 'center',
          fontFamily: SERIF.family,
          fontStyle: SERIF.style,
          fontWeight: style.fontWeight,
          fontSize: style.fontSize,
          letterSpacing: style.letterSpacing,
          lineHeight: style.lineHeight,
          transform: `scaleX(${style.scaleX})`,
          filter: `blur(${CAPTION.headline.blurFrom * (1 - entry)}px)`,
          whiteSpace: 'pre-wrap',
          ...SERIF_STROKE,
        }}
      >
        {tokens.map((token, i) =>
          token.space ? (
            <span key={i}>{token.text}</span>
          ) : (
            <span
              key={i}
              style={token.accented ? {color: accent} : chromeStyle}
            >
              {token.text}
            </span>
          ),
        )}
      </div>
    </div>
  );
};

export const EmphasisView: React.FC<{
  emphasis: Emphasis;
  words: Word[];
  accent: string;
  accentSoft?: string;
}> = ({emphasis, words, accent, accentSoft}) => {
  const frame = useCurrentFrame();
  const second = accentSoft ?? accent;

  if (emphasis.style === 'semantic') {
    const colour =
      emphasis.dir === 'up' ? CAPTION.semantic.up : CAPTION.semantic.down;
    return (
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: CAPTION.semantic.yCentre,
          transform: 'translateY(-50%)',
          textAlign: 'center',
          padding: '0 6%',
        }}
      >
        <div
          style={{
            fontFamily: FONTS.sans,
            fontWeight: 700,
            fontSize: CAPTION.semantic.fontSize,
            letterSpacing: '-0.02em',
            color: colour,
            textShadow: CAPTION.word.shadow,
          }}
        >
          {`\u2191 ${emphasis.text} \u2191`.replace(
            /\u2191/g,
            emphasis.dir === 'up' ? '\u2191' : '\u2193',
          )}
        </div>
      </div>
    );
  }

  const keyMs =
    firstWordStartMs(words, emphasis.key, emphasis.fromMs, emphasis.toMs) ??
    emphasis.fromMs + 250;
  const keyFrame = Math.max(1, Math.round((keyMs - emphasis.fromMs) / FRAME_MS));
  const keyIn = interpolate(
    frame,
    [keyFrame, keyFrame + CAPTION.twoTier.keyFadeFrames],
    [0, 1],
    clampOpts,
  );

  // The keyword is always quoted; the size shrinks before it can reach the edge.
  const keyText = `\u201C${emphasis.key}\u201D`;
  const keySize = fitFontSize(
    keyText,
    CAPTION.twoTier.keySize,
    CANVAS.width * CAPTION.twoTier.keyMaxWidthPct,
  );

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: CAPTION.twoTier.yCentre,
        transform: 'translateY(-50%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '0 6%',
      }}
    >
      <div
        style={{
          fontFamily: SERIF.family,
          fontStyle: SERIF.style,
          fontWeight: SERIF.leadWeight,
          fontSize: CAPTION.twoTier.leadSize,
          lineHeight: 1.05,
          color: '#FFFFFF',
          textShadow: CAPTION.word.shadow,
          textAlign: 'center',
          ...SERIF_STROKE,
        }}
      >
        {emphasis.lead.toLowerCase()}
      </div>
      <div
        style={{
          marginTop: CAPTION.twoTier.keyOverlap,
          fontFamily: FONTS.sans,
          fontWeight: 800,
          fontSize: keySize,
          lineHeight: 1.02,
          letterSpacing: '-0.02em',
          textAlign: 'center',
          whiteSpace: 'nowrap',
          opacity: keyIn,
          filter: `blur(${CAPTION.twoTier.keyBlurFrom * (1 - keyIn)}px) drop-shadow(0 2px 6px rgba(0,0,0,.6)) drop-shadow(0 6px 24px rgba(0,0,0,.45))`,
          backgroundImage: `linear-gradient(180deg, #FFFFFF 0%, ${second} 100%)`,
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          color: 'transparent',
          WebkitTextFillColor: 'transparent',
        }}
      >
        {keyText}
      </div>
    </div>
  );
};
