import {
  AssetOrder,
  AssetTypeEnum,
  AssetVisibility,
  SearchOrderField,
  type AssetResponseDto,
  type MetadataSearchDto,
} from '@immich/sdk';
import { DateTime } from 'luxon';
import { asLocalTimeISO } from '$lib/utils/date-time';
import { getMediaDirection, type MediaDirection, type MediaType } from '$lib/utils/media-workspace';

export type MediaSort = 'date' | 'rating' | 'name' | 'size';

export interface MediaFilterState {
  query: string;
  path: string;
  city: string;
  make: string;
  model: string;
  lens: string;
  tagId: string;
  minRating: number | null;
  year: number | null;
  month: number | null;
  direction: MediaDirection;
  gps: 'all' | 'yes' | 'no';
  minDuration: number | null;
  maxDuration: number | null;
  minWidth: number | null;
  minHeight: number | null;
  minSize: number | null;
  maxSize: number | null;
  raw: boolean;
  favorite: boolean;
  sort: MediaSort;
  order: 'asc' | 'desc';
}

export const FILTER_KEYS = [
  'q',
  'path',
  'city',
  'make',
  'model',
  'lens',
  'tag',
  'rating',
  'year',
  'month',
  'direction',
  'gps',
  'minDuration',
  'maxDuration',
  'minWidth',
  'minHeight',
  'minSize',
  'maxSize',
  'raw',
  'favorite',
  'sort',
  'order',
] as const;

const numberOrNull = (value: string | null) => {
  if (!value) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const parseMediaFilters = (searchParams: URLSearchParams): MediaFilterState => {
  const direction = searchParams.get('direction');
  const gps = searchParams.get('gps');
  const sort = searchParams.get('sort');

  return {
    query: searchParams.get('q') ?? '',
    path: searchParams.get('path') ?? '',
    city: searchParams.get('city') ?? '',
    make: searchParams.get('make') ?? '',
    model: searchParams.get('model') ?? '',
    lens: searchParams.get('lens') ?? '',
    tagId: searchParams.get('tag') ?? '',
    minRating: numberOrNull(searchParams.get('rating')),
    year: numberOrNull(searchParams.get('year')),
    month: numberOrNull(searchParams.get('month')),
    direction: direction === 'landscape' || direction === 'portrait' ? direction : 'all',
    gps: gps === 'yes' || gps === 'no' ? gps : 'all',
    minDuration: numberOrNull(searchParams.get('minDuration')),
    maxDuration: numberOrNull(searchParams.get('maxDuration')),
    minWidth: numberOrNull(searchParams.get('minWidth')),
    minHeight: numberOrNull(searchParams.get('minHeight')),
    minSize: numberOrNull(searchParams.get('minSize')),
    maxSize: numberOrNull(searchParams.get('maxSize')),
    raw: searchParams.get('raw') === '1',
    favorite: searchParams.get('favorite') === '1',
    sort: ['rating', 'name', 'size'].includes(sort ?? '') ? (sort as MediaSort) : 'date',
    order: searchParams.get('order') === 'asc' ? 'asc' : 'desc',
  };
};

const dateRange = ({ year, month }: Pick<MediaFilterState, 'year' | 'month'>) => {
  if (!year) {
    return undefined;
  }

  const start = DateTime.local(year, month ?? 1, 1);
  const end = (month ? start.endOf('month') : start.endOf('year')) as DateTime<true>;
  return {
    gte: asLocalTimeISO(start.startOf(month ? 'month' : 'year') as DateTime<true>),
    lte: asLocalTimeISO(end),
  };
};

const sortField = (sort: MediaSort) => {
  if (sort === 'rating') {
    return SearchOrderField.Rating;
  }
  if (sort === 'size') {
    return SearchOrderField.FileSizeInBytes;
  }
  return SearchOrderField.LocalDateTime;
};

export const buildMediaSearchDto = (
  filter: MediaFilterState,
  mediaType: MediaType | undefined,
  cursor?: string,
  size = 100,
): MetadataSearchDto => ({
  size,
  withExif: true,
  cursor,
  filter: {
    visibility: { eq: AssetVisibility.Timeline },
    type: mediaType ? { eq: mediaType === 'image' ? AssetTypeEnum.Image : AssetTypeEnum.Video } : undefined,
    originalFileName: filter.query ? { like: `%${filter.query}%` } : undefined,
    originalPath: filter.path ? { like: `%${filter.path}%` } : undefined,
    city: filter.city ? { eq: filter.city } : undefined,
    make: filter.make ? { eq: filter.make } : undefined,
    model: filter.model ? { eq: filter.model } : undefined,
    lensModel: filter.lens ? { eq: filter.lens } : undefined,
    tagIds: filter.tagId ? { any: [filter.tagId] } : undefined,
    isFavorite: filter.favorite ? { eq: true } : undefined,
    rating: filter.minRating === null ? undefined : { gte: filter.minRating },
    fileSizeInBytes:
      filter.minSize === null && filter.maxSize === null
        ? undefined
        : {
            gte: filter.minSize === null ? undefined : filter.minSize * 1024 * 1024,
            lte: filter.maxSize === null ? undefined : filter.maxSize * 1024 * 1024,
          },
    takenAt: dateRange(filter),
  },
  orderBy: {
    field: sortField(filter.sort),
    direction: filter.order === 'asc' ? AssetOrder.Asc : AssetOrder.Desc,
  },
});

const rawExtensions = new Set([
  '3fr',
  'arw',
  'cr2',
  'cr3',
  'dng',
  'erf',
  'fff',
  'iiq',
  'k25',
  'mef',
  'mos',
  'nef',
  'orf',
  'pef',
  'raf',
  'raw',
  'rw2',
  'rwl',
  'sr2',
  'srf',
  'srw',
  'x3f',
]);

const isRaw = (asset: AssetResponseDto) => {
  const extension = asset.originalFileName.split('.').pop()?.toLowerCase();
  return extension ? rawExtensions.has(extension) : false;
};

export const matchesMediaFilters = (asset: AssetResponseDto, filter: MediaFilterState) => {
  const exif = asset.exifInfo;
  const hasGps =
    exif?.latitude !== null && exif?.latitude !== undefined && exif.longitude !== null && exif.longitude !== undefined;
  const durationSeconds = asset.duration ? asset.duration / 1000 : null;

  return (
    (filter.minRating === null || (exif?.rating ?? 0) >= filter.minRating) &&
    (filter.direction === 'all' || getMediaDirection(asset) === filter.direction) &&
    (filter.gps === 'all' || (filter.gps === 'yes' ? hasGps : !hasGps)) &&
    (filter.minDuration === null || (durationSeconds !== null && durationSeconds >= filter.minDuration)) &&
    (filter.maxDuration === null || (durationSeconds !== null && durationSeconds <= filter.maxDuration)) &&
    (filter.minWidth === null || (asset.width !== null && asset.width >= filter.minWidth)) &&
    (filter.minHeight === null || (asset.height !== null && asset.height >= filter.minHeight)) &&
    (!filter.raw || isRaw(asset))
  );
};

export const hasClientOnlyFilters = (filter: MediaFilterState) =>
  filter.minRating !== null ||
  filter.direction !== 'all' ||
  filter.gps !== 'all' ||
  filter.minDuration !== null ||
  filter.maxDuration !== null ||
  filter.minWidth !== null ||
  filter.minHeight !== null ||
  filter.minSize !== null ||
  filter.maxSize !== null ||
  filter.raw;
