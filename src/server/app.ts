import { createHash } from 'node:crypto';
import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import { parseAssetId } from './asset-id.js';
import type { AppConfig } from './config.js';
import {
  deleteLibrary,
  enqueueScan,
  getAsset,
  getAssetSummary,
  getJob,
  getLibrary,
  hasActiveLibraryJob,
  listAssets,
  listLibraries,
  type AssetKind,
} from './db.js';
import { JobRunner } from './jobs.js';
import {
  LibraryMonitor,
  readLibraryAutomationSettings,
  saveLibraryAutomationSettings,
} from './library-monitor.js';
import { registerImmichApi } from './immich-api.js';
import { attachRealtime } from './realtime.js';
import { FaceService } from './face-service.js';
import {
  faceQueueStatistics,
  readFaceRecognitionSettings,
  saveFaceRecognitionSettings,
} from './face-settings.js';
import {
  chooseApplicationExecutable,
  exportFramedAssets,
  renderFramePreview,
  resolveAssets,
  type FrameStyle,
} from './local-media-tools.js';
import {
  readExternalToolSettings,
  saveExternalToolSettings,
  type ExternalToolSettings,
} from './external-tools.js';

const LOCAL_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);
const VERSION = '0.1.0';
const SHARING_HIDDEN_CSS = `
nav#sidebar a[href="/sharing"],
nav#sidebar a[href^="/shared-links"],
button[aria-label="Share"],
button[title="Share"],
button[aria-label="分享"],
button[title="分享"] {
  display: none !important;
}
`;

function getHostname(hostHeader: string | undefined): string {
  if (!hostHeader) {
    return '';
  }
  if (hostHeader.startsWith('[')) {
    return hostHeader.slice(1, hostHeader.indexOf(']'));
  }
  return hostHeader.split(':')[0] ?? '';
}

function clampInteger(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value ?? fallback);
  return Number.isInteger(parsed) ? Math.min(Math.max(parsed, min), max) : fallback;
}

function contentDisposition(fileName: string): string {
  return `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

function inlineScriptHashes(indexPath: string): string {
  try {
    const html = readFileSync(indexPath, 'utf8');
    return [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
      .map(
        (match) =>
          `'sha256-${createHash('sha256')
            .update(match[1]!.replace(/\r\n?/g, '\n'))
            .digest('base64')}'`,
      )
      .join(' ');
  } catch {
    return '';
  }
}

function localLibraryResponse(library: {
  id: number;
  path: string;
  created_at: string;
  asset_count: number;
}) {
  return {
    id: library.id,
    path: library.path,
    createdAt: library.created_at,
    assetCount: library.asset_count,
  };
}

