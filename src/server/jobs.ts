import type { DatabaseSync } from 'node:sqlite';
import type { AppConfig } from './config.js';
import { claimNextJob, type JobRecord } from './db.js';
import { runScanJob } from './scanner.js';

export class JobRunner {
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(
    private readonly db: DatabaseSync,
    private readonly config: AppConfig,
    private readonly log: Pick<Console, 'error'> = console,
  ) {}

  start(): void {
    if (this.timer) {
      return;
    }
    this.timer = setInterval(() => void this.runQueuedJobs(), 400);
    this.timer.unref();
    void this.runQueuedJobs();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  async runQueuedJobs(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      let job: JobRecord | undefined;
      while ((job = claimNextJob(this.db))) {
        try {
          await runScanJob(this.db, this.config, job);
        } catch (error) {
          this.log.error(`Job ${job.id} failed`, error);
        }
      }
    } finally {
      this.running = false;
    }
  }
}
