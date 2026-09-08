import { execFileSync } from 'node:child_process';
import { access } from 'node:fs/promises';

// Rasterises brand/sharp.svg into the sizes the manifest declares.
// Needs rsvg-convert (`brew install librsvg`). Run after editing the SVG.

const SOURCE = 'brand/sharp.svg';
const SIZES = [16, 32, 48, 128];

await access(SOURCE);
for (const size of SIZES) {
  const target = `icons/icon${size}.png`;
  execFileSync('rsvg-convert', ['-w', String(size), '-h', String(size), '-o', target, SOURCE]);
  console.log(target);
}
