#!/usr/bin/env node
/**
 * shorts-validate.mjs <edit.json> [--public <dir>] [--self-test]
 *
 * Enforces rules 1–8 of references/edit-schema.md. Errors exit 1, warnings do
 * not. `--self-test` runs assert-based pass/fail cases for every rule.
 *
 * Frame = 1000/30 ms.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert';

const FRAME_MS = 1000 / 30;
const BOUNDARY_TOLERANCE = FRAME_MS + 0.01;
const EPS = 0.5;

const RULES = {
  1: 'timeline contiguous, ordered, covers [0, duration], cuts on word onsets',
  2: 'no two adjacent face segments',
  3: 'split/graphic need a graphic; face must not have one',
  4: 'segment length 600–4500 ms (median ≈ 2000 ms)',
  5: 'face share of runtime 15–40%',
  6: 'last segment is face with a twoTier CTA emphasis',
  7: 'referenced assets exist under public/',
  8: 'at most one lightLeak',
  9: 'ordinals are a list: THE FIRST, THE SECOND, … in order, at least 2',
};

/** Ordinal labels are only meaningful as an ordered list. */
const ORDINALS = [
  'THE FIRST',
  'THE SECOND',
  'THE THIRD',
  'THE FOURTH',
  'THE FIFTH',
  'THE SIXTH',
  'THE SEVENTH',
  'THE EIGHTH',
  'THE NINTH',
  'THE TENTH',
];

const median = (values) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
};

const collectAssets = (edit) => {
  const assets = new Set();
  const push = (p) => {
    if (typeof p === 'string' && p.trim().length > 0) assets.add(p);
  };
  push(edit.aroll);
  push(edit.words);
  push(edit.matte);
  for (const segment of edit.segments ?? []) {
    const g = segment.graphic;
    if (!g) continue;
    switch (g.kind) {
      case 'image':
        if (typeof g.src === 'string') push(g.src);
        else for (const step of g.src ?? []) push(step.src);
        break;
      case 'logoTile':
        push(g.src);
        break;
      case 'portrait':
        push(g.src);
        break;
      case 'counter':
        if (typeof g.icon === 'string' && /[./]/.test(g.icon)) push(g.icon);
        break;
      case 'compare':
        push(g.left?.icon);
        push(g.right?.icon);
        break;
      default:
        break;
    }
  }
  for (const item of edit.fx ?? []) {
    if (item.kind === 'sfx') push(`shorts/sfx/${item.name}.wav`);
  }
  return [...assets];
};

