import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { access, mkdir, rename, stat } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import exifr from 'exifr';
import sharp from 'sharp';
import type { AssetKind, AssetOrientation, AssetUpsert } from './db.js';
import { readImageMotionInfo, type EmbeddedMotionVideo } from './motion-photo.js';

export const IMAGE_EXTENSIONS = new Set([
  '.avif',
  '.bmp',
  '.gif',
  '.heic',
  '.heif',
  '.jpeg',
  '.jpg',
  '.png',
  '.tif',
  '.tiff',
  '.webp',
]);

export const VIDEO_EXTENSIONS = new Set([
  '.3gp',
  '.avi',
  '.m4v',
  '.mkv',
  '.mov',
  '.mp4',
  '.mpeg',
  '.mpg',
  '.webm',
  '.wmv',
]);

const MIME_TYPES: Record<string, string> = {
  '.3gp': 'video/3gpp',
  '.avif': 'image/avif',
  '.avi': 'video/x-msvideo',
  '.bmp': 'image/bmp',
  '.gif': 'image/gif',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.m4v': 'video/x-m4v',
  '.mkv': 'video/x-matroska',
  '.mov': 'video/quicktime',
  '.mp4': 'video/mp4',
  '.mpeg': 'video/mpeg',
  '.mpg': 'video/mpeg',
  '.png': 'image/png',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.webm': 'video/webm',
  '.webp': 'image/webp',
  '.wmv': 'video/x-ms-wmv',
};

type Orientation = AssetOrientation;

export interface MediaMetadata {
  kind: AssetKind;
  mime: string;
  width: number | null;
  height: number | null;
  orientation: Orientation | null;
  takenAt: string;
  durationMs: number | null;
  latitude: number | null;
  longitude: number | null;
  make: string | null;
  model: string | null;
  lensModel: string | null;
  rating: number | null;
  description: string | null;
  tags: string[];
  city: string | null;
  country: string | null;
  state: string | null;
  contentIdentifier: string | null;
}

export interface ExifDetails {
  description: string | null;
  exposureTime: string | null;
  fNumber: number | null;
  focalLength: number | null;
  iso: number | null;
  latitude: number | null;
  lensModel: string | null;
  longitude: number | null;
  make: string | null;
  model: string | null;
  orientation: string | null;
  projectionType: string | null;
  timeZone: string | null;
}

export interface InspectedMedia extends Omit<AssetUpsert, 'libraryId'> {
  tags: string[];
  embeddedMotionVideo: EmbeddedMotionVideo | null;
}

interface FfprobeOutput {
  format?: {
    duration?: string;
    tags?: Record<string, string>;
  };
  streams?: Array<{
    codec_type?: string;
    width?: number;
    height?: number;
    duration?: string;
    tags?: Record<string, string>;
    side_data_list?: Array<{ rotation?: number }>;
  }>;
}

export function classifyMedia(filePath: string): AssetKind | undefined {
  const extension = path.extname(filePath).toLowerCase();
  if (IMAGE_EXTENSIONS.has(extension)) {
    return 'image';
  }
  if (VIDEO_EXTENSIONS.has(extension)) {
    return 'video';
  }
}

export function getMimeType(filePath: string): string {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

function getOrientation(width: number | null, height: number | null): Orientation | null {
  if (!width || !height) {
    return null;
  }
  if (width === height) {
    return 'square';
  }
  return width > height ? 'landscape' : 'portrait';
}

function parseDate(value: unknown): Date | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }
}

function parseNumber(value: unknown): number | null {
  const number = typeof value === 'string' && value.trim() ? Number(value) : value;
  return typeof number === 'number' && Number.isFinite(number) ? number : null;
}

function parseString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function parseLocalizedText(value: unknown): string | null {
  if (typeof value === 'string') {
    return parseString(value);
  }
  if (value && typeof value === 'object' && 'value' in value) {
    return parseString((value as { value?: unknown }).value);
  }
  return null;
}

