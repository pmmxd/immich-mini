import type { DatabaseSync } from 'node:sqlite';
import type { AppConfig } from './config.js';
import {
  claimFaceJob,
  completeFaceJob,
  failFaceJob,
  getAsset,
  queueFaceScan,
  resetFaceRecognitionData,
  storeDetectedFace,
} from './db.js';
import { readFaceRecognitionSettings } from './face-settings.js';
import { FaceWorkerClient } from './face-worker-client.js';

export class FaceService {
  private timer: NodeJS.Timeout | undefined;
  private running = false;
  private generation = 0;
  private readonly worker: FaceWorkerClient;

  constructor(
    private readonly db: DatabaseSync,
    private readonly config: AppConfig,
    private readonly log: Pick<Console, 'warn' | 'error' | 'info'> = console,
  ) {
    this.worker = new FaceWorkerClient(config, () => this.allowedRoots(), log);
  }

  private allowedRoots(): string[] {
    return (
      this.db.prepare('SELECT path FROM libraries ORDER BY id').all() as unknown as Array<{ path: string }>
    ).map((row) => row.path);
  }

  start(): void {
    if (!this.config.faceScanEnabled || this.timer) {
      return;
    }
    this.timer = setInterval(() => void this.queueAndRun(), 5_000);
    this.timer.unref();
    void this.queueAndRun();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    this.worker.stop();
  }

  async queueAndRun(): Promise<number> {
    const queued = queueFaceScan(this.db);
    if (queued > 0 || !this.running) {
      void this.runQueuedJobs();
    }
    return queued;
  }

  reprocess(): {
    queued: number;
    removedFaces: number;
    removedPeople: number;
    anchors: number;
  } {
    this.generation += 1;
    const reset = resetFaceRecognitionData(this.db);
    const queued = queueFaceScan(this.db);
    void this.runQueuedJobs();
    return { queued, ...reset };
  }

  private async runQueuedJobs(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      let job;
      while ((job = claimFaceJob(this.db))) {
        const generation = this.generation;
        try {
          const asset = getAsset(this.db, job.asset_id);
          if (!asset || asset.kind !== 'image') {
            throw new Error(`Asset ${job.asset_id} is not an analyzable image`);
          }
          this.worker.setAllowedRoots(this.allowedRoots());
          const result = await this.worker.analyze(
            asset.path,
            `face-${job.id}-${Date.now()}`,
            readFaceRecognitionSettings(this.db, this.config).detectionThreshold,
          );
          if (generation !== this.generation) {
            continue;
          }
          const settings = readFaceRecognitionSettings(this.db, this.config);
          for (const face of result.faces) {
            storeDetectedFace(this.db, asset.id, face, settings.clusterThreshold);
          }
          completeFaceJob(this.db, job.id);
          this.log.info(`Face scan complete for asset ${asset.id}: ${result.faces.length} faces`);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          failFaceJob(this.db, job.id, message);
          this.log.error(`Face scan failed for asset ${job.asset_id}: ${message}`);
        }
      }
    } finally {
      this.running = false;
    }
  }
}