export const validateEdit = (edit, {words = [], publicDir, wordsMissing = false} = {}) => {
  const issues = [];
  const add = (rule, level, code, message) => issues.push({rule, level, code, message});

  const segments = Array.isArray(edit.segments) ? edit.segments : [];
  if (segments.length === 0) {
    add(1, 'error', 'r1.empty', 'edit.segments is empty');
    return {issues, stats: null, durationMs: 0};
  }

  const lastWordEnd = words.length > 0 ? words[words.length - 1].endMs : 0;
  const durationMs = typeof edit.durationMs === 'number' ? edit.durationMs : lastWordEnd + 400;

  /* --------------------------------------------------------- rule 1 */
  if (Math.abs(segments[0].fromMs) > EPS) {
    add(1, 'error', 'r1.start', `first segment starts at ${segments[0].fromMs}ms, expected 0`);
  }

  segments.forEach((segment, i) => {
    if (!(segment.toMs > segment.fromMs)) {
      add(1, 'error', 'r1.order', `segment ${i}: toMs (${segment.toMs}) <= fromMs (${segment.fromMs})`);
    }
    if (i > 0) {
      const gap = segment.fromMs - segments[i - 1].toMs;
      if (Math.abs(gap) > EPS) {
        add(
          1,
          'error',
          'r1.gap',
          `segment ${i}: boundary ${gap > 0 ? 'gap' : 'overlap'} of ${Math.round(gap)}ms ` +
            `(previous ends ${segments[i - 1].toMs}ms, this starts ${segment.fromMs}ms)`,
        );
      }
      if (!wordsMissing && !words.some((w) => Math.abs(w.startMs - segment.fromMs) <= BOUNDARY_TOLERANCE)) {
        const nearest = words.reduce(
          (best, w) =>
            Math.abs(w.startMs - segment.fromMs) < Math.abs(best - segment.fromMs) ? w.startMs : best,
          words.length > 0 ? words[0].startMs : 0,
        );
        add(
          1,
          'error',
          'r1.boundary',
          `segment ${i}: cut at ${segment.fromMs}ms is not on a word onset ` +
            `(nearest word starts ${Math.round(nearest)}ms, tolerance ±1 frame = ${FRAME_MS.toFixed(1)}ms)`,
        );
      }
    }
  });

  if (Math.abs(segments[segments.length - 1].toMs - durationMs) > EPS) {
    add(
      1,
      'error',
      'r1.cover',
      `timeline ends at ${segments[segments.length - 1].toMs}ms but duration is ${durationMs}ms`,
    );
  }

  /* --------------------------------------------------------- rule 2 */
  for (let i = 1; i < segments.length; i += 1) {
    if (segments[i].layout === 'face' && segments[i - 1].layout === 'face') {
      add(2, 'error', 'r2.adjacentFace', `segments ${i - 1} and ${i} are both face`);
    }
  }

  /* --------------------------------------------------------- rule 3 */
  segments.forEach((segment, i) => {
    if (!['face', 'split', 'graphic'].includes(segment.layout)) {
      add(3, 'error', 'r3.layout', `segment ${i}: unknown layout "${segment.layout}"`);
      return;
    }
    if (segment.layout === 'face' && segment.graphic) {
      add(3, 'error', 'r3.faceGraphic', `segment ${i}: face segments must not carry a graphic`);
    }
    if (segment.layout !== 'face' && !segment.graphic) {
      add(3, 'error', 'r3.missingGraphic', `segment ${i}: ${segment.layout} needs a graphic`);
    }
  });

  /* --------------------------------------------------------- rule 4 */
  const lengths = segments.map((s) => s.toMs - s.fromMs);
  segments.forEach((segment, i) => {
    const length = lengths[i];
    if (length < 600 || length > 4500) {
      add(
        4,
        'error',
        'r4.length',
        `segment ${i}: ${Math.round(length)}ms is outside 600–4500ms`,
      );
    }
  });
  const medianLength = median(lengths);
  if (medianLength < 1600 || medianLength > 2400) {
    add(
      4,
      'warning',
      'r4.median',
      `median segment length ${Math.round(medianLength)}ms — target ≈ 2000ms`,
    );
  }

  /* --------------------------------------------------------- rule 5 */
  const faceMs = segments
    .filter((s) => s.layout === 'face')
    .reduce((sum, s) => sum + (s.toMs - s.fromMs), 0);
  const faceShare = durationMs > 0 ? faceMs / durationMs : 0;
  if (faceShare < 0.15 - 1e-9 || faceShare > 0.4 + 1e-9) {
    add(
      5,
      'warning',
      'r5.faceShare',
      `face share ${(faceShare * 100).toFixed(1)}% is outside 15–40%`,
    );
  }

  /* --------------------------------------------------------- rule 6 */
  const last = segments[segments.length - 1];
  const emphasis = Array.isArray(edit.emphasis) ? edit.emphasis : [];
  if (last.layout !== 'face') {
    add(6, 'error', 'r6.lastFace', `last segment is "${last.layout}", expected face with the CTA`);
  }
  const hasCta = emphasis.some(
    (e) => e.style === 'twoTier' && e.fromMs >= last.fromMs - EPS && e.fromMs < last.toMs,
  );
  if (!hasCta) {
    add(6, 'error', 'r6.cta', 'no twoTier emphasis inside the last segment (the CTA)');
  }

  /* --------------------------------------------------------- rule 7 */
  if (publicDir) {
    const missing = [];
    for (const asset of collectAssets(edit)) {
      const file = path.isAbsolute(asset) ? asset : path.join(publicDir, asset);
      if (!fs.existsSync(file)) missing.push(asset);
    }
    if (wordsMissing && edit.words) {
      missing.push(edit.words);
    }
    for (const asset of [...new Set(missing)]) {
      add(7, 'error', 'r7.asset', `missing under public/: ${asset}`);
    }
  }

  /* --------------------------------------------------------- rule 8 */
  const leaks = (edit.fx ?? []).filter((f) => f.kind === 'lightLeak');
  if (leaks.length > 1) {
    add(8, 'error', 'r8.lightLeak', `${leaks.length} lightLeaks — at most one per video`);
  }

  /* --------------------------------------------------------- rule 9 */
  const ordinals = segments
    .map((segment, i) => ({
      i,
      label:
        segment.graphic?.kind === 'logoTile' ? segment.graphic.ordinal : undefined,
    }))
    .filter((o) => typeof o.label === 'string' && o.label.trim().length > 0);

  if (ordinals.length === 1) {
    add(
      9,
      'error',
      'r9.ordinalCount',
      `segment ${ordinals[0].i}: "${ordinals[0].label.trim()}" is the only ordinal — ` +
        'ordinals are a list (THE FIRST, THE SECOND, …) or nothing at all',
    );
  }
  ordinals.forEach((o, k) => {
    const label = o.label.trim().toUpperCase().replace(/\s+/g, ' ');
    const expected = ORDINALS[k];
    if (label !== expected) {
      add(
        9,
        'error',
        'r9.ordinalOrder',
        `segment ${o.i}: ordinal "${o.label.trim()}" should be "${expected ?? 'beyond THE TENTH'}" — ` +
          'ordinals must start at THE FIRST and increase in order',
      );
    }
  });

  const stats = {
    durationMs,
    segmentCount: segments.length,
    medianLength,
    faceMs,
    faceShare,
    faceCount: segments.filter((s) => s.layout === 'face').length,
    splitCount: segments.filter((s) => s.layout === 'split').length,
    graphicCount: segments.filter((s) => s.layout === 'graphic').length,
    ordinalCount: ordinals.length,
    lengths,
  };

  return {issues, stats, durationMs};
};

