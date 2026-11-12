import { createMapMarkerCacheKey, isMapMarkerCacheFresh, MAP_MARKER_CACHE_TTL } from './map-marker-cache';

describe('map marker cache', () => {
  it('keeps markers cached for 24 hours', () => {
    expect(MAP_MARKER_CACHE_TTL).toBe(24 * 60 * 60 * 1000);
  });

  it('treats recent entries as fresh', () => {
    expect(isMapMarkerCacheFresh(0, MAP_MARKER_CACHE_TTL - 1)).toBe(true);
  });

  it('refreshes expired entries', () => {
    expect(isMapMarkerCacheFresh(0, MAP_MARKER_CACHE_TTL)).toBe(false);
  });

  it('keeps separate keys for separate scopes', () => {
    expect(createMapMarkerCacheKey('user-1', { albumId: 'album-1' })).not.toBe(
      createMapMarkerCacheKey('user-1', { albumId: 'album-2' }),
    );
  });
});
