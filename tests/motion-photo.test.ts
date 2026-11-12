import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { DatabaseSync } from 'node:sqlite';
import { toAssetId } from '../src/server/asset-id.js';
import { buildApp } from '../src/server/app.js';
import { loadConfig } from '../src/server/config.js';
import {
  MOTION_ASSET_ID_BASE,
  getAsset,
  openDatabase,
  type AssetRecord,
} from '../src/server/db.js';
import type { JobRunner } from '../src/server/jobs.js';
import { readImageMotionInfo } from '../src/server/motion-photo.js';

const execFileAsync = promisify(execFile);
const PROJECT_ROOT = path.resolve(import.meta.dirname, '..');

interface MotionContext {
  app: FastifyInstance;
  db: DatabaseSync;
  runner: JobRunner;
  dataDir: string;
  mediaDir: string;
}

let context: MotionContext | undefined;

async function createContext(): Promise<MotionContext> {
  const runRoot = path.join(PROJECT_ROOT, 'work', `motion-photo-${randomUUID()}`);
  const mediaDir = path.join(runRoot, 'media');
  const dataDir = path.join(runRoot, 'data');
  await mkdir(mediaDir, { recursive: true });
  await mkdir(dataDir, { recursive: true });

  const config = {
    ...loadConfig({
      PORT: '3310',
      IMMICH_MINI_DATA_DIR: dataDir,
    }),
    dataDir,
  };
  const db = openDatabase(dataDir);
  const { app, runner } = await buildApp(config, db, { triggerScans: false });
  return { app, db, runner, dataDir, mediaDir };
}

async function scan(context: MotionContext): Promise<void> {
  const response = await context.app.inject({
    method: 'POST',
    url: '/api/scan',
    headers: { host: '127.0.0.1' },
    payload: { path: context.mediaDir },
  });
  expect(response.statusCode).toBe(202);
  await context.runner.runQueuedJobs();
}

async function createVideo(outputPath: string): Promise<Buffer> {
  await execFileAsync(
    process.env.FFMPEG_PATH || 'ffmpeg',
    [
      '-nostdin',
      '-hide_banner',
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      'testsrc=size=320x240:rate=15',
      '-t',
      '0.8',
      '-pix_fmt',
      'yuv420p',
      outputPath,
    ],
    { windowsHide: true },
  );
  return readFile(outputPath);
}

