/**
 * Design tokens for the "proof-cut" shorts kit.
 * Every px value is authored at 1080x1920 / 30 fps.
 */
import type React from 'react';
import {loadFont as loadInterTight} from '@remotion/google-fonts/InterTight';
import {loadFont as loadInstrumentSerif} from '@remotion/google-fonts/InstrumentSerif';
import {loadFont as loadJetBrainsMono} from '@remotion/google-fonts/JetBrainsMono';
import type {PanelName} from './types';

const interTight = loadInterTight('normal', {
  weights: ['500', '600', '700', '800', '900'],
  subsets: ['latin'],
});

const instrumentSerif = loadInstrumentSerif('italic', {
  weights: ['400'],
  subsets: ['latin'],
});

const jetBrainsMono = loadJetBrainsMono('normal', {
  weights: ['400', '600'],
  subsets: ['latin'],
});

export const FONTS = {
  sans: interTight.fontFamily,
  serif: instrumentSerif.fontFamily,
  mono: jetBrainsMono.fontFamily,
} as const;

/**
 * The one serif token: headline, ordinal and the twoTier lead all read it, so
 * the editorial face of the kit can be swapped in one place. weight/scaleX/
 * textStroke travel with the family because they exist to compensate for it.
 *
 * Instrument Serif italic 400 is the default: the family ships a single weight,
 * so a 1.5 px same-colour text stroke stands in for one, and it sets at its
 * natural width (scaleX 1) — lighter, wider, more editorial.
 */
export const SERIF = {
  family: FONTS.serif,
  style: 'italic' as const,
  headlineWeight: 400,
  leadWeight: 400,
  scaleX: 1,
  /** extra weight on families that only ship 400 (px, 0 = off) */
  textStroke: 1.5,
} as const;

/** Stroke that stands in for a missing heavy weight (SERIF.textStroke). */
export const SERIF_STROKE: React.CSSProperties =
  SERIF.textStroke > 0
    ? {WebkitTextStroke: `${SERIF.textStroke}px currentColor`}
    : {};

// loadFont() registers a delayRender handle internally, so the render waits
// for every requested weight/subset before the first frame is captured.

export const CANVAS = {width: 1080, height: 1920, fps: 30} as const;

export const ACCENT_DEFAULT = '#D97757';

export const PANELS: Record<PanelName, {bg: string; dark: boolean}> = {
  paper: {bg: '#FAFAF8', dark: false},
  cream: {bg: '#F6F1EA', dark: false},
  beige: {bg: '#E8E0D5', dark: false},
  sand: {bg: '#D9A574', dark: false},
  slate: {bg: '#232A36', dark: true},
  navy: {bg: '#0B1A33', dark: true},
  charcoal: {bg: '#141414', dark: true},
  ink: {bg: '#0D1117', dark: true},
};

export const panelBg = (panel: PanelName | undefined): string =>
  PANELS[panel ?? 'paper'].bg;

export const isDarkPanel = (panel: PanelName | undefined): boolean =>
  PANELS[panel ?? 'paper'].dark;

/** Headline / text colour on a panel. */
export const panelInk = (panel: PanelName | undefined): string =>
  isDarkPanel(panel) ? '#FFFFFF' : '#111111';

export const CAPTION = {
  word: {
    face: {fontSize: 84, yCentre: 1345},
    split: {fontSize: 72, yCentre: 900},
    weight: 700,
    letterSpacing: '-0.02em',
    color: '#FFFFFF',
    shadow:
      '0 3px 18px rgba(0,0,0,.55), 0 1px 3px rgba(0,0,0,.35)',
    maxWidth: '90%',
    entryFrames: 2,
  },
  headline: {
    fontSize: 130,
    yCentre: 1290,
    weight: 800,
    letterSpacing: '-0.04em',
    entryFrames: 4,
    blurFrom: 10,
    yFrom: -16,
    maxWidth: '92%',
    lineHeight: 1.0,
  },
  twoTier: {
    yCentre: 1345,
    /** serif italic lead ("comment") */
    leadSize: 100,
    /** sans 800 key (“POPPI”), shrunk to fit keyMaxWidthPct */
    keySize: 140,
    keyMaxWidthPct: 0.9,
    /** the key overlaps the bottom ≈ 25 % of the lead */
    keyOverlap: -26,
    keyFadeFrames: 3,
    keyBlurFrom: 6,
  },
  semantic: {fontSize: 84, yCentre: 1345, up: '#8CF58F', down: '#FF6B6B'},
} as const;

export const LAYOUT = {
  face: {zoomOrigin: '50% 35%', zooms: [1, 1.12, 1.25] as const},
  split: {
    inset: 24,
    cardTop: 1190,
    cardRadius: 150,
    cardShadow: '0 -8px 60px rgba(0,0,0,.18)',
    bandTop: 0.06,
    bandHeight: 0.38,
    /** the face box is framed to this share of the frame width, then clamped to cover the card */
    faceWidthPct: 0.36,
    /** the eye line sits this far below the card's top edge */
    eyeBelowCardTop: 125,
    /** used when the edit has no face data */
    fallbackEyeY: 0.3,
  },
  graphic: {bandTop: 0.08, bandHeight: 0.47},
} as const;

export const SHADOWS = {
  imageCard: '0 20px 60px rgba(0,0,0,.25)',
  logoTile: '0 18px 50px rgba(0,0,0,.18)',
  uiCard: '0 18px 50px rgba(0,0,0,.16)',
} as const;

export const GRAPHIC = {
  imageRadius: 24,
  logoTileSize: 300,
  logoTileRadius: 66,
  logoTileIconPct: 0.6,
  logoTileGlyph: 140,
  logoTileLabelSize: 30,
  ordinalSize: 100,
  counterNumberSize: 150,
  counterIconSize: 104,
  counterLabelSize: 28,
  counterPillSize: 26,
  terminalRadius: 20,
  terminalMonoSize: 26,
  compareWaffleCols: 10,
  compareLabelSize: 44,
  comparePctSize: 64,
  chartStrokeWidth: 6,
  wordmarkSize: 170,
  wordmarkTagSize: 22,
  portraitWidthPct: 70,
  portraitLabelSize: 30,
  annotationAmber: '#F5B83D',
  annotationRed: '#E5362C',
  chromeFrom: '#4A4A4A',
  chromeTo: '#BDBDBD',
  terminalBg: '#0D1117',
  terminalInk: '#E6EDF3',
  dots: ['#FF5F57', '#FEBC2E', '#28C840'] as const,
} as const;

export const FX = {
  goboOpacity: 0.07,
  goboBlur: 18,
  lightLeakOpacity: 0.9,
} as const;

export const EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)';
