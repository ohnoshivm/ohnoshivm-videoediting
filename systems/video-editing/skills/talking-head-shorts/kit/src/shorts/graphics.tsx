/**
 * The graphic vocabulary: screenshot card, logo tile, odometer counter,
 * terminal, compare race, line chart, wordmark, portrait, annotations.
 * Every size is authored at 1080x1920.
 */
import React from 'react';
import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
} from 'remotion';
import {
  FONTS,
  GRAPHIC,
  SERIF,
  SHADOWS,
  isDarkPanel,
  panelInk,
} from './theme';
import type {
  Annotation,
  CompareGraphic,
  CounterGraphic,
  Graphic,
  ImageGraphic,
  LineChartGraphic,
  LogoTileGraphic,
  PortraitGraphic,
  Segment,
  Side,
  TerminalGraphic,
  WordmarkGraphic,
} from './types';
import {FRAME_MS} from './types';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

const easeOut = Easing.out(Easing.cubic);

/** local frame at which a timeline-ms start falls inside this segment */
export const localStartFrame = (
  startMs: number | undefined,
  segFromMs: number,
): number =>
  startMs === undefined
    ? 0
    : Math.max(0, Math.round((startMs - segFromMs) / FRAME_MS));

const progressAt = (
  frame: number,
  startFrame: number,
  durFrames: number,
): number =>
  easeOut(clamp01((frame - startFrame) / Math.max(1, durFrames)));

export const resolveImageSrc = (
  src: ImageGraphic['src'],
  atMs: number,
): string => {
  if (typeof src === 'string') {
    return src;
  }
  if (src.length === 0) {
    return '';
  }
  const ordered = [...src].sort((a, b) => a.atMs - b.atMs);
  let current = ordered[0].src;
  for (const step of ordered) {
    if (atMs >= step.atMs - 0.5) {
      current = step.src;
    }
  }
  return current;
};

/* ------------------------------------------------------------------ image */

const AnnotationView: React.FC<{a: Annotation; segFromMs: number}> = ({
  a,
  segFromMs,
}) => {
  const frame = useCurrentFrame();
  const start = localStartFrame(a.atMs, segFromMs);
  const boxIn = interpolate(frame, [start, start + 5], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: easeOut,
  });
  const draw = clamp01((frame - start) / 7);

  if (frame < start) {
    return null;
  }

  const style: React.CSSProperties = {
    position: 'absolute',
    left: `${a.rect[0] * 100}%`,
    top: `${a.rect[1] * 100}%`,
    width: `${a.rect[2] * 100}%`,
    height: `${a.rect[3] * 100}%`,
    pointerEvents: 'none',
  };

  if (a.kind === 'box') {
    return (
      <div
        style={{
          ...style,
          border: `4px solid ${a.color ?? GRAPHIC.annotationAmber}`,
          borderRadius: 14,
          opacity: boxIn,
          transform: `scale(${1.04 - 0.04 * boxIn})`,
        }}
      />
    );
  }

  return (
    <svg style={style} viewBox="0 0 100 100" preserveAspectRatio="none">
      <line
        x1={0}
        y1={100}
        x2={100 * draw * boxIn}
        y2={100 * (1 - draw * boxIn)}
        stroke={a.color ?? GRAPHIC.annotationRed}
        strokeWidth={7}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
};

const ImageGraphicView: React.FC<{g: ImageGraphic; segFromMs: number}> = ({
  g,
  segFromMs,
}) => {
  const frame = useCurrentFrame();
  const nowMs = segFromMs + frame * FRAME_MS;
  const entry = interpolate(frame, [0, 6], [0.96, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: easeOut,
  });
  const src = resolveImageSrc(g.src, nowMs);

  return (
    <div
      style={{
        position: 'relative',
        width: `${g.widthPct ?? 84}%`,
        transform: `scale(${entry})`,
      }}
    >
      <Img
        src={staticFile(src)}
        style={{
          display: 'block',
          width: '100%',
          height: 'auto',
          borderRadius: GRAPHIC.imageRadius,
          boxShadow: SHADOWS.imageCard,
        }}
      />
      {(g.annotations ?? []).map((a, i) => (
        <AnnotationView key={i} a={a} segFromMs={segFromMs} />
      ))}
    </div>
  );
};

