const LOCAL_ASSET_PREFIX = '00000000-0000-4000-8000-';

export function toAssetId(id: number): string {
  return `${LOCAL_ASSET_PREFIX}${id.toString(16).padStart(12, '0')}`;
}

export function parseAssetId(value: string): number | undefined {
  if (/^\d+$/.test(value)) {
    const id = Number(value);
    return Number.isSafeInteger(id) && id > 0 ? id : undefined;
  }
  const match = /^00000000-0000-4000-8000-([0-9a-f]{12})$/i.exec(value);
  if (!match?.[1]) {
    return undefined;
  }
  const id = Number.parseInt(match[1], 16);
  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
}
