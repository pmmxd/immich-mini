import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export type AssetKind = 'image' | 'video';
export type AssetOrientation = 'landscape' | 'portrait' | 'square';
export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed';
export const MOTION_ASSET_ID_BASE = 1_000_000_000_000;

export interface AssetRecord {
  id: number;
  library_id: number;
  path: string;
  name: string;
  kind: AssetKind;
  mime: string;
  bytes: number;
  width: number | null;
  height: number | null;
  orientation: AssetOrientation | null;
  taken_at: string;
  duration_ms: number | null;
  latitude: number | null;
  longitude: number | null;
  make: string | null;
  model: string | null;
  lens_model: string | null;
  city: string | null;
  country: string | null;
  state: string | null;
  rating: number | null;
  description: string | null;
  is_favorite: number;
  is_archived: number;
  is_trashed: number;
  visibility: 'timeline' | 'archive' | 'hidden' | 'locked';
  thumbnail_path: string | null;
  thumbnail_status: 'pending' | 'ready' | 'failed';
  live_photo_video_id: number | null;
  motion_content_identifier: string | null;
  is_motion_part: number;
  fingerprint: string;
  created_at: string;
  updated_at: string;
}

export interface JobRecord {
  id: number;
  type: 'scan';
  payload: string;
  status: JobStatus;
  progress: number;
  total: number;
  message: string | null;
  error: string | null;
  attempts: number;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface AssetUpsert {
  libraryId: number;
  path: string;
  name: string;
  kind: AssetKind;
  mime: string;
  bytes: number;
  width: number | null;
  height: number | null;
  orientation: AssetOrientation | null;
  takenAt: string;
  durationMs: number | null;
  latitude: number | null;
  longitude: number | null;
  make: string | null;
  model: string | null;
  lensModel: string | null;
  rating: number | null;
  description: string | null;
  city: string | null;
  country: string | null;
  state: string | null;
  contentIdentifier: string | null;
  fingerprint: string;
}

export interface MotionVideoUpsert {
  sourceAssetId: number;
  path: string;
  name: string;
  mime: string;
  bytes: number;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  fingerprint: string;
}

export interface AssetPage {
  items: AssetRecord[];
  total: number;
  nextOffset: number | null;
}

export interface AssetSearchOptions {
  albumIds?: string[] | undefined;
  tagIds?: string[] | undefined;
  personIds?: string[] | undefined;
  kind?: AssetKind | undefined;
  query?: string | undefined;
  pathQuery?: string | undefined;
  minSize?: number | undefined;
  maxSize?: number | undefined;
  takenAfter?: string | undefined;
  takenBefore?: string | undefined;
  favorite?: boolean | undefined;
  minRating?: number | undefined;
  city?: string | undefined;
  make?: string | undefined;
  model?: string | undefined;
  lensModel?: string | undefined;
  trashed?: boolean | undefined;
  visibility?: 'timeline' | 'archive' | 'hidden' | 'locked' | undefined;
  sort: 'date' | 'name' | 'size' | 'rating';
  order: 'asc' | 'desc';
  limit: number;
  offset: number;
}

export interface AlbumRecord {
  id: string;
  album_name: string;
  description: string;
  album_thumbnail_asset_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface TagRecord {
  id: string;
  name: string;
  value: string;
  color: string | null;
  parent_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface PersonRecord {
  id: string;
  name: string;
  birth_date: string | null;
  color: string | null;
  is_favorite: number;
  is_hidden: number;
  thumbnail_path: string | null;
  created_at: string;
  updated_at: string;
}

export interface FaceJobRecord {
  id: number;
  asset_id: number;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  attempts: number;
  error: string | null;
}

const SCHEMA = `
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;
  PRAGMA temp_store = MEMORY;

  CREATE TABLE IF NOT EXISTS libraries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT NOT NULL COLLATE NOCASE UNIQUE,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    library_id INTEGER NOT NULL REFERENCES libraries(id),
    path TEXT NOT NULL COLLATE NOCASE UNIQUE,
    name TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('image', 'video')),
    mime TEXT NOT NULL,
    bytes INTEGER NOT NULL,
    width INTEGER,
    height INTEGER,
    orientation TEXT CHECK (orientation IN ('landscape', 'portrait', 'square')),
    taken_at TEXT NOT NULL,
    duration_ms INTEGER,
    latitude REAL,
    longitude REAL,
    make TEXT,
    model TEXT,
    lens_model TEXT,
    city TEXT,
    country TEXT,
    state TEXT,
    rating INTEGER,
    description TEXT,
    is_favorite INTEGER NOT NULL DEFAULT 0,
    is_archived INTEGER NOT NULL DEFAULT 0,
    is_trashed INTEGER NOT NULL DEFAULT 0,
    visibility TEXT NOT NULL DEFAULT 'timeline',
    thumbnail_path TEXT,
    thumbnail_status TEXT NOT NULL DEFAULT 'pending'
      CHECK (thumbnail_status IN ('pending', 'ready', 'failed')),
    live_photo_video_id INTEGER,
    motion_content_identifier TEXT,
    is_motion_part INTEGER NOT NULL DEFAULT 0,
    fingerprint TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS assets_timeline
    ON assets(taken_at DESC, id DESC);
  CREATE INDEX IF NOT EXISTS assets_kind
    ON assets(kind, taken_at DESC, id DESC);
  CREATE INDEX IF NOT EXISTS assets_library
    ON assets(library_id);

  CREATE TABLE IF NOT EXISTS motion_videos (
    asset_id INTEGER PRIMARY KEY,
    source_asset_id INTEGER NOT NULL UNIQUE REFERENCES assets(id) ON DELETE CASCADE,
    path TEXT NOT NULL,
    name TEXT NOT NULL,
    mime TEXT NOT NULL,
    bytes INTEGER NOT NULL,
    width INTEGER,
    height INTEGER,
    duration_ms INTEGER,
    fingerprint TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK (type = 'scan'),
    payload TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued'
      CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
    progress INTEGER NOT NULL DEFAULT 0,
    total INTEGER NOT NULL DEFAULT 0,
    message TEXT,
    error TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    started_at TEXT,
    finished_at TEXT
  );

  CREATE INDEX IF NOT EXISTS jobs_queue
    ON jobs(status, id);

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS albums (
    id TEXT PRIMARY KEY,
    album_name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    album_thumbnail_asset_id INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS album_assets (
    album_id TEXT NOT NULL REFERENCES albums(id),
    asset_id INTEGER NOT NULL REFERENCES assets(id),
    added_at TEXT NOT NULL,
    PRIMARY KEY (album_id, asset_id)
  );
  CREATE INDEX IF NOT EXISTS album_assets_asset
    ON album_assets(asset_id);

  CREATE TABLE IF NOT EXISTS tags (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL COLLATE NOCASE UNIQUE,
    value TEXT NOT NULL COLLATE NOCASE UNIQUE,
    color TEXT,
    parent_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS asset_tags (
    asset_id INTEGER NOT NULL REFERENCES assets(id),
    tag_id TEXT NOT NULL REFERENCES tags(id),
    PRIMARY KEY (asset_id, tag_id)
  );

  CREATE TABLE IF NOT EXISTS people (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL DEFAULT '',
    birth_date TEXT,
    color TEXT,
    is_favorite INTEGER NOT NULL DEFAULT 0,
    is_hidden INTEGER NOT NULL DEFAULT 0,
    thumbnail_path TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS faces (
    id TEXT PRIMARY KEY,
    asset_id INTEGER NOT NULL REFERENCES assets(id),
    person_id TEXT NOT NULL REFERENCES people(id),
    x1 REAL NOT NULL,
    y1 REAL NOT NULL,
    x2 REAL NOT NULL,
    y2 REAL NOT NULL,
    score REAL NOT NULL,
    embedding BLOB NOT NULL,
    crop_path TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS faces_asset
    ON faces(asset_id);

  CREATE TABLE IF NOT EXISTS person_anchors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    person_id TEXT NOT NULL REFERENCES people(id),
    embedding BLOB NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS person_anchors_person
    ON person_anchors(person_id);

  CREATE TABLE IF NOT EXISTS face_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_id INTEGER NOT NULL UNIQUE REFERENCES assets(id),
    status TEXT NOT NULL DEFAULT 'queued'
      CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
    attempts INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    created_at TEXT NOT NULL,
    started_at TEXT,
    finished_at TEXT
  );
`;

function ensureColumn(db: DatabaseSync, table: string, column: string, definition: string): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as unknown as Array<{ name: string }>;
  if (!columns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function repairPersonThumbnails(db: DatabaseSync): void {
  db.prepare(
    `UPDATE people
     SET thumbnail_path = (
       SELECT crop_path FROM faces
       WHERE person_id = people.id AND crop_path IS NOT NULL
       ORDER BY created_at
       LIMIT 1
     ), updated_at = ?
     WHERE thumbnail_path IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM faces
         WHERE person_id = people.id AND crop_path = people.thumbnail_path
       )`,
  ).run(new Date().toISOString());
}

export function openDatabase(dataDir: string): DatabaseSync {
  mkdirSync(dataDir, { recursive: true });
  const databasePath = path.join(dataDir, 'immich-mini.db');
  const db = new DatabaseSync(databasePath);
  db.exec(SCHEMA);
  ensureColumn(db, 'assets', 'rating', 'INTEGER');
  ensureColumn(db, 'assets', 'description', 'TEXT');
  ensureColumn(db, 'assets', 'is_favorite', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'assets', 'is_archived', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'assets', 'is_trashed', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'assets', 'visibility', "TEXT NOT NULL DEFAULT 'timeline'");
  ensureColumn(db, 'assets', 'make', 'TEXT');
  ensureColumn(db, 'assets', 'model', 'TEXT');
  ensureColumn(db, 'assets', 'lens_model', 'TEXT');
  ensureColumn(db, 'assets', 'city', 'TEXT');
  ensureColumn(db, 'assets', 'country', 'TEXT');
  ensureColumn(db, 'assets', 'state', 'TEXT');
  ensureColumn(db, 'assets', 'live_photo_video_id', 'INTEGER');
  ensureColumn(db, 'assets', 'motion_content_identifier', 'TEXT');
  ensureColumn(db, 'assets', 'is_motion_part', 'INTEGER NOT NULL DEFAULT 0');
  db.exec('CREATE INDEX IF NOT EXISTS assets_motion_content ON assets(motion_content_identifier)');
  repairPersonThumbnails(db);
  db.prepare(`UPDATE face_jobs SET status = 'queued' WHERE status = 'running'`).run();
  db.prepare(
    `UPDATE jobs
     SET status = CASE WHEN attempts < 3 THEN 'queued' ELSE 'failed' END,
         message = CASE WHEN attempts < 3 THEN 'Recovered after restart' ELSE message END,
         error = CASE WHEN attempts >= 3 THEN 'Interrupted too many times' ELSE error END,
         finished_at = CASE WHEN attempts >= 3 THEN ? ELSE finished_at END
     WHERE status = 'running'`,
  ).run(new Date().toISOString());
  return db;
}

export function getLibrary(db: DatabaseSync, libraryPath: string): { id: number; path: string } | undefined {
  const normalized = path.resolve(libraryPath);
  db.prepare(
    `INSERT INTO libraries(path, created_at)
     VALUES (?, ?)
     ON CONFLICT(path) DO NOTHING`,
  ).run(normalized, new Date().toISOString());
  return db.prepare('SELECT id, path FROM libraries WHERE path = ?').get(normalized) as
    | { id: number; path: string }
    | undefined;
}

export function listLibraries(
  db: DatabaseSync,
): Array<{ id: number; path: string; created_at: string; asset_count: number }> {
  return db
    .prepare(
      `SELECT l.id, l.path, l.created_at, COUNT(a.id) AS asset_count
       FROM libraries l
       LEFT JOIN assets a ON a.library_id = l.id AND a.is_motion_part = 0
       GROUP BY l.id
       ORDER BY l.created_at, l.id`,
    )
    .all() as unknown as Array<{
    id: number;
    path: string;
    created_at: string;
    asset_count: number;
  }>;
}

export function hasActiveLibraryJob(db: DatabaseSync, libraryId: number): boolean {
  return (
    db
      .prepare(
        `SELECT 1
         FROM jobs
         WHERE type = 'scan'
           AND status IN ('queued', 'running')
           AND json_extract(payload, '$.libraryId') = ?
         LIMIT 1`,
      )
      .get(libraryId) !== undefined
  );
}

export function deleteLibrary(
  db: DatabaseSync,
  libraryId: number,
): { removedAssetCount: number } | undefined {
  const library = db.prepare('SELECT id FROM libraries WHERE id = ?').get(libraryId);
  if (!library) {
    return;
  }

  const assetIds = (
    db.prepare('SELECT id FROM assets WHERE library_id = ?').all(libraryId) as unknown as Array<{
      id: number;
    }>
  ).map((row) => row.id);

  db.exec('BEGIN IMMEDIATE');
  try {
    deleteAssetRecordsInTransaction(db, assetIds);
    db.prepare(
      `DELETE FROM jobs
       WHERE type = 'scan' AND json_extract(payload, '$.libraryId') = ?`,
    ).run(libraryId);
    db.prepare('DELETE FROM libraries WHERE id = ?').run(libraryId);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  return { removedAssetCount: assetIds.length };
}

export function enqueueScan(
  db: DatabaseSync,
  libraryId: number,
  libraryPath: string,
  queueIfRunning = false,
): JobRecord {
  const payload = JSON.stringify({ libraryId, path: libraryPath });
  const queued = db
    .prepare(
      `SELECT * FROM jobs
       WHERE type = 'scan' AND payload = ? AND status = 'queued'
       ORDER BY id DESC LIMIT 1`,
    )
    .get(payload) as JobRecord | undefined;
  if (queued) {
    return queued;
  }
  if (!queueIfRunning) {
    const running = db
      .prepare(
        `SELECT * FROM jobs
         WHERE type = 'scan' AND payload = ? AND status = 'running'
         ORDER BY id DESC LIMIT 1`,
      )
      .get(payload) as JobRecord | undefined;
    if (running) {
      return running;
    }
  }

  const result = db
    .prepare(`INSERT INTO jobs(type, payload, created_at) VALUES ('scan', ?, ?)`)
    .run(payload, new Date().toISOString());
  return getJob(db, Number(result.lastInsertRowid))!;
}

export function claimNextJob(db: DatabaseSync): JobRecord | undefined {
  const next = db.prepare(`SELECT id FROM jobs WHERE status = 'queued' ORDER BY id LIMIT 1`).get() as
    | { id: number }
    | undefined;
  if (!next) {
    return undefined;
  }

  const claimed = db
    .prepare(
      `UPDATE jobs
       SET status = 'running', started_at = ?, finished_at = NULL, error = NULL,
           attempts = attempts + 1, progress = 0, message = 'Starting scan'
       WHERE id = ? AND status = 'queued'`,
    )
    .run(new Date().toISOString(), next.id);
  return claimed.changes === 1 ? getJob(db, next.id) : undefined;
}

export function getJob(db: DatabaseSync, id: number): JobRecord | undefined {
  return db.prepare('SELECT * FROM jobs WHERE id = ?').get(id) as JobRecord | undefined;
}

export function updateJobProgress(
  db: DatabaseSync,
  id: number,
  progress: number,
  total: number,
  message: string,
): void {
  db.prepare('UPDATE jobs SET progress = ?, total = ?, message = ? WHERE id = ?').run(
    progress,
    total,
    message,
    id,
  );
}

export function completeJob(db: DatabaseSync, id: number, message: string): void {
  db.prepare(
    `UPDATE jobs
     SET status = 'succeeded', progress = total, message = ?, finished_at = ?
     WHERE id = ?`,
  ).run(message, new Date().toISOString(), id);
}

export function failJob(db: DatabaseSync, id: number, error: string): void {
  db.prepare(
    `UPDATE jobs
     SET status = 'failed', error = ?, message = 'Scan failed', finished_at = ?
     WHERE id = ?`,
  ).run(error.slice(0, 2_000), new Date().toISOString(), id);
}

export function upsertAsset(db: DatabaseSync, asset: AssetUpsert): AssetRecord {
  const now = new Date().toISOString();
  const existing = db
    .prepare('SELECT thumbnail_path, thumbnail_status, fingerprint FROM assets WHERE path = ?')
    .get(asset.path) as
    | Pick<AssetRecord, 'thumbnail_path' | 'thumbnail_status' | 'fingerprint'>
    | undefined;
  const keepThumbnail =
    existing?.fingerprint === asset.fingerprint &&
    existing.thumbnail_status === 'ready' &&
    existing.thumbnail_path
      ? existing.thumbnail_path
      : null;

  return db
    .prepare(
      `INSERT INTO assets(
         library_id, path, name, kind, mime, bytes, width, height,
         make, model, lens_model, city, country, state, orientation,
         taken_at, duration_ms, latitude, longitude, rating, description,
         thumbnail_path, thumbnail_status,
         motion_content_identifier, fingerprint, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(path) DO UPDATE SET
         library_id = excluded.library_id,
         name = excluded.name,
         kind = excluded.kind,
         mime = excluded.mime,
         bytes = excluded.bytes,
         width = excluded.width,
         height = excluded.height,
         make = excluded.make,
         model = excluded.model,
         lens_model = excluded.lens_model,
         city = excluded.city,
         country = excluded.country,
         state = excluded.state,
         orientation = excluded.orientation,
         taken_at = excluded.taken_at,
         duration_ms = excluded.duration_ms,
         latitude = excluded.latitude,
         longitude = excluded.longitude,
         rating = CASE
           WHEN assets.fingerprint <> excluded.fingerprint OR assets.rating IS NULL
             THEN excluded.rating
           ELSE assets.rating
         END,
         description = CASE
           WHEN assets.fingerprint <> excluded.fingerprint
             OR assets.description IS NULL
             OR TRIM(assets.description) = ''
             THEN excluded.description
           ELSE assets.description
         END,
         thumbnail_path = excluded.thumbnail_path,
         thumbnail_status = excluded.thumbnail_status,
         motion_content_identifier = excluded.motion_content_identifier,
         fingerprint = excluded.fingerprint,
         updated_at = excluded.updated_at
       RETURNING *`,
    )
    .get(
      asset.libraryId,
      asset.path,
      asset.name,
      asset.kind,
      asset.mime,
      asset.bytes,
      asset.width,
      asset.height,
      asset.make,
      asset.model,
      asset.lensModel,
      asset.city,
      asset.country,
      asset.state,
      asset.orientation,
      asset.takenAt,
      asset.durationMs,
      asset.latitude,
      asset.longitude,
      asset.rating,
      asset.description,
      keepThumbnail,
      keepThumbnail ? 'ready' : 'pending',
      asset.contentIdentifier,
      asset.fingerprint,
      now,
      now,
    ) as unknown as AssetRecord;
}

export function setAssetThumbnail(
  db: DatabaseSync,
  id: number,
  thumbnailPath: string | null,
  status: 'ready' | 'failed',
): void {
  db.prepare('UPDATE assets SET thumbnail_path = ?, thumbnail_status = ?, updated_at = ? WHERE id = ?').run(
    thumbnailPath,
    status,
    new Date().toISOString(),
    id,
  );
}

export function getAsset(db: DatabaseSync, id: number): AssetRecord | undefined {
  const asset = db.prepare('SELECT * FROM assets WHERE id = ?').get(id) as AssetRecord | undefined;
  if (asset || id < MOTION_ASSET_ID_BASE) {
    return asset;
  }

  const row = db
    .prepare(
      `SELECT m.*, a.library_id, a.taken_at, a.latitude, a.longitude,
              a.make, a.model, a.lens_model, a.city, a.country, a.state
       FROM motion_videos m
       INNER JOIN assets a ON a.id = m.source_asset_id
       WHERE m.asset_id = ?`,
    )
    .get(id) as
    | {
        asset_id: number;
        source_asset_id: number;
        path: string;
        name: string;
        mime: string;
        bytes: number;
        width: number | null;
        height: number | null;
        duration_ms: number | null;
        fingerprint: string;
        created_at: string;
        updated_at: string;
        library_id: number;
        taken_at: string;
        latitude: number | null;
        longitude: number | null;
        make: string | null;
        model: string | null;
        lens_model: string | null;
        city: string | null;
        country: string | null;
        state: string | null;
      }
    | undefined;
  if (!row) {
    return;
  }

  const orientation: AssetOrientation | null =
    !row.width || !row.height
      ? null
      : row.width === row.height
        ? 'square'
        : row.width > row.height
          ? 'landscape'
          : 'portrait';
  return {
    id: row.asset_id,
    library_id: row.library_id,
    path: row.path,
    name: row.name,
    kind: 'video',
    mime: row.mime,
    bytes: row.bytes,
    width: row.width,
    height: row.height,
    orientation,
    taken_at: row.taken_at,
    duration_ms: row.duration_ms,
    latitude: row.latitude,
    longitude: row.longitude,
    make: row.make,
    model: row.model,
    lens_model: row.lens_model,
    city: row.city,
    country: row.country,
    state: row.state,
    rating: null,
    description: null,
    is_favorite: 0,
    is_archived: 0,
    is_trashed: 0,
    visibility: 'timeline',
    thumbnail_path: null,
    thumbnail_status: 'ready',
    live_photo_video_id: null,
    motion_content_identifier: null,
    is_motion_part: 1,
    fingerprint: row.fingerprint,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function saveMotionVideo(db: DatabaseSync, video: MotionVideoUpsert): number {
  const assetId = MOTION_ASSET_ID_BASE + video.sourceAssetId;
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO motion_videos(
       asset_id, source_asset_id, path, name, mime, bytes, width, height,
       duration_ms, fingerprint, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(source_asset_id) DO UPDATE SET
       path = excluded.path,
       name = excluded.name,
       mime = excluded.mime,
       bytes = excluded.bytes,
       width = excluded.width,
       height = excluded.height,
       duration_ms = excluded.duration_ms,
       fingerprint = excluded.fingerprint,
       updated_at = excluded.updated_at`,
  ).run(
    assetId,
    video.sourceAssetId,
    video.path,
    video.name,
    video.mime,
    video.bytes,
    video.width,
    video.height,
    video.durationMs,
    video.fingerprint,
    now,
    now,
  );
  return assetId;
}

export function resetMotionLinks(db: DatabaseSync, libraryId: number): void {
  db.prepare(
    `UPDATE assets
     SET live_photo_video_id = NULL, is_motion_part = 0, updated_at = ?
     WHERE library_id = ?`,
  ).run(new Date().toISOString(), libraryId);
  db.prepare(
    `DELETE FROM motion_videos
     WHERE source_asset_id IN (SELECT id FROM assets WHERE library_id = ?)`,
  ).run(libraryId);
}

export function linkMotionVideo(
  db: DatabaseSync,
  imageAssetId: number,
  videoAssetId: number,
): boolean {
  const image = getAsset(db, imageAssetId);
  const video = getAsset(db, videoAssetId);
  if (!image || image.kind !== 'image' || !video || video.kind !== 'video' || image.id === video.id) {
    return false;
  }

  const now = new Date().toISOString();
  if (image.live_photo_video_id && image.live_photo_video_id < MOTION_ASSET_ID_BASE) {
    db.prepare(
      `UPDATE assets
       SET is_motion_part = 0, updated_at = ?
       WHERE id = ?
         AND NOT EXISTS (
           SELECT 1 FROM assets
           WHERE live_photo_video_id = ? AND id <> ?
         )`,
    ).run(now, image.live_photo_video_id, image.live_photo_video_id, imageAssetId);
  }
  db.prepare(
    `UPDATE assets
     SET live_photo_video_id = ?, updated_at = ?
     WHERE id = ?`,
  ).run(videoAssetId, now, imageAssetId);
  if (videoAssetId < MOTION_ASSET_ID_BASE) {
    db.prepare('UPDATE assets SET is_motion_part = 1, updated_at = ? WHERE id = ?').run(
      now,
      videoAssetId,
    );
  }
  return true;
}

export function unlinkMotionVideo(db: DatabaseSync, imageAssetId: number): boolean {
  const image = getAsset(db, imageAssetId);
  if (!image || image.kind !== 'image' || !image.live_photo_video_id) {
    return false;
  }
  const now = new Date().toISOString();
  if (image.live_photo_video_id < MOTION_ASSET_ID_BASE) {
    db.prepare(
      `UPDATE assets
       SET is_motion_part = 0, updated_at = ?
       WHERE id = ?
         AND NOT EXISTS (
           SELECT 1 FROM assets
           WHERE live_photo_video_id = ? AND id <> ?
         )`,
    ).run(now, image.live_photo_video_id, image.live_photo_video_id, imageAssetId);
  }
  db.prepare('UPDATE assets SET live_photo_video_id = NULL, updated_at = ? WHERE id = ?').run(
    now,
    imageAssetId,
  );
  return true;
}

export function listAssets(db: DatabaseSync, limit: number, offset: number, kind?: AssetKind): AssetPage {
  const where = kind ? 'WHERE is_motion_part = 0 AND kind = ?' : 'WHERE is_motion_part = 0';
  const args = kind ? [kind, limit + 1, offset] : [limit + 1, offset];
  const rows = db
    .prepare(`SELECT * FROM assets ${where} ORDER BY taken_at DESC, id DESC LIMIT ? OFFSET ?`)
    .all(...args) as unknown as AssetRecord[];
  const total = (db.prepare(`SELECT COUNT(*) AS count FROM assets ${where}`).get(...(kind ? [kind] : [])) as {
    count: number;
  }).count;
  const hasMore = rows.length > limit;
  return {
    items: rows.slice(0, limit),
    total,
    nextOffset: hasMore ? offset + limit : null,
  };
}

export function getAssetSummary(db: DatabaseSync): {
  total: number;
  images: number;
  videos: number;
  missingThumbnails: number;
} {
  const rows = db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(kind = 'image') AS images,
         SUM(kind = 'video') AS videos,
         SUM(thumbnail_status != 'ready') AS missing_thumbnails
       FROM assets
       WHERE is_motion_part = 0
         AND is_trashed = 0 AND is_archived = 0 AND visibility = 'timeline'`,
    )
    .get() as { total: number; images: number | null; videos: number | null; missing_thumbnails: number | null };
  return {
    total: rows.total,
    images: rows.images ?? 0,
    videos: rows.videos ?? 0,
    missingThumbnails: rows.missing_thumbnails ?? 0,
  };
}

export function listTimelineBuckets(
  db: DatabaseSync,
  albumId?: string,
  tagId?: string,
  personId?: string,
  isFavorite?: boolean,
  isTrashed?: boolean,
  visibility?: 'timeline' | 'archive' | 'hidden' | 'locked',
): Array<{ timeBucket: string; count: number }> {
  const conditions = ['is_motion_part = 0'];
  const parameters: string[] = [];
  if (albumId) {
    conditions.push('id IN (SELECT asset_id FROM album_assets WHERE album_id = ?)');
    parameters.push(albumId);
  }
  if (tagId) {
    conditions.push('id IN (SELECT asset_id FROM asset_tags WHERE tag_id = ?)');
    parameters.push(tagId);
  }
  if (personId) {
    conditions.push('id IN (SELECT asset_id FROM faces WHERE person_id = ?)');
    parameters.push(personId);
  }
  conditions.push(isTrashed ? 'is_trashed = 1' : 'is_trashed = 0');
  if (!isTrashed) {
    if (visibility === 'archive') {
      conditions.push('is_archived = 1');
    } else {
      conditions.push('is_archived = 0');
      conditions.push('visibility = ?');
      parameters.push(visibility ?? 'timeline');
    }
  }
  if (isFavorite) {
    conditions.push('is_favorite = 1');
  }
  const rows = db
    .prepare(
      `SELECT strftime('%Y-%m', taken_at, 'localtime') AS month, COUNT(*) AS count
       FROM assets
       WHERE ${conditions.join(' AND ')}
       GROUP BY month
       ORDER BY month DESC`,
    )
    .all(...parameters) as unknown as Array<{
    month: string;
    count: number;
  }>;
  return rows.map((row) => ({ timeBucket: `${row.month}-01`, count: row.count }));
}

export function listTimelineAssets(
  db: DatabaseSync,
  timeBucket: string,
  albumId?: string,
  tagId?: string,
  personId?: string,
  isFavorite?: boolean,
  isTrashed?: boolean,
  visibility?: 'timeline' | 'archive' | 'hidden' | 'locked',
): AssetRecord[] {
  const month = timeBucket.slice(0, 7);
  const conditions = [
    'is_motion_part = 0',
    `strftime('%Y-%m', taken_at, 'localtime') = ?`,
  ];
  const parameters: string[] = [month];
  if (albumId) {
    conditions.push('id IN (SELECT asset_id FROM album_assets WHERE album_id = ?)');
    parameters.push(albumId);
  }
  if (tagId) {
    conditions.push('id IN (SELECT asset_id FROM asset_tags WHERE tag_id = ?)');
    parameters.push(tagId);
  }
  if (personId) {
    conditions.push('id IN (SELECT asset_id FROM faces WHERE person_id = ?)');
    parameters.push(personId);
  }
  conditions.push(isTrashed ? 'is_trashed = 1' : 'is_trashed = 0');
  if (!isTrashed) {
    if (visibility === 'archive') {
      conditions.push('is_archived = 1');
    } else {
      conditions.push('is_archived = 0');
      conditions.push('visibility = ?');
      parameters.push(visibility ?? 'timeline');
    }
  }
  if (isFavorite) {
    conditions.push('is_favorite = 1');
  }
  return db
    .prepare(
      `SELECT * FROM assets
       WHERE ${conditions.join(' AND ')}
       ORDER BY taken_at DESC, id DESC`,
    )
    .all(...parameters) as unknown as AssetRecord[];
}

export function searchAssets(
  db: DatabaseSync,
  options: AssetSearchOptions,
): { items: AssetRecord[]; total: number; nextOffset: number | null } {
  const conditions: string[] = ['is_motion_part = 0'];
  const parameters: Array<string | number> = [];
  if (options.albumIds?.length) {
    conditions.push(
      `id IN (SELECT asset_id FROM album_assets WHERE album_id IN (${options.albumIds
        .map(() => '?')
        .join(', ')}))`,
    );
    parameters.push(...options.albumIds);
  }
  if (options.tagIds?.length) {
    conditions.push(
      `id IN (SELECT asset_id FROM asset_tags WHERE tag_id IN (${options.tagIds
        .map(() => '?')
        .join(', ')}))`,
    );
    parameters.push(...options.tagIds);
  }
  if (options.personIds?.length) {
    conditions.push(
      `id IN (SELECT asset_id FROM faces WHERE person_id IN (${options.personIds
        .map(() => '?')
        .join(', ')}))`,
    );
    parameters.push(...options.personIds);
  }
  if (options.city) {
    conditions.push('city = ?');
    parameters.push(options.city);
  }
  if (options.make) {
    conditions.push('make = ?');
    parameters.push(options.make);
  }
  if (options.model) {
    conditions.push('model = ?');
    parameters.push(options.model);
  }
  if (options.lensModel) {
    conditions.push('lens_model = ?');
    parameters.push(options.lensModel);
  }
  conditions.push('is_trashed = ?');
  parameters.push(options.trashed === true ? 1 : 0);
  if (options.visibility === 'timeline') {
    conditions.push(`is_archived = 0 AND visibility = 'timeline'`);
  } else if (options.visibility === 'archive') {
    conditions.push('is_archived = 1');
  } else if (options.visibility) {
    conditions.push('visibility = ?');
    parameters.push(options.visibility);
  }
  if (options.kind) {
    conditions.push('kind = ?');
    parameters.push(options.kind);
  }
  if (options.query) {
    conditions.push('name LIKE ? ESCAPE \'\\\'');
    parameters.push(`%${options.query}%`);
  }
  if (options.pathQuery) {
    conditions.push('path LIKE ? ESCAPE \'\\\'');
    parameters.push(`%${options.pathQuery}%`);
  }
  if (options.minSize !== undefined) {
    conditions.push('bytes >= ?');
    parameters.push(options.minSize);
  }
  if (options.maxSize !== undefined) {
    conditions.push('bytes <= ?');
    parameters.push(options.maxSize);
  }
  if (options.takenAfter) {
    conditions.push('taken_at >= ?');
    parameters.push(options.takenAfter);
  }
  if (options.takenBefore) {
    conditions.push('taken_at <= ?');
    parameters.push(options.takenBefore);
  }
  if (options.favorite === true) {
    conditions.push('is_favorite = 1');
  }
  if (options.minRating !== undefined) {
    conditions.push('COALESCE(rating, 0) >= ?');
    parameters.push(options.minRating);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const field =
    options.sort === 'name'
      ? 'name COLLATE NOCASE'
      : options.sort === 'size'
        ? 'bytes'
        : options.sort === 'rating'
          ? 'COALESCE(rating, 0)'
          : 'taken_at';
  const order = options.order === 'asc' ? 'ASC' : 'DESC';
  const rows = db
    .prepare(`SELECT * FROM assets ${where} ORDER BY ${field} ${order}, id ${order} LIMIT ? OFFSET ?`)
    .all(...parameters, options.limit, options.offset) as unknown as AssetRecord[];
  const total = (
    db.prepare(`SELECT COUNT(*) AS count FROM assets ${where}`).get(...parameters) as { count: number }
  ).count;
  return {
    items: rows,
    total,
    nextOffset: options.offset + rows.length < total ? options.offset + rows.length : null,
  };
}

export interface AssetUpdate {
  isFavorite?: boolean | undefined;
  rating?: number | null | undefined;
  description?: string | null | undefined;
  latitude?: number | null | undefined;
  longitude?: number | null | undefined;
  takenAt?: string | undefined;
  visibility?: 'timeline' | 'archive' | 'hidden' | 'locked' | undefined;
}

export function updateAssets(db: DatabaseSync, ids: number[], update: AssetUpdate): void {
  const assignments: string[] = [];
  const parameters: Array<string | number | null> = [];
  if (update.isFavorite !== undefined) {
    assignments.push('is_favorite = ?');
    parameters.push(update.isFavorite ? 1 : 0);
  }
  if (update.rating !== undefined) {
    assignments.push('rating = ?');
    parameters.push(update.rating);
  }
  if (update.description !== undefined) {
    assignments.push('description = ?');
    parameters.push(update.description);
  }
  if (update.latitude !== undefined) {
    assignments.push('latitude = ?');
    parameters.push(update.latitude);
  }
  if (update.longitude !== undefined) {
    assignments.push('longitude = ?');
    parameters.push(update.longitude);
  }
  if (update.takenAt !== undefined) {
    assignments.push('taken_at = ?');
    parameters.push(update.takenAt);
  }
  if (update.visibility !== undefined) {
    assignments.push('visibility = ?');
    parameters.push(update.visibility);
    assignments.push('is_archived = ?');
    parameters.push(update.visibility === 'archive' ? 1 : 0);
  }
  if (assignments.length === 0) {
    return;
  }
  assignments.push('updated_at = ?');
  parameters.push(new Date().toISOString());
  const statement = db.prepare(`UPDATE assets SET ${assignments.join(', ')} WHERE id = ?`);
  db.exec('BEGIN');
  try {
    for (const id of ids) {
      statement.run(...parameters, id);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function setAssetsTrashed(db: DatabaseSync, ids: number[], trashed: boolean): void {
  const statement = db.prepare('UPDATE assets SET is_trashed = ?, updated_at = ? WHERE id = ?');
  const now = new Date().toISOString();
  db.exec('BEGIN');
  try {
    for (const id of ids) {
      statement.run(trashed ? 1 : 0, now, id);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function deleteAssetRecordsInTransaction(db: DatabaseSync, ids: number[]): number {
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length === 0) {
    return 0;
  }

  let removed = 0;
  const execute = <T>(stage: string, operation: () => T): T => {
    try {
      return operation();
    } catch (error) {
      throw new Error(
        `Asset cleanup failed (${stage}): ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  };
  for (let offset = 0; offset < uniqueIds.length; offset += 400) {
    const batch = uniqueIds.slice(offset, offset + 400);
    const parameters = batch.map(() => '?').join(',');
    execute('album assets', () =>
      db.prepare(`DELETE FROM album_assets WHERE asset_id IN (${parameters})`).run(...batch),
    );
    execute('album thumbnails', () =>
      db
        .prepare(
          `UPDATE albums
           SET album_thumbnail_asset_id = (
             SELECT asset_id FROM album_assets
             WHERE album_id = albums.id
             ORDER BY added_at, asset_id
             LIMIT 1
           ), updated_at = ?
           WHERE album_thumbnail_asset_id IN (${parameters})`,
        )
        .run(new Date().toISOString(), ...batch),
    );
    execute('face jobs', () =>
      db.prepare(`DELETE FROM face_jobs WHERE asset_id IN (${parameters})`).run(...batch),
    );
    execute('faces', () =>
      db.prepare(`DELETE FROM faces WHERE asset_id IN (${parameters})`).run(...batch),
    );
    execute('asset tags', () =>
      db.prepare(`DELETE FROM asset_tags WHERE asset_id IN (${parameters})`).run(...batch),
    );
    execute('motion owners', () =>
      db
        .prepare(
          `UPDATE assets
           SET is_motion_part = 0, updated_at = ?
           WHERE id IN (
             SELECT live_photo_video_id FROM assets
             WHERE id IN (${parameters}) AND live_photo_video_id IS NOT NULL
           )`,
        )
        .run(new Date().toISOString(), ...batch),
    );
    execute('motion links', () =>
      db
        .prepare(
          `UPDATE assets
           SET live_photo_video_id = NULL, updated_at = ?
           WHERE live_photo_video_id IN (${parameters})`,
        )
        .run(new Date().toISOString(), ...batch),
    );
    execute('motion videos', () =>
      db.prepare(`DELETE FROM motion_videos WHERE source_asset_id IN (${parameters})`).run(...batch),
    );
    removed += Number(
      execute('assets', () =>
        db.prepare(`DELETE FROM assets WHERE id IN (${parameters})`).run(...batch),
      ).changes,
    );
  }
  return removed;
}

export function deleteAssetRecords(db: DatabaseSync, ids: number[]): number {
  db.exec('BEGIN IMMEDIATE');
  try {
    const count = deleteAssetRecordsInTransaction(db, ids);
    db.exec('COMMIT');
    return count;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function deleteAssetsUnderDirectories(
  db: DatabaseSync,
  libraryId: number,
  directories: string[],
): number {
  if (directories.length === 0) {
    return 0;
  }
  const roots = directories.map((directory) => path.resolve(directory));
  const assets = db
    .prepare('SELECT id, path FROM assets WHERE library_id = ?')
    .all(libraryId) as unknown as Array<{ id: number; path: string }>;
  const ids = assets
    .filter((asset) =>
      roots.some((root) => {
        const relative = path.relative(root, asset.path);
        return (
          relative === '' ||
          (relative !== '..' &&
            !relative.startsWith(`..${path.sep}`) &&
            !path.isAbsolute(relative))
        );
      }),
    )
    .map((asset) => asset.id);
  return deleteAssetRecords(db, ids);
}

export function listAlbums(
  db: DatabaseSync,
  assetId?: number,
): Array<AlbumRecord & { asset_count: number; thumbnail_asset_id: number | null }> {
  const assetCondition = assetId
    ? 'WHERE a.id IN (SELECT album_id FROM album_assets WHERE asset_id = ?)'
    : '';
  return db
    .prepare(
      `SELECT a.*,
         (SELECT COUNT(*) FROM album_assets aa WHERE aa.album_id = a.id) AS asset_count,
         COALESCE(a.album_thumbnail_asset_id,
           (SELECT aa.asset_id FROM album_assets aa WHERE aa.album_id = a.id ORDER BY aa.added_at LIMIT 1)
         ) AS thumbnail_asset_id
       FROM albums a
       ${assetCondition}
       ORDER BY a.updated_at DESC`,
    )
    .all(...(assetId ? [assetId] : [])) as unknown as Array<
    AlbumRecord & { asset_count: number; thumbnail_asset_id: number | null }
  >;
}

export function getAlbum(
  db: DatabaseSync,
  id: string,
): (AlbumRecord & { asset_count: number; thumbnail_asset_id: number | null }) | undefined {
  return db
    .prepare(
      `SELECT a.*,
         (SELECT COUNT(*) FROM album_assets aa WHERE aa.album_id = a.id) AS asset_count,
         COALESCE(a.album_thumbnail_asset_id,
           (SELECT aa.asset_id FROM album_assets aa WHERE aa.album_id = a.id ORDER BY aa.added_at LIMIT 1)
         ) AS thumbnail_asset_id
       FROM albums a
       WHERE a.id = ?`,
    )
    .get(id) as
    | (AlbumRecord & { asset_count: number; thumbnail_asset_id: number | null })
    | undefined;
}

export function createAlbum(
  db: DatabaseSync,
  albumName: string,
  description: string | null | undefined,
  assetIds: number[],
): AlbumRecord {
  const id = randomUUID();
  const now = new Date().toISOString();
  db.exec('BEGIN');
  try {
    db.prepare(
      `INSERT INTO albums(id, album_name, description, album_thumbnail_asset_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(id, albumName, description ?? '', assetIds[0] ?? null, now, now);
    const insertAsset = db.prepare(
      `INSERT INTO album_assets(album_id, asset_id, added_at)
       VALUES (?, ?, ?)
       ON CONFLICT(album_id, asset_id) DO NOTHING`,
    );
    for (const assetId of assetIds) {
      insertAsset.run(id, assetId, now);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return getAlbum(db, id)!;
}

export function updateAlbum(
  db: DatabaseSync,
  id: string,
  update: {
    albumName?: string | undefined;
    description?: string | null | undefined;
    albumThumbnailAssetId?: number | null | undefined;
  },
): AlbumRecord | undefined {
  const current = getAlbum(db, id);
  if (!current) {
    return;
  }
  db.prepare(
    `UPDATE albums
     SET album_name = ?, description = ?, album_thumbnail_asset_id = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    update.albumName ?? current.album_name,
    update.description === undefined ? current.description : (update.description ?? ''),
    update.albumThumbnailAssetId === undefined
      ? current.album_thumbnail_asset_id
      : update.albumThumbnailAssetId,
    new Date().toISOString(),
    id,
  );
  return getAlbum(db, id);
}

export function deleteAlbum(db: DatabaseSync, id: string): boolean {
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM album_assets WHERE album_id = ?').run(id);
    const result = db.prepare('DELETE FROM albums WHERE id = ?').run(id);
    db.exec('COMMIT');
    return result.changes > 0;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function addAlbumAssets(db: DatabaseSync, albumId: string, assetIds: number[]): void {
  const now = new Date().toISOString();
  const statement = db.prepare(
    `INSERT INTO album_assets(album_id, asset_id, added_at)
     VALUES (?, ?, ?)
     ON CONFLICT(album_id, asset_id) DO NOTHING`,
  );
  db.exec('BEGIN');
  try {
    for (const assetId of assetIds) {
      statement.run(albumId, assetId, now);
    }
    db.prepare(
      `UPDATE albums
       SET album_thumbnail_asset_id = COALESCE(
         album_thumbnail_asset_id,
         (SELECT asset_id FROM album_assets WHERE album_id = ? ORDER BY added_at LIMIT 1)
       ), updated_at = ?
       WHERE id = ?`,
    ).run(albumId, now, albumId);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function removeAlbumAssets(db: DatabaseSync, albumId: string, assetIds: number[]): void {
  const statement = db.prepare('DELETE FROM album_assets WHERE album_id = ? AND asset_id = ?');
  db.exec('BEGIN');
  try {
    for (const assetId of assetIds) {
      statement.run(albumId, assetId);
    }
    db.prepare('UPDATE albums SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), albumId);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function listTags(db: DatabaseSync): TagRecord[] {
  return db.prepare('SELECT * FROM tags ORDER BY value COLLATE NOCASE').all() as unknown as TagRecord[];
}

export function getTag(db: DatabaseSync, id: string): TagRecord | undefined {
  return db.prepare('SELECT * FROM tags WHERE id = ?').get(id) as TagRecord | undefined;
}

export function createTag(
  db: DatabaseSync,
  name: string,
  color?: string | null,
  parentId?: string | null,
): TagRecord {
  const parent = parentId ? getTag(db, parentId) : undefined;
  const value = parent ? `${parent.value}/${name}` : name;
  const id = randomUUID();
  const now = new Date().toISOString();
  const existing = db.prepare('SELECT * FROM tags WHERE value = ?').get(value) as TagRecord | undefined;
  if (existing) {
    return existing;
  }
  db.prepare(
    `INSERT INTO tags(id, name, value, color, parent_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, name, value, color ?? null, parentId ?? null, now, now);
  return getTag(db, id)!;
}

export function createOrGetTags(db: DatabaseSync, values: string[]): TagRecord[] {
  return values.map((value) => createTag(db, value.trim()));
}

export function updateTag(
  db: DatabaseSync,
  id: string,
  update: { name?: string | undefined; color?: string | null | undefined },
): TagRecord | undefined {
  const current = getTag(db, id);
  if (!current) {
    return;
  }
  const name = update.name ?? current.name;
  const parent = current.parent_id ? getTag(db, current.parent_id) : undefined;
  const value = parent ? `${parent.value}/${name}` : name;
  db.prepare('UPDATE tags SET name = ?, value = ?, color = ?, updated_at = ? WHERE id = ?').run(
    name,
    value,
    update.color === undefined ? current.color : update.color,
    new Date().toISOString(),
    id,
  );
  return getTag(db, id);
}

export function deleteTag(db: DatabaseSync, id: string): boolean {
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM asset_tags WHERE tag_id = ?').run(id);
    const result = db.prepare('DELETE FROM tags WHERE id = ?').run(id);
    db.exec('COMMIT');
    return result.changes > 0;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function setAssetTags(db: DatabaseSync, assetIds: number[], tagIds: string[]): void {
  const statement = db.prepare(
    'INSERT INTO asset_tags(asset_id, tag_id) VALUES (?, ?) ON CONFLICT(asset_id, tag_id) DO NOTHING',
  );
  db.exec('BEGIN');
  try {
    for (const assetId of assetIds) {
      for (const tagId of tagIds) {
        if (getAsset(db, assetId) && getTag(db, tagId)) {
          statement.run(assetId, tagId);
        }
      }
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function getAssetTags(db: DatabaseSync, assetId: number): TagRecord[] {
  return db
    .prepare(
      `SELECT t.* FROM tags t
       INNER JOIN asset_tags at ON at.tag_id = t.id
       WHERE at.asset_id = ?
       ORDER BY t.value COLLATE NOCASE`,
    )
    .all(assetId) as unknown as TagRecord[];
}

export function removeAssetTags(db: DatabaseSync, tagId: string, assetIds: number[]): void {
  const statement = db.prepare('DELETE FROM asset_tags WHERE tag_id = ? AND asset_id = ?');
  db.exec('BEGIN');
  try {
    for (const assetId of assetIds) {
      statement.run(tagId, assetId);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function queueFaceScan(db: DatabaseSync): number {
  db.prepare(
    `UPDATE face_jobs
     SET status = 'queued', error = NULL
     WHERE status = 'failed' AND attempts < 3`,
  ).run();
  const result = db
    .prepare(
      `INSERT INTO face_jobs(asset_id, created_at)
       SELECT id, ? FROM assets
       WHERE kind = 'image' AND is_trashed = 0
         AND id NOT IN (SELECT asset_id FROM face_jobs)
       ON CONFLICT(asset_id) DO NOTHING`,
    )
    .run(new Date().toISOString());
  return Number(result.changes);
}

export function claimFaceJob(db: DatabaseSync): FaceJobRecord | undefined {
  const next = db
    .prepare(`SELECT * FROM face_jobs WHERE status = 'queued' ORDER BY id LIMIT 1`)
    .get() as FaceJobRecord | undefined;
  if (!next) {
    return;
  }
  const claimed = db
    .prepare(
      `UPDATE face_jobs
       SET status = 'running', attempts = attempts + 1, started_at = ?, error = NULL
       WHERE id = ? AND status = 'queued'`,
    )
    .run(new Date().toISOString(), next.id);
  return claimed.changes === 1 ? { ...next, status: 'running', attempts: next.attempts + 1 } : undefined;
}

export function completeFaceJob(db: DatabaseSync, id: number): void {
  db.prepare(`UPDATE face_jobs SET status = 'succeeded', finished_at = ? WHERE id = ?`).run(
    new Date().toISOString(),
    id,
  );
}

export function failFaceJob(db: DatabaseSync, id: number, error: string): void {
  db.prepare(`UPDATE face_jobs SET status = 'failed', error = ?, finished_at = ? WHERE id = ?`).run(
    error.slice(0, 2_000),
    new Date().toISOString(),
    id,
  );
}

function toEmbeddingBuffer(values: number[]): Buffer {
  return Buffer.from(new Float32Array(values).buffer);
}

function fromEmbeddingBuffer(value: Uint8Array): Float32Array {
  return new Float32Array(value.buffer, value.byteOffset, value.byteLength / 4);
}

function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  const length = Math.min(a.length, b.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < length; index += 1) {
    dot += a[index]! * b[index]!;
    normA += a[index]! * a[index]!;
    normB += b[index]! * b[index]!;
  }
  return normA > 0 && normB > 0 ? dot / Math.sqrt(normA * normB) : 0;
}

export function storeDetectedFace(
  db: DatabaseSync,
  assetId: number,
  face: {
    boundingBox: { x1: number; y1: number; x2: number; y2: number };
    cropPath: string | null;
    embedding: number[];
    score: number;
  },
  clusterThreshold = 0.45,
): { personId: string; faceId: string; isNewPerson: boolean } {
  const embedding = Float32Array.from(face.embedding);
  const candidates = db
    .prepare(
      `SELECT person_id, embedding FROM faces
       UNION ALL
       SELECT person_id, embedding FROM person_anchors`,
    )
    .all() as unknown as Array<{
    person_id: string;
    embedding: Uint8Array;
  }>;
  let bestPersonId: string | undefined;
  let bestScore = clusterThreshold;
  for (const candidate of candidates) {
    const score = cosineSimilarity(embedding, fromEmbeddingBuffer(candidate.embedding));
    if (score >= bestScore) {
      bestPersonId = candidate.person_id;
      bestScore = score;
    }
  }

  const now = new Date().toISOString();
  const isNewPerson = !bestPersonId;
  if (!bestPersonId) {
    bestPersonId = randomUUID();
    db.prepare(
      `INSERT INTO people(id, name, thumbnail_path, created_at, updated_at)
       VALUES (?, '', ?, ?, ?)`,
    ).run(bestPersonId, face.cropPath, now, now);
  } else {
    db.prepare(
      `UPDATE people
       SET thumbnail_path = COALESCE(thumbnail_path, ?), updated_at = ?
       WHERE id = ?`,
    ).run(face.cropPath, now, bestPersonId);
  }

  const faceId = randomUUID();
  db.prepare(
    `INSERT INTO faces(
       id, asset_id, person_id, x1, y1, x2, y2, score, embedding, crop_path, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    faceId,
    assetId,
    bestPersonId,
    face.boundingBox.x1,
    face.boundingBox.y1,
    face.boundingBox.x2,
    face.boundingBox.y2,
    face.score,
    toEmbeddingBuffer(face.embedding),
    face.cropPath,
    now,
  );
  return { faceId, isNewPerson, personId: bestPersonId };
}

export function resetFaceRecognitionData(db: DatabaseSync): {
  removedFaces: number;
  removedPeople: number;
  anchors: number;
} {
  const now = new Date().toISOString();
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('DELETE FROM person_anchors').run();
    const anchors = db
      .prepare(
        `INSERT INTO person_anchors(person_id, embedding, created_at)
         SELECT f.person_id, f.embedding, ?
         FROM faces f
         INNER JOIN people p ON p.id = f.person_id
         WHERE p.name != ''
           AND f.id = (
             SELECT f2.id FROM faces f2
             WHERE f2.person_id = f.person_id
             ORDER BY f2.score DESC, f2.created_at
             LIMIT 1
           )`,
      )
      .run(now);
    db.prepare('DELETE FROM face_jobs').run();
    const removedFaces = Number(db.prepare('DELETE FROM faces').run().changes);
    const removedPeople = Number(db.prepare(`DELETE FROM people WHERE name = ''`).run().changes);
    db.exec('COMMIT');
    return {
      removedFaces,
      removedPeople,
      anchors: Number(anchors.changes),
    };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function listPeople(
  db: DatabaseSync,
  options: { withHidden?: boolean; name?: string | undefined } = {},
): Array<PersonRecord & { asset_count: number }> {
  const conditions = [options.withHidden ? '1 = 1' : 'p.is_hidden = 0'];
  const parameters: string[] = [];
  if (options.name) {
    conditions.push('p.name LIKE ?');
    parameters.push(`%${options.name}%`);
  }
  return db
    .prepare(
      `SELECT p.*, COUNT(DISTINCT f.asset_id) AS asset_count
       FROM people p
       INNER JOIN faces f ON f.person_id = p.id
       WHERE ${conditions.join(' AND ')}
       GROUP BY p.id
       ORDER BY (p.name = '') DESC, p.name COLLATE NOCASE, p.updated_at DESC`,
    )
    .all(...parameters) as unknown as Array<PersonRecord & { asset_count: number }>;
}

export function getPerson(db: DatabaseSync, id: string): PersonRecord | undefined {
  return db.prepare('SELECT * FROM people WHERE id = ?').get(id) as PersonRecord | undefined;
}

export function getAssetPeople(db: DatabaseSync, assetId: number): PersonRecord[] {
  return db
    .prepare(
      `SELECT DISTINCT p.* FROM people p
       INNER JOIN faces f ON f.person_id = p.id
       WHERE f.asset_id = ?
       ORDER BY p.name COLLATE NOCASE`,
    )
    .all(assetId) as unknown as PersonRecord[];
}

export function updatePerson(
  db: DatabaseSync,
  id: string,
  update: {
    birthDate?: string | null | undefined;
    color?: string | null | undefined;
    featureFaceAssetId?: number | undefined;
    isFavorite?: boolean | undefined;
    isHidden?: boolean | undefined;
    name?: string | undefined;
  },
): PersonRecord | undefined {
  const current = getPerson(db, id);
  if (!current) {
    return;
  }
  const featureCrop = update.featureFaceAssetId
    ? (
        db
          .prepare('SELECT crop_path FROM faces WHERE person_id = ? AND asset_id = ? AND crop_path IS NOT NULL LIMIT 1')
          .get(id, update.featureFaceAssetId) as { crop_path: string } | undefined
      )?.crop_path
    : undefined;
  db.prepare(
    `UPDATE people
     SET name = ?, birth_date = ?, color = ?, is_favorite = ?, is_hidden = ?,
         thumbnail_path = COALESCE(?, thumbnail_path), updated_at = ?
     WHERE id = ?`,
  ).run(
    update.name ?? current.name,
    update.birthDate === undefined ? current.birth_date : update.birthDate,
    update.color === undefined ? current.color : update.color,
    update.isFavorite === undefined ? current.is_favorite : update.isFavorite ? 1 : 0,
    update.isHidden === undefined ? current.is_hidden : update.isHidden ? 1 : 0,
    featureCrop ?? null,
    new Date().toISOString(),
    id,
  );
  return getPerson(db, id);
}

export function getSetting(db: DatabaseSync, key: string): string | undefined {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value;
}

export function setSetting(db: DatabaseSync, key: string, value: string): void {
  db.prepare(
    `INSERT INTO settings(key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run(key, value, new Date().toISOString());
}
