import { spawn, type ChildProcessByStdio } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { createInterface } from 'node:readline';
import type { Readable } from 'node:stream';
import type { AppConfig } from './config.js';
import { PROJECT_ROOT } from './config.js';

export interface FaceAnalysis {
  height: number;
  width: number;
  faces: Array<{
    boundingBox: { x1: number; y1: number; x2: number; y2: number };
    cropPath: string | null;
    embedding: number[];
    score: number;
  }>;
}

interface WorkerProcess {
  child: ChildProcessByStdio<null, Readable, Readable>;
  port: number;
}

export class FaceWorkerClient {
  private worker: WorkerProcess | undefined;
  private starting: Promise<WorkerProcess> | undefined;
  private readonly token = randomUUID();

  constructor(
    private readonly config: AppConfig,
    private allowedRoots: string[] | (() => string[]),
    private readonly log: Pick<Console, 'warn'> = console,
  ) {}

  setAllowedRoots(roots: string[]): void {
    const current = typeof this.allowedRoots === 'function' ? this.allowedRoots() : this.allowedRoots;
    if (current.join('\0') !== roots.join('\0')) {
      this.worker?.child.kill();
      this.worker = undefined;
    }
    this.allowedRoots = roots;
  }

  private async start(): Promise<WorkerProcess> {
    if (this.worker && this.worker.child.exitCode === null) {
      return this.worker;
    }
    if (this.starting) {
      return this.starting;
    }
    this.starting = new Promise<WorkerProcess>((resolve, reject) => {
      const args = [
        path.join(PROJECT_ROOT, 'worker', 'face_worker.py'),
        '--detector-model',
        path.join(this.config.faceModelsDir, 'face_detection_yunet_2023mar.onnx'),
        '--recognizer-model',
        path.join(this.config.faceModelsDir, 'face_recognition_sface_2021dec.onnx'),
        '--crop-dir',
        path.join(this.config.dataDir, 'faces'),
        '--idle-seconds',
        String(this.config.faceIdleSeconds),
        '--token',
        this.token,
      ];
      const roots = typeof this.allowedRoots === 'function' ? this.allowedRoots() : this.allowedRoots;
      for (const root of roots) {
        args.push('--allowed-root', root);
      }
      const child = spawn(this.config.pythonPath, args, {
        cwd: PROJECT_ROOT,
        env: { ...process.env, PYTHONUTF8: '1' },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error('Face worker startup timed out'));
      }, 30_000);
      let ready = false;
      let stderr = '';
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (chunk: string) => {
        stderr = `${stderr}${chunk}`.slice(-8_000);
      });
      child.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once('exit', (code, signal) => {
        if (!ready) {
          clearTimeout(timer);
          reject(new Error(`Face worker exited before ready: ${stderr.trim() || code || signal}`));
        }
        if (this.worker?.child === child) {
          this.worker = undefined;
        }
        if (code && code !== 0) {
          this.log.warn(`Face worker exited (${code}/${signal}): ${stderr.trim()}`);
        }
      });
      const lines = createInterface({ input: child.stdout });
      lines.once('line', (line) => {
        clearTimeout(timer);
        ready = true;
        try {
          const ready = JSON.parse(line) as { port?: number; ready?: boolean };
          if (!ready.ready || !ready.port) {
            throw new Error(`Unexpected face worker response: ${line}`);
          }
          const worker = { child, port: ready.port };
          this.worker = worker;
          resolve(worker);
        } catch (error) {
          child.kill();
          reject(error);
        }
      });
    }).finally(() => {
      this.starting = undefined;
    });
    return this.starting;
  }

  async analyze(imagePath: string, marker: string, minScore = 0.7): Promise<FaceAnalysis> {
    let worker = await this.start();
    try {
      return await this.request(worker.port, imagePath, marker, minScore);
    } catch {
      worker.child.kill();
      this.worker = undefined;
      worker = await this.start();
      return this.request(worker.port, imagePath, marker, minScore);
    }
  }

  private async request(port: number, imagePath: string, marker: string, minScore: number): Promise<FaceAnalysis> {
    const response = await fetch(`http://127.0.0.1:${port}/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Immich-Mini-Token': this.token,
      },
      body: JSON.stringify({ imagePath, marker, minScore }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error || `Face worker request failed (${response.status})`);
    }
    return response.json() as Promise<FaceAnalysis>;
  }

  stop(): void {
    this.worker?.child.kill();
    this.worker = undefined;
  }
}
