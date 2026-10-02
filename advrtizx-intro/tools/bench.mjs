#!/usr/bin/env node
// Worker-scaling benchmark: node tools/bench.mjs [--final] [--from 44 --to 55] [--acts 1]
// Runs tools/render.mjs with 1..4 workers over a short range and prints ms/frame. (Other processes on the machine skew results.)
import { spawnSync } from 'node:child_process';
const a = process.argv.slice(2), final = a.includes('--final'), g = (k, d) => { const i = a.indexOf('--' + k); return i < 0 ? d : a[i + 1]; };
for (const w of [1, 2, 3, 4]) {
  const r = spawnSync('node', ['tools/render.mjs', final ? '--final' : '--draft', '--acts', g('acts', '1'), '--from', g('from', '44'), '--to', g('to', '55'), '--workers', String(w), '--out', 'out/bench.mp4', '--audio', 'none'], { encoding: 'utf8' });
  const m = (r.stdout + r.stderr).match(/(\d+) ms\/frame\s+capture/); console.log(`workers ${w}: ${m ? m[1] : '?'} ms/frame`);
}
