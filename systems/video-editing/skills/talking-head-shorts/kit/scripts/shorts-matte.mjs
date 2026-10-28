#!/usr/bin/env node
/**
 * shorts-matte.mjs --in <video> --out <dir> [--quality accurate|balanced|fast]
 *                  [--samples 24] [--raw <file>]
 *
 * The split layout's pop-out needs two things the a-roll does not carry: a
 * person cutout with alpha, and where the face sits. This wraps
 * scripts/shorts-matte.swift (Apple Vision) and encodes its RGBA frames to VP9
 * with an alpha plane.
 *
 * Writes <out>/person.webm (yuva420p, same fps/frame count as the a-roll) and
 * <out>/face.json ({cx, cy, w, h, eyeY}, normalized, top-left origin).
 *
 * Run from the Remotion project directory.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';

const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const FFPROBE = process.env.FFPROBE || 'ffprobe';
const FPS = 30;
const SWIFT = path.join('scripts', 'shorts-matte.swift');

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : fallback;
};

const log = (msg) => console.log(msg);

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

const probeSize = (file) => {
  const out = run(
    FFPROBE,
    ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file],
    'ffprobe',
  ).stdout.trim();
  const [width, height] = out.split(',').map(Number);
  if (!width || !height) {
    throw new Error(`ffprobe: could not read the size of ${file}`);
  }
  return {width, height};
};

const main = () => {
  const input = flag('in');
  const outDir = flag('out');
  if (!input) {
    throw new Error('missing --in <a-roll>. Example: node scripts/shorts-matte.mjs --in public/shorts/x/aroll.mp4 --out public/shorts/x');
  }
  if (!outDir) {
    throw new Error('missing --out <dir>. Example: --out public/shorts/<slug>');
  }
  if (!fs.existsSync(input)) {
    throw new Error(`input not found: ${path.resolve(input)}`);
  }
  if (!fs.existsSync(SWIFT)) {
    throw new Error(`${SWIFT} not found — this step needs macOS and Apple Vision`);
  }

  fs.mkdirSync(outDir, {recursive: true});
  const raw = flag('raw', path.join(os.tmpdir(), `shorts-matte-${process.pid}.rgba`));
  const swiftArgs = ['--in', path.resolve(input), '--out', path.resolve(outDir), '--raw', raw];
  const quality = flag('quality');
  const samples = flag('samples');
  if (quality) swiftArgs.push('--quality', quality);
  if (samples) swiftArgs.push('--samples', samples);

  // Plain `swift` first: no build step. Compile only if the interpreter fails.
  let result = spawnSync('swift', ['-suppress-warnings', SWIFT, ...swiftArgs], {
    stdio: 'inherit',
  });
  if (result.error || result.status !== 0) {
    const binDir = path.join(os.tmpdir(), 'talking-head-shorts-matte');
    fs.mkdirSync(binDir, {recursive: true});
    const bin = path.join(binDir, 'shorts-matte');
    log(`  swift interpreter failed — compiling with swiftc -O → ${bin}`);
    run('swiftc', ['-O', SWIFT, '-o', bin], 'swiftc');
    result = spawnSync(bin, swiftArgs, {stdio: 'inherit'});
  }
  if (result.status !== 0) {
    throw new Error(`shorts-matte.swift failed (exit ${result.status})`);
  }

  const {width, height} = probeSize(input);
  const webm = path.join(outDir, 'person.webm');
  log(`  encoding person.webm (${width}x${height}, vp9 + alpha)`);
  run(
    FFMPEG,
    [
      '-y', '-v', 'error',
      '-f', 'rawvideo', '-pix_fmt', 'rgba',
      '-s', `${width}x${height}`, '-r', String(FPS), '-i', raw,
      '-an',
      '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p',
      '-b:v', '0', '-crf', '20',
      '-auto-alt-ref', '0', '-row-mt', '1',
      '-metadata:s:v:0', 'alpha_mode=1',
      webm,
    ],
    'ffmpeg (person.webm)',
  );
  fs.rmSync(raw, {force: true});

  const face = JSON.parse(fs.readFileSync(path.join(outDir, 'face.json'), 'utf8'));
  const size = fs.statSync(webm).size / 1024 / 1024;
  log(
    `  person.webm ${size.toFixed(1)} MB · face cx ${face.cx} cy ${face.cy} w ${face.w} h ${face.h} eyeY ${face.eyeY}`,
  );
  return face;
};

try {
  main();
} catch (error) {
  console.error(`\nshorts-matte error: ${error.message}`);
  process.exit(1);
}
