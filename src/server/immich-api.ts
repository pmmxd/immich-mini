import { createReadStream, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { statfs } from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import type { AppConfig } from './config.js';
import { parseAssetId, toAssetId } from './asset-id.js';
import {
  addAlbumAssets,
  createAlbum,
  createOrGetTags,
  createTag,
  deleteAlbum,
  deleteAssetRecords,
  deleteTag,
  getAsset,
  getAssetPeople,
  getAssetTags,
  getAlbum,
  getPerson,
  getSetting,
  getTag,
  linkMotionVideo,
  listAlbums,
  listPeople,
  listTags,
  listTimelineAssets,
  listTimelineBuckets,
  removeAlbumAssets,
  removeAssetTags,
  searchAssets as searchAssetsDb,
  setAssetsTrashed,
  setAssetTags,
  setSetting,
  unlinkMotionVideo,
  updateAlbum,
  updateAssets,
  updatePerson,
  updateTag,
  type AssetRecord,
} from './db.js';
import { readExifDetails, type ExifDetails } from './media.js';

export const LOCAL_USER_ID = '00000000-0000-4000-8000-000000000001';
export const LOCAL_USER_EMAIL = 'local@immich-mini.invalid';
const LOCAL_USER_NAME = '本地用户';
const CREATED_AT = '2026-01-01T00:00:00.000Z';
const MAP_DARK_STYLE = 'https://tiles.immich.cloud/v1/style/dark.json';
const MAP_LIGHT_STYLE = 'https://tiles.immich.cloud/v1/style/light.json';
const assetExifCache = new Map<number, { fingerprint: string; details: ExifDetails }>();

const localUser = {
  avatarColor: 'primary',
  clusterGroupId: 'immich-mini-local',
  createdAt: CREATED_AT,
  deletedAt: null,
  email: LOCAL_USER_EMAIL,
  id: LOCAL_USER_ID,
  isAdmin: false,
  license: null,
  name: LOCAL_USER_NAME,
  oauthId: '',
  profileChangedAt: CREATED_AT,
  profileImagePath: '',
  quotaSizeInBytes: null,
  quotaUsageInBytes: 0,
  shouldChangePassword: false,
  status: 'active',
  storageLabel: null,
  updatedAt: CREATED_AT,
};

const defaultPreferences = {
  albums: { defaultAssetOrder: 'desc' },
  cast: { gCastEnabled: false },
  download: { archiveSize: 1_073_741_824, includeEmbeddedVideos: true },
  emailNotifications: { albumInvite: false, albumUpdate: false, enabled: false },
  folders: { enabled: true, sidebarWeb: true },
  memories: { duration: 5, enabled: false, sidebarWeb: false },
  people: { enabled: true, minimumFaces: 1, sidebarWeb: true, updateStrategy: 'self' },
  purchase: { hideBuyButtonUntil: '2100-01-01T00:00:00.000Z', showSupportBadge: false },
  ratings: { enabled: true },
  recentlyAdded: { sidebarWeb: true },
  sharedLinks: { enabled: false, sidebarWeb: false },
  tags: { enabled: true, sidebarWeb: true },
};

function readPreferences(db: DatabaseSync): typeof defaultPreferences {
  const value = getSetting(db, 'preferences');
  if (!value) {
    return defaultPreferences;
  }
  try {
    return { ...defaultPreferences, ...(JSON.parse(value) as Partial<typeof defaultPreferences>) };
  } catch {
    return defaultPreferences;
  }
}

function localDateTime(value: string): string {
  const date = new Date(value);
  const padding = (part: number, length = 2) => String(part).padStart(length, '0');
  return `${date.getFullYear()}-${padding(date.getMonth() + 1)}-${padding(date.getDate())}T${padding(
    date.getHours(),
  )}:${padding(date.getMinutes())}:${padding(date.getSeconds())}.${padding(date.getMilliseconds(), 3)}`;
}

function localOffsetHours(value: string): number {
  return -new Date(value).getTimezoneOffset() / 60;
}

function ratio(asset: AssetRecord): number {
  if (!asset.width || !asset.height) {
    return 1;
  }
  return Math.round((asset.width / asset.height) * 1_000) / 1_000;
}

function checksum(asset: AssetRecord): string {
  return createHash('sha1').update(`${asset.path}\0${asset.fingerprint}`).digest('base64');
}

function assetType(asset: AssetRecord): 'IMAGE' | 'VIDEO' {
  return asset.kind === 'image' ? 'IMAGE' : 'VIDEO';
}

function tagResponse(tag: {
  id: string;
  name: string;
  value: string;
  color: string | null;
  parent_id: string | null;
  created_at: string;
  updated_at: string;
}) {
  return {
    color: tag.color ?? undefined,
    createdAt: tag.created_at,
    id: tag.id,
    name: tag.name,
    parentId: tag.parent_id ?? undefined,
    updatedAt: tag.updated_at,
    value: tag.value,
  };
}

function assetResponse(db: DatabaseSync, asset: AssetRecord): Record<string, unknown> {
  const owner = {
    avatarColor: localUser.avatarColor,
    email: localUser.email,
    id: localUser.id,
    name: localUser.name,
    profileChangedAt: localUser.profileChangedAt,
    profileImagePath: localUser.profileImagePath,
  };
  return {
    checksum: checksum(asset),
    createdAt: asset.created_at,
    duplicateId: null,
    duration: asset.duration_ms,
    exifInfo: {
      city: asset.city,
      country: asset.country,
      dateTimeOriginal: asset.taken_at,
      description: asset.description,
      exifImageHeight: asset.height,
      exifImageWidth: asset.width,
      exposureTime: null,
      fNumber: null,
      fileSizeInByte: asset.bytes,
      focalLength: null,
      iso: null,
      latitude: asset.latitude,
      lensModel: asset.lens_model,
      longitude: asset.longitude,
      make: asset.make,
      model: asset.model,
      modifyDate: asset.taken_at,
      orientation: null,
      projectionType: null,
      rating: asset.rating,
      state: asset.state,
      timeZone: null,
    },
    fileCreatedAt: asset.taken_at,
    fileModifiedAt: asset.taken_at,
    hasMetadata: true,
    height: asset.height,
    id: toAssetId(asset.id),
    isArchived: Boolean(asset.is_archived),
    isEdited: false,
    isFavorite: Boolean(asset.is_favorite),
    isOffline: false,
    isTrashed: Boolean(asset.is_trashed),
    libraryId: `library-${asset.library_id}`,
    livePhotoVideoId: asset.live_photo_video_id
      ? toAssetId(asset.live_photo_video_id)
      : null,
    localDateTime: localDateTime(asset.taken_at),
    originalFileName: asset.name,
    originalMimeType: asset.mime,
    originalPath: asset.path,
    owner,
    ownerId: LOCAL_USER_ID,
    people: getAssetPeople(db, asset.id).map(personResponse),
    resized: true,
    stack: null,
    tags: getAssetTags(db, asset.id).map(tagResponse),
    thumbhash: null,
    type: assetType(asset),
    updatedAt: asset.updated_at,
    visibility: asset.visibility,
    width: asset.width,
  };
}

async function assetDetailResponse(db: DatabaseSync, asset: AssetRecord): Promise<Record<string, unknown>> {
  const response = assetResponse(db, asset);
  const cached = assetExifCache.get(asset.id);
  const details =
    cached?.fingerprint === asset.fingerprint
      ? cached.details
      : await readExifDetails(asset.path).catch(() => undefined);
  if (details) {
    assetExifCache.set(asset.id, { fingerprint: asset.fingerprint, details });
    if (assetExifCache.size > 500) {
      assetExifCache.delete(assetExifCache.keys().next().value!);
    }
    response.exifInfo = {
      ...(response.exifInfo as Record<string, unknown>),
      ...Object.fromEntries(Object.entries(details).filter(([, value]) => value !== null)),
    };
  }
  return response;
}

function humanBytes(value: number): string {
  if (value < 1_024) {
    return `${value} B`;
  }
  const units = ['KiB', 'MiB', 'GiB', 'TiB'];
  let size = value / 1_024;
  let unit = units[0];
  for (let index = 1; index < units.length && size >= 1_024; index += 1) {
    size /= 1_024;
    unit = units[index];
  }
  return `${size.toFixed(1)} ${unit}`;
}

function albumResponse(
  db: DatabaseSync,
  album: {
    id: string;
    album_name: string;
    description: string;
    created_at: string;
    updated_at: string;
    asset_count: number;
    thumbnail_asset_id: number | null;
  },
) {
  const thumbnailAsset = album.thumbnail_asset_id
    ? (db.prepare('SELECT kind FROM assets WHERE id = ?').get(album.thumbnail_asset_id) as
        | { kind: 'image' | 'video' }
        | undefined)
    : undefined;
  const dates = db
    .prepare(
      `SELECT MIN(a.taken_at) AS start_date, MAX(a.taken_at) AS end_date
       FROM album_assets aa INNER JOIN assets a ON a.id = aa.asset_id
       WHERE aa.album_id = ? AND a.is_motion_part = 0`,
    )
    .get(album.id) as { start_date: string | null; end_date: string | null };
  return {
    albumName: album.album_name,
    albumThumbnailAssetId: album.thumbnail_asset_id ? toAssetId(album.thumbnail_asset_id) : null,
    albumThumbnailAssetType: thumbnailAsset?.kind ?? null,
    albumUsers: [
      {
        role: 'owner',
        user: {
          avatarColor: localUser.avatarColor,
          email: localUser.email,
          id: localUser.id,
          name: localUser.name,
          profileChangedAt: localUser.profileChangedAt,
          profileImagePath: localUser.profileImagePath,
        },
      },
    ],
    assetCount: album.asset_count,
    createdAt: album.created_at,
    description: album.description,
    endDate: dates.end_date ?? undefined,
    hasSharedLink: false,
    id: album.id,
    isActivityEnabled: false,
    lastModifiedAssetTimestamp: dates.end_date ?? undefined,
    order: 'desc',
    shared: false,
    startDate: dates.start_date ?? undefined,
    updatedAt: album.updated_at,
  };
}

function personResponse(person: {
  id: string;
  name: string;
  birth_date: string | null;
  color: string | null;
  is_favorite: number;
  is_hidden: number;
  thumbnail_path: string | null;
  updated_at: string;
}) {
  return {
    birthDate: person.birth_date,
    color: person.color ?? undefined,
    id: person.id,
    isFavorite: Boolean(person.is_favorite),
    isHidden: Boolean(person.is_hidden),
    name: person.name,
    otherPeople: [],
    sharedBy: [],
    sharedWith: [],
    thumbnailPath: person.thumbnail_path ?? '',
    updatedAt: person.updated_at,
  };
}

export function registerImmichApi(app: FastifyInstance, db: DatabaseSync, config: AppConfig): void {
  app.get('/api/server/config', async () => ({
    externalDomain: '',
    isInitialized: true,
    isOnboarded: true,
    loginPageMessage: '',
    maintenanceMode: false,
    mapDarkStyleUrl: MAP_DARK_STYLE,
    mapLightStyleUrl: MAP_LIGHT_STYLE,
    minFaces: 1,
    oauthButtonText: '',
    publicUsers: false,
    trashDays: 30,
    userDeleteDelay: 7,
  }));

  app.get('/api/server/features', async () => ({
    configFile: false,
    duplicateDetection: false,
    email: false,
    facialRecognition: true,
    importFaces: false,
    map: true,
    oauth: false,
    oauthAutoLaunch: false,
    ocr: false,
    passwordLogin: false,
    realtimeTranscoding: false,
    reverseGeocoding: false,
    search: true,
    sidecar: false,
    smartSearch: false,
    trash: true,
  }));

  app.get('/api/server/about', async () => ({
    licensed: false,
    nodejs: process.version,
    repository: 'immich-mini',
    repositoryUrl: '',
    version: '0.1.0',
    versionUrl: '',
  }));

  app.get('/api/server/ping', async () => ({ res: 'pong' }));

  app.get('/api/server/version', async () => ({ major: 0, minor: 1, patch: 0, prerelease: null }));

  app.get('/api/server/version-history', async () => []);

  app.get('/api/server/media-types', async () => ({
    image: ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif', 'image/tiff'],
    sidecar: ['application/xml', 'text/xml'],
    video: ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska'],
  }));

  app.get('/api/server/storage', async () => {
    const stats = await statfs(config.dataDir);
    const diskSizeRaw = Number(stats.blocks) * Number(stats.bsize);
    const diskAvailableRaw = Number(stats.bavail) * Number(stats.bsize);
    const diskUseRaw = Math.max(0, diskSizeRaw - diskAvailableRaw);
    return {
      diskAvailable: humanBytes(diskAvailableRaw),
      diskAvailableRaw,
      diskSize: humanBytes(diskSizeRaw),
      diskSizeRaw,
      diskUsagePercentage: diskSizeRaw > 0 ? Math.round((diskUseRaw / diskSizeRaw) * 10_000) / 100 : 0,
      diskUse: humanBytes(diskUseRaw),
      diskUseRaw,
    };
  });

  app.get('/api/server/statistics', async () => {
    const rows = db
      .prepare(
        `SELECT kind, COUNT(*) AS count, COALESCE(SUM(bytes), 0) AS usage
         FROM assets WHERE is_motion_part = 0 AND is_trashed = 0
         GROUP BY kind`,
      )
      .all() as unknown as Array<{ kind: string; count: number; usage: number }>;
    const imageRow = rows.find((row) => row.kind === 'image');
    const videoRow = rows.find((row) => row.kind === 'video');
    const usagePhotos = imageRow?.usage ?? 0;
    const usageVideos = videoRow?.usage ?? 0;
    return {
      photos: imageRow?.count ?? 0,
      usage: usagePhotos + usageVideos,
      usageByUser: [
        {
          photos: imageRow?.count ?? 0,
          quotaSizeInBytes: null,
          usage: usagePhotos + usageVideos,
          usagePhotos,
          usageVideos,
          userId: localUser.id,
          userName: localUser.name,
          videos: videoRow?.count ?? 0,
        },
      ],
      usagePhotos,
      usageVideos,
      videos: videoRow?.count ?? 0,
    };
  });

  app.get('/api/users/me', async () => localUser);

  app.get('/api/users/me/preferences', async () => readPreferences(db));

  app.put<{ Body: Record<string, unknown> }>('/api/users/me/preferences', async (request) => {
    const current = readPreferences(db);
    const next = { ...current, ...request.body };
    setSetting(db, 'preferences', JSON.stringify(next));
    return next;
  });

  app.get<{ Params: { id: string } }>('/api/users/:id/profile-image', async (_request, reply) => {
    return reply.code(404).send({ error: 'No profile image' });
  });

  app.get<{
    Querystring: {
      albumId?: string;
      isFavorite?: string;
      isTrashed?: string;
      personId?: string;
      tagId?: string;
      visibility?: string;
    };
  }>('/api/timeline/buckets', async (request) =>
    listTimelineBuckets(
      db,
      request.query.albumId,
      request.query.tagId,
      request.query.personId,
      request.query.isFavorite === 'true',
      request.query.isTrashed === 'true',
      request.query.visibility as 'timeline' | 'archive' | 'hidden' | 'locked' | undefined,
    ),
  );

  app.get<{
    Querystring: {
      albumId?: string;
      isFavorite?: string;
      isTrashed?: string;
      personId?: string;
      tagId?: string;
      timeBucket?: string;
      visibility?: string;
    };
  }>(
    '/api/timeline/bucket',
    async (request, reply) => {
    if (!request.query.timeBucket) {
      return reply.code(400).send({ error: 'timeBucket is required' });
    }
    const assets = listTimelineAssets(
      db,
      request.query.timeBucket,
      request.query.albumId,
      request.query.tagId,
      request.query.personId,
      request.query.isFavorite === 'true',
      request.query.isTrashed === 'true',
      request.query.visibility as 'timeline' | 'archive' | 'hidden' | 'locked' | undefined,
    );
    return {
      city: assets.map((asset) => asset.city),
      country: assets.map((asset) => asset.country),
      createdAt: assets.map((asset) => asset.created_at),
      duration: assets.map((asset) => asset.duration_ms),
      fileCreatedAt: assets.map((asset) => asset.taken_at),
      id: assets.map((asset) => toAssetId(asset.id)),
      isFavorite: assets.map((asset) => Boolean(asset.is_favorite)),
      isImage: assets.map((asset) => asset.kind === 'image'),
      isTrashed: assets.map((asset) => Boolean(asset.is_trashed)),
      latitude: assets.map((asset) => asset.latitude),
      livePhotoVideoId: assets.map((asset) =>
        asset.live_photo_video_id ? toAssetId(asset.live_photo_video_id) : null,
      ),
      localOffsetHours: assets.map((asset) => localOffsetHours(asset.taken_at)),
      longitude: assets.map((asset) => asset.longitude),
      ownerId: assets.map(() => LOCAL_USER_ID),
      projectionType: assets.map(() => null),
      ratio: assets.map(ratio),
      rating: assets.map((asset) => asset.rating),
      stack: assets.map(() => null),
      thumbhash: assets.map(() => null),
      visibility: assets.map((asset) => asset.visibility),
    };
    },
  );

  app.get<{ Params: { id: string } }>('/api/assets/:id', async (request, reply) => {
    const id = parseAssetId(request.params.id);
    const asset = id ? getAsset(db, id) : undefined;
    return asset ? assetDetailResponse(db, asset) : reply.code(404).send({ error: 'Asset not found' });
  });

  app.get<{ Querystring: { visibility?: string } }>('/api/assets/statistics', async (request, reply) => {
    if (request.query.visibility && request.query.visibility !== 'timeline') {
      return { images: 0, total: 0, videos: 0 };
    }
    return {
      images: (
        db
          .prepare(
            `SELECT COUNT(*) AS count FROM assets
             WHERE is_motion_part = 0
               AND kind = 'image' AND is_trashed = 0 AND is_archived = 0 AND visibility = 'timeline'`,
          )
          .get() as { count: number }
      ).count,
      total: (
        db
          .prepare(
            `SELECT COUNT(*) AS count FROM assets
             WHERE is_motion_part = 0
               AND is_trashed = 0 AND is_archived = 0 AND visibility = 'timeline'`,
          )
          .get() as { count: number }
      ).count,
      videos: (
        db
          .prepare(
            `SELECT COUNT(*) AS count FROM assets
             WHERE is_motion_part = 0
               AND kind = 'video' AND is_trashed = 0 AND is_archived = 0 AND visibility = 'timeline'`,
          )
          .get() as { count: number }
      ).count,
    };
  });

  app.put<{
    Body: {
      dateTimeOriginal?: string;
      description?: string;
      ids: string[];
      isFavorite?: boolean;
      latitude?: number;
      longitude?: number;
      rating?: number | null;
      visibility?: 'timeline' | 'archive' | 'hidden' | 'locked';
    };
  }>('/api/assets', async (request) => {
    const ids = request.body.ids.map(parseAssetId).filter((id): id is number => id !== undefined);
    updateAssets(db, ids, {
      isFavorite: request.body.isFavorite,
      rating: request.body.rating,
      description: request.body.description,
      latitude: request.body.latitude,
      longitude: request.body.longitude,
      takenAt: request.body.dateTimeOriginal,
      visibility: request.body.visibility,
    });
    return '';
  });

  app.put<{
    Params: { id: string };
    Body: {
      dateTimeOriginal?: string;
      description?: string;
      isFavorite?: boolean;
      latitude?: number;
      longitude?: number;
      livePhotoVideoId?: string | null;
      rating?: number | null;
      visibility?: 'timeline' | 'archive' | 'hidden' | 'locked';
    };
  }>('/api/assets/:id', async (request, reply) => {
    const id = parseAssetId(request.params.id);
    if (!id) {
      return reply.code(404).send({ error: 'Asset not found' });
    }
    updateAssets(db, [id], {
      isFavorite: request.body.isFavorite,
      rating: request.body.rating,
      description: request.body.description,
      latitude: request.body.latitude,
      longitude: request.body.longitude,
      takenAt: request.body.dateTimeOriginal,
      visibility: request.body.visibility,
    });
    if (request.body.livePhotoVideoId === null) {
      unlinkMotionVideo(db, id);
    } else if (request.body.livePhotoVideoId !== undefined) {
      const videoId = parseAssetId(request.body.livePhotoVideoId);
      if (!videoId || !linkMotionVideo(db, id, videoId)) {
        return reply.code(400).send({ error: 'Invalid live photo video' });
      }
    }
    const asset = getAsset(db, id);
    return asset ? assetDetailResponse(db, asset) : reply.code(404).send({ error: 'Asset not found' });
  });

  app.delete<{ Body: { force?: boolean; ids: string[] } }>('/api/assets', async (request) => {
    const ids = request.body.ids.map(parseAssetId).filter((id): id is number => id !== undefined);
    if (request.body.force) {
      deleteAssetRecords(db, ids);
    } else {
      setAssetsTrashed(db, ids, true);
    }
    return '';
  });

  app.post<{ Body: { ids: string[] } }>('/api/trash/restore/assets', async (request) => {
    const ids = request.body.ids.map(parseAssetId).filter((id): id is number => id !== undefined);
    setAssetsTrashed(db, ids, false);
    return { count: ids.length };
  });

  app.post('/api/trash/restore', async () => {
    const result = db.prepare('UPDATE assets SET is_trashed = 0 WHERE is_trashed = 1').run();
    return { count: Number(result.changes) };
  });

  app.post('/api/trash/empty', async () => {
    const rows = db.prepare('SELECT id FROM assets WHERE is_trashed = 1').all() as unknown as Array<{ id: number }>;
    return { count: deleteAssetRecords(db, rows.map((row) => row.id)) };
  });

  app.post<{
    Body: {
      albumIds?: string[];
      cursor?: string;
      filter?: {
        city?: { eq?: string };
        fileSizeInBytes?: { gte?: number; lte?: number };
        isFavorite?: { eq?: boolean };
        isTrashed?: { eq?: boolean };
        lensModel?: { eq?: string };
        make?: { eq?: string };
        model?: { eq?: string };
        originalFileName?: { like?: string };
        originalPath?: { like?: string };
        personIds?: { any?: string[] };
        rating?: { gte?: number };
        tagIds?: { any?: string[] };
        takenAt?: { gte?: string; lte?: string };
        type?: { eq?: string };
        visibility?: { eq?: string };
      };
      orderBy?: { direction?: string; field?: string };
      size?: number;
    };
  }>('/api/search/metadata', async (request, reply) => {
    const body = request.body ?? {};
    const filter = body.filter ?? {};
    const unsupportedValue =
      (filter.visibility?.eq &&
        filter.visibility.eq !== 'timeline' &&
        filter.visibility.eq !== 'archive' &&
        filter.visibility.eq !== 'hidden' &&
        filter.visibility.eq !== 'locked') ||
      (filter.type?.eq && filter.type.eq !== 'IMAGE' && filter.type.eq !== 'VIDEO');
    const size = Number.isInteger(body.size) ? Math.min(Math.max(body.size!, 1), 1_000) : 100;
    const offset = body.cursor && /^\d+$/.test(body.cursor) ? Number(body.cursor) : 0;
    const result = unsupportedValue
      ? { items: [], total: 0, nextOffset: null }
      : searchAssetsDb(db, {
          albumIds: body.albumIds,
          tagIds: filter.tagIds?.any,
          city: filter.city?.eq,
          make: filter.make?.eq,
          model: filter.model?.eq,
          lensModel: filter.lensModel?.eq,
          kind:
            filter.type?.eq === 'IMAGE' ? 'image' : filter.type?.eq === 'VIDEO' ? 'video' : undefined,
          query: filter.originalFileName?.like?.replaceAll('%', '') || undefined,
          pathQuery: filter.originalPath?.like?.replaceAll('%', '') || undefined,
          personIds: filter.personIds?.any,
          minSize: filter.fileSizeInBytes?.gte,
          maxSize: filter.fileSizeInBytes?.lte,
          takenAfter: filter.takenAt?.gte,
          takenBefore: filter.takenAt?.lte,
          favorite: filter.isFavorite?.eq,
          minRating: filter.rating?.gte,
          trashed: filter.isTrashed?.eq,
          visibility: filter.visibility?.eq as
            | 'timeline'
            | 'archive'
            | 'hidden'
            | 'locked'
            | undefined,
          sort:
            body.orderBy?.field === 'fileSizeInBytes'
              ? 'size'
              : body.orderBy?.field === 'name'
                ? 'name'
                : body.orderBy?.field === 'rating'
                  ? 'rating'
                  : 'date',
          order: body.orderBy?.direction === 'asc' ? 'asc' : 'desc',
          limit: size,
          offset,
        });
    const items = result.items.map((asset) => assetResponse(db, asset));
    const response = {
      albums: { count: 0, facets: [], items: [], total: 0 },
      assets: {
        count: items.length,
        facets: [],
        items,
        nextCursor: result.nextOffset === null ? null : String(result.nextOffset),
        nextPage: null,
        total: result.total,
      },
    };
    return reply.send(response);
  });

  app.get<{ Querystring: { assetId?: string } }>('/api/albums', async (request) => {
    const assetId = request.query.assetId ? parseAssetId(request.query.assetId) : undefined;
    return listAlbums(db, assetId).map((album) => albumResponse(db, album));
  });

  app.get('/api/albums/statistics', async () => {
    const count = (db.prepare('SELECT COUNT(*) AS count FROM albums').get() as { count: number }).count;
    return { notShared: count, owned: count, shared: 0 };
  });

  app.post<{
    Body: { albumName: string; assetIds?: string[]; description?: string | null };
  }>('/api/albums', async (request, reply) => {
    if (!request.body.albumName?.trim()) {
      return reply.code(400).send({ error: 'Album name is required' });
    }
    const assetIds = (request.body.assetIds ?? [])
      .map(parseAssetId)
      .filter((id): id is number => id !== undefined);
    const created = createAlbum(db, request.body.albumName.trim(), request.body.description, assetIds);
    return reply.code(201).send(albumResponse(db, getAlbum(db, created.id)!));
  });

  app.get<{ Params: { id: string } }>('/api/albums/:id', async (request, reply) => {
    const album = getAlbum(db, request.params.id);
    const enriched = album ? getAlbum(db, album.id) : undefined;
    return enriched ? albumResponse(db, enriched) : reply.code(404).send({ error: 'Album not found' });
  });

  app.put<{
    Params: { id: string };
    Body: { albumName?: string; albumThumbnailAssetId?: string; description?: string | null };
  }>('/api/albums/:id', async (request, reply) => {
    const thumbnailAssetId =
      request.body.albumThumbnailAssetId === undefined
        ? undefined
        : parseAssetId(request.body.albumThumbnailAssetId);
    const album = updateAlbum(db, request.params.id, {
      albumName: request.body.albumName,
      albumThumbnailAssetId: thumbnailAssetId,
      description: request.body.description,
    });
    const enriched = album ? getAlbum(db, album.id) : undefined;
    return enriched ? albumResponse(db, enriched) : reply.code(404).send({ error: 'Album not found' });
  });

  app.delete<{ Params: { id: string } }>('/api/albums/:id', async (request, reply) => {
    deleteAlbum(db, request.params.id);
    return reply.code(204).send();
  });

  app.put<{ Params: { id: string }; Body: { ids: string[] } }>(
    '/api/albums/:id/assets',
    async (request, reply) => {
      if (!getAlbum(db, request.params.id)) {
        return reply.code(404).send({ error: 'Album not found' });
      }
      const results = request.body.ids.map((value) => {
        const id = parseAssetId(value);
        if (!id || !getAsset(db, id)) {
          return { error: 'not_found', id: value, success: false };
        }
        addAlbumAssets(db, request.params.id, [id]);
        return { id: value, success: true };
      });
      return results;
    },
  );

  app.delete<{ Params: { id: string }; Body: { ids: string[] } }>(
    '/api/albums/:id/assets',
    async (request) => {
      const ids = request.body.ids.map(parseAssetId).filter((id): id is number => id !== undefined);
      removeAlbumAssets(db, request.params.id, ids);
      return request.body.ids.map((value) => ({ id: value, success: true }));
    },
  );

  app.put<{ Body: { assetIds: string[]; albumIds: string[] } }>('/api/albums/assets', async (request) => {
    const assetIds = request.body.assetIds
      .map(parseAssetId)
      .filter((id): id is number => id !== undefined);
    for (const albumId of request.body.albumIds) {
      addAlbumAssets(db, albumId, assetIds);
    }
    return { success: true };
  });

  app.get<{ Params: { id: string } }>('/api/albums/:id/map-markers', async (request) => {
    const rows = db
      .prepare(
        `SELECT a.id, a.latitude AS lat, a.longitude AS lon,
                a.city, a.country, a.state
         FROM assets a
         INNER JOIN album_assets aa ON aa.asset_id = a.id
         WHERE aa.album_id = ? AND a.is_motion_part = 0 AND a.is_trashed = 0
           AND a.latitude IS NOT NULL AND a.longitude IS NOT NULL`,
      )
      .all(request.params.id) as unknown as Array<{
      city: string | null;
      country: string | null;
      id: number;
      lat: number;
      lon: number;
      state: string | null;
    }>;
    return rows.map((row) => ({
      city: row.city,
      country: row.country,
      id: toAssetId(row.id),
      lat: row.lat,
      lon: row.lon,
      state: row.state,
    }));
  });

  app.get('/api/tags', async () => listTags(db).map(tagResponse));

  app.post<{ Body: { color?: string | null; name: string; parentId?: string | null } }>(
    '/api/tags',
    async (request, reply) => {
      if (!request.body.name?.trim()) {
        return reply.code(400).send({ error: 'Tag name is required' });
      }
      return reply
        .code(201)
        .send(tagResponse(createTag(db, request.body.name.trim(), request.body.color, request.body.parentId)));
    },
  );

  app.put<{ Body: { tags: string[] } }>('/api/tags', async (request) => {
    return createOrGetTags(db, request.body.tags).map(tagResponse);
  });

  app.put<{ Body: { assetIds: string[]; tagIds: string[] } }>('/api/tags/assets', async (request) => {
    const assetIds = request.body.assetIds
      .map(parseAssetId)
      .filter((id): id is number => id !== undefined);
    setAssetTags(db, assetIds, request.body.tagIds);
    return { count: assetIds.length };
  });

  app.get<{ Params: { id: string } }>('/api/tags/:id', async (request, reply) => {
    const tag = getTag(db, request.params.id);
    return tag ? tagResponse(tag) : reply.code(404).send({ error: 'Tag not found' });
  });

  app.put<{ Params: { id: string }; Body: { color?: string | null; name?: string } }>(
    '/api/tags/:id',
    async (request, reply) => {
      const tag = updateTag(db, request.params.id, request.body);
      return tag ? tagResponse(tag) : reply.code(404).send({ error: 'Tag not found' });
    },
  );

  app.delete<{ Params: { id: string } }>('/api/tags/:id', async (request) => {
    deleteTag(db, request.params.id);
    return '';
  });

  app.put<{ Params: { id: string }; Body: { ids: string[] } }>(
    '/api/tags/:id/assets',
    async (request) => {
      const assetIds = request.body.ids.map(parseAssetId).filter((id): id is number => id !== undefined);
      setAssetTags(db, assetIds, [request.params.id]);
      return request.body.ids.map((value) => ({ id: value, success: true }));
    },
  );

  app.delete<{ Params: { id: string }; Body: { ids: string[] } }>(
    '/api/tags/:id/assets',
    async (request) => {
      const assetIds = request.body.ids.map(parseAssetId).filter((id): id is number => id !== undefined);
      removeAssetTags(db, request.params.id, assetIds);
      return request.body.ids.map((value) => ({ id: value, success: true }));
    },
  );

  app.get<{
    Querystring: { name?: string; page?: string; size?: string; withHidden?: string };
  }>('/api/people', async (request) => {
    const withHidden = request.query.withHidden === 'true';
    const people = listPeople(db, { name: request.query.name, withHidden });
    const page = Math.max(1, Number(request.query.page) || 1);
    const size = Math.min(Math.max(Number(request.query.size) || 100, 1), 1_000);
    const start = (page - 1) * size;
    const rows = people.slice(start, start + size);
    const totalAssets = (
      db.prepare('SELECT COUNT(DISTINCT asset_id) AS count FROM faces').get() as {
        count: number;
      }
    ).count;
    return {
      hasNextPage: start + size < people.length,
      hidden: people.filter((person) => person.is_hidden).length,
      people: rows.map(personResponse),
      total: people.length,
      totalAssets,
    };
  });

  app.get<{ Params: { id: string } }>('/api/people/:id/thumbnail', async (request, reply) => {
    const person = getPerson(db, request.params.id);
    if (!person?.thumbnail_path || !existsSync(person.thumbnail_path)) {
      return reply.code(404).send({ error: 'Person thumbnail not found' });
    }
    reply.header('Cache-Control', 'private, max-age=3600');
    return reply.type('image/jpeg').send(createReadStream(person.thumbnail_path));
  });

  app.get<{ Params: { id: string } }>('/api/people/:id/statistics', async (request) => {
    const count = (
      db.prepare('SELECT COUNT(DISTINCT asset_id) AS count FROM faces WHERE person_id = ?').get(request.params.id) as {
        count: number;
      }
    ).count;
    return { assets: count };
  });

  app.get<{ Params: { id: string } }>('/api/people/:id', async (request, reply) => {
    const person = getPerson(db, request.params.id);
    return person ? personResponse(person) : reply.code(404).send({ error: 'Person not found' });
  });

  app.put<{
    Params: { id: string };
    Body: {
      birthDate?: string | null;
      color?: string | null;
      featureFaceAssetId?: string;
      isFavorite?: boolean;
      isHidden?: boolean;
      name?: string;
    };
  }>('/api/people/:id', async (request, reply) => {
    const person = updatePerson(db, request.params.id, {
      birthDate: request.body.birthDate,
      color: request.body.color,
      featureFaceAssetId:
        request.body.featureFaceAssetId === undefined
          ? undefined
          : parseAssetId(request.body.featureFaceAssetId),
      isFavorite: request.body.isFavorite,
      isHidden: request.body.isHidden,
      name: request.body.name,
    });
    return person ? personResponse(person) : reply.code(404).send({ error: 'Person not found' });
  });

  app.delete('/api/people', async () => '');
  app.get('/api/memories', async () => []);
  app.get<{ Querystring: { isFavorite?: string } }>('/api/map/markers', async (request) => {
    const favoriteCondition = request.query.isFavorite === 'true' ? 'AND is_favorite = 1' : '';
    const rows = db
      .prepare(
        `SELECT id, latitude AS lat, longitude AS lon, city, country, state
         FROM assets
         WHERE is_motion_part = 0
           AND is_trashed = 0 AND latitude IS NOT NULL AND longitude IS NOT NULL ${favoriteCondition}
         ORDER BY taken_at DESC`,
      )
      .all() as unknown as Array<{
      city: string | null;
      country: string | null;
      id: number;
      lat: number;
      lon: number;
      state: string | null;
    }>;
    return rows.map((row) => ({
      city: row.city,
      country: row.country,
      id: toAssetId(row.id),
      lat: row.lat,
      lon: row.lon,
      state: row.state,
    }));
  });
  app.get('/api/search/explore', async () => {
    const visibleImages = `
      kind = 'image'
      AND is_motion_part = 0
      AND is_trashed = 0
      AND is_archived = 0
      AND visibility = 'timeline'
    `;
    const places = db
      .prepare(
        `SELECT * FROM assets
         WHERE ${visibleImages} AND city IS NOT NULL AND TRIM(city) <> ''
         GROUP BY city
         ORDER BY MAX(taken_at) DESC
         LIMIT 12`,
      )
      .all() as unknown as AssetRecord[];
    const recents = db
      .prepare(
        `SELECT * FROM assets
         WHERE ${visibleImages}
         ORDER BY created_at DESC, id DESC
         LIMIT 12`,
      )
      .all() as unknown as AssetRecord[];
    return [
      {
        fieldName: 'exifInfo.city',
        items: places.map((asset) => ({
          value: asset.city!,
          data: assetResponse(db, asset),
        })),
      },
      {
        fieldName: 'createdAt',
        items: recents.map((asset) => ({
          value: asset.created_at,
          data: assetResponse(db, asset),
        })),
      },
    ];
  });
  app.get('/api/search/metadata', async () => ({ items: [], total: 0 }));
  app.get('/api/search/random', async () => []);
  app.post('/api/search/random', async () => []);
  app.get<{ Querystring: { name?: string } }>('/api/search/person', async (request) =>
    listPeople(db, { name: request.query.name, withHidden: true }).map(personResponse),
  );
  app.get('/api/search/places', async () => []);
  app.get<{
    Querystring: {
      type?: string;
      make?: string;
      model?: string;
      country?: string;
      state?: string;
    };
  }>('/api/search/suggestions', async (request) => {
    const columns: Record<string, string> = {
      city: 'city',
      country: 'country',
      state: 'state',
      'camera-make': 'make',
      'camera-model': 'model',
      'camera-lens-model': 'lens_model',
    };
    const column = columns[request.query.type ?? ''];
    if (!column) {
      return [];
    }

    const conditions = [
      'is_motion_part = 0',
      'is_trashed = 0',
      `COALESCE(TRIM(${column}), '') <> ''`,
    ];
    const parameters: string[] = [];
    const filter = (name: string, value: string | undefined) => {
      if (value) {
        conditions.push(`${name} = ?`);
        parameters.push(value);
      }
    };
    filter('make', request.query.make);
    filter('model', request.query.model);
    filter('country', request.query.country);
    filter('state', request.query.state);

    const values = (
      db
        .prepare(
          `SELECT DISTINCT TRIM(${column}) AS value
           FROM assets
           WHERE ${conditions.join(' AND ')}
           ORDER BY value COLLATE NOCASE
           LIMIT 200`,
        )
        .all(...parameters) as unknown as Array<{ value: string }>
    ).map((row) => row.value);
    return values.filter(
      (value, index) => values.findIndex((item) => item.toLowerCase() === value.toLowerCase()) === index,
    );
  });
  app.get('/api/memories/statistics', async () => ({ total: 0 }));
  app.get('/api/api-keys', async () => []);
  app.get('/api/api-keys/me', async () => []);
  app.get('/api/sessions', async () => []);
  app.delete('/api/sessions', async () => '');
  app.get<{ Querystring: { path?: string } }>('/api/view/folder', async (request) => {
    if (!request.query.path) {
      return [];
    }
    const rows = db
      .prepare(
        'SELECT * FROM assets WHERE is_motion_part = 0 AND is_trashed = 0 ORDER BY taken_at DESC, id DESC',
      )
      .all() as unknown as AssetRecord[];
    return rows
      .filter((asset) => path.dirname(asset.path).toLowerCase() === path.resolve(request.query.path!).toLowerCase())
      .map((asset) => assetResponse(db, asset));
  });
  app.get('/api/view/folder/unique-paths', async () => {
    const rows = db
      .prepare('SELECT DISTINCT path FROM assets WHERE is_motion_part = 0 AND is_trashed = 0')
      .all() as unknown as Array<{ path: string }>;
    return [...new Set(rows.map((row) => path.dirname(row.path)))].sort((a, b) => a.localeCompare(b, 'en'));
  });
  app.get('/api/notifications', async () => []);
  app.put('/api/notifications', async () => '');
  app.get('/api/cluster-groups/:id/users', async () => [
    {
      avatarColor: localUser.avatarColor,
      email: localUser.email,
      id: localUser.id,
      name: localUser.name,
      profileChangedAt: localUser.profileChangedAt,
      profileImagePath: localUser.profileImagePath,
    },
  ]);

  app.post('/api/auth/logout', async () => ({ redirectUri: '/' }));
}
