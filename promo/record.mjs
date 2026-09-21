// Renders promo/sliders.html to an MP4, one frame at a time, so the result is
// smooth whatever the machine: `bun promo/record.mjs [name]` renders promo/<name>.html
// to promo/sharp-<name>.mp4 (needs playwright and ffmpeg). Default name: simple.
// A square cut: `bun promo/record.mjs list-square 1080 1080 1`.
import { chromium } from 'playwright';
import { mkdir, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = process.env.PROMO_DIR ?? path.dirname(fileURLToPath(import.meta.url));
const frames = path.join(here, '.frames');
const FPS = 30;
const name = process.argv[2] ?? 'simple';
const [width, height, scale] = [
  process.argv[3] ?? 1280,
  process.argv[4] ?? 720,
  process.argv[5] ?? 1.5,
].map(Number);
await rm(frames, { recursive: true, force: true });
await mkdir(frames, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale });
await page.goto(`file://${path.join(here, `${name}.html`)}?still`);
await page.evaluate(() => document.fonts.ready);
const duration = await page.evaluate(() => window.DURATION);
const total = Math.round(duration * FPS);
for (let frame = 0; frame < total; frame++) {
  await page.evaluate((t) => window.seek(t), frame / FPS);
  await page.screenshot({ path: path.join(frames, `${String(frame).padStart(4, '0')}.png`) });
}
await browser.close();
execFileSync('ffmpeg', [
  '-y',
  '-loglevel',
  'error',
  '-framerate',
  String(FPS),
  '-i',
  path.join(frames, '%04d.png'),
  '-c:v',
  'libx264',
  '-profile:v',
  'main',
  '-level',
  '4.0',
  '-g',
  String(FPS),
  '-keyint_min',
  String(FPS),
  '-sc_threshold',
  '0',
  '-bf',
  '0',
  '-pix_fmt',
  'yuv420p',
  '-crf',
  '17',
  '-movflags',
  '+faststart',
  path.join(here, `sharp-${name}.mp4`),
]);
await rm(frames, { recursive: true, force: true });
console.log(`wrote promo/sharp-${name}.mp4`);
