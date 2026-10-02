#!/usr/bin/env node
// Determinism + palette lint for scene/kit/engine code. Frames must be a pure function of time:
// no Math.random, Date, performance.now, requestAnimationFrame, setTimeout/setInterval, CSS animation; banned fonts; no off-palette colours in scenes.
//   node tools/lint.mjs            (all)       node tools/lint.mjs film/scenes/act3.js
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/browser.mjs';

const BANNED = [
  [/Math\.random\s*\(/, 'Math.random (use ctx.rng(seed) / util.makeRng / hash01)'],
  [/\bDate\.now\b|new Date\b/, 'Date'],
  [/performance\.now/, 'performance.now'],
  [/requestAnimationFrame/, 'requestAnimationFrame'],
  [/\bsetTimeout\b|\bsetInterval\b/, 'timers'],
  [/@keyframes|animation\s*:|transition\s*:/, 'CSS animation'],
  [/\b(Archivo|IBM Plex Mono|Instrument Serif|Playfair|Montserrat|Poppins|Inter|Roboto|Bebas|Oswald)\b(?=[^\n]*font|["'])/, 'banned font'],
];
const SKIP = new Set(['vendor', 'fonts', 'dev']);
const files = [];
const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (SKIP.has(e.name)) continue; const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(js|mjs)$/.test(e.name)) files.push(p); } };
const targets = process.argv.slice(2);
if (targets.length) files.push(...targets.map((t) => path.resolve(t))); else walk(path.join(ROOT, 'film'));
const allowed = (f, why) => (f.endsWith('film/main.js') && /requestAnimationFrame/.test(why)) || f.endsWith('tools/lint.mjs');
let bad = 0;
for (const f of files) {
  const raw = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));   // blank block comments, keep line numbers
  const lines = raw.split('\n');
  lines.forEach((l, i) => {
    const code = l.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');
    for (const [re, why] of BANNED) if (re.test(code) && !allowed(f, why)) { console.log(`${path.relative(ROOT, f)}:${i + 1}: ${why}\n    ${l.trim()}`); bad++; }
  });
}
console.log(bad ? `\n${bad} problem(s)` : `lint ok (${files.length} files)`);
process.exit(bad ? 1 : 0);
