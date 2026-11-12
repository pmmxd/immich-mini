import { open } from 'node:fs/promises';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { linkMotionVideo } from './db.js';

const XMP_HEADER_BYTES = 4 * 1024 * 1024;

export interface EmbeddedMotionVideo {
  length: number;
  mime: string;
}

export interface ImageMotionInfo {
  contentIdentifier: string | null;
  embeddedMotionVideo: EmbeddedMotionVideo | null;
}

function xmpValue(xml: string, name: string): string | undefined {
  const attribute = new RegExp(
    `(?:[\\w.-]+:)?${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`,
    'i',
  ).exec(xml);
  if (attribute) {
    return attribute[1] ?? attribute[2];
  }
  const element = new RegExp(
    `<(?:[\\w.-]+:)?${name}\\b[^>]*>\\s*([^<]+?)\\s*</`,
    'i',
  ).exec(xml);
  return element?.[1];
}

async function readXmpHeader(filePath: string): Promise<string> {
  const file = await open(filePath, 'r');
  try {
    const fileSize = (await file.stat()).size;
    const length = Math.min(fileSize, XMP_HEADER_BYTES);
    const buffer = Buffer.alloc(length);
    await file.read(buffer, 0, length, 0);
    return buffer.toString('latin1');
  } finally {
    await file.close();
  }
}

export async function readImageMotionInfo(filePath: string): Promise<ImageMotionInfo> {
  const xml = await readXmpHeader(filePath);
  const contentIdentifier =
    xmpValue(xml, 'ContentIdentifier') ??
    xmpValue(xml, 'contentIdentifier') ??
    xmpValue(xml, 'InstanceID') ??
    null;
  const motionEnabled =
    xmpValue(xml, 'MotionPhoto') === '1' || xmpValue(xml, 'MicroVideo') === '1';
  if (!motionEnabled) {
    return { contentIdentifier: contentIdentifier?.trim() || null, embeddedMotionVideo: null };
  }

  const itemTags = xml.match(/<(?:[\w.-]+:)?Item\b[^>]*>/gi) ?? [];
  const motionItem = itemTags.find((tag) => xmpValue(tag, 'Semantic') === 'MotionPhoto');
  const itemLength = Number(xmpValue(motionItem ?? '', 'Length'));
  const microVideoOffset = Number(
    xmpValue(xml, 'MicroVideoOffset') ?? xmpValue(xml, 'MotionPhotoOffset'),
  );
  const length = Number.isFinite(itemLength) && itemLength > 0 ? itemLength : microVideoOffset;
  if (!Number.isFinite(length) || length <= 0) {
    return { contentIdentifier: contentIdentifier?.trim() || null, embeddedMotionVideo: null };
  }

  return {
    contentIdentifier: contentIdentifier?.trim() || null,
    embeddedMotionVideo: {
      length: Math.round(length),
      mime: xmpValue(motionItem ?? '', 'Mime')?.trim() || 'video/mp4',
    },
  };
}

function normalizedStem(filePath: string): string {
  return `${path.dirname(filePath).toLowerCase()}\0${path
    .basename(filePath, path.extname(filePath))
    .toLowerCase()}`;
}

export function pairLivePhotos(db: DatabaseSync, libraryId: number): number {
  const assets = db
    .prepare(
      `SELECT id, path, kind, taken_at, motion_content_identifier, live_photo_video_id
       FROM assets
       WHERE library_id = ? AND is_motion_part = 0
       ORDER BY id`,
    )
    .all(libraryId) as unknown as Array<{
    id: number;
    path: string;
    kind: 'image' | 'video';
    taken_at: string;
    motion_content_identifier: string | null;
    live_photo_video_id: number | null;
  }>;

  const images = assets.filter((asset) => asset.kind === 'image' && !asset.live_photo_video_id);
  const videos = assets.filter(
    (asset) =>
      asset.kind === 'video' &&
      ['.mov', '.mp4', '.m4v'].includes(path.extname(asset.path).toLowerCase()),
  );
  const usedVideos = new Set<number>();
  const byContentIdentifier = new Map<string, typeof videos>();
  const byStem = new Map<string, typeof videos>();
  for (const video of videos) {
    if (video.motion_content_identifier) {
      const key = video.motion_content_identifier.toLowerCase();
      byContentIdentifier.set(key, [...(byContentIdentifier.get(key) ?? []), video]);
    }
    const stem = normalizedStem(video.path);
    byStem.set(stem, [...(byStem.get(stem) ?? []), video]);
  }

  let linked = 0;
  for (const image of images) {
    const contentIdentifier = image.motion_content_identifier?.toLowerCase();
    const candidates = contentIdentifier
      ? (byContentIdentifier.get(contentIdentifier) ?? [])
      : (byStem.get(normalizedStem(image.path)) ?? []);
    const video = candidates
      .filter((candidate) => !usedVideos.has(candidate.id))
      .filter(
        (candidate) =>
          Boolean(contentIdentifier) ||
          Math.abs(Date.parse(candidate.taken_at) - Date.parse(image.taken_at)) <= 10 * 60 * 1000,
      )
      .sort(
        (left, right) =>
          Math.abs(Date.parse(left.taken_at) - Date.parse(image.taken_at)) -
          Math.abs(Date.parse(right.taken_at) - Date.parse(image.taken_at)),
      )[0];
    if (video && linkMotionVideo(db, image.id, video.id)) {
      usedVideos.add(video.id);
      linked += 1;
    }
  }
  return linked;
}
