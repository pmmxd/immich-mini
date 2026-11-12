import type { PluginMethodResponseDto, PluginTemplateResponseDto, WorkflowTrigger } from '@immich/sdk';
import type { JSONSchemaProperty } from '$lib/types';

const methodText: Record<string, { title: string; description: string }> = {
  assetFileFilter: {
    title: '按文件名筛选',
    description: '使用文本或正则表达式匹配资源文件名',
  },
  assetMissingTimeZoneFilter: {
    title: '筛选缺少时区的资源',
    description: '筛选没有时区信息的资源',
  },
  assetLocationFilter: {
    title: '按地理位置筛选',
    description: '根据拍摄地点筛选资源',
  },
  assetDateFilter: {
    title: '按拍摄日期筛选',
    description: '根据拍摄日期筛选资源',
  },
  assetTypeFilter: {
    title: '按资源类型筛选',
    description: '按图片、视频等资源类型筛选',
  },
  assetAddTags: {
    title: '添加标签',
    description: '为资源添加标签',
  },
  assetTagFilter: {
    title: '按标签筛选',
    description: '根据资源已有的标签筛选',
  },
  assetExifFilter: {
    title: '按 EXIF 元数据筛选',
    description: '根据相机、镜头、评分等 EXIF 属性筛选资源',
  },
  assetArchive: {
    title: '归档资源',
    description: '将资源移动到归档',
  },
  assetLock: {
    title: '移入锁定文件夹',
    description: '将资源移动到锁定文件夹',
  },
  assetVisibility: {
    title: '更新可见性',
    description: '将资源设置为指定的可见性',
  },
  assetFavorite: {
    title: '收藏资源',
    description: '收藏或取消收藏资源',
  },
  assetAddToAlbums: {
    title: '添加到相册',
    description: '将资源加入指定相册',
  },
  webhook: {
    title: '触发 Webhook',
    description: '向指定地址发送事件数据',
  },
};

const schemaText: Record<string, { title?: string; description?: string }> = {
  'Filename pattern': {
    title: '文件名匹配规则',
    description: '用于匹配文件名的文本或正则表达式',
  },
  'Match type': {
    title: '匹配方式',
    description: '选择文件名的匹配方式',
  },
  'Case sensitive': {
    title: '区分大小写',
    description: '匹配时是否区分大小写',
  },
  'Use path': {
    title: '使用服务器路径',
    description: '匹配服务器上的完整路径，而不是原始文件名',
  },
  Inverse: {
    title: '反向操作',
    description: '开启后执行相反操作',
  },
  Region: {
    title: '地区',
    description: '按地区名称筛选',
  },
  Country: {
    title: '国家',
    description: '资源拍摄地必须匹配的国家',
  },
  'State/province': {
    title: '省/州',
    description: '资源拍摄地必须匹配的省或州',
  },
  City: {
    title: '城市',
    description: '资源拍摄地必须匹配的城市',
  },
  Coordinate: {
    title: '坐标',
    description: '按与指定坐标的距离筛选',
  },
  Latitude: {
    title: '纬度',
    description: '参考坐标的纬度',
  },
  Longitude: {
    title: '经度',
    description: '参考坐标的经度',
  },
  'Maximum distance': {
    title: '最大距离',
    description: '资源与参考坐标的最大距离，单位为公里',
  },
  'Start date': {
    title: '开始日期',
    description: '包含资源的最早日期',
  },
  Day: {
    title: '日',
    description: '要匹配的日期',
  },
  Month: {
    title: '月',
    description: '要匹配的月份',
  },
  Year: {
    title: '年',
    description: '要匹配的年份',
  },
  'End date': {
    title: '结束日期',
    description: '包含资源的最晚日期',
  },
  'Match recurring dates': {
    title: '匹配每年重复日期',
    description: '忽略年份，只匹配相同的月和日',
  },
  'Asset types': {
    title: '资源类型',
    description: '允许通过的资源类型',
  },
  Tags: {
    title: '标签',
    description: '选择要处理的标签',
  },
  Matching: {
    title: '匹配条件',
    description: '资源必须包含全部、任意一个或不包含所选标签',
  },
  Property: {
    title: 'EXIF 属性',
    description: '选择要匹配的 EXIF 属性',
  },
  Pattern: {
    title: '匹配规则',
    description: '要匹配的文本或正则表达式',
  },
  Visibility: {
    title: '可见性',
    description: '资源的可见性状态',
  },
  'Album IDs': {
    title: '相册',
    description: '选择目标相册',
  },
  'Album name': {
    title: '相册名称',
    description: '使用同名相册；不存在时自动创建',
  },
  URL: {
    title: '请求地址',
    description: '事件数据将作为 JSON 发送到此地址',
  },
  'Header name': {
    title: '请求头名称',
    description: '附加请求头的名称',
  },
  'Header value': {
    title: '请求头值',
    description: '附加请求头的值',
  },
  Method: {
    title: '请求方法',
    description: '使用的 HTTP 请求方法',
  },
};

const enumText: Record<string, string> = {
  contains: '包含',
  startsWith: '开头是',
  exact: '完全匹配',
  regex: '正则表达式',
  all: '全部满足',
  any: '任意一个',
  none: '都不包含',
  IMAGE: '图片',
  VIDEO: '视频',
  AUDIO: '音频',
  OTHER: '其他',
  archive: '归档',
  timeline: '时间线',
  locked: '锁定',
  make: '相机品牌',
  model: '相机型号',
  exifImageWidth: '图片宽度',
  exifImageHeight: '图片高度',
  fileSizeInByte: '文件大小',
  orientation: '方向',
  lensModel: '镜头型号',
  fNumber: '光圈值',
  focalLength: '焦距',
  iso: 'ISO',
  description: '描述',
  fps: '帧率',
  exposureTime: '曝光时间',
  livePhotoCID: '实况照片 ID',
  timeZone: '时区',
  projectionType: '投影类型',
  profileDescription: '色彩配置',
  colorspace: '色彩空间',
  bitsPerSample: '位深',
  rating: '评分',
};

