<script lang="ts">
  import Thumbnail from '$lib/components/assets/thumbnail/Thumbnail.svelte';
  import { assetMultiSelectManager } from '$lib/managers/asset-multi-select-manager.svelte';
  import { getByteUnitString } from '$lib/utils/byte-units';
  import { formatDuration, getMediaDirection } from '$lib/utils/media-workspace';
  import { toChineseCityName } from '$lib/utils/city-names-zh';
  import { Route } from '$lib/route';
  import { toTimelineAsset } from '$lib/utils/timeline-util';
  import { AssetTypeEnum, type AssetResponseDto } from '@immich/sdk';
  import { locale, t } from 'svelte-i18n';
  import { DateTime } from 'luxon';

  interface Props {
    asset: AssetResponseDto;
    cardSize: number;
    portrait?: 'image' | 'video' | false;
    onOpen: (asset: AssetResponseDto) => void;
  }

  let { asset, cardSize, portrait = false, onOpen }: Props = $props();

  const exif = $derived(asset.exifInfo);
  const direction = $derived(getMediaDirection(asset));
  const date = $derived(DateTime.fromISO(asset.localDateTime).setLocale($locale ?? 'en'));
  const timelineAsset = $derived(toTimelineAsset(asset));
  const selected = $derived(assetMultiSelectManager.hasSelectedAsset(asset.id));
  const thumbnailHeight = $derived(
    portrait === 'video'
      ? Math.round((cardSize * 16) / 9)
      : portrait === 'image'
        ? Math.round((cardSize * 4) / 3)
        : Math.round((cardSize * 3) / 4),
  );
  const metadata = $derived(
    [
      toChineseCityName(exif?.city),
      exif?.make,
      exif?.model,
      exif?.lensModel,
      asset.width && asset.height ? `${asset.width} × ${asset.height}` : undefined,
      exif?.fileSizeInByte ? getByteUnitString(exif.fileSizeInByte, $locale ?? undefined) : undefined,
      asset.duration ? formatDuration(asset.duration) : undefined,
    ].filter(Boolean),
  );

  const toggleSelection = () => {
    if (selected) {
      assetMultiSelectManager.removeAssetFromMultiselectGroup(asset.id);
    } else {
      assetMultiSelectManager.selectAsset(timelineAsset);
    }
  };

  const openAsset = () => {
    if (assetMultiSelectManager.selectionActive) {
      toggleSelection();
      return;
    }
    onOpen(asset);
  };
</script>

<article
  class="group flex max-w-full flex-col overflow-hidden rounded-lg bg-white ring-1 ring-gray-200 transition hover:-translate-y-0.5 hover:ring-2 hover:ring-immich-primary dark:bg-immich-dark-gray dark:ring-gray-700 dark:hover:ring-immich-dark-primary"
  style:width={`${cardSize}px`}
>
  <div
    class={[
      'relative overflow-hidden bg-gray-100 dark:bg-gray-800',
      portrait === 'video' ? 'aspect-9/16' : portrait === 'image' ? 'aspect-3/4' : 'aspect-4/3',
    ]}
  >
    <Thumbnail
      asset={timelineAsset}
      {selected}
      disableLinkMouseOver
      preload={false}
      thumbnailWidth={cardSize}
      {thumbnailHeight}
      imageClass={portrait === 'image' ? 'object-contain' : 'object-cover'}
      onClick={openAsset}
      onSelect={toggleSelection}
    />
    <div class="absolute inset-x-2 top-2 flex items-start justify-between gap-2">
      <div class="flex flex-wrap gap-1">
        {#if asset.type === AssetTypeEnum.Video}
          <span class="rounded-sm bg-black/65 px-2 py-1 text-xs font-medium text-white">
            {formatDuration(asset.duration ?? 0)}
          </span>
        {/if}
        {#if asset.type === AssetTypeEnum.Video}
          <span class="rounded-sm bg-black/65 px-2 py-1 text-xs font-medium text-white">
            {direction === 'portrait' ? '9:16' : direction === 'landscape' ? '16:9' : '?'}
          </span>
        {/if}
      </div>
      {#if asset.isFavorite}
        <span class="rounded-full bg-black/65 px-2 py-1 text-xs text-white" title={$t('favorite')}>♥</span>
      {/if}
    </div>
  </div>

  <a
    href={Route.viewAsset({ id: asset.id })}
    class="flex shrink-0 flex-col gap-1 px-3 py-2 text-sm"
    onclick={(event) => {
      event.preventDefault();
      openAsset();
    }}
  >
    <div class="flex items-start justify-between gap-2">
      <h3 class="min-w-0 truncate font-medium" title={asset.originalFileName}>{asset.originalFileName}</h3>
      {#if exif?.rating && exif.rating > 0}
        <span class="shrink-0 text-amber-500" aria-label={$t('rating')}>{'★'.repeat(exif.rating)}</span>
      {/if}
    </div>
    <p class="text-xs text-gray-500">{date.toLocaleString(DateTime.DATETIME_MED)}</p>
    <p class="truncate text-xs text-gray-500">
      {metadata.length > 0 ? metadata.join(' · ') : (exif?.city ?? $t('gps'))}
    </p>
  </a>
</article>
