import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import { buildApp } from '../src/server/app.js';
import { loadConfig } from '../src/server/config.js';
import {
  readExternalToolSettings,
  saveExternalToolSettings,
} from '../src/server/external-tools.js';
import {
  readFaceRecognitionSettings,
  saveFaceRecognitionSettings,
} from '../src/server/face-settings.js';
import { LibraryMonitor } from '../src/server/library-monitor.js';
import { exportFramedAssets, renderFramePreview } from '../src/server/local-media-tools.js';
import {
  claimNextJob,
  deleteAssetRecords,
  enqueueScan,
  getAssetTags,
  getLibrary,
  getPerson,
  listPeople,
  openDatabase,
  resetFaceRecognitionData,
  storeDetectedFace,
  updatePerson,
  updateAssets,
  type AssetRecord,
  type JobRecord,
} from '../src/server/db.js';
import type { JobRunner } from '../src/server/jobs.js';

const execFileAsync = promisify(execFile);
const PROJECT_ROOT = path.resolve(import.meta.dirname, '..');
const TEST_XMP = `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about=""
      xmlns:dc="http://purl.org/dc/elements/1.1/"
      xmlns:xmp="http://ns.adobe.com/xap/1.0/"
      xmp:Rating="4">
      <dc:subject>
        <rdf:Bag>
          <rdf:li>旅行</rdf:li>
          <rdf:li>人物/爸爸</rdf:li>
        </rdf:Bag>
      </dc:subject>
      <dc:description>
        <rdf:Alt>
          <rdf:li xml:lang="x-default">测试说明</rdf:li>
        </rdf:Alt>
      </dc:description>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;

interface TestContext {
  app: FastifyInstance;
  db: DatabaseSync;
  runner: JobRunner;
  dataDir: string;
  mediaDir: string;
  imagePath: string;
  videoPath: string;
  config: ReturnType<typeof loadConfig>;
}

let context: TestContext | undefined;

async function createFixture(): Promise<TestContext> {
  const runRoot = path.join(PROJECT_ROOT, 'work', `vertical-slice-${randomUUID()}`);
  const mediaDir = path.join(runRoot, 'media');
  const dataDir = path.join(runRoot, 'data');
  await mkdir(mediaDir, { recursive: true });
  await mkdir(dataDir, { recursive: true });

  const imagePath = path.join(mediaDir, 'landscape.jpg');
  const portraitPath = path.join(mediaDir, 'portrait.jpg');
  const videoPath = path.join(mediaDir, 'clip.mp4');
  const dotDirectory = path.join(mediaDir, '.ignored');
  const attributedHiddenDirectory = path.join(mediaDir, 'hidden-by-attribute');
  await Promise.all([
    mkdir(dotDirectory, { recursive: true }),
    mkdir(attributedHiddenDirectory, { recursive: true }),
  ]);
  await Promise.all([
    sharp({
      create: { width: 960, height: 640, channels: 3, background: { r: 30, g: 120, b: 108 } },
    })
      .composite([
        {
          input: Buffer.from(
            '<svg width="960" height="640"><rect x="420" y="120" width="220" height="300" fill="#f3f1eb"/></svg>',
          ),
          top: 0,
          left: 0,
        },
      ])
      .withXmp(TEST_XMP)
      .jpeg({ quality: 88 })
      .toFile(imagePath),
    sharp({
      create: { width: 500, height: 900, channels: 3, background: { r: 181, g: 101, b: 42 } },
    })
      .jpeg({ quality: 88 })
      .toFile(portraitPath),
    execFileAsync(
      process.env.FFMPEG_PATH || 'ffmpeg',
      [
        '-nostdin',
        '-hide_banner',
        '-loglevel',
        'error',
        '-f',
        'lavfi',
        '-i',
        'testsrc=size=640x360:rate=24',
        '-t',
        '1.2',
        '-pix_fmt',
        'yuv420p',
        videoPath,
      ],
      { windowsHide: true },
    ),
    sharp({
      create: { width: 80, height: 60, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .jpeg()
      .toFile(path.join(dotDirectory, 'ignored.jpg')),
    sharp({
      create: { width: 80, height: 60, channels: 3, background: { r: 4, g: 5, b: 6 } },
    })
      .jpeg()
      .toFile(path.join(attributedHiddenDirectory, 'ignored.jpg')),
  ]);
  if (process.platform === 'win32') {
    await execFileAsync('attrib.exe', ['+h', attributedHiddenDirectory], { windowsHide: true });
  }

  const config = {
    ...loadConfig({
      PORT: '3310',
      IMMICH_MINI_DATA_DIR: dataDir,
    }),
    dataDir,
  };
  const db = openDatabase(dataDir);
  const { app, runner } = await buildApp(config, db, { triggerScans: false });
  return { app, db, runner, dataDir, mediaDir, imagePath, videoPath, config };
}

afterEach(async () => {
  await context?.app.close();
  context?.db.close();
  context = undefined;
});

describe('first vertical slice', () => {
  it('loads configurable face precision settings', () => {
    const config = loadConfig({
      IMMICH_MINI_FACE_DETECTION_THRESHOLD: '0.8',
      IMMICH_MINI_FACE_CLUSTER_THRESHOLD: '0.55',
      PORT: '3310',
    });
    expect(config.faceDetectionThreshold).toBe(0.8);
    expect(config.faceClusterThreshold).toBe(0.55);
  });

  it('stores image, video and frame editor paths', async () => {
    const dataDir = path.join(PROJECT_ROOT, 'work', `external-tools-${randomUUID()}`, 'data');
    await mkdir(dataDir, { recursive: true });
    const db = openDatabase(dataDir);
    try {
      const executable = 'C:\\Windows\\System32\\notepad.exe';
      const saved = saveExternalToolSettings(db, {
        videoEditorPath: executable,
        imageEditorPath: executable,
        frameEditorPath: executable,
      });
      expect(readExternalToolSettings(db)).toEqual(saved);
    } finally {
      db.close();
    }
  });

  it('deletes asset indexes in multiple parameter batches', async () => {
    const dataDir = path.join(PROJECT_ROOT, 'work', `delete-batch-${randomUUID()}`, 'data');
    await mkdir(dataDir, { recursive: true });
    const db = openDatabase(dataDir);
    try {
      const library = db
        .prepare('INSERT INTO libraries(path, created_at) VALUES (?, ?)')
        .run(dataDir, new Date().toISOString());
      const insert = db.prepare(
        `INSERT INTO assets(
           library_id, path, name, kind, mime, bytes, taken_at, fingerprint, created_at, updated_at
         ) VALUES (?, ?, ?, 'image', 'image/jpeg', 1, ?, ?, ?, ?)`,
      );
      const now = new Date().toISOString();
      const ids: number[] = [];
      for (let index = 0; index < 801; index += 1) {
        const result = insert.run(
          Number(library.lastInsertRowid),
          path.join(dataDir, `${index}.jpg`),
          `${index}.jpg`,
          now,
          `fingerprint-${index}`,
          now,
          now,
        );
        ids.push(Number(result.lastInsertRowid));
      }
      expect(deleteAssetRecords(db, ids)).toBe(801);
      expect(
        (db.prepare('SELECT COUNT(*) AS count FROM assets').get() as { count: number }).count,
      ).toBe(0);
    } finally {
      db.close();
    }
  });

  it('queues one follow-up scan for watcher changes during a running scan', async () => {
    const dataDir = path.join(PROJECT_ROOT, 'work', `scan-follow-up-${randomUUID()}`, 'data');
    await mkdir(dataDir, { recursive: true });
    const db = openDatabase(dataDir);
    try {
      const library = getLibrary(db, dataDir)!;
      const first = enqueueScan(db, library.id, library.path);
      expect(claimNextJob(db)?.id).toBe(first.id);
      expect(enqueueScan(db, library.id, library.path).id).toBe(first.id);

      const followUp = enqueueScan(db, library.id, library.path, true);
      expect(followUp.id).not.toBe(first.id);
      expect(followUp.status).toBe('queued');
      expect(enqueueScan(db, library.id, library.path, true).id).toBe(followUp.id);
    } finally {
      db.close();
    }
  });

  it('persists face precision and preserves named people when rebuilding clusters', async () => {
    context = await createFixture();
    const created = await context.app.inject({
      method: 'POST',
      url: '/api/scan',
      headers: { host: '127.0.0.1' },
      payload: { path: context.mediaDir },
    });
    expect(created.statusCode).toBe(202);
    await context.runner.runQueuedJobs();

    saveFaceRecognitionSettings(context.db, {
      detectionThreshold: 0.82,
      clusterThreshold: 0.56,
    });
    expect(readFaceRecognitionSettings(context.db, context.config)).toEqual({
      detectionThreshold: 0.82,
      clusterThreshold: 0.56,
    });

    const assets = context.db
      .prepare(`SELECT * FROM assets WHERE kind = 'image' ORDER BY id`)
      .all() as unknown as AssetRecord[];
    const embedding = Array.from({ length: 128 }, (_, index) => (index === 0 ? 1 : 0));
    const named = storeDetectedFace(context.db, assets[0]!.id, {
      boundingBox: { x1: 1, y1: 1, x2: 40, y2: 40 },
      cropPath: null,
      embedding,
      score: 0.98,
    });
    updatePerson(context.db, named.personId, { name: '保留人物' });
    const unnamedEmbedding = Array.from({ length: 128 }, (_, index) => (index === 1 ? 1 : 0));
    storeDetectedFace(context.db, assets[1]!.id, {
      boundingBox: { x1: 2, y1: 2, x2: 42, y2: 42 },
      cropPath: null,
      embedding: unnamedEmbedding,
      score: 0.97,
    });

    const reset = resetFaceRecognitionData(context.db);
    expect(reset.anchors).toBe(1);
    expect(reset.removedFaces).toBe(2);
    expect(reset.removedPeople).toBe(1);
    expect(getPerson(context.db, named.personId)?.name).toBe('保留人物');

    const rematched = storeDetectedFace(
      context.db,
      assets[0]!.id,
      {
        boundingBox: { x1: 3, y1: 3, x2: 43, y2: 43 },
        cropPath: null,
        embedding,
        score: 0.96,
      },
      0.5,
    );
    expect(rematched.personId).toBe(named.personId);
  });

  it('renders framed media exports into an explicit output folder', async () => {
    context = await createFixture();
    const created = await context.app.inject({
      method: 'POST',
      url: '/api/scan',
      headers: { host: '127.0.0.1' },
      payload: { path: context.mediaDir },
    });
    expect(created.statusCode).toBe(202);
    await context.runner.runQueuedJobs();

    const assets = context.db
      .prepare('SELECT * FROM assets ORDER BY id')
      .all() as unknown as AssetRecord[];
    const image = assets.find((asset) => asset.kind === 'image')!;
    const outputRoot = path.join(path.dirname(context.dataDir), 'local-tools');
    const frameDestination = path.join(outputRoot, 'frames');

    const framed = await exportFramedAssets([image], frameDestination, 'dark');
    expect(framed.copied).toBe(1);
    expect((await readdir(frameDestination)).some((name) => name.endsWith('相框.jpg'))).toBe(true);
    expect((await renderFramePreview(image, 'light')).length).toBeGreaterThan(0);

    const assetId = `00000000-0000-4000-8000-${image.id.toString(16).padStart(12, '0')}`;
    const exported = await context.app.inject({
      method: 'POST',
      url: '/api/local/assets/frame',
      headers: { host: '127.0.0.1' },
      payload: { ids: [assetId], style: 'light', destination: frameDestination },
    });
    expect(exported.statusCode).toBe(200);
    expect(exported.json<{ copied: number; failures: string[] }>().copied).toBe(1);

    const invalidDestination = await context.app.inject({
      method: 'POST',
      url: '/api/local/assets/frame',
      headers: { host: '127.0.0.1' },
      payload: { ids: [assetId], style: 'light', destination: path.join(outputRoot, 'missing') },
    });
    expect(invalidDestination.statusCode).toBe(400);
  }, 60_000);

  it('imports embedded tags, rating and description while preserving manual edits', async () => {
    context = await createFixture();
    const scan = () =>
      context!.app.inject({
        method: 'POST',
        url: '/api/scan',
        headers: { host: '127.0.0.1' },
        payload: { path: context!.mediaDir },
      });

    expect((await scan()).statusCode).toBe(202);
    await context.runner.runQueuedJobs();

    const asset = context.db
      .prepare(`SELECT * FROM assets WHERE name = 'landscape.jpg'`)
      .get() as AssetRecord;
    expect(asset.rating).toBe(4);
    expect(asset.description).toBe('测试说明');
    expect(getAssetTags(context.db, asset.id).map((tag) => tag.value)).toEqual(
      expect.arrayContaining(['旅行', '人物/爸爸']),
    );

    updateAssets(context.db, [asset.id], {
      rating: 2,
      description: '手工说明',
    });
    expect((await scan()).statusCode).toBe(202);
    await context.runner.runQueuedJobs();

    const rescanned = context.db
      .prepare('SELECT * FROM assets WHERE id = ?')
      .get(asset.id) as AssetRecord;
    expect(rescanned.rating).toBe(2);
    expect(rescanned.description).toBe('手工说明');
  }, 60_000);

  it('scans originals read-only, writes thumbnails, and serves a timeline', async () => {
    context = await createFixture();
    const beforeHash = createHash('sha256').update(await readFile(context.imagePath)).digest('hex');

    const created = await context.app.inject({
      method: 'POST',
      url: '/api/scan',
      headers: { host: '127.0.0.1' },
      payload: { path: context.mediaDir },
    });
    expect(created.statusCode).toBe(202);
    const createdJob = created.json<JobRecord>();

    await context.runner.runQueuedJobs();

    const finished = await context.app.inject({
      method: 'GET',
      url: `/api/jobs/${createdJob.id}`,
      headers: { host: 'localhost' },
    });
    expect(finished.statusCode).toBe(200);
    expect(finished.json<JobRecord>().status).toBe('succeeded');

    const timelineResponse = await context.app.inject({
      method: 'GET',
      url: '/api/assets?limit=20',
      headers: { host: 'localhost' },
    });
    expect(timelineResponse.statusCode).toBe(200);
    const timeline = timelineResponse.json<{ items: AssetRecord[]; total: number }>();
    expect(timeline.total).toBe(3);
    expect(timeline.items.map((asset) => asset.kind).sort()).toEqual(['image', 'image', 'video']);
    expect(timeline.items.every((asset) => asset.thumbnail_status === 'ready')).toBe(true);
    expect(
      timeline.items.every(
        (asset) => asset.thumbnail_path?.startsWith(path.join(context!.dataDir, 'thumbnails')) === true,
      ),
    ).toBe(true);

    const localPaths = await context.app.inject({
      method: 'POST',
      url: '/api/local/assets/paths',
      headers: { host: 'localhost' },
      payload: { ids: timeline.items.slice(0, 2).map((asset) => asset.id) },
    });
    expect(localPaths.statusCode).toBe(200);
    expect(localPaths.json<{ items: Array<{ path: string }> }>().items.map((asset) => asset.path)).toEqual(
      timeline.items.slice(0, 2).map((asset) => asset.path),
    );

    const video = timeline.items.find((asset) => asset.kind === 'video')!;
    const rangeResponse = await context.app.inject({
      method: 'GET',
      url: `/api/assets/${video.id}/original`,
      headers: { host: 'localhost', range: 'bytes=0-31' },
    });
    expect(rangeResponse.statusCode).toBe(206);
    expect(rangeResponse.headers['content-length']).toBe('32');
    expect((await stat(context.videoPath)).size).toBe(video.bytes);

    const playbackResponse = await context.app.inject({
      method: 'GET',
      url: `/api/assets/${video.id}/video/playback`,
      headers: { host: 'localhost', range: 'bytes=0-31' },
    });
    expect(playbackResponse.statusCode).toBe(206);
    expect(playbackResponse.headers['content-length']).toBe('32');

    const boot = await context.app.inject({
      method: 'GET',
      url: '/api/server/config',
      headers: { host: 'localhost' },
    });
    expect(boot.statusCode).toBe(200);
    expect(boot.json<{ isInitialized: boolean }>().isInitialized).toBe(true);
    expect(boot.headers['set-cookie']).toContain('immich_is_authenticated=true');

    const customCss = await context.app.inject({
      method: 'GET',
      url: '/custom.css',
      headers: { host: 'localhost' },
    });
    expect(customCss.statusCode).toBe(200);
    expect(customCss.body).toContain('a[href="/sharing"]');

    const user = await context.app.inject({
      method: 'GET',
      url: '/api/users/me',
      headers: { host: 'localhost' },
    });
    expect(user.statusCode).toBe(200);
    expect(user.json<{ email: string }>().email).toBe('local@immich-mini.invalid');

    const buckets = await context.app.inject({
      method: 'GET',
      url: '/api/timeline/buckets?visibility=timeline&withStacked=true&withPartners=true',
      headers: { host: 'localhost' },
    });
    expect(buckets.statusCode).toBe(200);
    const bucketRows = buckets.json<Array<{ timeBucket: string; count: number }>>();
    expect(bucketRows.reduce((total, bucket) => total + bucket.count, 0)).toBe(3);

    const bucket = await context.app.inject({
      method: 'GET',
      url: `/api/timeline/bucket?timeBucket=${bucketRows[0]!.timeBucket}&withStacked=true`,
      headers: { host: 'localhost' },
    });
    expect(bucket.statusCode).toBe(200);
    const bucketAssets = bucket.json<{ id: string[]; rating?: (number | null)[] }>();
    expect(bucketAssets.id).toHaveLength(3);
    expect(bucketAssets.rating).toHaveLength(3);

    const assetDetail = await context.app.inject({
      method: 'GET',
      url: `/api/assets/${timeline.items[0]!.id}`,
      headers: { host: 'localhost' },
    });
    expect(assetDetail.statusCode).toBe(200);
    expect(assetDetail.json<{ id: string }>().id).toBe(
      `00000000-0000-4000-8000-${timeline.items[0]!.id.toString(16).padStart(12, '0')}`,
    );

    const imageSearch = await context.app.inject({
      method: 'POST',
      url: '/api/search/metadata',
      headers: { host: 'localhost' },
      payload: {
        size: 100,
        filter: {
          visibility: { eq: 'timeline' },
          type: { eq: 'IMAGE' },
        },
        orderBy: { field: 'localDateTime', direction: 'desc' },
      },
    });
    expect(imageSearch.statusCode).toBe(200);
    const imageResults = imageSearch.json<{
      assets: { items: Array<{ type: string }>; total: number };
    }>();
    expect(imageResults.assets.total).toBe(2);
    expect(imageResults.assets.items.every((asset) => asset.type === 'IMAGE')).toBe(true);

    const stats = await context.app.inject({
      method: 'GET',
      url: '/api/assets/statistics?visibility=timeline',
      headers: { host: 'localhost' },
    });
    expect(stats.statusCode).toBe(200);
    expect(stats.json<{ images: number; total: number; videos: number }>()).toEqual({
      images: 2,
      total: 3,
      videos: 1,
    });

    const images = timeline.items.filter((asset) => asset.kind === 'image');
    context.db
      .prepare(
        `UPDATE assets
         SET make = ?, model = ?, lens_model = ?, city = ?
         WHERE id = ?`,
      )
      .run('Nikon', 'Z 6II', 'NIKKOR Z 24-120mm f/4 S', 'Shanghai', images[0]!.id);
    context.db
      .prepare(
        `UPDATE assets
         SET make = ?, model = ?, lens_model = ?, city = ?
         WHERE id = ?`,
      )
      .run('Canon', 'EOS R5', 'RF 24-70mm F2.8 L IS USM', 'Hangzhou', images[1]!.id);

    const makes = await context.app.inject({
      method: 'GET',
      url: '/api/search/suggestions?type=camera-make',
      headers: { host: 'localhost' },
    });
    expect(makes.json<string[]>()).toEqual(['Canon', 'Nikon']);

    const models = await context.app.inject({
      method: 'GET',
      url: '/api/search/suggestions?type=camera-model&make=Nikon',
      headers: { host: 'localhost' },
    });
    expect(models.json<string[]>()).toEqual(['Z 6II']);

    const lenses = await context.app.inject({
      method: 'GET',
      url: '/api/search/suggestions?type=camera-lens-model&make=Nikon&model=Z%206II',
      headers: { host: 'localhost' },
    });
    expect(lenses.json<string[]>()).toEqual(['NIKKOR Z 24-120mm f/4 S']);

    const cities = await context.app.inject({
      method: 'GET',
      url: '/api/search/suggestions?type=city',
      headers: { host: 'localhost' },
    });
    expect(cities.json<string[]>()).toEqual(['Hangzhou', 'Shanghai']);

    const firstAssetId = `00000000-0000-4000-8000-${timeline.items[0]!.id
      .toString(16)
      .padStart(12, '0')}`;
    const favorite = await context.app.inject({
      method: 'PUT',
      url: '/api/assets',
      headers: { host: 'localhost' },
      payload: { ids: [firstAssetId], isFavorite: true, rating: 5 },
    });
    expect(favorite.statusCode).toBe(200);

    const ratedAsset = await context.app.inject({
      method: 'GET',
      url: `/api/assets/${firstAssetId}`,
      headers: { host: 'localhost' },
    });
    expect(ratedAsset.json<{ exifInfo: { rating: number } }>().exifInfo.rating).toBe(5);

    const metadataUpdate = await context.app.inject({
      method: 'PUT',
      url: `/api/assets/${firstAssetId}`,
      headers: { host: 'localhost' },
      payload: {
        latitude: 31.2304,
        longitude: 121.4737,
        dateTimeOriginal: '2024-05-06T07:08:09.000Z',
        description: 'metadata linked',
      },
    });
    expect(metadataUpdate.statusCode).toBe(200);
    const updatedMetadata = metadataUpdate.json<{
      exifInfo: { latitude: number; longitude: number; description: string };
      localDateTime: string;
    }>();
    expect(updatedMetadata.exifInfo.latitude).toBe(31.2304);
    expect(updatedMetadata.exifInfo.longitude).toBe(121.4737);
    expect(updatedMetadata.exifInfo.description).toBe('metadata linked');
    expect(updatedMetadata.localDateTime).toContain('2024-05-06T');

    const favorites = await context.app.inject({
      method: 'POST',
      url: '/api/search/metadata',
      headers: { host: 'localhost' },
      payload: {
        filter: {
          visibility: { eq: 'timeline' },
          isFavorite: { eq: true },
        },
      },
    });
    expect(favorites.statusCode).toBe(200);
    expect(favorites.json<{ assets: { total: number } }>().assets.total).toBe(1);

    const createdAlbum = await context.app.inject({
      method: 'POST',
      url: '/api/albums',
      headers: { host: 'localhost' },
      payload: { albumName: 'Test Album', assetIds: [firstAssetId] },
    });
    expect(createdAlbum.statusCode).toBe(201);
    const album = createdAlbum.json<{ assetCount: number; id: string }>();
    expect(album.assetCount).toBe(1);

    const albumBuckets = await context.app.inject({
      method: 'GET',
      url: `/api/timeline/buckets?albumId=${album.id}`,
      headers: { host: 'localhost' },
    });
    expect(albumBuckets.statusCode).toBe(200);
    expect(
      albumBuckets.json<Array<{ count: number }>>().reduce((total, bucket) => total + bucket.count, 0),
    ).toBe(1);

    const createdTag = await context.app.inject({
      method: 'POST',
      url: '/api/tags',
      headers: { host: 'localhost' },
      payload: { name: 'test-tag' },
    });
    expect(createdTag.statusCode).toBe(201);
    const tag = createdTag.json<{ id: string }>();
    const tagged = await context.app.inject({
      method: 'PUT',
      url: `/api/tags/${tag.id}/assets`,
      headers: { host: 'localhost' },
      payload: { ids: [firstAssetId] },
    });
    expect(tagged.statusCode).toBe(200);
    const taggedAsset = await context.app.inject({
      method: 'GET',
      url: `/api/assets/${firstAssetId}`,
      headers: { host: 'localhost' },
    });
    expect(taggedAsset.json<{ tags: Array<{ id: string }> }>().tags[0]?.id).toBe(tag.id);

    const geotagged = await context.app.inject({
      method: 'PUT',
      url: `/api/assets/${firstAssetId}`,
      headers: { host: 'localhost' },
      payload: { latitude: 31.2304, longitude: 121.4737 },
    });
    expect(geotagged.statusCode).toBe(200);
    const markers = await context.app.inject({
      method: 'GET',
      url: '/api/map/markers',
      headers: { host: 'localhost' },
    });
    expect(markers.statusCode).toBe(200);
    expect(markers.json<Array<{ id: string; lat: number }>>()).toEqual([
      expect.objectContaining({ id: firstAssetId, lat: 31.2304 }),
    ]);
    const imageAssetId = timeline.items.find((asset) => asset.kind === 'image')!.id;
    context.db.prepare('UPDATE assets SET city = ? WHERE id = ?').run('Shanghai', imageAssetId);
    const explore = await context.app.inject({
      method: 'GET',
      url: '/api/search/explore',
      headers: { host: 'localhost' },
    });
    expect(explore.statusCode).toBe(200);
    const exploreFields = explore.json<
      Array<{ fieldName: string; items: Array<{ value: string }> }>
    >();
    expect(exploreFields.find((field) => field.fieldName === 'exifInfo.city')?.items[0]?.value).toBe(
      'Shanghai',
    );
    expect(exploreFields.find((field) => field.fieldName === 'createdAt')?.items.length).toBeGreaterThan(
      0,
    );
    const albumMarkers = await context.app.inject({
      method: 'GET',
      url: `/api/albums/${album.id}/map-markers`,
      headers: { host: 'localhost' },
    });
    expect(albumMarkers.json<Array<{ id: string }>>()[0]?.id).toBe(firstAssetId);

    const embedding = Array.from({ length: 128 }, (_, index) => (index === 0 ? 1 : 0));
    storeDetectedFace(context.db, timeline.items[0]!.id, {
      boundingBox: { x1: 1, y1: 1, x2: 40, y2: 40 },
      cropPath: null,
      embedding,
      score: 0.98,
    });
    storeDetectedFace(context.db, timeline.items[1]!.id, {
      boundingBox: { x1: 2, y1: 2, x2: 42, y2: 42 },
      cropPath: null,
      embedding,
      score: 0.97,
    });
    expect(listPeople(context.db)).toHaveLength(1);
    expect(listPeople(context.db)[0]!.asset_count).toBe(2);
    const people = await context.app.inject({
      method: 'GET',
      url: '/api/people',
      headers: { host: 'localhost' },
    });
    expect(people.statusCode).toBe(200);
    const peopleBody = people.json<{ people: Array<{ id: string }>; total: number }>();
    expect(peopleBody.total).toBe(1);
    const namedPerson = await context.app.inject({
      method: 'PUT',
      url: `/api/people/${peopleBody.people[0]!.id}`,
      headers: { host: 'localhost' },
      payload: { name: 'Test Person' },
    });
    expect(namedPerson.statusCode).toBe(200);
    expect(namedPerson.json<{ name: string }>().name).toBe('Test Person');

    const trashed = await context.app.inject({
      method: 'DELETE',
      url: '/api/assets',
      headers: { host: 'localhost' },
      payload: { ids: [firstAssetId] },
    });
    expect(trashed.statusCode).toBe(200);
    expect((await stat(context.imagePath)).size).toBeGreaterThan(0);

    const restored = await context.app.inject({
      method: 'POST',
      url: '/api/trash/restore/assets',
      headers: { host: 'localhost' },
      payload: { ids: [firstAssetId] },
    });
    expect(restored.statusCode).toBe(200);

    const deletedAlbum = await context.app.inject({
      method: 'DELETE',
      url: `/api/albums/${album.id}`,
      headers: { host: 'localhost' },
    });
    expect(deletedAlbum.statusCode).toBe(204);

    const permanentDelete = await context.app.inject({
      method: 'DELETE',
      url: '/api/assets',
      headers: { host: 'localhost' },
      payload: { ids: [firstAssetId], force: true },
    });
    expect(permanentDelete.statusCode).toBe(200);
    expect((await stat(context.imagePath)).size).toBeGreaterThan(0);

    const afterHash = createHash('sha256').update(await readFile(context.imagePath)).digest('hex');
    expect(afterHash).toBe(beforeHash);

  });

  it('removes indexes for files missing from a rescanned library', async () => {
    context = await createFixture();
    const firstScan = await context.app.inject({
      method: 'POST',
      url: '/api/scan',
      headers: { host: '127.0.0.1' },
      payload: { path: context.mediaDir },
    });
    expect(firstScan.statusCode).toBe(202);
    await context.runner.runQueuedJobs();

    const library = context.db.prepare('SELECT id FROM libraries LIMIT 1').get() as { id: number };
    const now = new Date().toISOString();
    context.db
      .prepare(
        `INSERT INTO assets(
           library_id, path, name, kind, mime, bytes, taken_at, fingerprint, created_at, updated_at
         ) VALUES (?, ?, 'missing.jpg', 'image', 'image/jpeg', 1, ?, 'missing', ?, ?)`,
      )
      .run(
        library.id,
        path.join(context.mediaDir, 'missing.jpg'),
        now,
        now,
        now,
      );

    const secondScan = await context.app.inject({
      method: 'POST',
      url: '/api/scan',
      headers: { host: '127.0.0.1' },
      payload: { path: context.mediaDir },
    });
    expect(secondScan.statusCode).toBe(202);
    await context.runner.runQueuedJobs();

    const status = await context.app.inject({
      method: 'GET',
      url: '/api/status',
      headers: { host: 'localhost' },
    });
    expect(status.json<{ assets: { total: number } }>().assets.total).toBe(3);
  });

  it('keeps SQLite in WAL mode and rejects non-local hosts', async () => {
    context = await createFixture();
    const journal = context.db.prepare('PRAGMA journal_mode').get() as { journal_mode: string };
    expect(journal.journal_mode).toBe('wal');

    const healthy = await context.app.inject({
      method: 'GET',
      url: '/api/health',
      headers: { host: 'localhost' },
    });
    expect(healthy.statusCode).toBe(200);
    expect(healthy.json<{ service: string }>().service).toBe('immich-mini');

    const rejected = await context.app.inject({
      method: 'GET',
      url: '/api/health',
      headers: { host: 'untrusted.example' },
    });
    expect(rejected.statusCode).toBe(421);
  });

  it('registers and scans multiple media libraries', async () => {
    context = await createFixture();
    const secondLibrary = path.join(path.dirname(context.mediaDir), 'second-library');
    await mkdir(secondLibrary, { recursive: true });
    await sharp({
      create: { width: 320, height: 240, channels: 3, background: { r: 50, g: 90, b: 140 } },
    })
      .jpeg()
      .toFile(path.join(secondLibrary, 'second.jpg'));

    for (const libraryPath of [context.mediaDir, secondLibrary]) {
      const response = await context.app.inject({
        method: 'POST',
        url: '/api/local/libraries',
        headers: { host: 'localhost' },
        payload: { path: libraryPath },
      });
      expect(response.statusCode).toBe(202);
      await context.runner.runQueuedJobs();
    }

    const libraries = await context.app.inject({
      method: 'GET',
      url: '/api/local/libraries',
      headers: { host: 'localhost' },
    });
    expect(libraries.statusCode).toBe(200);
    expect(
      libraries
        .json<Array<{ path: string; assetCount: number }>>()
        .map((library) => path.normalize(library.path)),
    ).toEqual([path.normalize(context.mediaDir), path.normalize(secondLibrary)]);
    expect(
      libraries
        .json<Array<{ assetCount: number }>>()
        .map((library) => library.assetCount),
    ).toEqual([3, 1]);

    const status = await context.app.inject({
      method: 'GET',
      url: '/api/status',
      headers: { host: 'localhost' },
    });
    expect(status.json<{ assets: { total: number } }>().assets.total).toBe(4);

    const automation = await context.app.inject({
      method: 'PUT',
      url: '/api/local/libraries/settings',
      headers: { host: 'localhost' },
      payload: {
        watchEnabled: true,
        scanEnabled: true,
        scanIntervalMinutes: 360,
      },
    });
    expect(automation.statusCode).toBe(200);
    expect(
      automation.json<{
        scanEnabled: boolean;
        scanIntervalMinutes: number;
        watchEnabled: boolean;
      }>(),
    ).toEqual({
      watchEnabled: true,
      scanEnabled: true,
      scanIntervalMinutes: 360,
    });

    const monitor = new LibraryMonitor(context.db, context.runner, {
      debounceMs: 25,
    });
    monitor.start();
    try {
      await sharp({
        create: { width: 160, height: 120, channels: 3, background: { r: 120, g: 40, b: 30 } },
      })
        .jpeg()
        .toFile(path.join(secondLibrary, 'watched.jpg'));

      const deadline = Date.now() + 5_000;
      let total = 4;
      while (total < 5 && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        const current = await context.app.inject({
          method: 'GET',
          url: '/api/status',
          headers: { host: 'localhost' },
        });
        total = current.json<{ assets: { total: number } }>().assets.total;
      }
      expect(total).toBe(5);
    } finally {
      monitor.stop();
    }

    await context.runner.runQueuedJobs();
    const librariesBeforeRemoval = await context.app.inject({
      method: 'GET',
      url: '/api/local/libraries',
      headers: { host: 'localhost' },
    });
    const second = librariesBeforeRemoval
      .json<Array<{ id: number; path: string }>>()
      .find((library) => path.normalize(library.path) === path.normalize(secondLibrary));
    expect(second).toBeDefined();

    const activeScan = await context.app.inject({
      method: 'POST',
      url: `/api/local/libraries/${second!.id}/scan`,
      headers: { host: 'localhost' },
    });
    expect(activeScan.statusCode).toBe(202);
    const rejectedRemoval = await context.app.inject({
      method: 'DELETE',
      url: `/api/local/libraries/${second!.id}`,
      headers: { host: 'localhost' },
    });
    expect(rejectedRemoval.statusCode).toBe(409);

    await context.runner.runQueuedJobs();
    const removed = await context.app.inject({
      method: 'DELETE',
      url: `/api/local/libraries/${second!.id}`,
      headers: { host: 'localhost' },
    });
    expect(removed.statusCode).toBe(200);
    expect(removed.json<{ removedAssetCount: number }>().removedAssetCount).toBe(2);
    await expect(stat(path.join(secondLibrary, 'second.jpg'))).resolves.toBeDefined();
    await expect(stat(path.join(secondLibrary, 'watched.jpg'))).resolves.toBeDefined();

    const librariesAfterRemoval = await context.app.inject({
      method: 'GET',
      url: '/api/local/libraries',
      headers: { host: 'localhost' },
    });
    expect(
      librariesAfterRemoval
        .json<Array<{ path: string; assetCount: number }>>()
        .map((library) => ({
          path: path.normalize(library.path),
          assetCount: library.assetCount,
        })),
    ).toEqual([{ path: path.normalize(context.mediaDir), assetCount: 3 }]);

    const statusAfterRemoval = await context.app.inject({
      method: 'GET',
      url: '/api/status',
      headers: { host: 'localhost' },
    });
    expect(statusAfterRemoval.json<{ assets: { total: number } }>().assets.total).toBe(3);
  });
});
