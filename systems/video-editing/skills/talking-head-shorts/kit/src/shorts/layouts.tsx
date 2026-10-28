/**
 * The three layouts: face, split, graphic. Hard cuts only, framing static
 * within a shot.
 */
import React from 'react';
import {AbsoluteFill, OffthreadVideo, staticFile} from 'remotion';
import {Gobo} from './fx';
import {GraphicBackdrop, GraphicView} from './graphics';
import {CANVAS, LAYOUT, panelBg} from './theme';
import type {Face, Segment} from './types';

const Video: React.FC<{
  src: string;
  trimBefore: number;
  zoom?: number;
}> = ({src, trimBefore, zoom = 1}) => (
  <OffthreadVideo
    src={staticFile(src)}
    muted
    trimBefore={trimBefore}
    style={{
      position: 'absolute',
      inset: 0,
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      transform: `scale(${zoom})`,
      transformOrigin: LAYOUT.face.zoomOrigin,
    }}
  />
);

export const FaceLayout: React.FC<{
  segment: Segment;
  aroll: string;
  trimBefore: number;
}> = ({segment, aroll, trimBefore}) => (
  <AbsoluteFill style={{backgroundColor: '#000000', overflow: 'hidden'}}>
    <Video src={aroll} trimBefore={trimBefore} zoom={segment.zoom ?? 1} />
  </AbsoluteFill>
);

const bandStyle = (top: number, height: number): React.CSSProperties => ({
  position: 'absolute',
  left: 0,
  right: 0,
  top: `${top * 100}%`,
  height: `${height * 100}%`,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
});

/** Where the a-roll sits inside the split card, in card-local px. */
type Framing = {scale: number; left: number; top: number};

/**
 * Frame the a-roll on the face box: the face is ~36 % of the frame width and
 * the eye line sits `eyeBelowCardTop` px under the card's top edge. Both are
 * clamped so the video always covers the card — no gaps at the sides.
 */
const splitFraming = (face: Face | undefined): Framing => {
  const {inset, cardTop, faceWidthPct, eyeBelowCardTop, fallbackEyeY} =
    LAYOUT.split;
  const cardW = CANVAS.width - inset * 2;
  const cardH = CANVAS.height - cardTop;
  const cover = Math.max(cardW / CANVAS.width, cardH / CANVAS.height);
  const faceW = face?.w ?? 0;
  const wanted =
    faceW > 0.02 ? (CANVAS.width * faceWidthPct) / (faceW * CANVAS.width) : cover;
  const scale = Math.max(cover, wanted);
  const scaledW = CANVAS.width * scale;
  const scaledH = CANVAS.height * scale;
  const eyeX = face?.cx ?? 0.5;
  const eyeY = face?.eyeY ?? fallbackEyeY;
  const left = Math.min(0, Math.max(cardW - scaledW, cardW / 2 - eyeX * scaledW));
  const top = Math.min(
    0,
    Math.max(cardH - scaledH, eyeBelowCardTop - eyeY * scaledH),
  );
  return {scale, left, top};
};

export const SplitLayout: React.FC<{
  segment: Segment;
  aroll: string;
  matte?: string;
  face?: Face;
  trimBefore: number;
  accent: string;
  segFromMs: number;
}> = ({segment, aroll, matte, face, trimBefore, accent, segFromMs}) => {
  const bg = panelBg(segment.panel);
  const framing = splitFraming(face);
  const size = {
    position: 'absolute' as const,
    width: CANVAS.width * framing.scale,
    height: CANVAS.height * framing.scale,
  };
  // The signed matte unlocks the pop-out: the head crosses the card's top edge.
  const popOut = Boolean(matte) && segment.popOut !== false;

  return (
    <AbsoluteFill style={{backgroundColor: bg, overflow: 'hidden'}}>
      <GraphicBackdrop graphic={segment.graphic} segFromMs={segFromMs} />
      {segment.gobo ? <Gobo /> : null}

      <div style={bandStyle(LAYOUT.split.bandTop, LAYOUT.split.bandHeight)}>
        {segment.graphic ? (
          <GraphicView
            graphic={segment.graphic}
            segment={segment}
            accent={accent}
            segFromMs={segFromMs}
          />
        ) : null}
      </div>

      <div
        style={{
          position: 'absolute',
          left: LAYOUT.split.inset,
          right: LAYOUT.split.inset,
          top: LAYOUT.split.cardTop,
          bottom: -40,
          borderTopLeftRadius: LAYOUT.split.cardRadius,
          borderTopRightRadius: LAYOUT.split.cardRadius,
          overflow: 'hidden',
          boxShadow: LAYOUT.split.cardShadow,
          backgroundColor: '#000000',
        }}
      >
        <OffthreadVideo
          src={staticFile(aroll)}
          muted
          trimBefore={trimBefore}
          style={{...size, left: framing.left, top: framing.top}}
        />
      </div>

      {popOut ? (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            height: LAYOUT.split.cardTop,
            overflow: 'hidden',
            pointerEvents: 'none',
          }}
        >
          <OffthreadVideo
            src={staticFile(matte as string)}
            muted
            transparent
            trimBefore={trimBefore}
            style={{
              ...size,
              left: LAYOUT.split.inset + framing.left,
              top: LAYOUT.split.cardTop + framing.top,
            }}
          />
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

export const GraphicLayout: React.FC<{
  segment: Segment;
  aroll: string;
  trimBefore: number;
  accent: string;
  segFromMs: number;
}> = ({segment, aroll, trimBefore, accent, segFromMs}) => {
  return (
    <AbsoluteFill
      style={{backgroundColor: panelBg(segment.panel), overflow: 'hidden'}}
    >
      <GraphicBackdrop graphic={segment.graphic} segFromMs={segFromMs} />
      {segment.gobo ? <Gobo /> : null}
      <div style={bandStyle(LAYOUT.graphic.bandTop, LAYOUT.graphic.bandHeight)}>
        {segment.graphic ? (
          <GraphicView
            graphic={segment.graphic}
            segment={segment}
            accent={accent}
            segFromMs={segFromMs}
          />
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

export const SegmentLayout: React.FC<{
  segment: Segment;
  aroll: string;
  matte?: string;
  face?: Face;
  trimBefore: number;
  accent: string;
}> = ({segment, aroll, matte, face, trimBefore, accent}) => {
  const segFromMs = segment.fromMs;
  switch (segment.layout) {
    case 'face':
      return (
        <FaceLayout segment={segment} aroll={aroll} trimBefore={trimBefore} />
      );
    case 'split':
      return (
        <SplitLayout
          segment={segment}
          aroll={aroll}
          matte={matte}
          face={face}
          trimBefore={trimBefore}
          accent={accent}
          segFromMs={segFromMs}
        />
      );
    case 'graphic':
    default:
      return (
        <GraphicLayout
          segment={segment}
          aroll={aroll}
          trimBefore={trimBefore}
          accent={accent}
          segFromMs={segFromMs}
        />
      );
  }
};
