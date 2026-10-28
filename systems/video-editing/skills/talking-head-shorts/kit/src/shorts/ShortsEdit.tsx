/**
 * <ShortsEdit /> — renders one edit.json (plus its resolved words.json).
 * The whole timeline is data: segments, auto captions, emphasis overrides, fx.
 */
import React, {useMemo} from 'react';
import {
  AbsoluteFill,
  Audio,
  Sequence,
  staticFile,
  useVideoConfig,
} from 'remotion';
import {EmphasisView, CaptionChunkView} from './captionsView';
import {chunkWords} from './captions';
import {FxLayer} from './fx';
import {SegmentLayout} from './layouts';
import type {Emphasis, Segment, ShortsEditProps, Word} from './types';
import {msToFrame} from './types';

const overlaps = (aFrom: number, aTo: number, bFrom: number, bTo: number) =>
  aFrom < bTo - 0.5 && aTo > bFrom + 0.5;

export const ShortsEdit: React.FC<ShortsEditProps> = (props) => {
  const {wordsData, ...edit} = props;
  const {durationInFrames} = useVideoConfig();
  const words = useMemo<Word[]>(() => wordsData ?? [], [wordsData]);
  const totalMs = durationInFrames * (1000 / 30);

  const segments = useMemo<Segment[]>(() => {
    const list = edit.segments.map((segment) => ({...segment}));
    if (list.length > 0) {
      list[list.length - 1].toMs = totalMs;
    }
    return list;
  }, [edit.segments, totalMs]);

  const emphasis = useMemo<Emphasis[]>(() => edit.emphasis ?? [], [edit.emphasis]);

  const chunks = useMemo(() => chunkWords(words, totalMs), [words, totalMs]);

  return (
    <AbsoluteFill style={{backgroundColor: '#000000', overflow: 'hidden'}}>
      <Audio src={staticFile(edit.aroll)} />

      {segments.map((segment, i) => {
        const from = msToFrame(segment.fromMs);
        const to = i + 1 < segments.length ? msToFrame(segments[i + 1].fromMs) : durationInFrames;
        return (
          <Sequence
            key={`seg-${i}`}
            name={`${segment.layout} ${Math.round(segment.fromMs)}-${Math.round(segment.toMs)}`}
            from={from}
            durationInFrames={Math.max(1, to - from)}
          >
            <SegmentLayout
              segment={segment}
              aroll={edit.aroll}
              matte={edit.matte}
              face={edit.face}
              trimBefore={from}
              accent={edit.accent}
            />
          </Sequence>
        );
      })}

      {chunks.map((chunk, i) => {
        const suppressed = emphasis.some((e) =>
          overlaps(chunk.startMs, chunk.endMs, e.fromMs, e.toMs),
        );
        if (suppressed) {
          return null;
        }
        const from = msToFrame(chunk.startMs);
        const to = msToFrame(chunk.endMs);
        return (
          <Sequence
            key={`cap-${i}`}
            name={`caption "${chunk.text}"`}
            from={from}
            durationInFrames={Math.max(1, to - from)}
            layout="none"
          >
            <CaptionChunkView
              chunk={chunk}
              segments={segments}
              accent={edit.accent}
            />
          </Sequence>
        );
      })}

      {emphasis.map((e, i) => {
        const from = msToFrame(e.fromMs);
        const to = msToFrame(e.toMs);
        return (
          <Sequence
            key={`emp-${i}`}
            name={`emphasis ${e.style}`}
            from={from}
            durationInFrames={Math.max(1, to - from)}
            layout="none"
          >
            <EmphasisView
              emphasis={e}
              words={words}
              accent={edit.accent}
              accentSoft={edit.accentSoft}
            />
          </Sequence>
        );
      })}

      <FxLayer fx={edit.fx} />
    </AbsoluteFill>
  );
};
