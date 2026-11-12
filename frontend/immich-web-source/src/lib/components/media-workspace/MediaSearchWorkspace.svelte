<script lang="ts">
  import { page } from '$app/state';
  import MediaCard from './MediaCard.svelte';
  import MediaTimeline from './MediaTimeline.svelte';
  import { getByteUnitString } from '$lib/utils/byte-units';
  import { eventManager } from '$lib/managers/event-manager.svelte';
  import { assetViewerManager } from '$lib/managers/asset-viewer-manager.svelte';
  import {
    buildMediaSearchDto,
    hasClientOnlyFilters,
    matchesMediaFilters,
    parseMediaFilters,
  } from '$lib/utils/media-filters';
  import { formatDuration, type MediaType, type VideoOrientation } from '$lib/utils/media-workspace';
  import { navigate } from '$lib/utils/navigation';
  import type { AssetResponseDto } from '@immich/sdk';
  import { searchAssets } from '@immich/sdk';
  import { LoadingSpinner } from '@immich/ui';
  import { onDestroy, onMount, untrack } from 'svelte';
  import { locale, t } from 'svelte-i18n';

  interface Props {
    mediaType?: MediaType;
    orientation: VideoOrientation;
    cardSize: number;
    grouped?: boolean;
  }

  let { mediaType, orientation, cardSize, grouped = false }: Props = $props();
  let assets = $state<AssetResponseDto[]>([]);
  let total = $state(0);
  let nextCursor = $state<string | undefined>();
  let loading = $state(false);
  let error = $state('');
  let sentinel = $state<HTMLElement>();
  const portrait = $derived(orientation === 'portrait' && mediaType ? mediaType : false);

  const filter = $derived({
    ...parseMediaFilters(page.url.searchParams),
    direction:
      orientation === 'all'
        ? parseMediaFilters(page.url.searchParams).direction
        : (orientation as 'landscape' | 'portrait'),
  });
  const pageSize = 100;
  const queryKey = $derived(JSON.stringify(buildMediaSearchDto(filter, mediaType, undefined, pageSize)));

  const stats = $derived({
    images: assets.filter((asset) => asset.type === 'IMAGE').length,
    videos: assets.filter((asset) => asset.type === 'VIDEO').length,
    gps: assets.filter(
      (asset) =>
        asset.exifInfo?.latitude !== null &&
        asset.exifInfo?.latitude !== undefined &&
        asset.exifInfo.longitude !== null &&
        asset.exifInfo.longitude !== undefined,
    ).length,
    bytes: assets.reduce((sum, asset) => sum + (asset.exifInfo?.fileSizeInByte ?? 0), 0),
    duration: assets.reduce((sum, asset) => sum + (asset.type === 'VIDEO' ? (asset.duration ?? 0) : 0), 0),
  });

  const sortClientSide = (items: AssetResponseDto[]) => {
    if (filter.sort === 'name') {
      return items.sort(
        (a, b) => a.originalFileName.localeCompare(b.originalFileName) * (filter.order === 'asc' ? 1 : -1),
      );
    }
    return items;
  };

  const loadPage = async (cursor?: string) => {
    if (loading || assetViewerManager.isViewing) {
      return;
    }
    loading = true;
    error = '';
    try {
      const response = await searchAssets({
        metadataSearchDto: buildMediaSearchDto(filter, mediaType, cursor, pageSize),
      });
      const items = response.assets.items.filter((asset) => matchesMediaFilters(asset, filter));
      const existingIds = new Set(assets.map((asset) => asset.id));
      assets = [...assets, ...sortClientSide(items.filter((asset) => !existingIds.has(asset.id)))];
      total = response.assets.total;
      nextCursor = response.assets.nextCursor ?? undefined;
    } catch (error_) {
      error = error_ instanceof Error ? error_.message : String(error_);
    } finally {
      loading = false;
    }
  };

  const reload = async () => {
    assets = [];
    total = 0;
    nextCursor = undefined;
    await loadPage();
  };

  const loadMore = () => {
    void loadPage(nextCursor);
  };

  $effect(() => {
    const query = queryKey;
    if (!query) {
      return;
    }
    untrack(() => void reload());
  });

  onMount(() => {
    let observer: IntersectionObserver | undefined;
    if (sentinel) {
      observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            loadMore();
          }
        },
        { rootMargin: '600px' },
      );
      observer.observe(sentinel);
    }
    return () => observer?.disconnect();
  });

  const unsubscribe = eventManager.on({
    AssetUpdate: (updatedAsset) => {
      assets = assets.map((asset) => (asset.id === updatedAsset.id ? updatedAsset : asset));
    },
  });
  onDestroy(unsubscribe);

  const open = (asset: AssetResponseDto) => {
    void navigate({ targetRoute: 'current', assetId: asset.id });
  };
</script>

<section class="flex min-h-0 flex-1 flex-col">
  <div
    class="flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-gray-200 px-3 py-2 text-xs text-gray-600 dark:border-gray-700 dark:text-gray-300"
  >
    <span>
      {$t('candidate_total')}: <strong>{total.toLocaleString($locale ?? undefined)}</strong>
    </span>
    <span>
      {$t('loaded') ?? 'Loaded'}: {assets.length.toLocaleString($locale ?? undefined)}{hasClientOnlyFilters(filter)
        ? ' *'
        : ''}
    </span>
    <span>{$t('image')}: {stats.images}</span>
    <span>{$t('videos')}: {stats.videos}</span>
    <span>{getByteUnitString(stats.bytes, $locale ?? undefined)}</span>
    <span>{$t('gps')}: {stats.gps}</span>
    <span>{$t('duration')}: {formatDuration(stats.duration)}</span>
  </div>

  <div class="min-h-0 flex-1 overflow-y-auto p-3">
    {#if error}
      <div class="mb-3 rounded-sm border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/30">
        {error}
      </div>
    {/if}

    {#if grouped}
      <MediaTimeline {assets} {cardSize} {portrait} onOpen={open} />
    {:else}
      <div class="flex flex-wrap gap-2">
        {#each assets as asset (asset.id)}
          <MediaCard {asset} {cardSize} {portrait} onOpen={open} />
        {/each}
      </div>
    {/if}

    {#if assets.length === 0 && !loading}
      <div class="flex min-h-60 items-center justify-center text-sm text-gray-500">{$t('no_results')}</div>
    {/if}

    {#if loading}
      <div class="flex justify-center py-8"><LoadingSpinner /></div>
    {/if}
    {#if nextCursor && !loading}
      <div class="flex justify-center py-4">
        <button
          type="button"
          class="rounded-sm border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-800"
          onclick={loadMore}
        >
          {$t('load_more')}
        </button>
      </div>
    {/if}
    <div bind:this={sentinel} class="h-8"></div>
  </div>
</section>
