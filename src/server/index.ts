import { existsSync } from 'node:fs';
import path from 'node:path';
import { loadEnvFile } from 'node:process';
import { buildApp } from './app.js';
import { PROJECT_ROOT, loadConfig } from './config.js';
import { enqueueScan, getLibrary, openDatabase } from './db.js';

const envFile = path.join(PROJECT_ROOT, '.env');
if (existsSync(envFile)) {
  loadEnvFile(envFile);
}

const config = loadConfig();
const db = openDatabase(config.dataDir);
const { app, faceService, runner } = await buildApp(config, db, { logger: true });

runner.start();
faceService.start();

if (config.libraryPath) {
  const library = getLibrary(db, config.libraryPath);
  if (library) {
    const job = enqueueScan(db, library.id, library.path);
    app.log.info({ libraryPath: library.path, jobId: job.id }, 'Queued configured library scan');
    void runner.runQueuedJobs();
  }
}

async function shutdown(signal: string): Promise<void> {
  app.log.info(`${signal} received, shutting down`);
  runner.stop();
  faceService.stop();
  await app.close();
  db.close();
  process.exit(0);
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await app.listen({ host: '127.0.0.1', port: config.port });
  app.log.info(`Immich Mini: http://127.0.0.1:${config.port}`);
} catch (error) {
  app.log.error(error);
  runner.stop();
  db.close();
  process.exit(1);
}