/** blurred, darkened, enlarged full-frame copy of the image, behind the card */
export const GraphicBackdrop: React.FC<{
  graphic: Graphic | undefined;
  segFromMs: number;
}> = ({graphic, segFromMs}) => {
  const frame = useCurrentFrame();
  if (graphic?.kind !== 'image' || graphic.backdrop !== 'blur') {
    return null;
  }
  const src = resolveImageSrc(graphic.src, segFromMs + frame * FRAME_MS);
  return (
    <AbsoluteFill style={{overflow: 'hidden'}}>
      <Img
        src={staticFile(src)}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform: 'scale(1.6)',
          filter: 'blur(40px) brightness(0.45)',
        }}
      />
    </AbsoluteFill>
  );
};

/* -------------------------------------------------------------- logoTile */

const Ordinal: React.FC<{text: string; accent: string}> = ({text, accent}) => {
  const frame = useCurrentFrame();
  const entry = interpolate(frame, [0, 4], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: easeOut,
  });
  return (
    <div
      style={{
        fontFamily: SERIF.family,
        fontStyle: SERIF.style,
        fontWeight: SERIF.headlineWeight,
        fontSize: GRAPHIC.ordinalSize,
        letterSpacing: '-0.02em',
        textTransform: 'uppercase',
        transform: `scaleX(${SERIF.scaleX}) translateY(${-16 * (1 - entry)}px)`,
        opacity: entry,
        filter: `blur(${10 * (1 - entry)}px)`,
        backgroundImage: `linear-gradient(180deg, ${accent} 0%, rgba(255,255,255,0.35) 100%)`,
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        color: 'transparent',
        WebkitTextFillColor: 'transparent',
        lineHeight: 1.05,
      }}
    >
      {text}
    </div>
  );
};

const LogoTileGraphicView: React.FC<{g: LogoTileGraphic; accent: string}> = ({
  g,
  accent,
}) => {
  const frame = useCurrentFrame();
  const tileScale = spring({
    frame,
    fps: 30,
    from: 0.9,
    to: 1,
    durationInFrames: 8,
    config: {damping: 200},
  });
  const labelSize = GRAPHIC.logoTileLabelSize;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 30,
      }}
    >
      {g.ordinal ? <Ordinal text={g.ordinal} accent={accent} /> : null}
      <div
        style={{
          width: GRAPHIC.logoTileSize,
          height: GRAPHIC.logoTileSize,
          borderRadius: GRAPHIC.logoTileRadius,
          background: '#FFFFFF',
          boxShadow: SHADOWS.logoTile,
          transform: `scale(${tileScale})`,
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {g.src ? (
          <Img
            src={staticFile(g.src)}
            style={{
              width: `${GRAPHIC.logoTileIconPct * 100}%`,
              height: `${GRAPHIC.logoTileIconPct * 100}%`,
              objectFit: 'contain',
            }}
          />
        ) : (
          <div
            style={{
              fontFamily: FONTS.sans,
              fontWeight: 800,
              fontSize: GRAPHIC.logoTileGlyph,
              color: '#111111',
              lineHeight: 1,
            }}
          >
            {g.glyph ?? '★'}
          </div>
        )}
        {g.label ? (
          <div
            style={{
              position: 'absolute',
              bottom: 26,
              left: 0,
              right: 0,
              textAlign: 'center',
              fontFamily: FONTS.mono,
              fontWeight: 400,
              fontSize: labelSize,
              color: '#333333',
              opacity: 0.85,
            }}
          >
            {g.label}
          </div>
        ) : null}
      </div>
    </div>
  );
};

/* --------------------------------------------------------------- counter */

type NumFormat = 'k' | 'comma' | 'percent';

type Slot = {kind: 'digit'; place: number} | {kind: 'char'; ch: string};

const numberStructure = (target: number, format: NumFormat) => {
  const scaledTarget = format === 'k' ? target / 1000 : target;
  const decimals = format === 'k' ? 1 : 0;
  const intLen = String(Math.floor(Math.abs(scaledTarget))).length;
  const slots: Slot[] = [];
  for (let i = 0; i < intLen; i += 1) {
    if (format === 'comma' && i > 0 && (intLen - i) % 3 === 0) {
      slots.push({kind: 'char', ch: ','});
    }
    slots.push({kind: 'digit', place: intLen - 1 - i});
  }
  if (decimals > 0) {
    slots.push({kind: 'char', ch: '.'});
    for (let d = 1; d <= decimals; d += 1) {
      slots.push({kind: 'digit', place: -d});
    }
  }
  const suffix = format === 'k' ? 'k' : format === 'percent' ? '%' : '';
  return {slots, suffix};
};

