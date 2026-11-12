import { describe, expect, it } from 'vitest';
import { normalizeDisplayText } from './text-repair';

describe('normalizeDisplayText', () => {
  it('keeps normal Chinese text', () => {
    expect(normalizeDisplayText('旅行')).toBe('旅行');
  });

  it('repairs double-encoded UTF-8 text', () => {
    expect(normalizeDisplayText('æè¡')).toBe('旅行');
  });
});