function motionXmp(offset: number): string {
  return `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description
      xmlns:Camera="http://ns.google.com/photos/1.0/camera/"
      Camera:MicroVideo="1"
      Camera:MicroVideoVersion="1"
      Camera:MicroVideoOffset="${offset}" />
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}

afterEach(async () => {
  await context?.app.close();
  context?.db.close();
  context = undefined;
});

describe('motion photos', () => {
  it('reads the modern Google motion photo container metadata', async () => {
    const filePath = path.join(
      PROJECT_ROOT,
      'work',
      `motion-xmp-${randomUUID()}.jpg`,
    );
    const xml = `<?xpacket begin=""?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description
      xmlns:xmp="http://ns.adobe.com/xap/1.0/"
      xmlns:GCamera="http://ns.google.com/photos/1.0/camera/"
      xmlns:Container="http://ns.google.com/photos/1.0/container/"
      xmlns:Item="http://ns.google.com/photos/1.0/container/item/"
      xmp:ContentIdentifier="ABC-123"
      GCamera:MotionPhoto="1">
      <Container:Directory>
        <rdf:Seq>
          <rdf:li>
            <Container:Item Item:Mime="video/mp4" Item:Semantic="MotionPhoto" Item:Length="2048" />
          </rdf:li>
        </rdf:Seq>
      </Container:Directory>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>`;
    await writeFile(filePath, Buffer.concat([Buffer.from(xml), Buffer.alloc(2048)]));

    await expect(readImageMotionInfo(filePath)).resolves.toEqual({
      contentIdentifier: 'ABC-123',
      embeddedMotionVideo: { length: 2048, mime: 'video/mp4' },
    });
  });

  it('extracts and serves an Android motion video without listing it twice', async () => {
    context = await createContext();
    const sourceVideo = path.join(path.dirname(context.mediaDir), 'source.mp4');
    const video = await createVideo(sourceVideo);
    const motionPath = path.join(context.mediaDir, 'PXL_20260101_000000000.jpg');
    const image = await sharp({
      create: { width: 640, height: 480, channels: 3, background: { r: 22, g: 88, b: 144 } },
    })
      .withXmp(motionXmp(video.length))
      .jpeg({ quality: 88 })
      .toBuffer();
    await writeFile(motionPath, Buffer.concat([image, video]));

    const info = await readImageMotionInfo(motionPath);
    expect(info.embeddedMotionVideo?.length).toBe(video.length);

    await scan(context);
    const photo = context.db
      .prepare("SELECT * FROM assets WHERE kind = 'image'")
      .get() as unknown as AssetRecord;
    expect(photo.live_photo_video_id).toBe(MOTION_ASSET_ID_BASE + photo.id);

    const motionVideo = getAsset(context.db, photo.live_photo_video_id!);
    expect(motionVideo?.kind).toBe('video');
    expect((await stat(motionVideo!.path)).size).toBe(video.length);

    const detail = await context.app.inject({
      method: 'GET',
      url: `/api/assets/${toAssetId(photo.id)}`,
      headers: { host: '127.0.0.1' },
    });
    expect(detail.json<{ livePhotoVideoId: string }>().livePhotoVideoId).toBe(
      toAssetId(photo.live_photo_video_id!),
    );

    const buckets = await context.app.inject({
      method: 'GET',
      url: '/api/timeline/buckets',
      headers: { host: '127.0.0.1' },
    });
    const bucket = buckets.json<Array<{ timeBucket: string }>>()[0]!;
    const timeline = await context.app.inject({
      method: 'GET',
      url: `/api/timeline/bucket?timeBucket=${bucket.timeBucket}`,
      headers: { host: '127.0.0.1' },
    });
    const timelineAssets = timeline.json<{ id: string[]; livePhotoVideoId: Array<string | null> }>();
    const photoIndex = timelineAssets.id.indexOf(toAssetId(photo.id));
    expect(timelineAssets.livePhotoVideoId[photoIndex]).toBe(
      toAssetId(photo.live_photo_video_id!),
    );

    const playback = await context.app.inject({
      method: 'GET',
      url: `/api/assets/${toAssetId(photo.live_photo_video_id!)}/video/playback`,
      headers: { host: '127.0.0.1', range: 'bytes=0-31' },
    });
    expect(playback.statusCode).toBe(206);
    expect(playback.rawPayload.length).toBe(32);

    const videos = await context.app.inject({
      method: 'GET',
      url: '/api/assets?kind=video',
      headers: { host: '127.0.0.1' },
    });
    expect(videos.json<{ items: unknown[] }>().items).toHaveLength(0);
  }, 30_000);

  it('links an Apple-style paired MOV and can unlink it manually', async () => {
    context = await createContext();
    const imagePath = path.join(context.mediaDir, 'IMG_1000.jpg');
    const videoPath = path.join(context.mediaDir, 'IMG_1000.MOV');
    await sharp({
      create: { width: 640, height: 480, channels: 3, background: { r: 120, g: 80, b: 40 } },
    })
      .jpeg()
      .toFile(imagePath);
    await createVideo(videoPath);

    await scan(context);
    const image = context.db
      .prepare("SELECT * FROM assets WHERE path = ?")
      .get(imagePath) as unknown as AssetRecord;
    const video = context.db
      .prepare("SELECT * FROM assets WHERE path = ?")
      .get(videoPath) as unknown as AssetRecord;
    expect(image.live_photo_video_id).toBe(video.id);
    expect(video.is_motion_part).toBe(1);

    const normalVideos = await context.app.inject({
      method: 'GET',
      url: '/api/assets?kind=video',
      headers: { host: '127.0.0.1' },
    });
    expect(normalVideos.json<{ items: unknown[] }>().items).toHaveLength(0);

    const unlinked = await context.app.inject({
      method: 'PUT',
      url: `/api/assets/${toAssetId(image.id)}`,
      headers: { host: '127.0.0.1' },
      payload: { livePhotoVideoId: null },
    });
    expect(unlinked.statusCode).toBe(200);
    expect(unlinked.json<{ livePhotoVideoId: null }>().livePhotoVideoId).toBeNull();
    expect(getAsset(context.db, video.id)?.is_motion_part).toBe(0);
  }, 30_000);

  it('migrates an existing assets table in place', async () => {
    const dataDir = path.join(PROJECT_ROOT, 'work', `motion-migration-${randomUUID()}`, 'data');
    await mkdir(dataDir, { recursive: true });
    let db = openDatabase(dataDir);
    db.close();

    const raw = new DatabaseSync(path.join(dataDir, 'immich-mini.db'));
    raw.exec(`
      DROP INDEX IF EXISTS assets_motion_content;
      ALTER TABLE assets DROP COLUMN live_photo_video_id;
      ALTER TABLE assets DROP COLUMN motion_content_identifier;
      ALTER TABLE assets DROP COLUMN is_motion_part;
    `);
    raw.close();

    db = openDatabase(dataDir);
    try {
      const columns = db.prepare('PRAGMA table_info(assets)').all() as unknown as Array<{
        name: string;
      }>;
      expect(columns.map((column) => column.name)).toEqual(
        expect.arrayContaining([
          'live_photo_video_id',
          'motion_content_identifier',
          'is_motion_part',
        ]),
      );
      expect(
        db
          .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'motion_videos'")
          .get(),
      ).toBeTruthy();
    } finally {
      db.close();
    }
  });
});
