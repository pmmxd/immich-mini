import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PROJECT_ROOT = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));

export interface AppConfig {
  dataDir: string;
  webDist: string;
  port: number;
  ffmpegPath: string;
  ffprobePath: string;
  libraryPath?: string;
  pythonPath: string;
  faceModelsDir: string;
  faceIdleSeconds: number;
  faceDetectionThreshold: number;
  faceClusterThreshold: number;
  faceScanEnabled: boolean;
}

function threshold(name: string, value: string | undefined, fallback: number): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed) || parsed < 0.1 || parsed > 0.99) {
    throw new Error(`Invalid ${name}: ${value ?? fallback}`);
  }
  return parsed;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const port = Number(env.PORT ?? 3310);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`Invalid PORT: ${env.PORT}`);
  }
  const libraryPath = env.IMMICH_MINI_LIBRARY?.trim();
  const bundledFfmpeg = path.join(PROJECT_ROOT, 'runtime', 'ffmpeg', 'ffmpeg.exe');
  const bundledFfprobe = path.join(PROJECT_ROOT, 'runtime', 'ffmpeg', 'ffprobe.exe');
  const bundledPython = path.join(PROJECT_ROOT, 'runtime', 'python', 'python.exe');
  const faceIdleSeconds = Number(env.IMMICH_MINI_FACE_IDLE_SECONDS ?? 45);
  if (!Number.isInteger(faceIdleSeconds) || faceIdleSeconds < 10) {
    throw new Error(`Invalid IMMICH_MINI_FACE_IDLE_SECONDS: ${env.IMMICH_MINI_FACE_IDLE_SECONDS}`);
  }

  return {
    dataDir: path.resolve(env.IMMICH_MINI_DATA_DIR ?? path.join(PROJECT_ROOT, 'data')),
    webDist: path.join(PROJECT_ROOT, 'vendor', 'immich-web'),
    port,
    ffmpegPath: env.FFMPEG_PATH || (existsSync(bundledFfmpeg) ? bundledFfmpeg : 'ffmpeg'),
    ffprobePath: env.FFPROBE_PATH || (existsSync(bundledFfprobe) ? bundledFfprobe : 'ffprobe'),
    pythonPath: env.PYTHON_PATH || (existsSync(bundledPython) ? bundledPython : 'python'),
    faceModelsDir: path.resolve(env.IMMICH_MINI_FACE_MODELS_DIR ?? path.join(PROJECT_ROOT, 'models')),
    faceIdleSeconds,
    faceDetectionThreshold: threshold(
      'IMMICH_MINI_FACE_DETECTION_THRESHOLD',
      env.IMMICH_MINI_FACE_DETECTION_THRESHOLD,
      0.7,
    ),
    faceClusterThreshold: threshold(
      'IMMICH_MINI_FACE_CLUSTER_THRESHOLD',
      env.IMMICH_MINI_FACE_CLUSTER_THRESHOLD,
      0.45,
    ),
    faceScanEnabled: env.IMMICH_MINI_FACE_SCAN !== '0',
    ...(libraryPath ? { libraryPath: path.resolve(libraryPath) } : {}),
  };
}
