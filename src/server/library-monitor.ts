import { watch, type FSWatcher } from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';
import { enqueueScan, getSetting, listLibraries, setSetting } from './db.js';
import type { JobRunner } from './jobs.js';

const SETTINGS_KEY = 'localLibraryAutomation';
export const DEFAULT_LIBRARY_AUTOMATION = {
  watchEnabled: false,
  scanEnabled: false,
  scanIntervalMinutes: 360,
};

export interface LibraryAutomationSettings {
  watchEnabled: boolean;
  scanEnabled: boolean;
  scanIntervalMinutes: number;
}

export function readLibraryAutomationSettings(db: DatabaseSync): LibraryAutomationSettings {
  const raw = getSetting(db, SETTINGS_KEY);
  if (!raw) {
    return { ...DEFAULT_LIBRARY_AUTOMATION };
  }
  try {
    const value = JSON.parse(raw) as Partial<LibraryAutomationSettings>;
    const interval = Number(value.scanIntervalMinutes);
    return {
      watchEnabled: value.watchEnabled === true,
      scanEnabled: value.scanEnabled === true,
      scanIntervalMinutes:
        Number.isInteger(interval) && interval >= 5 && interval <= 10_080
          ? interval
          : DEFAULT_LIBRARY_AUTOMATION.scanIntervalMinutes,
    };
  } catch {
    return { ...DEFAULT_LIBRARY_AUTOMATION };
  }
}

export function saveLibraryAutomationSettings(
  db: DatabaseSync,
  settings: LibraryAutomationSettings,
): void {
  setSetting(db, SETTINGS_KEY, JSON.stringify(settings));
}

export class LibraryMonitor {
  private readonly watchers = new Map<number, FSWatcher>();
  private readonly debounceTimers = new Map<number, NodeJS.Timeout>();
  private scanTimer: NodeJS.Timeout | undefined;
  private active = false;

  constructor(
    private readonly db: DatabaseSync,
    private readonly runner: JobRunner,
    private readonly options: {
      debounceMs?: number;
      logger?: Pick<Console, 'error' | 'info'>;
    } = {},
  ) {}

  start(): void {
    if (this.active) {
      return;
    }
    this.active = true;
    this.apply();
  }

  refresh(): void {
    if (this.active) {
      this.apply();
    }
  }

  stop(): void {
    this.active = false;
    for (const watcher of this.watchers.values()) {
      watcher.close();
    }
    this.watchers.clear();
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
    if (this.scanTimer) {
      clearInterval(this.scanTimer);
      this.scanTimer = undefined;
    }
  }

  private apply(): void {
    this.stop();
    this.active = true;
    const settings = readLibraryAutomationSettings(this.db);
    const libraries = listLibraries(this.db);

    if (settings.watchEnabled) {
      for (const library of libraries) {
        this.watchLibrary(library);
      }
    }
    if (settings.scanEnabled) {
      this.scanTimer = setInterval(
        () => this.scanAll(libraries),
        settings.scanIntervalMinutes * 60_000,
      );
      this.scanTimer.unref();
    }
  }

  private watchLibrary(library: { id: number; path: string }): void {
    try {
      const watcher = watch(library.path, { recursive: true }, () => this.debounce(library));
      watcher.on('error', (error) => this.options.logger?.error('Library watcher failed', error));
      this.watchers.set(library.id, watcher);
    } catch (error) {
      this.options.logger?.error(`Could not watch library ${library.path}`, error);
    }
  }

  private debounce(library: { id: number; path: string }): void {
    const current = this.debounceTimers.get(library.id);
    if (current) {
      clearTimeout(current);
    }
    const timer = setTimeout(() => {
      this.debounceTimers.delete(library.id);
      this.scanLibrary(library);
    }, this.options.debounceMs ?? 1_500);
    this.debounceTimers.set(library.id, timer);
  }

  private scanAll(libraries: Array<{ id: number; path: string }>): void {
    for (const library of libraries) {
      this.scanLibrary(library);
    }
  }

  private scanLibrary(library: { id: number; path: string }): void {
    const job = enqueueScan(this.db, library.id, library.path, true);
    this.options.logger?.info(`Queued library scan ${job.id}: ${library.path}`);
    void this.runner.runQueuedJobs();
  }
}
