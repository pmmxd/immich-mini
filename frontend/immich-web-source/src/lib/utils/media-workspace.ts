export type MediaWorkspaceTab = 'all' | 'video' | 'image' | 'timeline' | 'map';
export type MediaType = 'image' | 'video';
export type VideoOrientation = 'all' | 'landscape' | 'portrait';
export type MediaDirection = 'all' | 'landscape' | 'portrait';

export interface MediaWorkspaceState {
  tab: MediaWorkspaceTab;
  mediaType?: MediaType;
  orientation: VideoOrientation;
}

type MediaAsset = {
  width?: number | null;
  height?: number | null;
  ratio?: number;
};

export const parseMediaWorkspace = (searchParams: URLSearchParams): MediaWorkspaceState => {
  const type = searchParams.get('type');
  const mediaType = type === 'video' ? 'video' : type === 'image' ? 'image' : undefined;
  const orientation = searchParams.get('orientation');
  const resolvedOrientation =
    mediaType && (orientation === 'landscape' || orientation === 'portrait') ? orientation : 'all';

  if (searchParams.get('view') === 'timeline') {
    return { tab: 'timeline', mediaType, orientation: resolvedOrientation };
  }

  if (type === 'video') {
    return {
      tab: 'video',
      mediaType: 'video',
      orientation: resolvedOrientation,
    };
  }

  if (type === 'image') {
    return { tab: 'image', mediaType: 'image', orientation: resolvedOrientation };
  }

  return { tab: 'all', mediaType, orientation: resolvedOrientation };
};

export const getMediaDirection = (asset: MediaAsset): 'landscape' | 'portrait' | 'unknown' => {
  if (asset.width && asset.height) {
    return asset.height > asset.width ? 'portrait' : 'landscape';
  }
  if (asset.ratio && asset.ratio > 0) {
    return asset.ratio >= 1 ? 'landscape' : 'portrait';
  }
  return 'unknown';
};

export const matchesMediaDirection = (asset: MediaAsset, direction: MediaDirection) => {
  if (direction === 'all') {
    return true;
  }
  return getMediaDirection(asset) === direction;
};

export const hasWorkspaceFilters = (searchParams: URLSearchParams) => {
  for (const key of searchParams.keys()) {
    if (key !== 'type' && key !== 'orientation' && key !== 'view' && key !== 'at') {
      return true;
    }
  }
  return false;
};

export const formatDuration = (milliseconds: number) => {
  const totalSeconds = Math.round(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${minutes}:${String(seconds).padStart(2, '0')}`;
};
