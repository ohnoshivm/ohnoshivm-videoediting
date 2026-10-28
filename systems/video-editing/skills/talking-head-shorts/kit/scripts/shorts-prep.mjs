#!/usr/bin/env node
/**
 * shorts-prep.mjs --in <raw> --slug <slug> [--model medium.en] [--gap 180]
 *                  [--pad 60] [--accent "#D97757"] [--no-matte]
 *
 * Run from the Remotion project directory. Produces
 * public/shorts/<slug>/{aroll.mp4,words.json,transcript.txt,edit.json} and,
 * unless --no-matte, {person.webm,face.json} for the split layout's pop-out.
 *
 * 1. 16 kHz mono wav
 * 2. whisper.cpp (installed + model downloaded into ~/.cache/talking-head-shorts)
 * 3. tighten: keep [start-pad, end+pad], merge when the speech gap < --gap
 * 4. build the 1080x1920 / 30 fps / -14 LUFS a-roll
 * 5. matte: Apple Vision person segmentation → VP9 + alpha, plus the face box
 * 6. remap word times onto the tight timeline
 * 7. write the assets and a one-face draft edit.json
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import whisperCppModule from '@remotion/install-whisper-cpp';

const {installWhisperCpp, downloadWhisperModel, transcribe, toCaptions} =
  whisperCppModule;

const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const FFPROBE = process.env.FFPROBE || 'ffprobe';
const WHISPER_VERSION = '1.5.5';
const CACHE_ROOT = path.join(os.homedir(), '.cache', 'talking-head-shorts');
const WHISPER_DIR = path.join(CACHE_ROOT, 'whisper.cpp');
const FPS = 30;
const FRAME_MS = 1000 / FPS;
const WIDTH = 1080;
const HEIGHT = 1920;
const MODELS = [
  'tiny', 'tiny.en', 'base', 'base.en', 'small', 'small.en',
  'medium', 'medium.en', 'large-v1', 'large-v2', 'large-v3', 'large-v3-turbo',
];

/* ------------------------------------------------------------------ utils */

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : fallback;
};
const has = (name) => args.includes(`--${name}`);

const log = (msg) => console.log(msg);
const step = (n, msg) => console.log(`\n[${n}/7] ${msg}`);

const run = (bin, argv, label) => {
  const result = spawnSync(bin, argv, {encoding: 'utf8', maxBuffer: 64 * 1024 * 1024});
  if (result.error) {
    throw new Error(`${label}: could not run ${bin} (${result.error.message})`);
  }
  if (result.status !== 0) {
    throw new Error(
      `${label} failed (exit ${result.status})\n${(result.stderr || '').trim().slice(-3000)}`,
    );
  }
  return result;
};

const probeDurationMs = (file) => {
  const out = run(
    FFPROBE,
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file],
    'ffprobe',
  ).stdout.trim();
  const seconds = Number.parseFloat(out);
  if (!Number.isFinite(seconds)) {
    throw new Error(`ffprobe: could not read duration of ${file}`);
  }
  return seconds * 1000;
};

const round1 = (n) => Math.round(n * 10) / 10;

const MATTE_SCRIPT = 'scripts/shorts-matte.mjs';

/**
 * 5. Person matte + face box for the split layout's pop-out. Apple Vision does
 * the segmentation (shorts-matte.swift); shorts-matte.mjs encodes it to VP9
 * with alpha. Both derived files sit next to the a-roll.
 */
const buildMatte = (projectDir, aroll, outDir, workDir) => {
  const script = path.join(projectDir, MATTE_SCRIPT);
  if (!fs.existsSync(script)) {
    throw new Error(
      `${MATTE_SCRIPT} not found — it needs macOS + Apple Vision (or run with --no-matte)`,
    );
  }
  const result = spawnSync(
    process.execPath,
    [
      script,
      '--in', aroll,
      '--out', outDir,
      '--raw', path.join(workDir, 'person.rgba'),
    ],
    {stdio: 'inherit'},
  );
  if (result.error || result.status !== 0) {
    throw new Error(`matte step failed (${result.error?.message ?? `exit ${result.status}`})`);
  }
  return JSON.parse(fs.readFileSync(path.join(outDir, 'face.json'), 'utf8'));
};

