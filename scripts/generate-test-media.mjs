import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Map(
  process.argv.slice(2).flatMap((value, index, values) =>
    value.startsWith('--') ? [[value.slice(2), values[index + 1]]] : [],
  ),
);
const count = Number(args.get('count') ?? 1000);
const output = path.resolve(args.get('out') ?? path.join(PROJECT_ROOT, 'work', `perf-media-${Date.now()}`));
if (!Number.isInteger(count) || count < 1) {
  throw new Error('--count must be a positive integer');
}

await mkdir(output, { recursive: false });
for (let index = 0; index < count; index += 1) {
  const portrait = index % 3 === 0;
  const width = portrait ? 480 : 640;
  const height = portrait ? 640 : 480;
  const hue = (index * 37) % 360;
  const color = `hsl(${hue}, 45%, 42%)`;
  await sharp({
    create: { width, height, channels: 3, background: color },
  })
    .composite([
      {
        input: Buffer.from(
          `<svg width="${width}" height="${height}"><rect x="${width * 0.38}" y="${height * 0.32}" width="${width * 0.24}" height="${height * 0.36}" fill="#f4f1e9"/></svg>`,
        ),
      },
    ])
    .jpeg({ quality: 78 })
    .toFile(path.join(output, `media-${String(index + 1).padStart(4, '0')}.jpg`));
}
console.log(JSON.stringify({ count, output }));
