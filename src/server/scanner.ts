import { execFile } from 'node:child_process';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { AppConfig } from './config.js';
import {
  completeJob,
  createOrGetTags,
  deleteAssetRecords,
  deleteAssetsUnderDirectories,
  failJob,
  linkMotionVideo,
  resetMotionLinks,
  saveMotionVideo,
  setAssetThumbnail,
  setAssetTags,
  updateJobProgress,
  upsertAsset,
  type JobRecord,
} from './db.js';
import {
  classifyMedia,
  createThumbnail,
  extractEmbeddedMotionVideo,
  getMotionVideoCachePath,
  getThumbnailPath,
  inspectMedia,
} from './media.js';
import { pairLivePhotos } from './motion-photo.js';

const SKIPPED_DIRECTORIES = new Set(['$recycle.bin', '.git', 'node_modules', 'system volume information']);

interface ScanResult {
  indexed: number;
  failed: number;
  removed: number;
  warnings: string[];
}

function pathKey(value: string): string {
  const resolved = path.resolve(value);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

// Node's directory entries do not expose the Windows hidden attribute.
function findExcludedDirectories(directory: string): Promise<string[]> {
  if (process.platform !== 'win32') {
    return Promise.resolve([]);
  }
  const script = `
    Get-ChildItem -LiteralPath $env:IMMICH_MINI_SCAN_ROOT -Directory -Force -Recurse -ErrorAction SilentlyContinue |
      Where-Object {
        $_.Name.StartsWith('.') -or
        (($_.Attributes -band [IO.FileAttributes]::Hidden) -ne 0)
      } |
      ForEach-Object {
        [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($_.FullName))
      }
  `;
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      {
        env: { ...process.env, IMMICH_MINI_SCAN_ROOT: directory },
        maxBuffer: 4 * 1024 * 1024,
        timeout: 60_000,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr.trim() || error.message));
          return;
        }
        resolve(
          stdout
            .split(/\r?\n/)
            .filter(Boolean)
            .map((line) => path.resolve(Buffer.from(line, 'base64').toString('utf8'))),
        );
      },
    );
  });
}

async function collectMediaFiles(
  directory: string,
  excludedDirectories: Set<string>,
  warnings: string[],
): Promise<string[]> {
  const files: string[] = [];
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    warnings.push(`${directory}: ${error instanceof Error ? error.message : String(error)}`);
    return files;
  }

  for (const entry of entries) {
    if (entry.isSymbolicLink()) {
      continue;
    }
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const normalizedPath = path.resolve(entryPath);
      if (
        !entry.name.startsWith('.') &&
        !excludedDirectories.has(pathKey(normalizedPath)) &&
        !SKIPPED_DIRECTORIES.has(entry.name.toLowerCase())
      ) {
        files.push(...(await collectMediaFiles(normalizedPath, excludedDirectories, warnings)));
      }
    } else if (entry.isFile() && classifyMedia(entryPath)) {
      files.push(entryPath);
    }
  }
  return files;
}