/**
 * A mechanical odometer wheel: the lowest displayed wheel spins continuously,
 * every wheel above it only turns during the last tenth of the wheel below
 * (that is what keeps the higher digits snapped to their number while lower
 * ones roll).
 */
const digitPos = (
  scaledValue: number,
  place: number,
  lowest: boolean,
): number => {
  const fv = Math.abs(scaledValue) / Math.pow(10, place);
  const digit = Math.floor(fv) % 10;
  const within = fv - Math.floor(fv);
  const frac = lowest
    ? within
    : Math.min(1, Math.max(0, (within - 0.9) / 0.1));
  return digit + frac;
};

/**
 * Odometer: every digit is a vertical 0-9 column that scrolls, with vertical
 * motion blur proportional to the per-frame velocity (zero at rest).
 */
const Odometer: React.FC<{
  value: number;
  prevValue: number;
  target: number;
  format: NumFormat;
  fontSize: number;
  color: string;
  idPrefix: string;
}> = ({value, prevValue, target, format, fontSize, color, idPrefix}) => {
  const cellH = fontSize;
  const colW = fontSize * 0.62;
  const {slots, suffix} = numberStructure(target, format);
  const scaled = format === 'k' ? value / 1000 : value;
  const scaledPrev = format === 'k' ? prevValue / 1000 : prevValue;

  const digitSlots = slots.filter(
    (s): s is {kind: 'digit'; place: number} => s.kind === 'digit',
  );
  const lowestPlace = Math.min(...digitSlots.map((s) => s.place));

  const digits = digitSlots.map((s) => {
    const lowest = s.place === lowestPlace;
    const pos = digitPos(scaled, s.place, lowest);
    const prevPos = digitPos(scaledPrev, s.place, lowest);
    const blur = Math.min(cellH * 0.035, Math.abs(pos - prevPos) * cellH * 0.1);
    return {...s, pos, blur};
  });

  let digitIdx = -1;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        fontFamily: FONTS.sans,
        fontWeight: 800,
        fontSize,
        lineHeight: 1,
        color,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      <svg width={0} height={0} style={{position: 'absolute'}} aria-hidden>
        <defs>
          {digits.map((d, i) => (
            <filter
              key={`${idPrefix}-${i}`}
              id={`${idPrefix}-${i}`}
              x="-60%"
              y="-10%"
              width="220%"
              height="120%"
            >
              <feGaussianBlur stdDeviation={`0 ${d.blur.toFixed(2)}`} />
            </filter>
          ))}
        </defs>
      </svg>
      {slots.map((slot, slotIdx) => {
        if (slot.kind === 'char') {
          return (
            <div
              key={`c-${slotIdx}`}
              style={{
                height: cellH,
                lineHeight: `${cellH}px`,
                width: slot.ch === '.' ? colW * 0.34 : colW * 0.3,
                textAlign: 'center',
              }}
            >
              {slot.ch}
            </div>
          );
        }
        digitIdx += 1;
        const d = digits[digitIdx];
        return (
          <div
            key={`d-${slotIdx}`}
            style={{
              height: cellH,
              width: colW,
              overflow: 'hidden',
              position: 'relative',
              WebkitMaskImage:
                'linear-gradient(to bottom, transparent 0%, #000 17%, #000 83%, transparent 100%)',
              maskImage:
                'linear-gradient(to bottom, transparent 0%, #000 17%, #000 83%, transparent 100%)',
            }}
          >
            <div
              style={{
                transform: `translateY(${-d.pos * cellH}px)`,
                filter: d.blur > 0.05 ? `url(#${idPrefix}-${digitIdx})` : undefined,
              }}
            >
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((n, i) => (
                <div
                  key={i}
                  style={{
                    height: cellH,
                    lineHeight: `${cellH}px`,
                    textAlign: 'center',
                  }}
                >
                  {n}
                </div>
              ))}
            </div>
          </div>
        );
      })}
      {suffix ? (
        <div style={{height: cellH, lineHeight: `${cellH}px`, marginLeft: fontSize * 0.04}}>
          {suffix}
        </div>
      ) : null}
    </div>
  );
};

