import { existsSync } from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { getSetting, setSetting } from './db.js';

const SETTINGS_KEY = 'externalTools';

export const DEFAULT_EXTERNAL_TOOL_SETTINGS = {
  videoEditorPath: '',
  imageEditorPath: '',
  frameEditorPath: '',
} as const;

export type ExternalToolSettings = {
  -readonly [Key in keyof typeof DEFAULT_EXTERNAL_TOOL_SETTINGS]: string;
};

export function readExternalToolSettings(db: DatabaseSync): ExternalToolSettings {
  const raw = getSetting(db, SETTINGS_KEY);
  if (raw) {
    try {
      const stored = JSON.parse(raw) as Partial<ExternalToolSettings>;
      return {
        videoEditorPath: stored.videoEditorPath?.trim() || DEFAULT_EXTERNAL_TOOL_SETTINGS.videoEditorPath,
        imageEditorPath: stored.imageEditorPath?.trim() || DEFAULT_EXTERNAL_TOOL_SETTINGS.imageEditorPath,
        frameEditorPath: stored.frameEditorPath?.trim() || DEFAULT_EXTERNAL_TOOL_SETTINGS.frameEditorPath,
      };
    } catch {}
  }
  return { ...DEFAULT_EXTERNAL_TOOL_SETTINGS };
}

export function saveExternalToolSettings(
  db: DatabaseSync,
  settings: ExternalToolSettings,
): ExternalToolSettings {
  const saved = Object.fromEntries(
    Object.entries(settings).map(([key, value]) => {
      const executable = path.resolve(value.trim());
      if (!existsSync(executable)) {
        throw new Error(`应用不存在：${executable}`);
      }
      if (path.extname(executable).toLowerCase() !== '.exe') {
        throw new Error('外部工具必须是 EXE');
      }
      return [key, executable];
    }),
  ) as ExternalToolSettings;
  setSetting(db, SETTINGS_KEY, JSON.stringify(saved));
  return saved;
}
