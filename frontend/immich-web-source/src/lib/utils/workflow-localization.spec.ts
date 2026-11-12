import type { PluginMethodResponseDto } from '@immich/sdk';
import { describe, expect, it } from 'vitest';
import {
  getBuiltinWorkflowTemplates,
  localizeWorkflowEnumLabel,
  localizeWorkflowMethod,
} from './workflow-localization';

describe('workflow localization', () => {
  it('translates core method metadata and schema labels', () => {
    const method = {
      key: 'immich-plugin-core#assetDateFilter',
      name: 'assetDateFilter',
      title: 'Filter by date',
      description: 'Filter assets by date taken',
      types: [],
      uiHints: ['Filter'],
      hostFunctions: false,
      schema: {
        type: 'object',
        properties: {
          startDate: {
            type: 'object',
            title: 'Start date',
            description: 'Earliest date of assets to include',
            properties: {
              day: { type: 'number', title: 'Day', description: 'Day of the year to match' },
            },
          },
        },
      },
    } as unknown as PluginMethodResponseDto;

    expect(localizeWorkflowMethod(method, 'zh-Hans')).toMatchObject({
      title: '按拍摄日期筛选',
      description: '根据拍摄日期筛选资源',
      schema: {
        properties: {
          startDate: {
            title: '开始日期',
            properties: {
              day: { title: '日' },
            },
          },
        },
      },
    });
  });

  it('translates enum labels without changing stored values', () => {
    expect(localizeWorkflowEnumLabel('exact', 'zh-Hans')).toBe('完全匹配');
    expect(localizeWorkflowEnumLabel('exact', 'en')).toBe('exact');
  });

  it('provides localized built-in workflow templates', () => {
    const templates = getBuiltinWorkflowTemplates('zh-Hans');

    expect(templates).toHaveLength(3);
    expect(templates[0]).toMatchObject({ title: '按拍摄年份加入相册' });
    expect(templates[1]).toMatchObject({ title: '五星照片自动收藏' });
    expect(templates[2]).toMatchObject({ title: '视频自动加入视频相册' });
  });
});
