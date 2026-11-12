import { getExternalToolSettings } from '$lib/services/external-tools.service';

export interface LocalMediaOperationResult {
  cancelled: boolean;
  copied: number;
  failures?: Array<{ name: string; error: string }>;
  destination?: string;
}

interface LocalAssetPath {
  id: number;
  path: string;
  kind: 'image' | 'video';
  name: string;
}

export interface LocalExportResult {
  canceled: boolean;
  paths: string[];
  failures: string[];
}

export interface LocalFolderResult {
  canceled: boolean;
  path?: string;
}

const LOCALDOCK_ORIGIN = 'http://127.0.0.1:7012';
const TOOL_MESSAGE_TYPE = 'immich-localdock-tool';

async function readResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => undefined)) as { error?: string } | undefined;
  if (!response.ok) {
    throw new Error(payload?.error || `Request failed (${response.status})`);
  }
  return payload as T;
}

export async function exportFramedAssets(
  ids: string[],
  style: 'light' | 'dark',
  destination: string,
): Promise<LocalMediaOperationResult> {
  return readResponse(
    await fetch('/api/local/assets/frame', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, style, destination }),
    }),
  );
}

async function getLocalAssetPaths(ids: string[]): Promise<LocalAssetPath[]> {
  return (
    await readResponse<{ items: LocalAssetPath[] }>(
      await fetch('/api/local/assets/paths', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      }),
    )
  ).items;
}

function runLocalDockTool(
  action: 'defaultOpen' | 'openWith' | 'editor' | 'frameEditor' | 'folder' | 'chooseFolder' | 'export',
  files: string[] = [],
  editor?: string,
): Promise<unknown> {
  const requestId = crypto.randomUUID();
  const iframe = document.createElement('iframe');
  iframe.hidden = true;
  iframe.style.display = 'none';
  iframe.src = `${LOCALDOCK_ORIGIN}/open-tool.html?${new URLSearchParams({
    action,
    files: JSON.stringify(files),
    requestId,
    ...(editor ? { editor } : {}),
  })}`;

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      window.clearTimeout(timeout);
      window.removeEventListener('message', onMessage);
      iframe.remove();
    };
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== LOCALDOCK_ORIGIN || event.source !== iframe.contentWindow) {
        return;
      }
      const data = event.data as {
        type?: string;
        requestId?: string;
        ok?: boolean;
        error?: string;
        result?: unknown;
      };
      if (data?.type !== TOOL_MESSAGE_TYPE || data.requestId !== requestId) {
        return;
      }
      cleanup();
      if (data.ok) {
        resolve(data.result);
      } else {
        reject(new Error(data.error || 'LocalDock 外部工具调用失败'));
      }
    };
    const timeout = window.setTimeout(
      () => {
        cleanup();
        reject(new Error('LocalDock 外部工具调用超时'));
      },
      action === 'export' ? 10 * 60_000 : action === 'chooseFolder' ? 5 * 60_000 : 60_000,
    );
    window.addEventListener('message', onMessage);
    document.body.append(iframe);
  });
}

export async function openMediaWithDefaultApp(ids: string[]): Promise<number> {
  const assets = await getLocalAssetPaths(ids);
  if (assets.length === 0) {
    throw new Error('没有可打开的媒体');
  }
  if (assets.length > 64) {
    throw new Error('一次最多用默认软件打开 64 个媒体');
  }
  await runLocalDockTool(
    'defaultOpen',
    assets.map((asset) => asset.path),
  );
  return assets.length;
}

export async function openMediaWithSystemChooser(ids: string[]): Promise<void> {
  if (ids.length !== 1) {
    throw new Error('系统“打开方式”一次只能选择一个媒体');
  }
  const [asset] = await getLocalAssetPaths(ids);
  if (!asset) {
    throw new Error('未找到所选媒体');
  }
  await runLocalDockTool('openWith', [asset.path]);
}

export async function openMediaWithEditor(ids: string[]): Promise<number> {
  const assets = await getLocalAssetPaths(ids);
  if (assets.length === 0) {
    throw new Error('没有可编辑的媒体');
  }
  if (assets.length > 64) {
    throw new Error('一次最多用外部编辑器打开 64 个媒体');
  }
  const allImages = assets.every((asset) => asset.kind === 'image');
  const allVideos = assets.every((asset) => asset.kind === 'video');
  if (!allImages && !allVideos) {
    throw new Error('图片和视频需要分别使用各自的编辑软件');
  }
  const settings = await getExternalToolSettings();
  await runLocalDockTool(
    'editor',
    assets.map((asset) => asset.path),
    allImages ? settings.imageEditorPath : settings.videoEditorPath,
  );
  return assets.length;
}

export async function openImagesWithFrameEditor(ids: string[]): Promise<number> {
  const assets = await getLocalAssetPaths(ids);
  if (assets.length === 0 || assets.some((asset) => asset.kind !== 'image')) {
    throw new Error('相框外部工具只支持图片');
  }
  const settings = await getExternalToolSettings();
  await runLocalDockTool(
    'frameEditor',
    assets.map((asset) => asset.path),
    settings.frameEditorPath,
  );
  return assets.length;
}

export async function openMediaInFolder(ids: string[]): Promise<number> {
  const assets = await getLocalAssetPaths(ids);
  if (assets.length === 0) {
    throw new Error('没有可定位的媒体');
  }
  if (assets.length > 500) {
    throw new Error('一次最多定位 500 个媒体');
  }
  await runLocalDockTool(
    'folder',
    assets.map((asset) => asset.path),
  );
  return assets.length;
}

export async function chooseLocalExportFolder(): Promise<LocalFolderResult> {
  const result = (await runLocalDockTool('chooseFolder')) as Partial<LocalFolderResult> | undefined;
  return {
    canceled: Boolean(result?.canceled),
    ...(typeof result?.path === 'string' ? { path: result.path } : {}),
  };
}

export async function exportAssetsToFolder(ids: string[]): Promise<LocalExportResult> {
  if (ids.length > 200) {
    throw new Error('一次最多导出 200 个媒体');
  }
  const assets = await getLocalAssetPaths(ids);
  if (assets.length === 0) {
    throw new Error('没有可导出的媒体');
  }
  const result = (await runLocalDockTool(
    'export',
    assets.map((asset) => asset.path),
  )) as Partial<LocalExportResult> | undefined;
  return {
    canceled: Boolean(result?.canceled),
    paths: Array.isArray(result?.paths) ? result.paths : [],
    failures: Array.isArray(result?.failures) ? result.failures : [],
  };
}
