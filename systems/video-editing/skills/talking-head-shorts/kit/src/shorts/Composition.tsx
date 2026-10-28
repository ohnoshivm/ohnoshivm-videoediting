/**
 * Registers the "ShortsEdit" composition: 1080x1920, 30 fps, duration derived
 * from the edit's words.json (or edit.durationMs).
 */
import React from 'react';
import {Composition, staticFile} from 'remotion';
import {ShortsEdit} from './ShortsEdit';
import {defaultEdit} from './defaultEdit';
import type {ShortsEditProps, Word} from './types';

export const calculateShortsMetadata = async ({
  props,
}: {
  props: ShortsEditProps;
}) => {
  let words = props.wordsData;

  if (!words) {
    const url = staticFile(props.words);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `ShortsEdit: could not load words file "${props.words}" (${response.status}). ` +
          `It must exist under public/ and be listed in edit.words.`,
      );
    }
    words = (await response.json()) as Word[];
  }

  const lastEnd = words.length > 0 ? words[words.length - 1].endMs : 0;
  const durationMs = props.durationMs ?? lastEnd + 400;

  return {
    props: {...props, wordsData: words},
    durationInFrames: Math.max(1, Math.ceil((durationMs / 1000) * 30)),
  };
};

export const ShortsEditComposition: React.FC = () => (
  <Composition
    id="ShortsEdit"
    component={ShortsEdit}
    width={1080}
    height={1920}
    fps={30}
    defaultProps={defaultEdit}
    durationInFrames={300}
    calculateMetadata={calculateShortsMetadata}
  />
);
