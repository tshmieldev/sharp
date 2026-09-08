import { deflateSync } from 'node:zlib';
import { writeFile } from 'node:fs/promises';

// Sharp's own mark, drawn from geometry rather than traced from anything:
// three tapering bars with the middle one broken, the gap being the filter.
// Run with `bun scripts/icon.mjs` after changing any number here.

const SIZES = [16, 32, 48, 128];
const SUPERSAMPLE = 4;
const TOP = [0x7a, 0x69, 0xff];
const BOTTOM = [0x53, 0x40, 0xdc];
const MARK = [0xff, 0xff, 0xff];
const CORNER = 0.22;
// Small sizes get heavier bars and a wider break, or the three rows silt up
// into one grey block. x0/x1 pairs are unit-space spans, per row.
const PROFILES = {
  large: {
    bar: 0.1,
    rows: [
      [0.3, [[0.17, 0.83]]],
      [
        0.5,
        [
          [0.25, 0.44],
          [0.56, 0.75],
        ],
      ],
      [0.7, [[0.33, 0.67]]],
    ],
  },
  small: {
    bar: 0.14,
    rows: [
      [0.28, [[0.15, 0.85]]],
      [
        0.5,
        [
          [0.22, 0.42],
          [0.58, 0.78],
        ],
      ],
      [0.72, [[0.31, 0.69]]],
    ],
  },
};
const profileFor = (size) => (size <= 32 ? PROFILES.small : PROFILES.large);

/** Signed distance to a rounded rectangle centred on the unit square. */
function insideRounded(x, y, radius) {
  const dx = Math.abs(x - 0.5) - (0.5 - radius);
  const dy = Math.abs(y - 0.5) - (0.5 - radius);
  // Inside either inset band is inside the shape; only the corners curve.
  if (dx <= 0 || dy <= 0) return true;
  return Math.hypot(dx, dy) <= radius;
}

function insideBars(x, y, profile) {
  const half = profile.bar / 2;
  return profile.rows.some(([cy, spans]) =>
    spans.some(([x0, x1]) => {
      const nearest = Math.min(Math.max(x, x0 + half), x1 - half);
      return Math.hypot(x - nearest, y - cy) <= half;
    }),
  );
}

function render(size) {
  const profile = profileFor(size);
  const scale = size * SUPERSAMPLE;
  const pixels = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let coverage = 0;
      let mark = 0;
      for (let sy = 0; sy < SUPERSAMPLE; sy++) {
        for (let sx = 0; sx < SUPERSAMPLE; sx++) {
          const x = (px * SUPERSAMPLE + sx + 0.5) / scale;
          const y = (py * SUPERSAMPLE + sy + 0.5) / scale;
          if (!insideRounded(x, y, CORNER)) continue;
          coverage++;
          if (insideBars(x, y, profile)) mark++;
        }
      }
      const samples = SUPERSAMPLE * SUPERSAMPLE;
      const offset = (py * size + px) * 4;
      if (!coverage) continue;
      const t = (py + 0.5) / size;
      const ink = mark / coverage;
      for (let channel = 0; channel < 3; channel++) {
        const base = TOP[channel] + (BOTTOM[channel] - TOP[channel]) * t;
        pixels[offset + channel] = Math.round(base + (MARK[channel] - base) * ink);
      }
      pixels[offset + 3] = Math.round((coverage / samples) * 255);
    }
  }
  return pixels;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([length, body, crc]);
}

const TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return c ^ 0xffffffff;
}

function png(size, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // no per-line filter
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

await Promise.all(SIZES.map((size) => writeFile(`icons/icon${size}.png`, png(size, render(size)))));
console.log(`Wrote ${SIZES.map((size) => `icons/icon${size}.png`).join(', ')}`);
