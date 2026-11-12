import { AssetTypeEnum, AssetVisibility, type AssetResponseDto } from '@immich/sdk';
import { describe, expect, it } from 'vitest';
import { buildMediaSearchDto, matchesMediaFilters, parseMediaFilters } from './media-filters';

const asset = {
  id: 'asset-1',
  type: AssetTypeEnum.Video,
  originalFileName: 'sample.mp4',
  originalPath: '/library/2024/sample.mp4',
  width: 1920,
  height: 1080,
  duration: 65_000,
  visibility: AssetVisibility.Timeline,
  exifInfo: { rating: 4, latitude: 31.2, longitude: 121.4, fileSizeInByte: 1000 },
} as AssetResponseDto;

describe('media filters', () => {
  it('builds server search parameters', () => {
    const filter = parseMediaFilters(
      new URLSearchParams('?q=sample&city=Shanghai&rating=3&year=2024&month=5&favorite=1&sort=size'),
    );
    const dto = buildMediaSearchDto(filter, 'video', 'cursor-1');
    expect(dto).toMatchObject({
      size: 100,
      withExif: true,
      cursor: 'cursor-1',
      filter: {
        type: { eq: AssetTypeEnum.Video },
        originalFileName: { like: '%sample%' },
        city: { eq: 'Shanghai' },
        isFavorite: { eq: true },
        rating: { gte: 3 },
        visibility: { eq: AssetVisibility.Timeline },
      },
    });
    expect(dto).not.toHaveProperty('type');
    expect(dto).not.toHaveProperty('visibility');
    expect(dto).not.toHaveProperty('page');
  });

  it('applies client metadata filters', () => {
    const filter = parseMediaFilters(
      new URLSearchParams('?rating=4&direction=landscape&gps=yes&minDuration=60&minWidth=1280'),
    );
    expect(matchesMediaFilters(asset, filter)).toBe(true);
    expect(matchesMediaFilters({ ...asset, duration: 30_000 }, filter)).toBe(false);
    expect(matchesMediaFilters({ ...asset, exifInfo: { ...asset.exifInfo, rating: 2 } }, filter)).toBe(false);
  });

  it('filters RAW images by extension', () => {
    const filter = parseMediaFilters(new URLSearchParams('?raw=1'));
    expect(matchesMediaFilters({ ...asset, originalFileName: 'photo.CR3' }, filter)).toBe(true);
    expect(matchesMediaFilters(asset, filter)).toBe(false);
  });
});