function parseRating(...values: unknown[]): number | null {
  for (const value of values) {
    const rating = parseNumber(value);
    if (rating !== null && rating > 0) {
      return Math.min(5, Math.round(rating));
    }
  }
  return null;
}

function normalizeTags(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
  const tags = raw
    .flatMap((item) => (typeof item === 'string' ? item.split(/[,;]/) : []))
    .map((item) =>
      item
        .trim()
        .replaceAll('|', '/')
        .replace(/\/+/g, '/')
        .replace(/^\/|\/$/g, ''),
    )
    .filter((item) => item.length > 0 && item.length <= 200);
  return [...new Set(tags)].slice(0, 100);
}

function embeddedTags(exif: Record<string, unknown>): string[] {
  const fields = new Map(
    Object.entries(exif).map(([key, value]) => [key.toLowerCase(), value]),
  );
  for (const key of [
    'lastkeywordxmp',
    'tagslist',
    'hierarchicalsubject',
    'subject',
    'keywords',
    'xpkeywords',
  ]) {
    const tags = normalizeTags(fields.get(key));
    if (tags.length > 0) {
      return tags;
    }
  }
  return [];
}

function formatExposure(value: unknown): string | null {
  const seconds = parseNumber(value);
  if (seconds === null || seconds <= 0) {
    return null;
  }
  return seconds < 1 ? `1/${Math.round(1 / seconds)}` : Number(seconds.toFixed(3)).toString();
}

export async function readExifDetails(filePath: string): Promise<ExifDetails> {
  const exif = (await exifr
    .parse(filePath, { xmp: true, iptc: true })
    .catch(() => undefined)) as
    | Record<string, unknown>
    | undefined;
  return {
    description:
      parseLocalizedText(exif?.caption) ??
      parseLocalizedText(exif?.Caption) ??
      parseLocalizedText(exif?.description) ??
      parseLocalizedText(exif?.Description) ??
      parseLocalizedText(exif?.title) ??
      parseString(exif?.ImageDescription),
    exposureTime: formatExposure(exif?.ExposureTime),
    fNumber: parseNumber(exif?.FNumber),
    focalLength: parseNumber(exif?.FocalLength),
    iso: parseNumber(exif?.ISO ?? exif?.ISOSpeedRatings),
    latitude: parseNumber(exif?.latitude),
    lensModel: parseString(exif?.LensModel),
    longitude: parseNumber(exif?.longitude),
    make: parseString(exif?.Make),
    model: parseString(exif?.Model),
    orientation: parseNumber(exif?.Orientation)?.toString() ?? null,
    projectionType: parseString(exif?.ProjectionType),
    timeZone: parseString(exif?.OffsetTimeOriginal ?? exif?.TimeZone),
  };
}

async function imageMetadata(filePath: string, modifiedAt: Date): Promise<MediaMetadata> {
  const [metadata, exif] = await Promise.all([
    sharp(filePath, { failOn: 'error' }).metadata(),
    exifr.parse(filePath, { xmp: true, iptc: true }).catch(() => undefined),
  ]);
  const swapsAxes = metadata.orientation !== undefined && metadata.orientation >= 5;
  const width = metadata.width ? (swapsAxes ? metadata.height : metadata.width) ?? null : null;
  const height = metadata.height ? (swapsAxes ? metadata.width : metadata.height) ?? null : null;
  const takenAt =
    parseDate(exif?.DateTimeOriginal) ?? parseDate(exif?.CreateDate) ?? parseDate(exif?.ModifyDate) ?? modifiedAt;

  return {
    kind: 'image',
    mime: getMimeType(filePath),
    width,
    height,
    orientation: getOrientation(width, height),
    takenAt: takenAt.toISOString(),
    durationMs: null,
    latitude: parseNumber(exif?.latitude),
    longitude: parseNumber(exif?.longitude),
    make: typeof exif?.Make === 'string' ? exif.Make : null,
    model: typeof exif?.Model === 'string' ? exif.Model : null,
    lensModel: typeof exif?.LensModel === 'string' ? exif.LensModel : null,
    rating: parseRating(exif?.Rating, exif?.rating, Number(exif?.RatingPercent) / 20),
    description:
      parseLocalizedText(exif?.caption) ??
      parseLocalizedText(exif?.Caption) ??
      parseLocalizedText(exif?.description) ??
      parseLocalizedText(exif?.Description) ??
      parseLocalizedText(exif?.title) ??
      parseString(exif?.ImageDescription),
    tags: embeddedTags((exif ?? {}) as Record<string, unknown>),
    city: null,
    country: null,
    state: null,
    contentIdentifier: null,
  };
}

