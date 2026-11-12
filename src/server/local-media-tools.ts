import { execFile } from 'node:child_process';
import { access, mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import exifr from 'exifr';
import sharp from 'sharp';
import { getAsset, type AssetRecord } from './db.js';

export type FrameStyle = 'light' | 'dark';

interface FrameResult {
  copied: number;
  failures: Array<{ name: string; error: string }>;
  destination: string;
}

function powershell(script: string, env: NodeJS.ProcessEnv = {}, timeout = 15 * 60_000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-STA', '-Command', script],
      {
        env: { ...process.env, ...env },
        maxBuffer: 1024 * 1024,
        timeout,
        windowsHide: false,
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr.trim() || error.message));
          return;
        }
        resolve(stdout.trim());
      },
    );
  });
}

function decodePath(output: string): string | undefined {
  return output ? Buffer.from(output, 'base64').toString('utf8') : undefined;
}

export async function chooseApplicationExecutable(title: string): Promise<string | undefined> {
  const script = `
    Add-Type -AssemblyName System.Windows.Forms
    $dialog = New-Object System.Windows.Forms.OpenFileDialog
    $dialog.Title = $env:IMMICH_MINI_APP_DIALOG_TITLE
    $dialog.Filter = '应用程序 (*.exe)|*.exe'
    $dialog.CheckFileExists = $true
    $dialog.Multiselect = $false
    if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
      [Console]::Out.Write([Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($dialog.FileName)))
    }
  `;
  return decodePath(await powershell(script, { IMMICH_MINI_APP_DIALOG_TITLE: title }));
}

export function resolveAssets(db: DatabaseSync, ids: number[]): AssetRecord[] {
  return ids.flatMap((id) => {
    const asset = getAsset(db, id);
    return asset ? [asset] : [];
  });
}

async function uniquePath(directory: string, name: string): Promise<string> {
  const extension = path.extname(name);
  const base = path.basename(name, extension);
  for (let index = 0; ; index += 1) {
    const suffix = index === 0 ? '' : ` (${index})`;
    const candidate = path.join(directory, `${base}${suffix}${extension}`);
    try {
      await stat(candidate);
    } catch {
      return candidate;
    }
  }
}

function xml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function formatExposure(value: unknown): string {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '';
  }
  if (seconds < 1) {
    return `1/${Math.round(1 / seconds)}s`;
  }
  return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
}

function formatNumber(value: unknown, suffix = ''): string {
  const number = Number(value);
  return Number.isFinite(number) ? `${Number(number.toFixed(1))}${suffix}` : '';
}

function compactText(value: string, limit: number): string {
  return value.length > limit ? `${value.slice(0, limit - 1)}...` : value;
}

