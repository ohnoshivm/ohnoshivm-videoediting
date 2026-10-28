/**
 * FX layer: deterministic foliage gobo, light-leak flicker, SFX playback.
 */
import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Sequence,
  staticFile,
  useCurrentFrame,
} from 'remotion';
import {FX} from './theme';
import type {Fx} from './types';
import {FRAME_MS, msToFrame} from './types';

/** Deterministic leaf-shadow gobo entering from the top-right corner. */
export const Gobo: React.FC = () => (
  <AbsoluteFill
    style={{
      pointerEvents: 'none',
      opacity: FX.goboOpacity,
      filter: `blur(${FX.goboBlur}px)`,
    }}
  >
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 1080 1920"
      preserveAspectRatio="xMidYMid slice"
    >
      <g fill="#000000">
        <path
          d="M1120 -80 C 1010 190, 900 330, 660 520"
          stroke="#000000"
          strokeWidth={9}
          fill="none"
        />
        <path
          d="M1006 180 C 940 300, 880 390, 800 470"
          stroke="#000000"
          strokeWidth={5}
          fill="none"
        />
        <ellipse cx={1044} cy={44} rx={118} ry={38} transform="rotate(-28 1044 44)" />
        <ellipse cx={968} cy={158} rx={132} ry={43} transform="rotate(-58 968 158)" />
        <ellipse cx={1042} cy={268} rx={104} ry={35} transform="rotate(24 1042 268)" />
        <ellipse cx={888} cy={308} rx={120} ry={40} transform="rotate(-18 888 308)" />
        <ellipse cx={824} cy={430} rx={126} ry={42} transform="rotate(-62 824 430)" />
        <ellipse cx={944} cy={486} rx={98} ry={33} transform="rotate(12 944 486)" />
        <ellipse cx={684} cy={560} rx={112} ry={37} transform="rotate(-34 684 560)" />
      </g>
    </svg>
  </AbsoluteFill>
);

const gradient = (cx: number, cy: number, warm: string, hot: string): string =>
  `radial-gradient(circle at ${cx}% ${cy}%, ${warm}, transparent 60%), radial-gradient(circle at ${100 - cx}% ${100 - cy}%, ${hot}, transparent 55%)`;

/** 2 flash frames, 1 clean frame, 2 flash frames — no crossfades. */
const LightLeakFrames: React.FC = () => {
  const frame = useCurrentFrame();
  const firstBurst = frame === 0 || frame === 1;
  const secondBurst = frame === 3 || frame === 4;
  if (!firstBurst && !secondBurst) {
    return null;
  }
  const bg = firstBurst
    ? gradient(80, 30, 'rgba(255,170,60,.95)', 'rgba(255,230,140,.85)')
    : gradient(66, 42, 'rgba(255,170,60,.95)', 'rgba(255,230,140,.85)');
  return (
    <AbsoluteFill
      style={{
        backgroundImage: bg,
        mixBlendMode: 'screen',
        opacity: FX.lightLeakOpacity,
      }}
    />
  );
};

export const FxLayer: React.FC<{fx: Fx[] | undefined}> = ({fx}) => {
  if (!fx || fx.length === 0) {
    return null;
  }
  return (
    <>
      {fx.map((item, i) => {
        if (item.kind === 'lightLeak') {
          return (
            <Sequence
              key={`ll-${i}`}
              from={msToFrame(item.atMs)}
              durationInFrames={5}
              layout="none"
            >
              <LightLeakFrames />
            </Sequence>
          );
        }
        return (
          <Sequence
            key={`sfx-${i}`}
            from={msToFrame(item.atMs)}
            layout="none"
          >
            <Audio
              src={staticFile(`shorts/sfx/${item.name}.wav`)}
              volume={Math.pow(10, (item.gainDb ?? -12) / 20)}
            />
          </Sequence>
        );
      })}
    </>
  );
};

export const localMs = (frame: number): number => frame * FRAME_MS;