export async function scanLibrary(
  db: DatabaseSync,
  config: AppConfig,
  job: JobRecord,
  libraryId: number,
  libraryPath: string,
): Promise<ScanResult> {
  const libraryStat = await stat(libraryPath);
  if (!libraryStat.isDirectory()) {
    throw new Error(`Library path is not a directory: ${libraryPath}`);
  }

  updateJobProgress(db, job.id, 0, 0, 'Discovering media files');
  const warnings: string[] = [];
  let excludedDirectories: string[] = [];
  try {
    excludedDirectories = await findExcludedDirectories(libraryPath);
  } catch (error) {
    warnings.push(
      `Hidden directory discovery: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (excludedDirectories.length > 0) {
    deleteAssetsUnderDirectories(db, libraryId, excludedDirectories);
  }
  const files = await collectMediaFiles(
    libraryPath,
    new Set(excludedDirectories.map(pathKey)),
    warnings,
  );
  const discoveryWarningCount = warnings.length;
  updateJobProgress(db, job.id, 0, files.length, `Found ${files.length} media files`);
  resetMotionLinks(db, libraryId);

  let indexed = 0;
  let failed = 0;
  for (const [index, filePath] of files.entries()) {
    const kind = classifyMedia(filePath);
    if (!kind) {
      continue;
    }

    try {
      const inspected = await inspectMedia(filePath, kind, config.ffprobePath);
      const { tags, embeddedMotionVideo, ...metadata } = inspected;
      const asset = upsertAsset(db, { ...metadata, libraryId });
      if (tags.length > 0) {
        // Imported tags are additive so a rescan never removes a manually assigned tag.
        const importedTags = createOrGetTags(db, tags);
        setAssetTags(db, [asset.id], importedTags.map((tag) => tag.id));
      }
      const thumbnailPath = getThumbnailPath(
        path.join(config.dataDir, 'thumbnails'),
        asset.path,
        asset.fingerprint,
        asset.kind,
      );

      try {
        await createThumbnail(asset.path, asset.kind, thumbnailPath, {
          ffmpegPath: config.ffmpegPath,
          durationMs: asset.duration_ms,
        });
        setAssetThumbnail(db, asset.id, thumbnailPath, 'ready');
      } catch (error) {
        failed += 1;
        warnings.push(
          `Thumbnail ${path.basename(filePath)}: ${error instanceof Error ? error.message : String(error)}`,
        );
        setAssetThumbnail(db, asset.id, null, 'failed');
      }
      if (embeddedMotionVideo) {
        try {
          const motionPath = getMotionVideoCachePath(
            config.dataDir,
            asset.path,
            asset.fingerprint,
          );
          await extractEmbeddedMotionVideo(
            asset.path,
            motionPath,
            embeddedMotionVideo.length,
          );
          const motionMetadata = await inspectMedia(
            motionPath,
            'video',
            config.ffprobePath,
          );
          const motionVideoId = saveMotionVideo(db, {
            sourceAssetId: asset.id,
            path: motionPath,
            name: `${path.basename(asset.name, path.extname(asset.name))}.mp4`,
            mime: motionMetadata.mime,
            bytes: motionMetadata.bytes,
            width: motionMetadata.width,
            height: motionMetadata.height,
            durationMs: motionMetadata.durationMs,
            fingerprint: motionMetadata.fingerprint,
          });
          linkMotionVideo(db, asset.id, motionVideoId);
        } catch (error) {
          warnings.push(
            `Motion photo ${path.basename(filePath)}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
      indexed += 1;
    } catch (error) {
      failed += 1;
      warnings.push(`${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    }

    updateJobProgress(db, job.id, index + 1, files.length, `Indexed ${indexed} of ${files.length} files`);
  }

  const linkedMotionPhotos = pairLivePhotos(db, libraryId);
  let removed = 0;
  if (discoveryWarningCount === 0) {
    const foundPaths = new Set(files.map(pathKey));
    const stored = db
      .prepare('SELECT id, path FROM assets WHERE library_id = ?')
      .all(libraryId) as unknown as Array<{ id: number; path: string }>;
    const missingIds = stored
      .filter((asset) => !foundPaths.has(pathKey(asset.path)))
      .map((asset) => asset.id);
    removed = deleteAssetRecords(db, missingIds);
  }

  const warningNote = warnings.length > 0 ? `, ${warnings.length} warnings` : '';
  const removedNote = removed > 0 ? `, ${removed} removed` : '';
  const motionNote = linkedMotionPhotos > 0 ? `, ${linkedMotionPhotos} live photos linked` : '';
  completeJob(
    db,
    job.id,
    `Scan complete: ${indexed} indexed, ${failed} failed${motionNote}${removedNote}${warningNote}`,
  );
  return { indexed, failed, removed, warnings };
}

export async function runScanJob(
  db: DatabaseSync,
  config: AppConfig,
  job: JobRecord,
): Promise<void> {
  try {
    const payload = JSON.parse(job.payload) as { libraryId?: unknown; path?: unknown };
    if (typeof payload.libraryId !== 'number' || typeof payload.path !== 'string') {
      throw new Error('Invalid scan job payload');
    }
    await scanLibrary(db, config, job, payload.libraryId, payload.path);
  } catch (error) {
    failJob(db, job.id, error instanceof Error ? error.message : String(error));
    throw error;
  }
}