function infoSvg(
  width: number,
  height: number,
  baseWidth: number,
  padding: number,
  layout: 'below' | 'side',
  asset: AssetRecord,
  exif: Record<string, unknown>,
  style: FrameStyle,
): Buffer {
  const dark = style === 'dark';
  const foreground = dark ? '#f6f4ee' : '#1c1b19';
  const muted = dark ? '#aaa9a5' : '#77736d';
  const divider = dark ? '#353634' : '#ddd9d1';
  const accent = String(exif.Make ?? asset.make ?? '').toUpperCase().includes('NIKON')
    ? '#ffe100'
    : '#f59e0b';
  const rawMake = String(exif.Make ?? asset.make ?? '').trim();
  const make = rawMake.toUpperCase().includes('NIKON') ? 'Nikon' : rawMake;
  const rawModel = String(exif.Model ?? asset.model ?? '').trim();
  const model = rawModel
    .replace(/^NIKON\s+/i, '')
    .replace(new RegExp(`^${rawMake.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+`, 'i'), '')
    .trim()
    .replace(/^Z\s+(\d+)_([23])$/, (_, body: string, generation: string) =>
      `Z ${body} ${generation === '2' ? 'II' : 'III'}`,
    )
    .replaceAll('_', ' ');
  const lens = String(exif.LensModel ?? asset.lens_model ?? '').trim();
  const focal = formatNumber(exif.FocalLength, 'mm');
  const aperture = formatNumber(exif.FNumber);
  const shutter = formatExposure(exif.ExposureTime);
  const iso = formatNumber(exif.ISO, '');
  const primary = [focal, aperture ? `f/${aperture}` : '', shutter, iso ? `ISO ${iso}` : '']
    .filter(Boolean)
    .join('  ·  ');
  const taken = new Date(asset.taken_at);
  const date = Number.isNaN(taken.getTime())
    ? ''
    : taken.toLocaleString('zh-CN', { hour12: false }).replaceAll('/', '-');
  const brandSize = Math.max(14, Math.round(baseWidth * 0.014));
  const modelSize = Math.max(11, Math.round(baseWidth * 0.011));
  const detailSize = Math.max(10, Math.round(baseWidth * 0.0105));
  const dateSize = Math.max(9, Math.round(baseWidth * 0.009));
  const brand = make || 'IMMICH MINI';
  const fallbackModel = path.basename(asset.name, path.extname(asset.name));
  const modelLabel = compactText(model || (make ? '' : fallbackModel), layout === 'side' ? 26 : 34);
  const lensLabel = compactText(lens || '镜头参数未记录', layout === 'side' ? 28 : 40);
  const left = padding;
  const right = width - padding;
  const isNikon = brand.toUpperCase() === 'NIKON';
  const badgeHeight = layout === 'side'
    ? Math.max(22, Math.round(baseWidth * 0.018))
    : Math.max(22, Math.round(height * 0.27));
  const badgeWidth = Math.max(54, Math.round(baseWidth * 0.052));
  const brandY = layout === 'side' ? Math.round(height * 0.19) : Math.round(height * 0.42);
  const badgeY = Math.round(brandY - badgeHeight * 0.72);
  const brandGap = Math.max(10, Math.round(baseWidth * 0.011));
  const brandMarkup = isNikon
    ? `
      <rect x="${left}" y="${badgeY}" width="${badgeWidth}" height="${badgeHeight}"
        rx="${Math.max(3, Math.round(badgeHeight * 0.14))}" fill="${accent}"/>
      <text x="${left + badgeWidth / 2}" y="${brandY}"
        text-anchor="middle" fill="#111111" font-family="Arial, sans-serif"
        font-size="${brandSize}" font-weight="700" font-style="italic">Nikon</text>
      <text x="${layout === 'side' ? left : left + badgeWidth + brandGap}"
        y="${layout === 'side' ? brandY + badgeHeight + modelSize + 8 : brandY}"
        fill="${foreground}" font-family="'Segoe UI', Arial, sans-serif"
        font-size="${modelSize}" font-weight="600">${xml(modelLabel)}</text>
    `
    : `
      <text x="${left}" y="${brandY}"
        fill="${foreground}" font-family="'Segoe UI', Arial, sans-serif" font-size="${brandSize}"
        font-weight="700">${xml(brand)}</text>
      <text x="${left}" y="${brandY + modelSize + 8}"
        fill="${muted}" font-family="'Segoe UI', Arial, sans-serif" font-size="${modelSize}">
        ${xml(modelLabel)}
      </text>
    `;
  const lineY = layout === 'side'
    ? Math.round(height * 0.36)
    : Math.max(12, Math.round(height * 0.14));
  const detailY = layout === 'side' ? Math.round(height * 0.47) : Math.round(height * 0.39);
  const exposureY = detailY + detailSize + Math.max(5, Math.round(baseWidth * 0.006));
  const dateY = exposureY + dateSize + Math.max(7, Math.round(baseWidth * 0.008));
  const textAnchor = layout === 'side' ? 'start' : 'end';
  const detailX = layout === 'side' ? left : right;
  return Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <line x1="${left}" y1="${lineY}" x2="${right}" y2="${lineY}"
        stroke="${divider}" stroke-width="1"/>
      ${brandMarkup}
      <text x="${right}" y="${lineY + dateSize + 4}"
        text-anchor="end" fill="${muted}" font-family="'Segoe UI', Arial, sans-serif"
        font-size="${Math.max(8, Math.round(baseWidth * 0.0075))}" letter-spacing="1.1">CAMERA DETAILS</text>
      <text x="${detailX}" y="${detailY}"
        text-anchor="${textAnchor}" fill="${foreground}" font-family="'Segoe UI', Arial, sans-serif"
        font-size="${detailSize}" font-weight="600">${xml(lensLabel)}</text>
      <text x="${detailX}" y="${exposureY}"
        text-anchor="${textAnchor}" fill="${muted}" font-family="Consolas, 'Courier New', monospace"
        font-size="${detailSize}">${xml(primary || '拍摄参数未记录')}</text>
      <text x="${detailX}" y="${dateY}"
        text-anchor="${textAnchor}" fill="${muted}" font-family="'Segoe UI', Arial, sans-serif"
        font-size="${dateSize}">${xml(date)}</text>
    </svg>
  `);
}

async function renderFramedBuffer(
  asset: AssetRecord,
  style: FrameStyle,
  maxWidth?: number,
): Promise<Buffer> {
  const exif = ((await exifr.parse(asset.path).catch(() => undefined)) ?? {}) as Record<
    string,
    unknown
  >;
  const imagePipeline = sharp(asset.path).rotate();
  const image = await (maxWidth
    ? imagePipeline.resize({ width: maxWidth, withoutEnlargement: true })
    : imagePipeline
  ).toBuffer({ resolveWithObject: true });
  const width = image.info.width;
  const height = image.info.height;
  const border = Math.max(10, Math.round(width * 0.012));
  const infoPadding = Math.max(14, Math.round(width * 0.018));
  const sideLayout = height > width * 1.15;
  const infoWidth = sideLayout ? Math.max(210, Math.round(width * 0.26)) : 0;
  const infoHeight = sideLayout ? 0 : Math.max(94, Math.round(width * 0.068));
  const canvasWidth = border * 2 + width + infoWidth;
  const canvasHeight = border * 2 + height + infoHeight;
  const background = style === 'dark' ? '#18191a' : '#fbfaf7';
  const imageEdge =
    style === 'dark'
      ? `<rect x="${border - 1}" y="${border - 1}" width="${width + 2}" height="${height + 2}"
          fill="none" stroke="#ffffff" stroke-opacity="0.1"/>`
      : `<rect x="${border - 1}" y="${border - 1}" width="${width + 2}" height="${height + 2}"
          fill="none" stroke="#111111" stroke-opacity="0.12"/>`;
  const divider = style === 'dark' ? '#343534' : '#dedad2';
  const infoLeft = sideLayout ? border + width : 0;
  const infoTop = sideLayout ? border : border + height;
  const infoPanelWidth = sideLayout ? infoWidth : canvasWidth;
  const infoPanelHeight = sideLayout ? height : infoHeight;
  return sharp({
    create: {
      width: canvasWidth,
      height: canvasHeight,
      channels: 3,
      background,
    },
  })
    .composite([
      { input: image.data, left: border, top: border },
      {
        input: Buffer.from(`<svg width="${canvasWidth}" height="${canvasHeight}">${imageEdge}</svg>`),
        left: 0,
        top: 0,
      },
      {
        input: Buffer.from(
          `<svg width="${canvasWidth}" height="${canvasHeight}">
            <rect x="${infoLeft}" y="${infoTop}" width="${infoPanelWidth}" height="${infoPanelHeight}"
              fill="${background}"/>
            ${sideLayout
              ? `<line x1="${infoLeft}" y1="${infoTop}" x2="${infoLeft}" y2="${infoTop + height}"
                  stroke="${divider}" stroke-width="1"/>`
              : `<line x1="${border}" y1="${infoTop}" x2="${canvasWidth - border}" y2="${infoTop}"
                  stroke="${divider}" stroke-width="1"/>`}
          </svg>`,
        ),
        left: 0,
        top: 0,
      },
      {
        input: infoSvg(
          infoPanelWidth,
          infoPanelHeight,
          width,
          infoPadding,
          sideLayout ? 'side' : 'below',
          asset,
          exif,
          style,
        ),
        left: infoLeft,
        top: infoTop,
      },
    ])
    .jpeg({ quality: 95 })
    .toBuffer();
}

async function renderFramedImage(
  asset: AssetRecord,
  destination: string,
  style: FrameStyle,
): Promise<void> {
  const output = await renderFramedBuffer(asset, style);
  const fileName = `${path.basename(asset.name, path.extname(asset.name))} - 相框.jpg`;
  let lastError: unknown;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const target = await uniquePath(destination, fileName);
    try {
      await writeFile(target, output, { flag: 'wx' });
      return;
    } catch (error) {
      lastError = error;
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        continue;
      }
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }
  throw new Error(
    `写入相框失败: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
    { cause: lastError },
  );
}

export async function renderFramePreview(
  asset: AssetRecord,
  style: FrameStyle,
): Promise<Buffer> {
  if (asset.kind !== 'image') {
    throw new Error('相框预览只支持图片');
  }
  return renderFramedBuffer(asset, style, 1_000);
}

export async function exportFramedAssets(
  assets: AssetRecord[],
  destination: string,
  style: FrameStyle,
): Promise<FrameResult> {
  await mkdir(destination, { recursive: true });
  const failures: Array<{ name: string; error: string }> = [];
  let copied = 0;
  for (const asset of assets) {
    if (asset.kind !== 'image') {
      failures.push({ name: asset.name, error: '相框功能只支持图片' });
      continue;
    }
    try {
      await renderFramedImage(asset, destination, style);
      copied += 1;
    } catch (error) {
      failures.push({
        name: asset.name,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { copied, failures, destination };
}

