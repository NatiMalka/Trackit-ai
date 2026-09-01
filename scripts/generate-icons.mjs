/**
 * Rasterises icon.jpg into every size the manifest and iOS need.
 * Run with `npm run icons` after replacing icon.jpg.
 *
 * Home-screen icons are opaque and full-bleed. iOS fills transparent pixels
 * with white, which is how a rounded PNG turns into a white border.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'icon.jpg');
const outDir = path.join(root, 'public', 'icons');

const NAVY = { r: 10, g: 14, b: 39, alpha: 1 };

async function artwork() {
  const trimmed = await sharp(src)
    .rotate()
    .trim({ threshold: 18 })
    .toBuffer({ resolveWithObject: true });

  const { width, height } = trimmed.info;
  const side = Math.max(width, height);
  return sharp(trimmed.data)
    .extend({
      top: Math.floor((side - height) / 2),
      bottom: Math.ceil((side - height) / 2),
      left: Math.floor((side - width) / 2),
      right: Math.ceil((side - width) / 2),
      background: NAVY,
    })
    .png()
    .toBuffer();
}

/**
 * Full-bleed opaque PNG. `zoom` > 1 crops in so the mark fills the tile.
 * Never round or leave alpha — iOS paints missing pixels white.
 */
async function render({ name, size, zoom, pad }, art) {
  const inner = Math.max(1, Math.round(size * (1 - pad * 2)));
  const scaled = Math.round(inner * zoom);
  const left = Math.max(0, Math.round((scaled - inner) / 2));
  const top = left;

  const mark = await sharp(art)
    .resize(scaled, scaled, { fit: 'cover', position: 'centre' })
    .extract({ left, top, width: inner, height: inner })
    .png()
    .toBuffer();

  const buf = await sharp({
    create: { width: size, height: size, channels: 3, background: NAVY },
  })
    .composite([{ input: mark, gravity: 'centre' }])
    .flatten({ background: NAVY })
    .removeAlpha()
    .png({ compressionLevel: 9 })
    .toBuffer();

  await writeFile(path.join(outDir, name), buf);
  return name;
}

await mkdir(outDir, { recursive: true });
const art = await artwork();

const targets = [
  // Opaque squares iOS uses for Add to Home Screen. New names bust its cache.
  { name: 'apple-touch-180.png', size: 180, zoom: 1.12, pad: 0 },
  { name: 'apple-touch-192.png', size: 192, zoom: 1.12, pad: 0 },
  { name: 'apple-touch-512.png', size: 512, zoom: 1.12, pad: 0 },
  { name: 'icon-192.png', size: 192, zoom: 1.12, pad: 0 },
  { name: 'icon-512.png', size: 512, zoom: 1.12, pad: 0 },
  { name: 'maskable-192.png', size: 192, zoom: 1, pad: 0.12 },
  { name: 'maskable-512.png', size: 512, zoom: 1, pad: 0.12 },
  { name: 'favicon-32.png', size: 32, zoom: 1.08, pad: 0 },
];

const written = await Promise.all(targets.map((t) => render(t, art)));
// Keep the previous filename so a cached HTML link still gets the full-bleed art.
await writeFile(path.join(outDir, 'apple-touch-icon.png'), await sharp(path.join(outDir, 'apple-touch-180.png')).png().toBuffer());
console.log(`icons written: ${written.join(', ')}, apple-touch-icon.png`);