/* ------------------------------------------------------------------- CLI */

const loadJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

const runFile = (editFile, publicDir) => {
  if (!fs.existsSync(editFile)) {
    console.error(`shorts-validate: edit not found: ${editFile}`);
    process.exit(1);
  }
  const edit = loadJson(editFile);

  let words = [];
  let wordsMissing = false;
  const wordsFile = edit.words ? path.join(publicDir, edit.words) : null;
  if (wordsFile && fs.existsSync(wordsFile)) {
    words = loadJson(wordsFile);
  } else if (edit.words) {
    wordsMissing = true;
  }

  const {issues, stats, durationMs} = validateEdit(edit, {words, publicDir, wordsMissing});
  const errors = issues.filter((i) => i.level === 'error');
  const warnings = issues.filter((i) => i.level === 'warning');

  console.log('ShortsEdit validator');
  console.log(`  edit      ${editFile}`);
  console.log(`  public    ${publicDir}`);
  if (stats) {
    console.log(
      `  duration  ${(durationMs / 1000).toFixed(2)}s · ${stats.segmentCount} segments · ` +
        `median ${Math.round(stats.medianLength)}ms · face ${(stats.faceShare * 100).toFixed(0)}% ` +
        `(${stats.faceCount} face / ${stats.splitCount} split / ${stats.graphicCount} graphic)`,
    );
  }
  console.log('');

  for (const [rule, label] of Object.entries(RULES)) {
    const ruleIssues = issues.filter((i) => String(i.rule) === rule);
    const failed = ruleIssues.some((i) => i.level === 'error');
    const warned = ruleIssues.some((i) => i.level === 'warning');
    const status = failed ? 'FAIL' : warned ? 'WARN' : 'PASS';
    console.log(`  [${rule}] ${label.padEnd(58, '.')} ${status}`);
  }

  if (warnings.length > 0) {
    console.log('\nwarnings');
    for (const w of warnings) console.log(`  [${w.rule}] ${w.message}`);
  }
  if (errors.length > 0) {
    console.log('\nerrors');
    for (const e of errors) console.log(`  [${e.rule}] ${e.code}: ${e.message}`);
  }

  console.log(`\n${errors.length} error(s), ${warnings.length} warning(s)`);
  process.exit(errors.length > 0 ? 1 : 0);
};

