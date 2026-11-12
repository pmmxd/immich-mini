import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/server/config.js';
import { FaceWorkerClient } from '../src/server/face-worker-client.js';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..');

describe('face worker', () => {
  it('loads the ONNX models and returns a valid analysis', async () => {
    const root = path.join(PROJECT_ROOT, 'work', `face-worker-${randomUUID()}`);
    await mkdir(root, { recursive: true });
    const imagePath = path.join(root, 'blank.jpg');
    await sharp({
      create: { width: 320, height: 240, channels: 3, background: { r: 24, g: 80, b: 96 } },
    })
      .jpeg()
      .toFile(imagePath);

    const config = loadConfig({ PORT: '3310' });
    const worker = new FaceWorkerClient(config, [root]);
    try {
      const result = await worker.analyze(imagePath, 'test-face', 0.8);
      expect(result.width).toBe(320);
      expect(result.height).toBe(240);
      expect(result.faces).toEqual([]);
    } finally {
      worker.stop();
    }
  }, 60_000);
});
