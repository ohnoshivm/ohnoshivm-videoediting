// Playwright + headless Chromium (software WebGL2 via SwiftShader). Resolved the same way advrtizx-film/render.mjs does:
// local, NODE_PATH, then the global npm root (/opt/node22/lib/node_modules). NEVER run "playwright install".
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
export const FRAMES = 1800, FPS = 30;

export function loadPlaywright() {
  const req = createRequire(import.meta.url);
  const paths = [ROOT, ...(process.env.NODE_PATH || '').split(':').filter(Boolean)];
  try { paths.push(execSync('npm root -g', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()); } catch {}
  for (const name of ['playwright-core', 'playwright']) { try { return req(req.resolve(name, { paths })); } catch {} }
  throw new Error('playwright(-core) not found locally, in NODE_PATH or npm root -g');
}

export const CHROME_ARGS = [
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--enable-webgl2-compute-context=false',
  '--force-color-profile=srgb', '--font-render-hinting=none', '--hide-scrollbars', '--disable-lcd-text',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
  '--disable-features=CalculateNativeWinOcclusion', '--no-sandbox', '--disable-dev-shm-usage',
];

export async function launch(extraArgs = []) {
  const { chromium } = loadPlaywright();
  return chromium.launch({ executablePath: CHROME, args: [...CHROME_ARGS, ...extraArgs] });
}

/** Opens film/index.html and waits for window.__ready. query: object of URL params. */
export async function openFilm(browser, { port, scale = 1, query = {}, quiet = false }) {
  const W = Math.round(1920 * scale), H = Math.round(1080 * scale);
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error('[page error]', e.message));
  page.on('console', (m) => { const t = m.type(); if (t === 'error' || (!quiet && (t === 'warning' || t === 'log'))) { const s = m.text(); if (!/GroupMarkerNotSet|Automatic fallback to software WebGL/.test(s)) console.error(`[${t}]`, s); } });
  const qs = new URLSearchParams({ scale: String(scale), ...query }).toString();
  await page.goto(`http://127.0.0.1:${port}/film/index.html?${qs}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true || window.__fatal, null, { timeout: 180000, polling: 100 });
  const fatal = await page.evaluate(() => window.__fatal || null);
  if (fatal) throw new Error('film failed to boot: ' + fatal);
  return page;
}
