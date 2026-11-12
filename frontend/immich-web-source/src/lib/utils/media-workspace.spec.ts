import { describe, expect, it } from 'vitest';
import { formatDuration, getMediaDirection, hasWorkspaceFilters, parseMediaWorkspace } from './media-workspace';

describe('media workspace', () => {
  it.each([
    ['', 'all', undefined, 'all'],
    ['?type=image', 'image', 'image', 'all'],
    ['?type=image&orientation=portrait', 'image', 'image', 'portrait'],
    ['?type=video', 'video', 'video', 'all'],
    ['?type=video&orientation=portrait', 'video', 'video', 'portrait'],
    ['?type=video&orientation=invalid', 'video', 'video', 'all'],
    ['?view=timeline&type=video', 'timeline', 'video', 'all'],
  ])('parses %s', (search, tab, mediaType, orientation) => {
    expect(parseMediaWorkspace(new URLSearchParams(search))).toEqual({ tab, mediaType, orientation });
  });

  it('classifies direction and unknown dimensions', () => {
    expect(getMediaDirection({ width: 1920, height: 1080 })).toBe('landscape');
    expect(getMediaDirection({ width: 1080, height: 1920 })).toBe('portrait');
    expect(getMediaDirection({ width: 1920, height: 1920 })).toBe('landscape');
    expect(getMediaDirection({ width: null, height: 1080 })).toBe('unknown');
  });

  it('recognizes workspace filters', () => {
    expect(hasWorkspaceFilters(new URLSearchParams('?type=video&orientation=portrait'))).toBe(false);
    expect(hasWorkspaceFilters(new URLSearchParams('?type=video&rating=4'))).toBe(true);
  });

  it('formats durations', () => {
    expect(formatDuration(65_000)).toBe('1:05');
    expect(formatDuration(3_665_000)).toBe('1:01:05');
  });
});
