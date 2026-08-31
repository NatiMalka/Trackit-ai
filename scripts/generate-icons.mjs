/**
 * Rasterises the app icon into every size the manifest and iOS need.
 * Run with `npm run icons` after editing public/icons/favicon.svg.
 *
 * Maskable variants get extra padding because Android crops icons to an
 * arbitrary shape and will clip anything sitting in the outer ~10%.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'public', 'icons');

const BG = '#0b0e14';

// Explicit width/height, not just a viewBox: librsvg falls back to the
// intrinsic size and the mark comes out microscopic without them.
const mark = (size, scale) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">
  <g transform="translate(32 32) scale(${scale}) translate(-32 -32)">
    <path d="M12 42C18 24 34 16 52 20" fill="none" stroke="#ff7a29" stroke-width="3"
          stroke-linecap="round" stroke-dasharray="5 5.5"/>
    <path d="M20 34l12-6 12 6v13l-12 6-12-6z" fill="#2e7dff"/>
    <path d="M20 34l12 6 12-6-12-6z" fill="#5b9bff"/>
    <path d="M32 40v13l12-6V34z" fill="#1f5fd6"/>
    <circle cx="12" cy="42" r="4" fill="#ff7a29"/>
  </g>
</svg>`;

async function render({ name, size, scale, radius }) {
  const art = await sharp(Buffer.from(mark(size, scale))).png().toBuffer();

  const rounded =
    radius > 0
      ? Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
             <rect width="${size}" height="${size}" rx="${radius}" fill="${BG}"/>
           </svg>`,
        )
      : Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
             <rect width="${size}" height="${size}" fill="${BG}"/>
           </svg>`,
        );

  const buf = await sharp(rounded)
    .composite([{ input: art, blend: 'over' }])
    .png({ compressionLevel: 9 })
    .toBuffer();

  await writeFile(path.join(outDir, name), buf);
  return name;
}

const targets = [
  { name: 'icon-192.png', size: 192, scale: 1, radius: 44 },
  { name: 'icon-512.png', size: 512, scale: 1, radius: 118 },
  // Full-bleed square + inset artwork so Android's mask cannot clip the mark.
  { name: 'maskable-192.png', size: 192, scale: 0.72, radius: 0 },
  { name: 'maskable-512.png', size: 512, scale: 0.72, radius: 0 },
  { name: 'apple-touch-icon.png', size: 180, scale: 1, radius: 0 },
  { name: 'favicon-32.png', size: 32, scale: 1, radius: 6 },
];

await mkdir(outDir, { recursive: true });
const written = await Promise.all(targets.map(render));
console.log(`icons written: ${written.join(', ')}`);