function runCommand(command: string, args: string[], timeout = 60_000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      { timeout, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`${path.basename(command)} failed: ${stderr.trim() || error.message}`));
          return;
        }
        resolve(stdout);
      },
    );
  });
}

async function videoMetadata(
  filePath: string,
  modifiedAt: Date,
  ffprobePath: string,
): Promise<MediaMetadata> {
  const stdout = await runCommand(ffprobePath, [
    '-v',
    'error',
    '-print_format',
    'json',
    '-show_format',
    '-show_streams',
    filePath,
  ]);
  const probe = JSON.parse(stdout) as FfprobeOutput;
  const stream = probe.streams?.find((item) => item.codec_type === 'video');
  if (!stream) {
    throw new Error('No video stream found');
  }

  const rotation = Math.abs(stream.side_data_list?.[0]?.rotation ?? Number(stream.tags?.rotate ?? 0));
  const swapsAxes = rotation === 90 || rotation === 270;
  const width = stream.width ? (swapsAxes ? stream.height : stream.width) ?? null : null;
  const height = stream.height ? (swapsAxes ? stream.width : stream.height) ?? null : null;
  const tags = { ...probe.format?.tags, ...stream.tags };
  const tagEntries = Object.entries(tags);
  const tag = (...names: string[]) =>
    names
      .map(
        (name) =>
          tagEntries.find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1],
      )
      .find((value) => value?.trim());
  const location = parseString(
    tag('location', 'com.apple.quicktime.location.ISO6709', 'com.apple.quicktime.location'),
  );
  const locationMatch = location ? /^([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)/.exec(location) : undefined;
  const takenAt = parseDate(tags.creation_time) ?? modifiedAt;
  const durationSeconds = Number(probe.format?.duration ?? stream.duration);

  return {
    kind: 'video',
    mime: getMimeType(filePath),
    width,
    height,
    orientation: getOrientation(width, height),
    takenAt: takenAt.toISOString(),
    durationMs: Number.isFinite(durationSeconds) ? Math.round(durationSeconds * 1_000) : null,
    latitude: locationMatch ? parseNumber(locationMatch[1]) : null,
    longitude: locationMatch ? parseNumber(locationMatch[2]) : null,
    make: parseString(
      tag('make', 'com.apple.quicktime.make', 'com.android.manufacturer'),
    ),
    model: parseString(
      tag('model', 'com.apple.quicktime.model', 'com.android.model'),
    ),
    lensModel: parseString(
      tag('lens_model', 'com.apple.quicktime.lens_model', 'com.android.lens_model'),
    ),
    rating: parseRating(tag('rating', 'Rating')),
    description: parseString(tag('description', 'comment', 'synopsis')),
    tags: normalizeTags(tag('keywords', 'Keywords', 'subject')),
    city: null,
    country: null,
    state: null,
    contentIdentifier: parseString(
      tag('com.apple.quicktime.content.identifier', 'contentIdentifier', 'ContentIdentifier'),
    ),
  };
}