/* ------------------------------------------------------------- self-test */

const selfTest = () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'shorts-validate-'));
  const publicDir = path.join(tmp, 'public');
  fs.mkdirSync(path.join(publicDir, 'shorts', 'test'), {recursive: true});
  fs.mkdirSync(path.join(publicDir, 'shorts', 'sfx'), {recursive: true});
  fs.writeFileSync(path.join(publicDir, 'shorts', 'test', 'aroll.mp4'), 'x');
  fs.writeFileSync(path.join(publicDir, 'shorts', 'test', 'words.json'), '[]');
  fs.writeFileSync(path.join(publicDir, 'shorts', 'test', 'img.png'), 'x');
  fs.writeFileSync(path.join(publicDir, 'shorts', 'test', 'person.webm'), 'x');
  fs.writeFileSync(path.join(publicDir, 'shorts', 'sfx', 'whoosh.wav'), 'x');

  const clone = (value) => JSON.parse(JSON.stringify(value));

  const buildEdit = ({
    lengths = [2000, 4000, 2000, 2000, 2000],
    layouts = ['face', 'graphic', 'split', 'graphic', 'face'],
    emphasis = 'cta',
    fx = [{kind: 'lightLeak', atMs: 5000}],
    graphic = () => ({kind: 'wordmark', text: 'X'}),
  } = {}) => {
    let t = 0;
    const segments = lengths.map((length, i) => {
      const segment = {fromMs: t, toMs: t + length, layout: layouts[i]};
      if (layouts[i] !== 'face') segment.graphic = graphic(i);
      t += length;
      return segment;
    });
    const durationMs = t;
    const boundaries = segments.map((s) => s.fromMs).concat([durationMs]);
    const words = [];
    for (const boundary of boundaries) {
      words.push({text: 'word', startMs: boundary, endMs: boundary + 200});
      words.push({text: 'filler', startMs: boundary + 700, endMs: boundary + 900});
    }
    const last = segments[segments.length - 1];
    const edit = {
      aroll: 'shorts/test/aroll.mp4',
      words: 'shorts/test/words.json',
      accent: '#D97757',
      durationMs,
      segments,
      emphasis:
        emphasis === 'cta'
          ? [
              {
                style: 'twoTier',
                fromMs: last.fromMs + 200,
                toMs: last.toMs,
                lead: 'comment',
                key: 'FREE',
              },
            ]
          : [],
      fx,
    };
    return {edit, words};
  };

  const run = (build, mutate) => {
    const built = buildEdit(build);
    if (mutate) mutate(built.edit);
    const result = validateEdit(built.edit, {words: built.words, publicDir});
    return result.issues;
  };

  const has = (issues, code, level = 'error') =>
    issues.some((i) => i.code === code && i.level === level);
  const clean = (issues) => issues.length === 0;

  const cases = [];
  const check = (name, fn) => {
    try {
      fn();
      cases.push({name, ok: true});
    } catch (error) {
      cases.push({name, ok: false, error: error.message});
    }
  };

  const base = buildEdit();
  const baseIssues = validateEdit(base.edit, {words: base.words, publicDir}).issues;

  check('base edit is clean (0 errors, 0 warnings)', () => {
    assert.deepStrictEqual(baseIssues, [], JSON.stringify(baseIssues));
  });

  check('rule 1 fails on a timeline gap', () => {
    const issues = run({}, (edit) => {
      edit.segments[2].fromMs += 100;
      edit.segments[2].toMs += 100;
      edit.segments[3].fromMs += 100;
    });
    assert.ok(has(issues, 'r1.gap'), 'expected r1.gap');
  });

  check('rule 1 fails on a cut that is not a word onset', () => {
    const issues = run({}, (edit) => {
      edit.segments[2].fromMs += 400;
      edit.segments[1].toMs += 400;
      edit.segments[2].toMs += 400;
      edit.segments[3].fromMs += 400;
    });
    assert.ok(has(issues, 'r1.boundary'), 'expected r1.boundary');
  });

  check('rule 1 fails when the timeline does not reach durationMs', () => {
    const issues = run({}, (edit) => {
      edit.segments[edit.segments.length - 1].toMs -= 400;
    });
    assert.ok(has(issues, 'r1.cover'), 'expected r1.cover');
  });

  check('rule 1 fails when the first segment does not start at 0', () => {
    const issues = run({}, (edit) => {
      edit.segments[0].fromMs = 200;
    });
    assert.ok(has(issues, 'r1.start'), 'expected r1.start');
  });

  check('rule 2 fails on adjacent face segments', () => {
    const issues = run({layouts: ['face', 'face', 'split', 'graphic', 'face']});
    assert.ok(has(issues, 'r2.adjacentFace'), 'expected r2.adjacentFace');
  });

  check('rule 3 fails when split/graphic has no graphic', () => {
    const issues = run({}, (edit) => {
      delete edit.segments[1].graphic;
    });
    assert.ok(has(issues, 'r3.missingGraphic'), 'expected r3.missingGraphic');
  });

  check('rule 3 fails when face carries a graphic', () => {
    const issues = run({}, (edit) => {
      edit.segments[0].graphic = {kind: 'wordmark', text: 'X'};
    });
    assert.ok(has(issues, 'r3.faceGraphic'), 'expected r3.faceGraphic');
  });

  check('rule 4 fails on a segment shorter than 600ms', () => {
    const issues = run({lengths: [2000, 400, 2000, 2000, 2000]});
    assert.ok(has(issues, 'r4.length'), 'expected r4.length');
  });

  check('rule 4 fails on a segment longer than 4500ms', () => {
    const issues = run({lengths: [2000, 5000, 2000, 2000, 2000]});
    assert.ok(has(issues, 'r4.length'), 'expected r4.length');
  });

  check('rule 4 warns on a median far from 2000ms', () => {
    const issues = run({lengths: [3000, 3000, 3000, 3000, 3000]});
    assert.ok(has(issues, 'r4.median', 'warning'), 'expected r4.median warning');
    assert.ok(!issues.some((i) => i.level === 'error'), 'expected no errors');
  });

  check('rule 5 warns when face share is too high', () => {
    const issues = run({lengths: [4000, 4000, 4000], layouts: ['face', 'graphic', 'face']});
    assert.ok(has(issues, 'r5.faceShare', 'warning'), 'expected r5.faceShare warning');
    assert.ok(!issues.some((i) => i.level === 'error'), 'expected no errors');
  });

  check('rule 5 warns when face share is too low', () => {
    const issues = run({
      lengths: [1000, 4000, 4000, 4000, 1000],
      layouts: ['face', 'graphic', 'split', 'graphic', 'face'],
    });
    assert.ok(has(issues, 'r5.faceShare', 'warning'), 'expected r5.faceShare warning');
  });

  check('rule 6 fails when the last segment is not face', () => {
    const issues = run({layouts: ['face', 'graphic', 'split']});
    assert.ok(has(issues, 'r6.lastFace'), 'expected r6.lastFace');
  });

  check('rule 6 fails without a twoTier CTA in the last segment', () => {
    const issues = run({emphasis: 'none'});
    assert.ok(has(issues, 'r6.cta'), 'expected r6.cta');
  });

  check('rule 7 fails when the a-roll is missing', () => {
    const issues = run({}, (edit) => {
      edit.aroll = 'shorts/test/nope.mp4';
    });
    assert.ok(has(issues, 'r7.asset'), 'expected r7.asset');
  });

  check('rule 7 fails when an image asset is missing', () => {
    const issues = run({}, (edit) => {
      edit.segments[1].graphic = {
        kind: 'image',
        src: [{atMs: 0, src: 'shorts/test/missing.png'}],
      };
    });
    assert.ok(has(issues, 'r7.asset'), 'expected r7.asset');
  });

  check('rule 7 fails when an sfx file is missing', () => {
    const issues = run({fx: [{kind: 'sfx', atMs: 1000, name: 'ding'}]});
    assert.ok(has(issues, 'r7.asset'), 'expected r7.asset');
  });

  check('rule 8 fails on two light leaks', () => {
    const issues = run({fx: [{kind: 'lightLeak', atMs: 1000}, {kind: 'lightLeak', atMs: 4000}]});
    assert.ok(has(issues, 'r8.lightLeak'), 'expected r8.lightLeak');
  });

  check('rule 8 passes on a single light leak', () => {
    const issues = run({fx: [{kind: 'lightLeak', atMs: 1000}]});
    assert.ok(!has(issues, 'r8.lightLeak'), 'unexpected r8.lightLeak');
  });

  check('rule 9 passes on an ordered ordinal list', () => {
    const issues = run({}, (edit) => {
      edit.segments[1].graphic = {kind: 'logoTile', ordinal: 'THE FIRST'};
      edit.segments[3].graphic = {kind: 'logoTile', ordinal: 'THE SECOND'};
    });
    assert.ok(!has(issues, 'r9.ordinalCount'), 'unexpected r9.ordinalCount');
    assert.ok(!has(issues, 'r9.ordinalOrder'), 'unexpected r9.ordinalOrder');
  });

  check('rule 9 fails on a lone ordinal', () => {
    const issues = run({}, (edit) => {
      edit.segments[1].graphic = {kind: 'logoTile', ordinal: 'THE FIRST'};
    });
    assert.ok(has(issues, 'r9.ordinalCount'), 'expected r9.ordinalCount');
  });

  check('rule 9 fails when ordinals do not start at THE FIRST', () => {
    const issues = run({}, (edit) => {
      edit.segments[1].graphic = {kind: 'logoTile', ordinal: 'THE SECOND'};
      edit.segments[3].graphic = {kind: 'logoTile', ordinal: 'THE THIRD'};
    });
    assert.ok(has(issues, 'r9.ordinalOrder'), 'expected r9.ordinalOrder');
  });

  check('rule 9 fails when ordinals skip', () => {
    const issues = run({}, (edit) => {
      edit.segments[1].graphic = {kind: 'logoTile', ordinal: 'THE FIRST'};
      edit.segments[3].graphic = {kind: 'logoTile', ordinal: 'THE THIRD'};
    });
    assert.ok(has(issues, 'r9.ordinalOrder'), 'expected r9.ordinalOrder');
  });

  check('rule 7 fails when the matte is missing', () => {
    const issues = run({}, (edit) => {
      edit.matte = 'shorts/test/nope.webm';
    });
    assert.ok(has(issues, 'r7.asset'), 'expected r7.asset');
  });

  check('clone helper keeps fixtures independent', () => {
    const a = clone(base.edit);
    a.segments[0].toMs = 1;
    assert.notStrictEqual(base.edit.segments[0].toMs, 1);
  });

  fs.rmSync(tmp, {recursive: true, force: true});

  const failed = cases.filter((c) => !c.ok);
  for (const c of cases) {
    console.log(`  ${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.ok ? '' : ` — ${c.error}`}`);
  }
  console.log(`\nself-test: ${cases.length - failed.length}/${cases.length} passed`);
  process.exit(failed.length === 0 ? 0 : 1);
};

/* -------------------------------------------------------------- entrypoint */

const argv = process.argv.slice(2);
if (argv.includes('--self-test')) {
  selfTest();
} else {
  const publicIndex = argv.indexOf('--public');
  let publicDir = path.resolve('public');
  if (publicIndex >= 0) {
    if (!argv[publicIndex + 1]) {
      console.error('shorts-validate: --public needs a directory');
      process.exit(1);
    }
    publicDir = path.resolve(argv[publicIndex + 1]);
  }
  const editArg = argv.find(
    (arg, i) => !arg.startsWith('--') && !(publicIndex >= 0 && i === publicIndex + 1),
  );
  if (!editArg) {
    console.error('usage: node scripts/shorts-validate.mjs <edit.json> [--public <dir>] [--self-test]');
    process.exit(1);
  }
  runFile(path.resolve(editArg), publicDir);
}
