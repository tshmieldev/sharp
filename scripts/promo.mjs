import { execFileSync } from 'node:child_process';
import { mkdir, writeFile, rm } from 'node:fs/promises';

// Chrome Web Store artwork. Needs rsvg-convert (`brew install librsvg`).
// These are graphics, not screenshots: the store also wants real captures of
// the extension running, which have to be taken in a browser.

const OUT = 'store';
const INK = '#ffffff';
const VIOLET = '#8b7dff';
const MUTED = '#8f8da6';
const FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif";

/** The gavel from brand/sharp.svg, in its own 100x100 box. */
function mark(x, y, size, colour = INK) {
  const paths = [
    'M43 17 51 14.5 66.5 30 64 38Z',
    'M43.3 22.2 58.6 37.4 52 44 86.5 75.2 87 83.2 78.5 82.8 47.2 48.5 40 55.5 24.8 40.8Z',
    'M19.5 40 40.5 60.7 32.7 63.2 17.1 48Z',
  ];
  return `<g transform="translate(${x} ${y}) scale(${size / 100})" fill="${colour}">${paths
    .map((d) => `<path d="${d}"/>`)
    .join('')}</g>`;
}

const backdrop = (w, h) => `
  <defs>
    <radialGradient id="glow" cx="50%" cy="0%" r="85%">
      <stop offset="0%" stop-color="#6d5bff" stop-opacity="0.45"/>
      <stop offset="100%" stop-color="#6d5bff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="#0b0b10"/>
  <rect width="${w}" height="${h}" fill="url(#glow)"/>`;

const svg = (w, h, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${backdrop(w, h)}${body}</svg>`;

const text = (x, y, size, weight, fill, value, extra = '') =>
  `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="${fill}" ${extra}>${value}</text>`;

const sheets = {
  'tile-440x280': svg(
    440,
    280,
    `${mark(160, 34, 120, VIOLET)}
     ${text(220, 190, 52, 700, INK, 'Sharp', 'text-anchor="middle" letter-spacing="-1.5"')}
     ${text(220, 222, 19, 500, VIOLET, 'Cut the slop.', 'text-anchor="middle"')}`,
  ),
  'marquee-1400x560': svg(
    1400,
    560,
    `${mark(316, 180, 200, VIOLET)}
     ${text(560, 256, 108, 700, INK, 'Sharp', 'letter-spacing="-3"')}
     ${text(566, 320, 36, 500, VIOLET, 'Cut the slop.')}
     ${text(566, 376, 26, 400, MUTED, 'Filter your X timeline with your own AI model.')}`,
  ),
  'listing-1280x800': svg(
    1280,
    800,
    `${mark(548, 132, 184, VIOLET)}
     ${text(640, 404, 116, 700, INK, 'Sharp', 'text-anchor="middle" letter-spacing="-3.5"')}
     ${text(640, 458, 34, 500, VIOLET, 'Cut the slop.', 'text-anchor="middle"')}
     ${text(640, 550, 27, 400, MUTED, 'Describe what you never want to see. It stops showing up.', 'text-anchor="middle"')}
     ${text(640, 596, 27, 400, MUTED, 'Your API key, your provider, your bill.', 'text-anchor="middle"')}
     ${text(640, 642, 27, 400, MUTED, 'No account. No server. Nothing collected.', 'text-anchor="middle"')}`,
  ),
};

await mkdir(OUT, { recursive: true });
for (const [name, source] of Object.entries(sheets)) {
  const [, w, h] = /-(\d+)x(\d+)$/.exec(name);
  await writeFile(`${OUT}/${name}.svg`, source);
  try {
    execFileSync('rsvg-convert', [
      '-w',
      w,
      '-h',
      h,
      '-o',
      `${OUT}/${name}.png`,
      `${OUT}/${name}.svg`,
    ]);
  } catch (error) {
    throw new Error(`rsvg-convert failed for ${name}. Install librsvg. ${error.message}`);
  }
  await rm(`${OUT}/${name}.svg`);
  console.log(`${OUT}/${name}.png`);
}