/* ------------------------------------------------------------------- main */

const main = async () => {
  const input = flag('in');
  const slug = flag('slug');
  const model = flag('model', 'medium.en');
  const gapMs = Number(flag('gap', '180'));
  const padMs = Number(flag('pad', '60'));
  const accent = flag('accent', '#D97757');
  const matte = !has('no-matte');

  if (!input) {
    throw new Error('missing --in <raw video>. Example: node scripts/shorts-prep.mjs --in talk.mp4 --slug my-short');
  }
  if (!slug) {
    throw new Error('missing --slug <slug>. Example: --slug my-short');
  }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    throw new Error(`invalid --slug "${slug}" (lowercase letters, digits and dashes only)`);
  }
  if (!MODELS.includes(model)) {
    throw new Error(`invalid --model "${model}" (one of: ${MODELS.join(', ')})`);
  }
  if (!fs.existsSync(input)) {
    throw new Error(`input not found: ${path.resolve(input)}`);
  }
  if (!fs.existsSync(path.join(process.cwd(), 'package.json'))) {
    throw new Error('shorts-prep must be run from the Remotion project directory (no package.json here)');
  }

  const projectDir = process.cwd();
  const publicDir = path.join(projectDir, 'public');
  const outDir = path.join(publicDir, 'shorts', slug);
  const workDir = path.join(CACHE_ROOT, `${slug}-work`);

  fs.rmSync(workDir, {recursive: true, force: true});
  fs.mkdirSync(workDir, {recursive: true});
  fs.mkdirSync(path.join(outDir, 'assets'), {recursive: true});

  const originalMs = probeDurationMs(input);
  log(`shorts-prep  ${path.basename(input)}`);
  log(`  original   ${round1(originalMs / 1000)}s → public/shorts/${slug}/`);
  log(`  model      ${model}   gap ${gapMs}ms   pad ${padMs}ms   accent ${accent}`);

  /* 1 ------------------------------------------------------- audio 16 kHz */
  step(1, 'extracting 16 kHz mono wav');
  const wav16k = path.join(workDir, 'audio-16k.wav');
  run(
    FFMPEG,
    ['-y', '-v', 'error', '-i', input, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', wav16k],
    'ffmpeg (16 kHz wav)',
  );

  /* 2 ---------------------------------------------------------- transcribe */
  step(2, `installing whisper.cpp ${WHISPER_VERSION} + ${model} (cached in ~/.cache/talking-head-shorts)`);
  const install = await installWhisperCpp({
    to: WHISPER_DIR,
    version: WHISPER_VERSION,
    printOutput: false,
  });
  log(`  whisper.cpp ${install.alreadyExisted ? 'already installed' : 'built'}`);

  const download = await downloadWhisperModel({
    model,
    folder: WHISPER_DIR,
    printOutput: has('verbose'),
  });
  log(`  model ${model} ${download.alreadyExisted ? 'already downloaded' : 'downloaded'}`);

  log('  transcribing (token-level timestamps)…');
  const transcription = await transcribe({
    inputPath: wav16k,
    whisperPath: WHISPER_DIR,
    whisperCppVersion: WHISPER_VERSION,
    model,
    modelFolder: WHISPER_DIR,
    tokenLevelTimestamps: true,
    printOutput: false,
    translateToEnglish: false,
    onProgress: (p) => {
      process.stdout.write(`\r  progress ${String(Math.round(p * 100)).padStart(3)}%`);
    },
  });
  process.stdout.write('\r  progress 100%\n');

  const {captions} = toCaptions({whisperCppOutput: transcription});

  /* 2b ------------------------------------------------------ merge tokens */
  const words = [];
  let current = null;
  const flush = () => {
    if (current && current.text.trim().length > 0) {
      words.push({...current, text: current.text.trim()});
    }
    current = null;
  };

  for (const caption of captions) {
    const raw = (caption.text ?? '').replace(/<\|[^|>]*\|>/g, '');
    if (raw.trim().length === 0) {
      continue;
    }
    const startsNew = current === null || /^\s/.test(raw);
    const piece = raw.trim();
    if (/^\[.*\]$/.test(piece) || /^\(.*\)$/.test(piece)) {
      continue; // [BLANK_AUDIO], [Music], (laughs)
    }
    if (/^[-–—]+$/.test(piece)) {
      continue;
    }
    if (startsNew) {
      flush();
      current = {text: piece, startMs: caption.startMs, endMs: caption.endMs};
    } else {
      current.text += piece;
      current.endMs = caption.endMs;
    }
  }
  flush();

  if (words.length === 0) {
    throw new Error('transcription produced no words — does the input have speech?');
  }
  log(`  ${words.length} words transcribed`);

  /* 3 ------------------------------------------------------------ tighten */
  step(3, 'tightening speech');
  const ranges = [];
  words.forEach((word, index) => {
    const startMs = Math.max(0, word.startMs - padMs);
    const endMs = Math.min(originalMs, word.endMs + padMs);
    const previous = ranges[ranges.length - 1];
    const speechGap = previous ? word.startMs - previous.lastWordEndMs : Infinity;
    if (previous && speechGap < gapMs) {
      previous.endMs = Math.max(previous.endMs, endMs);
      previous.lastWordEndMs = word.endMs;
      previous.wordIdx.push(index);
    } else {
      ranges.push({
        startMs,
        endMs,
        lastWordEndMs: word.endMs,
        wordIdx: [index],
      });
    }
  });

  // snap every range to the 30 fps grid so pieces concatenate cleanly
  const pieces = ranges.map((range, i) => {
    const startF = Math.max(0, Math.round(range.startMs / FRAME_MS));
    let endF = Math.round(range.endMs / FRAME_MS);
    if (endF <= startF) {
      endF = startF + 1;
    }
    return {
      index: i,
      startF,
      endF,
      frames: endF - startF,
      startMs: startF * FRAME_MS,
      endMs: endF * FRAME_MS,
      wordIdx: range.wordIdx,
    };
  });

  const keptMs = pieces.reduce((sum, p) => sum + p.frames * FRAME_MS, 0);
  log(`  ${ranges.length} kept ranges · ${round1(originalMs / 1000)}s → ${round1(keptMs / 1000)}s`);

  /* 4 ------------------------------------------------------------- pieces */
  step(4, `building ${pieces.length} pieces (1080x1920, 30 fps, crf 18)`);
  const pieceFiles = [];
  pieces.forEach((piece, i) => {
    const file = path.join(workDir, `piece-${String(i).padStart(4, '0')}.mp4`);
    const durationSec = (piece.frames * FRAME_MS) / 1000;
    const fadeOutStart = Math.max(0, durationSec - 0.008);
    run(
      FFMPEG,
      [
        '-y', '-v', 'error',
        '-ss', (piece.startMs / 1000).toFixed(6),
        '-t', (durationSec + 0.05).toFixed(6),
        '-i', input,
        '-vf',
        `scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase:flags=lanczos,crop=${WIDTH}:${HEIGHT},setsar=1,fps=${FPS}`,
        '-frames:v', String(piece.frames),
        '-c:v', 'libx264', '-crf', '18', '-preset', 'veryfast', '-pix_fmt', 'yuv420p',
        '-af', `afade=t=in:st=0:d=0.008,afade=t=out:st=${fadeOutStart.toFixed(3)}:d=0.008,apad`,
        '-t', durationSec.toFixed(6),
        '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2',
        file,
      ],
      `ffmpeg (piece ${i})`,
    );
    pieceFiles.push(file);
    process.stdout.write(`\r  ${i + 1}/${pieces.length} pieces`);
  });
  process.stdout.write('\n');

  const listFile = path.join(workDir, 'concat.txt');
  fs.writeFileSync(
    listFile,
    pieceFiles.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n') + '\n',
  );
  const concatFile = path.join(workDir, 'tight-raw.mp4');
  run(
    FFMPEG,
    ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', concatFile],
    'ffmpeg (concat)',
  );

  const aroll = path.join(outDir, 'aroll.mp4');
  run(
    FFMPEG,
    [
      '-y', '-v', 'error',
      '-i', concatFile,
      '-c:v', 'copy',
      '-af',
      'highpass=f=80,acompressor=threshold=-20dB:ratio=3:attack=5:release=80,loudnorm=I=-14:TP=-1.5:LRA=4',
      '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2',
      '-movflags', '+faststart',
      aroll,
    ],
    'ffmpeg (audio chain)',
  );

  const tightMs = probeDurationMs(aroll);
  log(`  aroll.mp4 ${round1(tightMs / 1000)}s`);

  /* 5 -------------------------------------------------------------- matte */
  let face = null;
  if (matte) {
    step(5, 'matting the presenter (Apple Vision person segmentation)');
    face = buildMatte(projectDir, aroll, outDir, workDir);
    log(
      `  person.webm + face.json  cx ${face.cx}  cy ${face.cy}  w ${face.w}  h ${face.h}  eyeY ${face.eyeY}`,
    );
  } else {
    step(5, 'matte skipped (--no-matte) — split layout stays inside the card');
  }

  /* 6 --------------------------------------------------------- remap words */
  step(6, 'remapping word timings');
  // real durations of the encoded pieces, so words stay on their syllables
  let offsetMs = 0;
  const remapped = new Array(words.length);
  pieces.forEach((piece) => {
    const actualMs = probeDurationMs(pieceFiles[piece.index]);
    for (const wordIdx of piece.wordIdx) {
      const word = words[wordIdx];
      const local = word.startMs - piece.startMs;
      const startMs = Math.max(offsetMs, Math.round(offsetMs + local));
      const endMs = Math.max(startMs + 20, Math.round(offsetMs + (word.endMs - piece.startMs)));
      remapped[wordIdx] = {text: word.text, startMs, endMs: Math.min(endMs, Math.round(offsetMs + actualMs))};
    }
    offsetMs += actualMs;
  });

  const finalWords = remapped.filter(Boolean);
  for (let i = 1; i < finalWords.length; i += 1) {
    if (finalWords[i].startMs < finalWords[i - 1].startMs) {
      finalWords[i].startMs = finalWords[i - 1].startMs;
    }
    if (finalWords[i].endMs <= finalWords[i].startMs) {
      finalWords[i].endMs = finalWords[i].startMs + 30;
    }
  }

  /* 7 -------------------------------------------------------------- write */
  step(7, 'writing assets');
  const wordsPath = path.join(outDir, 'words.json');
  fs.writeFileSync(wordsPath, `${JSON.stringify(finalWords, null, 2)}\n`);

  fs.writeFileSync(
    path.join(outDir, 'transcript.txt'),
    finalWords
      .map((w, i) => `${String(i).padStart(3, '0')}  ${String(w.startMs).padStart(5, ' ')}ms  ${w.text}`)
      .join('\n') + '\n',
  );

  const durationMs = Math.round(tightMs);
  const edit = {
    aroll: `shorts/${slug}/aroll.mp4`,
    words: `shorts/${slug}/words.json`,
    ...(face ? {matte: `shorts/${slug}/person.webm`, face} : {}),
    accent,
    durationMs,
    segments: [{fromMs: 0, toMs: durationMs, layout: 'face', zoom: 1}],
    emphasis: [],
    fx: [],
  };
  fs.writeFileSync(path.join(outDir, 'edit.json'), `${JSON.stringify(edit, null, 2)}\n`);

  log(`\nsummary`);
  log(`  original   ${round1(originalMs / 1000)}s`);
  log(`  tight      ${round1(durationMs / 1000)}s  (${pieces.length} ranges, ${finalWords.length} words)`);
  log(`  a-roll     public/shorts/${slug}/aroll.mp4`);
  if (face) log(`  matte      public/shorts/${slug}/person.webm (+ face.json)`);
  log(`  words      public/shorts/${slug}/words.json`);
  log(`  transcript public/shorts/${slug}/transcript.txt`);
  log(`  draft edit public/shorts/${slug}/edit.json  (one face segment — write the real cut next)`);
};

main().catch((error) => {
  console.error(`\nshorts-prep error: ${error.message}`);
  process.exit(1);
});