export async function buildApp(
  config: AppConfig,
  db: DatabaseSync,
  options: { logger?: boolean; triggerScans?: boolean } = {},
): Promise<{ app: FastifyInstance; runner: JobRunner; faceService: FaceService }> {
  const app = Fastify({
    logger: options.logger ?? false,
    bodyLimit: 1024 * 1024,
  });
  const runner = new JobRunner(db, config);
  const libraryMonitor = new LibraryMonitor(db, runner, { logger: console });
  if (options.triggerScans !== false) {
    libraryMonitor.start();
  }
  const faceService = new FaceService(db, config);
  const webAvailable = existsSync(path.join(config.webDist, 'index.html'));
  const contentSecurityPolicy = [
    "default-src 'self'",
    "img-src 'self' data: blob: https://tiles.immich.cloud https://static.immich.cloud",
    "media-src 'self' blob:",
    "font-src 'self' data: https://static.immich.cloud",
    "style-src 'self' 'unsafe-inline'",
    `script-src 'self' 'wasm-unsafe-eval' ${inlineScriptHashes(path.join(config.webDist, 'index.html'))}`,
    "worker-src 'self' blob:",
    "frame-src 'self' http://127.0.0.1:7012",
    "child-src 'self' blob: http://127.0.0.1:7012",
    "connect-src 'self' ws: https://tiles.immich.cloud https://static.immich.cloud",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
  ].join('; ');

  app.addHook('onRequest', async (request, reply) => {
    const hostname = getHostname(request.headers.host);
    if (!LOCAL_HOSTS.has(hostname)) {
      return reply.code(421).send({ error: 'Only local hostnames are accepted' });
    }
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('Cross-Origin-Resource-Policy', 'same-origin');
    reply.header(
      'Set-Cookie',
      'immich_is_authenticated=true; Path=/; SameSite=Strict; Max-Age=31536000',
    );
    reply.header('Content-Security-Policy', contentSecurityPolicy);
  });

  if (webAvailable) {
    await app.register(fastifyStatic, {
      root: config.webDist,
      prefix: '/',
      wildcard: false,
      preCompressed: true,
    });
  }

  app.get('/api/health', async () => ({
    ok: true,
    service: 'immich-mini',
    version: VERSION,
  }));

  app.get('/custom.css', async (_request, reply) => reply.type('text/css').send(SHARING_HIDDEN_CSS));

  app.get('/api/status', async () => ({
    version: VERSION,
    assets: getAssetSummary(db),
  }));

  app.get('/api/local/libraries', async () => listLibraries(db).map(localLibraryResponse));
  app.get('/api/local/libraries/settings', async () => readLibraryAutomationSettings(db));

  app.put<{
    Body: {
      watchEnabled?: unknown;
      scanEnabled?: unknown;
      scanIntervalMinutes?: unknown;
    };
  }>('/api/local/libraries/settings', async (request, reply) => {
    const interval = Number(request.body?.scanIntervalMinutes);
    if (
      typeof request.body?.watchEnabled !== 'boolean' ||
      typeof request.body?.scanEnabled !== 'boolean' ||
      !Number.isInteger(interval) ||
      interval < 5 ||
      interval > 10_080
    ) {
      return reply.code(400).send({ error: 'Invalid library automation settings' });
    }
    const settings = {
      watchEnabled: request.body.watchEnabled,
      scanEnabled: request.body.scanEnabled,
      scanIntervalMinutes: interval,
    };
    saveLibraryAutomationSettings(db, settings);
    libraryMonitor.refresh();
    return settings;
  });

  app.post<{ Params: { id: string } }>(
    '/api/local/libraries/:id/scan',
    async (request, reply) => {
      const id = Number(request.params.id);
      const library = Number.isInteger(id)
        ? listLibraries(db).find((item) => item.id === id)
        : undefined;
      if (!library) {
        return reply.code(404).send({ error: 'Library not found' });
      }
      const job = enqueueScan(db, library.id, library.path);
      if (options.triggerScans !== false) {
        void runner.runQueuedJobs();
      }
      return reply.code(202).send({ job });
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/api/local/libraries/:id',
    async (request, reply) => {
      const id = Number(request.params.id);
      const library = Number.isInteger(id)
        ? listLibraries(db).find((item) => item.id === id)
        : undefined;
      if (!library) {
        return reply.code(404).send({ error: 'Library not found' });
      }
      if (hasActiveLibraryJob(db, library.id)) {
        return reply.code(409).send({ error: '媒体库正在扫描，完成后才能移除' });
      }

      const result = deleteLibrary(db, library.id);
      if (!result) {
        return reply.code(404).send({ error: 'Library not found' });
      }
      libraryMonitor.refresh();
      return result;
    },
  );

  app.post<{ Body: { path?: unknown } }>('/api/local/libraries', async (request, reply) => {
    const libraryPath = request.body?.path;
    if (typeof libraryPath !== 'string' || libraryPath.trim().length === 0) {
      return reply.code(400).send({ error: 'A directory path is required' });
    }
    if (!path.isAbsolute(libraryPath.trim())) {
      return reply.code(400).send({ error: 'The directory path must be absolute' });
    }
    const normalized = path.resolve(libraryPath.trim());
    let libraryStat;
    try {
      libraryStat = await stat(normalized);
    } catch {
      return reply.code(400).send({ error: 'The directory does not exist' });
    }
    if (!libraryStat.isDirectory()) {
      return reply.code(400).send({ error: 'Path is not a directory' });
    }

    const library = getLibrary(db, normalized);
    if (!library) {
      return reply.code(500).send({ error: 'Could not register library' });
    }
    const job = enqueueScan(db, library.id, library.path);
    libraryMonitor.refresh();
    if (options.triggerScans !== false) {
      void runner.runQueuedJobs();
    }
    const stored = listLibraries(db).find((item) => item.id === library.id);
    return reply.code(202).send({
      library: stored ? localLibraryResponse(stored) : { ...library, createdAt: '', assetCount: 0 },
      job,
    });
  });

  app.get<{
    Querystring: { limit?: string; offset?: string; kind?: string };
  }>('/api/assets', async (request, reply) => {
    const kind = request.query.kind;
    if (kind !== undefined && kind !== 'image' && kind !== 'video') {
      return reply.code(400).send({ error: 'kind must be image or video' });
    }
    const limit = clampInteger(request.query.limit, 120, 1, 200);
    const offset = clampInteger(request.query.offset, 0, 0, Number.MAX_SAFE_INTEGER);
    return listAssets(db, limit, offset, kind as AssetKind | undefined);
  });

  app.get<{ Params: { id: string } }>('/api/assets/:id/thumbnail', async (request, reply) => {
    const id = parseAssetId(request.params.id);
    const asset = id ? getAsset(db, id) : undefined;
    if (!asset?.thumbnail_path || !existsSync(asset.thumbnail_path)) {
      return reply.code(404).send({ error: 'Thumbnail not found' });
    }
    reply.header('Cache-Control', 'public, max-age=31536000, immutable');
    reply.type(asset.kind === 'image' ? 'image/webp' : 'image/jpeg');
    return reply.send(createReadStream(asset.thumbnail_path));
  });

  const streamFile = async (
    request: FastifyRequest,
    reply: FastifyReply,
    filePath: string,
    fileName: string,
    mime: string,
  ) => {
    let fileStat;
    try {
      fileStat = await stat(filePath);
    } catch {
      return reply.code(410).send({ error: 'Media file is unavailable' });
    }

    reply.header('Cache-Control', 'private, no-store');
    reply.header('Accept-Ranges', 'bytes');
    reply.header('Content-Disposition', contentDisposition(fileName));
    reply.type(mime);

    const range = request.headers.range;
    if (!range) {
      reply.header('Content-Length', fileStat.size);
      return reply.send(createReadStream(filePath));
    }

    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match) {
      return reply.code(416).header('Content-Range', `bytes */${fileStat.size}`).send();
    }
    const first = match[1] ? Number(match[1]) : undefined;
    const last = match[2] ? Number(match[2]) : undefined;
    const start = first ?? Math.max(0, fileStat.size - (last ?? 0));
    const end = first === undefined ? fileStat.size - 1 : Math.min(last ?? fileStat.size - 1, fileStat.size - 1);
    if (start > end || start >= fileStat.size) {
      return reply.code(416).header('Content-Range', `bytes */${fileStat.size}`).send();
    }

    return reply
      .code(206)
      .header('Content-Range', `bytes ${start}-${end}/${fileStat.size}`)
      .header('Content-Length', end - start + 1)
      .send(createReadStream(filePath, { start, end }));
  };

  const streamOriginal = async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ) => {
    const id = parseAssetId(request.params.id);
    const asset = id ? getAsset(db, id) : undefined;
    if (!asset) {
      return reply.code(404).send({ error: 'Asset not found' });
    }
    return streamFile(request, reply, asset.path, asset.name, asset.mime);
  };

  app.get<{ Params: { id: string } }>('/api/assets/:id/original', streamOriginal);
  app.get<{ Params: { id: string } }>('/api/assets/:id/video/playback', streamOriginal);

  app.post<{ Body: { path?: unknown } }>('/api/scan', async (request, reply) => {
    const libraryPath = request.body?.path;
    if (typeof libraryPath !== 'string' || libraryPath.trim().length === 0) {
      return reply.code(400).send({ error: 'A directory path is required' });
    }
    const normalized = path.resolve(libraryPath.trim());
    if (!path.isAbsolute(libraryPath.trim())) {
      return reply.code(400).send({ error: 'The directory path must be absolute' });
    }

    let libraryStat;
    try {
      libraryStat = await stat(normalized);
    } catch {
      return reply.code(400).send({ error: 'Directory does not exist' });
    }
    if (!libraryStat.isDirectory()) {
      return reply.code(400).send({ error: 'Path is not a directory' });
    }

    const library = getLibrary(db, normalized);
    if (!library) {
      return reply.code(500).send({ error: 'Could not register library' });
    }
    const job = enqueueScan(db, library.id, library.path);
    if (options.triggerScans !== false) {
      void runner.runQueuedJobs();
    }
    return reply.code(202).send(job);
  });

  app.get<{ Params: { id: string } }>('/api/jobs/:id', async (request, reply) => {
    const job = getJob(db, Number(request.params.id));
    return job ?? reply.code(404).send({ error: 'Job not found' });
  });

  app.post('/api/faces/scan', async () => ({ queued: await faceService.queueAndRun() }));

  app.get('/api/local/faces/settings', async () => ({
    ...readFaceRecognitionSettings(db, config),
    ...faceQueueStatistics(db),
  }));

  app.put<{
    Body: { detectionThreshold?: unknown; clusterThreshold?: unknown };
  }>('/api/local/faces/settings', async (request, reply) => {
    const detectionThreshold = Number(request.body?.detectionThreshold);
    const clusterThreshold = Number(request.body?.clusterThreshold);
    if (
      !Number.isFinite(detectionThreshold) ||
      detectionThreshold < 0.1 ||
      detectionThreshold > 0.99 ||
      !Number.isFinite(clusterThreshold) ||
      clusterThreshold < 0.1 ||
      clusterThreshold > 0.99
    ) {
      return reply.code(400).send({ error: '人脸阈值必须在 0.1 到 0.99 之间' });
    }
    const settings = { detectionThreshold, clusterThreshold };
    saveFaceRecognitionSettings(db, settings);
    return { ...settings, ...faceQueueStatistics(db) };
  });

  app.post('/api/local/faces/reprocess', async () => faceService.reprocess());

  app.get('/api/local/tools/settings', async () => readExternalToolSettings(db));

  app.put<{ Body: Partial<Record<keyof ExternalToolSettings, unknown>> }>(
    '/api/local/tools/settings',
    async (request, reply) => {
      const body = request.body ?? {};
      const keys: Array<keyof ExternalToolSettings> = [
        'videoEditorPath',
        'imageEditorPath',
        'frameEditorPath',
      ];
      if (keys.some((key) => typeof body[key] !== 'string')) {
        return reply.code(400).send({ error: '请填写全部外部工具路径' });
      }
      try {
        return saveExternalToolSettings(db, {
          videoEditorPath: body.videoEditorPath as string,
          imageEditorPath: body.imageEditorPath as string,
          frameEditorPath: body.frameEditorPath as string,
        });
      } catch (error) {
        return reply.code(400).send({ error: error instanceof Error ? error.message : String(error) });
      }
    },
  );

  app.post<{ Body: { title?: unknown } }>('/api/local/tools/choose', async (request) => {
    const title =
      typeof request.body?.title === 'string' && request.body.title.trim()
        ? request.body.title.trim().slice(0, 80)
        : '选择外部工具';
    const executable = await chooseApplicationExecutable(title);
    return executable ? { cancelled: false, path: executable } : { cancelled: true };
  });

  const selectedAssets = (value: unknown) => {
    if (!Array.isArray(value) || value.length === 0 || value.length > 5_000) {
      throw new Error('请选择 1 到 5000 个媒体');
    }
    const ids = value.map((id) => parseAssetId(id)).filter((id): id is number => id !== undefined);
    if (ids.length !== value.length) {
      throw new Error('媒体 ID 无效');
    }
    return resolveAssets(db, [...new Set(ids)]);
  };

  app.post<{ Body: { ids?: unknown } }>('/api/local/assets/paths', async (request, reply) => {
    try {
      const assets = selectedAssets(request.body?.ids);
      return {
        items: assets.map((asset) => ({
          id: asset.id,
          path: asset.path,
          kind: asset.kind,
          name: asset.name,
        })),
      };
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post<{ Body: { ids?: unknown; style?: unknown; destination?: unknown } }>(
    '/api/local/assets/frame',
    async (request, reply) => {
      try {
        const style = request.body?.style;
        if (style !== 'light' && style !== 'dark') {
          throw new Error('请选择相框样式');
        }
        if (typeof request.body?.destination !== 'string' || !path.isAbsolute(request.body.destination)) {
          throw new Error('请选择有效的导出文件夹');
        }
        const destination = path.resolve(request.body.destination);
        const destinationStat = await stat(destination).catch(() => undefined);
        if (!destinationStat?.isDirectory()) {
          throw new Error('导出文件夹不存在');
        }
        const assets = selectedAssets(request.body?.ids);
        if (assets.some((asset) => asset.kind !== 'image')) {
          return reply.code(400).send({ error: '相框功能只支持图片' });
        }
        return await exportFramedAssets(assets, destination, style as FrameStyle);
      } catch (error) {
        return reply
          .code(400)
          .send({ error: error instanceof Error ? error.message : String(error) });
      }
    },
  );

  app.get<{
    Params: { id: string };
    Querystring: { style?: string };
  }>('/api/local/assets/:id/frame-preview', async (request, reply) => {
    try {
      const id = parseAssetId(request.params.id);
      const asset = id === undefined ? undefined : getAsset(db, id);
      if (!asset) {
        return reply.code(404).send({ error: '未找到图片' });
      }
      const style = request.query.style === 'dark' ? 'dark' : 'light';
      const preview = await renderFramePreview(asset, style);
      reply.header('Cache-Control', 'private, no-store');
      return reply.type('image/jpeg').send(preview);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  registerImmichApi(app, db, config);
  attachRealtime(app);
  app.addHook('onClose', async () => {
    libraryMonitor.stop();
    faceService.stop();
  });

  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/api/')) {
      return reply.code(404).send({ error: 'Not found' });
    }
    if (webAvailable) {
      return reply.type('text/html').sendFile('index.html');
    }
    return reply.code(404).send({ error: 'Web UI is not built. Run npm run build.' });
  });

  return { app, faceService, runner };
}