const CounterGraphicView: React.FC<{
  g: CounterGraphic;
  segFromMs: number;
  segment: Segment;
}> = ({g, segFromMs, segment}) => {
  const frame = useCurrentFrame();
  const dark = isDarkPanel(segment.panel);
  const ink = panelInk(segment.panel);
  const format: NumFormat = g.format ?? 'comma';
  const startFrame = localStartFrame(g.startMs, segFromMs);
  const durFrames = Math.max(1, Math.round((g.durMs ?? 1000) / FRAME_MS));

  const valueFor = (f: number) =>
    g.from + (g.to - g.from) * progressAt(f, startFrame, durFrames);

  const value = valueFor(frame);
  const prevValue = valueFor(Math.max(0, frame - 1));

  const pillBg = dark ? 'rgba(255,255,255,0.12)' : 'rgba(17,17,17,0.06)';
  const labelColor = dark ? 'rgba(255,255,255,0.62)' : 'rgba(17,17,17,0.55)';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 18,
      }}
    >
      {g.icon ? (
        /[./]/.test(g.icon) ? (
          <Img
            src={staticFile(g.icon)}
            style={{
              width: GRAPHIC.counterIconSize,
              height: GRAPHIC.counterIconSize,
              objectFit: 'contain',
            }}
          />
        ) : (
          <div
            style={{
              fontFamily: FONTS.sans,
              fontWeight: 800,
              fontSize: GRAPHIC.counterIconSize,
              color: ink,
              lineHeight: 1,
            }}
          >
            {g.icon}
          </div>
        )
      ) : null}

      <Odometer
        value={value}
        prevValue={prevValue}
        target={g.to}
        format={format}
        fontSize={GRAPHIC.counterNumberSize}
        color={ink}
        idPrefix="odo-main"
      />

      {g.label ? (
        <div
          style={{
            fontFamily: FONTS.sans,
            fontWeight: 500,
            fontSize: GRAPHIC.counterLabelSize,
            color: labelColor,
            letterSpacing: '0.01em',
          }}
        >
          {g.label}
        </div>
      ) : null}

      {g.sub && g.sub.length > 0 ? (
        <div style={{display: 'flex', gap: 14, marginTop: 8}}>
          {g.sub.map((s, i) => {
            const appear = startFrame + 5;
            const fade = interpolate(frame, [appear, appear + 5], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            });
            const subValue =
              s.from + (s.to - s.from) * progressAt(frame, appear, durFrames);
            const prevSub =
              s.from + (s.to - s.from) * progressAt(frame - 1, appear, durFrames);
            return (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 22px',
                  borderRadius: 999,
                  background: pillBg,
                  opacity: fade,
                }}
              >
                <Odometer
                  value={subValue}
                  prevValue={prevSub}
                  target={s.to}
                  format="comma"
                  fontSize={GRAPHIC.counterPillSize}
                  color={ink}
                  idPrefix={`odo-sub-${i}`}
                />
                <span
                  style={{
                    fontFamily: FONTS.sans,
                    fontWeight: 500,
                    fontSize: GRAPHIC.counterPillSize,
                    color: labelColor,
                  }}
                >
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};

/* -------------------------------------------------------------- terminal */

const TerminalGraphicView: React.FC<{
  g: TerminalGraphic;
  segFromMs: number;
}> = ({g, segFromMs}) => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        width: '88%',
        minHeight: 470,
        display: 'flex',
        flexDirection: 'column',
        borderRadius: GRAPHIC.terminalRadius,
        background: GRAPHIC.terminalBg,
        boxShadow: '0 24px 60px rgba(0,0,0,0.35)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '18px 22px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        {GRAPHIC.dots.map((c) => (
          <div
            key={c}
            style={{width: 16, height: 16, borderRadius: 999, background: c}}
          />
        ))}
        {g.title ? (
          <div
            style={{
              marginLeft: 12,
              fontFamily: FONTS.mono,
              fontWeight: 400,
              fontSize: 22,
              color: '#8B949E',
            }}
          >
            {g.title}
          </div>
        ) : null}
      </div>
      <div style={{padding: '26px 30px 32px'}}>
        {g.lines.map((line, i) => {
          const at = localStartFrame(line.atMs, segFromMs);
          if (frame < at) {
            return null;
          }
          const chars = Math.min(
            line.text.length,
            Math.floor((frame - at) * 3) + 1,
          );
          return (
            <div
              key={i}
              style={{
                fontFamily: FONTS.mono,
                fontWeight: 400,
                fontSize: GRAPHIC.terminalMonoSize,
                lineHeight: 1.55,
                color: line.color ?? GRAPHIC.terminalInk,
                whiteSpace: 'pre-wrap',
              }}
            >
              {line.text.slice(0, chars)}
            </div>
          );
        })}
      </div>
    </div>
  );
};

