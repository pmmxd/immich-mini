import type { DatabaseSync } from 'node:sqlite';
import type { AppConfig } from './config.js';
import { getSetting, setSetting } from './db.js';

const SETTINGS_KEY = 'faceRecognitionSettings';

export interface FaceRecognitionSettings {
  detectionThreshold: number;
  clusterThreshold: number;
}

function validThreshold(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0.1 && value <= 0.99;
}

export function readFaceRecognitionSettings(
  db: DatabaseSync,
  config: AppConfig,
): FaceRecognitionSettings {
  const defaults = {
    detectionThreshold: config.faceDetectionThreshold,
    clusterThreshold: config.faceClusterThreshold,
  };
  const raw = getSetting(db, SETTINGS_KEY);
  if (!raw) {
    return defaults;
  }
  try {
    const value = JSON.parse(raw) as Partial<FaceRecognitionSettings>;
    return {
      detectionThreshold: validThreshold(value.detectionThreshold)
        ? value.detectionThreshold
        : defaults.detectionThreshold,
      clusterThreshold: validThreshold(value.clusterThreshold)
        ? value.clusterThreshold
        : defaults.clusterThreshold,
    };
  } catch {
    return defaults;
  }
}

export function saveFaceRecognitionSettings(
  db: DatabaseSync,
  settings: FaceRecognitionSettings,
): void {
  setSetting(db, SETTINGS_KEY, JSON.stringify(settings));
}

export function faceQueueStatistics(db: DatabaseSync): {
  queued: number;
  running: number;
  succeeded: number;
  failed: number;
} {
  const rows = db
    .prepare('SELECT status, COUNT(*) AS count FROM face_jobs GROUP BY status')
    .all() as unknown as Array<{
    status: 'queued' | 'running' | 'succeeded' | 'failed';
    count: number;
  }>;
  const result = { queued: 0, running: 0, succeeded: 0, failed: 0 };
  for (const row of rows) {
    result[row.status] = row.count;
  }
  return result;
}