const templateText: Record<string, { title: string; description: string }> = {
  'immich-plugin-core#screenshots-smart-album': {
    title: '自动归档截图',
    description: '自动归档文件名包含 screenshot 的上传，并可加入截图相册',
  },
  'immich-plugin-core#missing-timezone-smart-album': {
    title: '无时区资源相册',
    description: '将缺少时区的资源自动加入单独相册',
  },
  'immich-plugin-core#location-smart-album': {
    title: '按地点自动建相册',
    description: '将指定地点拍摄的资源自动加入相册',
  },
  'builtin-year-album': {
    title: '按拍摄年份加入相册',
    description: '将新资源按拍摄年份自动加入对应相册',
  },
  'builtin-five-star': {
    title: '五星照片自动收藏',
    description: '将评分为五星的照片自动加入收藏',
  },
  'builtin-video-album': {
    title: '视频自动加入视频相册',
    description: '将所有新视频自动加入视频相册',
  },
};

export const isChineseLocale = (locale: string | null | undefined) => !!locale && locale.toLowerCase().startsWith('zh');

const methodName = (key: string) => key.split('#').at(-1) ?? key;

export const localizeWorkflowMethodTitle = (method: PluginMethodResponseDto, locale: string | null | undefined) =>
  isChineseLocale(locale) ? (methodText[methodName(method.key)]?.title ?? method.title) : method.title;

export const localizeWorkflowMethodDescription = (
  method: PluginMethodResponseDto,
  locale: string | null | undefined,
) =>
  isChineseLocale(locale)
    ? (methodText[methodName(method.key)]?.description ?? method.description)
    : method.description;

export const localizeWorkflowMethod = (
  method: PluginMethodResponseDto,
  locale: string | null | undefined,
): PluginMethodResponseDto =>
  isChineseLocale(locale)
    ? {
        ...method,
        title: localizeWorkflowMethodTitle(method, locale),
        description: localizeWorkflowMethodDescription(method, locale),
        schema: localizeWorkflowSchema(method.schema as JSONSchemaProperty | undefined, locale),
      }
    : method;

const localizeWorkflowSchema = (
  schema: JSONSchemaProperty | undefined,
  locale: string | null | undefined,
): JSONSchemaProperty | undefined => {
  if (!schema || !isChineseLocale(locale)) {
    return schema;
  }

  const knownText = schema.title ? schemaText[schema.title] : undefined;
  return {
    ...schema,
    title: knownText?.title ?? schema.title,
    description: knownText?.description ?? schema.description,
    properties: schema.properties
      ? Object.fromEntries(
          Object.entries(schema.properties).map(([key, value]) => [key, localizeWorkflowSchema(value, locale)!]),
        )
      : undefined,
  };
};

export const localizeWorkflowTemplate = (
  template: PluginTemplateResponseDto,
  locale: string | null | undefined,
): PluginTemplateResponseDto => {
  const text = templateText[template.key];
  return isChineseLocale(locale) && text ? { ...template, ...text } : template;
};

export const localizeWorkflowEnumLabel = (value: string, locale: string | null | undefined) =>
  isChineseLocale(locale) ? (enumText[value] ?? value) : value;

export const getBuiltinWorkflowTemplates = (locale: string | null | undefined): PluginTemplateResponseDto[] => {
  const year = new Date().getFullYear();
  const templates: PluginTemplateResponseDto[] = [
    {
      key: 'builtin-year-album',
      title: 'Add to year album',
      description: 'Automatically add new assets to an album by captured year',
      trigger: 'AssetMetadataExtraction' as WorkflowTrigger,
      uiHints: ['SmartAlbum'],
      steps: [
        {
          method: 'immich-plugin-core#assetDateFilter',
          enabled: true,
          config: {
            startDate: { day: 1, month: 1, year },
            endDate: { day: 31, month: 12, year },
            recurring: false,
          },
        },
        {
          method: 'immich-plugin-core#assetAddToAlbums',
          enabled: true,
          config: { albumName: `${year} 照片`, albumIds: [] },
        },
      ],
    },
    {
      key: 'builtin-five-star',
      title: 'Favorite five-star photos',
      description: 'Automatically favorite photos rated five stars',
      trigger: 'AssetMetadataExtraction' as WorkflowTrigger,
      uiHints: [],
      steps: [
        {
          method: 'immich-plugin-core#assetExifFilter',
          enabled: true,
          config: {
            property: 'rating',
            pattern: '5',
            matchType: 'exact',
            caseSensitive: false,
          },
        },
        {
          method: 'immich-plugin-core#assetFavorite',
          enabled: true,
          config: {},
        },
      ],
    },
    {
      key: 'builtin-video-album',
      title: 'Add videos to an album',
      description: 'Automatically add new videos to a video album',
      trigger: 'AssetMetadataExtraction' as WorkflowTrigger,
      uiHints: ['SmartAlbum'],
      steps: [
        {
          method: 'immich-plugin-core#assetTypeFilter',
          enabled: true,
          config: { allowedTypes: ['VIDEO'] },
        },
        {
          method: 'immich-plugin-core#assetAddToAlbums',
          enabled: true,
          config: { albumName: '视频', albumIds: [] },
        },
      ],
    },
  ];

  return templates.map((template) => localizeWorkflowTemplate(template, locale));
};