/* --------------------------------------------------------------- compare */

const SideCard: React.FC<{
  side: Side;
  progress: number;
  dark: boolean;
}> = ({side, progress, dark}) => {
  const filled = Math.round(side.value * progress);
  return (
    <div
      style={{
        width: '44%',
        borderRadius: 24,
        background: '#FFFFFF',
        boxShadow: SHADOWS.uiCard,
        padding: 26,
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
      }}
    >
      {side.icon ? (
        <Img
          src={staticFile(side.icon)}
          style={{width: 56, height: 56, objectFit: 'contain'}}
        />
      ) : null}
      <div
        style={{
          fontFamily: FONTS.sans,
          fontWeight: 800,
          fontSize: GRAPHIC.compareLabelSize,
          color: side.color,
          lineHeight: 1.05,
        }}
      >
        {side.label}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${GRAPHIC.compareWaffleCols}, 1fr)`,
          gap: 6,
        }}
      >
        {Array.from({length: 100}).map((_, i) => (
          <div
            key={i}
            style={{
              aspectRatio: '1 / 1',
              borderRadius: 3,
              background:
                i < filled
                  ? side.color
                  : dark
                    ? 'rgba(17,17,17,0.08)'
                    : 'rgba(17,17,17,0.08)',
            }}
          />
        ))}
      </div>
      <div
        style={{
          fontFamily: FONTS.sans,
          fontWeight: 800,
          fontSize: GRAPHIC.comparePctSize,
          color: side.color,
          lineHeight: 1,
        }}
      >
        {Math.round(side.value * progress)}%
      </div>
    </div>
  );
};

const CompareGraphicView: React.FC<{
  g: CompareGraphic;
  segFromMs: number;
  segment: Segment;
}> = ({g, segFromMs, segment}) => {
  const frame = useCurrentFrame();
  const startFrame = localStartFrame(g.startMs, segFromMs);
  const durFrames = Math.max(1, Math.round((g.durMs ?? 1200) / FRAME_MS));
  const progress = progressAt(frame, startFrame, durFrames);
  const dark = isDarkPanel(segment.panel);
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        gap: '2%',
        width: '100%',
      }}
    >
      <SideCard side={g.left} progress={progress} dark={dark} />
      <SideCard side={g.right} progress={progress} dark={dark} />
    </div>
  );
};

/* ------------------------------------------------------------- lineChart */

const LineChartGraphicView: React.FC<{
  g: LineChartGraphic;
  segFromMs: number;
  accent: string;
}> = ({g, segFromMs, accent}) => {
  const frame = useCurrentFrame();
  const startFrame = localStartFrame(g.startMs, segFromMs);
  const durFrames = Math.max(1, Math.round((g.durMs ?? 1500) / FRAME_MS));
  const draw = progressAt(frame, startFrame, durFrames);

  const pts = g.points.length > 0 ? g.points : [0, 0];
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const coords = pts.map((v, i) => {
    const x = pts.length === 1 ? 50 : (i / (pts.length - 1)) * 96 + 2;
    const y = 54 - ((v - min) / span) * 44 - 4;
    return `${x},${y}`;
  });

  return (
    <div
      style={{
        width: '90%',
        height: '82%',
        borderRadius: 24,
        background: '#FFFFFF',
        boxShadow: SHADOWS.uiCard,
        padding: '28px 30px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div
        style={{
          fontFamily: FONTS.sans,
          fontWeight: 600,
          fontSize: 26,
          color: 'rgba(17,17,17,0.5)',
          letterSpacing: '0.01em',
        }}
      >
        {g.label ?? ''}
      </div>
      <svg
        viewBox="0 0 100 60"
        preserveAspectRatio="none"
        style={{flex: 1, width: '100%'}}
      >
        {[12, 24, 36, 48].map((y) => (
          <line
            key={y}
            x1={0}
            y1={y}
            x2={100}
            y2={y}
            stroke="rgba(17,17,17,0.06)"
            strokeWidth={0.4}
          />
        ))}
        <polyline
          points={coords.join(' ')}
          fill="none"
          stroke={g.color ?? accent}
          strokeWidth={0.6}
          strokeLinejoin="round"
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={1 - draw}
        />
      </svg>
    </div>
  );
};

/* -------------------------------------------------------------- wordmark */

const WordmarkGraphicView: React.FC<{
  g: WordmarkGraphic;
  segment: Segment;
}> = ({g, segment}) => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 34,
        width: '92%',
      }}
    >
      <div
        style={{
          fontFamily: FONTS.sans,
          fontWeight: 900,
          fontSize: GRAPHIC.wordmarkSize,
          letterSpacing: '-0.04em',
          lineHeight: 0.9,
          color: panelInk(segment.panel),
          textAlign: 'center',
          wordBreak: 'break-word',
        }}
      >
        {g.text}
      </div>
      {g.tags && g.tags.length > 0 ? (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: 12,
          }}
        >
          {g.tags.map((tag, i) => {
            const at = 6 + i * 3;
            const o = interpolate(frame, [at, at + 3], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            });
            return (
              <div
                key={i}
                style={{
                  borderRadius: 999,
                  padding: '12px 24px',
                  background: tag.color,
                  color: '#FFFFFF',
                  fontFamily: FONTS.sans,
                  fontWeight: 600,
                  fontSize: GRAPHIC.wordmarkTagSize,
                  opacity: o,
                  transform: `translateY(${8 * (1 - o)}px)`,
                }}
              >
                {tag.label}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};

/* -------------------------------------------------------------- portrait */

const PortraitGraphicView: React.FC<{g: PortraitGraphic}> = ({g}) => {
  return (
    <div
      style={{
        height: '100%',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        alignItems: 'center',
      }}
    >
      {g.label ? (
        <div
          style={{
            fontFamily: FONTS.sans,
            fontWeight: 500,
            fontSize: GRAPHIC.portraitLabelSize,
            color: 'rgba(0,0,0,0.45)',
            marginBottom: 18,
          }}
        >
          {g.label}
        </div>
      ) : null}
      <Img
        src={staticFile(g.src)}
        style={{
          width: `${GRAPHIC.portraitWidthPct}%`,
          height: 'auto',
          maxHeight: '78%',
          objectFit: 'contain',
          objectPosition: 'bottom center',
          WebkitMaskImage:
            'linear-gradient(to bottom, #000 84%, rgba(0,0,0,0.2) 94%, transparent 100%)',
          maskImage:
            'linear-gradient(to bottom, #000 84%, rgba(0,0,0,0.2) 94%, transparent 100%)',
        }}
      />
    </div>
  );
};

/* --------------------------------------------------------------- switch */

export const GraphicView: React.FC<{
  graphic: Graphic;
  segment: Segment;
  accent: string;
  segFromMs: number;
}> = ({graphic, segment, accent, segFromMs}) => {
  switch (graphic.kind) {
    case 'image':
      return <ImageGraphicView g={graphic} segFromMs={segFromMs} />;
    case 'logoTile':
      return <LogoTileGraphicView g={graphic} accent={accent} />;
    case 'counter':
      return (
        <CounterGraphicView
          g={graphic}
          segFromMs={segFromMs}
          segment={segment}
        />
      );
    case 'terminal':
      return <TerminalGraphicView g={graphic} segFromMs={segFromMs} />;
    case 'compare':
      return (
        <CompareGraphicView
          g={graphic}
          segFromMs={segFromMs}
          segment={segment}
        />
      );
    case 'lineChart':
      return (
        <LineChartGraphicView
          g={graphic}
          segFromMs={segFromMs}
          accent={accent}
        />
      );
    case 'wordmark':
      return <WordmarkGraphicView g={graphic} segment={segment} />;
    case 'portrait':
      return <PortraitGraphicView g={graphic} />;
    default:
      return null;
  }
};
