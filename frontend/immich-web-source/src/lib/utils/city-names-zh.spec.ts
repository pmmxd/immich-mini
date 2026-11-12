import { describe, expect, it } from 'vitest';
import { toChineseCityName, toLocalizedPlaceName } from './city-names-zh';

describe('toChineseCityName', () => {
  it('keeps Chinese names', () => {
    expect(toChineseCityName('上海')).toBe('上海');
  });

  it('translates common English city names', () => {
    expect(toChineseCityName('Shanghai')).toBe('上海');
    expect(toChineseCityName('Xi’an')).toBe('西安');
    expect(toChineseCityName('Hong Kong')).toBe('香港');
  });

  it('translates the places shown by Immich', () => {
    expect(toChineseCityName('Baizhifang')).toBe('白纸坊');
    expect(toChineseCityName('Dali Old Town')).toBe('大理古城');
    expect(toChineseCityName('Jinrongjie')).toBe('金融街');
    expect(toChineseCityName('Liulimiao')).toBe('琉璃庙');
    expect(toChineseCityName('China')).toBe('中国');
    expect(toChineseCityName('Ningwei')).toBe('宁围');
    expect(toChineseCityName('Zhejiang')).toBe('浙江');
  });

  it('keeps unknown names unchanged', () => {
    expect(toChineseCityName('Example City')).toBe('Example City');
  });

  it('only localizes place names for Chinese locales', () => {
    expect(toLocalizedPlaceName('Zhejiang', 'zh-Hans')).toBe('浙江');
    expect(toLocalizedPlaceName('Zhejiang', 'en')).toBe('Zhejiang');
  });
});