export async function inspectMedia(
  filePath: string,
  kind: AssetKind,
  ffprobePath: string,
): Promise<InspectedMedia> {
  const fileStat = await stat(filePath);
  const modifiedAt = fileStat.mtime;
  const metadata =
    kind === 'image'
      ? await imageMetadata(filePath, modifiedAt)
      : await videoMetadata(filePath, modifiedAt, ffprobePath);
  const imageMotion =
    kind === 'image'
      ? await readImageMotionInfo(filePath).catch(() => ({
          contentIdentifier: null,
          embeddedMotionVideo: null,
        }))
      : { contentIdentifier: null, embeddedMotionVideo: null };

  return {
    path: path.resolve(filePath),
    name: path.basename(filePath),
    kind,
    mime: metadata.mime,
    bytes: fileStat.size,
    width: metadata.width,
    height: metadata.height,
    orientation: metadata.orientation,
    takenAt: metadata.takenAt,
    durationMs: metadata.durationMs,
    latitude: metadata.latitude,
    longitude: metadata.longitude,
    make: metadata.make,
    model: metadata.model,
    lensModel: metadata.lensModel,
    rating: metadata.rating,
    description: metadata.description,
    tags: metadata.tags,
    city: metadata.city,
    country: metadata.country,
    state: metadata.state,
    contentIdentifier: metadata.contentIdentifier ?? imageMotion.contentIdentifier,
    embeddedMotionVideo: imageMotion.embeddedMotionVideo,
    fingerprint: `${fileStat.size}:${Math.round(fileStat.mtimeMs)}`,
  };
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export function getThumbnailPath(
  thumbnailDir: string,
  assetPath: string,
  fingerprint: string,
  kind: AssetKind,
): string {
  const key = createHash('sha256').update(`${assetPath}\0${fingerprint}`).digest('hex').slice(0, 20);
  return path.join(thumbnailDir, `${key}.${kind === 'image' ? 'webp' : 'jpg'}`);
}

export function getMotionVideoCachePath(
  dataDir: string,
  assetPath: string,
  fingerprint: string,
): string {
  const key = createHash('sha256').update(`${assetPath}\0${fingerprint}`).digest('hex').slice(0, 24);
  return path.join(dataDir, 'motion-videos', `${key}.mp4`);
}

export async function extractEmbeddedMotionVideo(
  sourcePath: string,
  outputPath: string,
  length: number,
): Promise<string> {
  const fileStat = await stat(sourcePath);
  const start = fileStat.size - length;
  if (start <= 0 || start >= fileStat.size) {
    throw new Error('动态照片视频偏移无效');
  }

  try {
    if ((await stat(outputPath)).size === length) {
      return outputPath;
    }
    await rename(outputPath, `${outputPath}.${Date.now()}.stale`);
  } catch {
    // The cache file does not exist yet.
  }

  await mkdir(path.dirname(outputPath), { recursive: true });
  const tempPath = `${outputPath}.${process.pid}.tmp`;
  await pipeline(
    createReadStream(sourcePath, { start, end: fileStat.size - 1 }),
    createWriteStream(tempPath),
  );
  await rename(tempPath, outputPath);
  return outputPath;
}

export async function createThumbnail(
  filePath: string,
  kind: AssetKind,
  outputPath: string,
  options: { ffmpegPath: string; durationMs: number | null },
): Promise<void> {
  if (await exists(outputPath)) {
    return;
  }
  await mkdir(path.dirname(outputPath), { recursive: true });

  if (kind === 'image') {
    await sharp(filePath, { failOn: 'error' })
      .rotate()
      .resize(640, 640, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toFile(outputPath);
    return;
  }

  const seekSeconds = Math.min(Math.max((options.durationMs ?? 10_000) / 10_000, 0.4), 20);
  await runCommand(options.ffmpegPath, [
    '-nostdin',
    '-hide_banner',
    '-loglevel',
    'error',
    '-ss',
    seekSeconds.toFixed(2),
    '-i',
    filePath,
    '-frames:v',
    '1',
    '-vf',
    'scale=640:640:force_original_aspect_ratio=decrease',
    '-q:v',
    '3',
    outputPath,
  ]);
}
