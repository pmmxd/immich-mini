<script lang="ts">
  import { Route } from '$lib/route';
  import type { MediaType, MediaWorkspaceTab, VideoOrientation } from '$lib/utils/media-workspace';
  import { AssetVisibility, getAssetStatistics, type AssetStatsResponseDto } from '@immich/sdk';
  import { onMount } from 'svelte';
  import { locale, t } from 'svelte-i18n';

  interface Props {
    active: MediaWorkspaceTab;
    mediaType?: MediaType;
    orientation?: VideoOrientation;
  }

  let { active, mediaType, orientation = 'all' }: Props = $props();
  let stats = $state<AssetStatsResponseDto>();

  const tabs = $derived([
    { id: 'all' as const, label: $t('all'), href: Route.photos(), count: stats?.total },
    { id: 'video' as const, label: $t('videos'), href: Route.photos({ type: 'video' }), count: stats?.videos },
    { id: 'image' as const, label: $t('image'), href: Route.photos({ type: 'image' }), count: stats?.images },
    {
      id: 'timeline' as const,
      label: $t('timeline'),
      href: Route.photos({
        view: 'timeline',
        type: mediaType,
        orientation: mediaType ? orientation : undefined,
      }),
    },
  ]);

  const orientationTabs = $derived([
    { id: 'all' as const, label: $t('all_videos'), href: Route.photos({ type: 'video' }) },
    {
      id: 'landscape' as const,
      label: $t('landscape'),
      href: Route.photos({ type: 'video', orientation: 'landscape' }),
    },
    { id: 'portrait' as const, label: $t('portrait'), href: Route.photos({ type: 'video', orientation: 'portrait' }) },
  ]);
  const imageOrientationTabs = $derived([
    { id: 'all' as const, label: $t('all_photos'), href: Route.photos({ type: 'image' }) },
    {
      id: 'landscape' as const,
      label: $t('landscape_images'),
      href: Route.photos({ type: 'image', orientation: 'landscape' }),
    },
    {
      id: 'portrait' as const,
      label: $t('portrait_images'),
      href: Route.photos({ type: 'image', orientation: 'portrait' }),
    },
  ]);

  onMount(async () => {
    stats = await getAssetStatistics({ visibility: AssetVisibility.Timeline }).catch(() => undefined);
  });
</script>

<nav aria-label={$t('photos_and_videos')} class="shrink-0 border-b border-gray-200 dark:border-gray-700">
  <div class="flex min-h-12 scrollbar-hidden items-stretch gap-1 overflow-x-auto px-2 sm:px-4">
    {#each tabs as tab (tab.id)}
      <a
        href={tab.href}
        aria-current={active === tab.id ? 'page' : undefined}
        class="relative flex shrink-0 items-center gap-2 px-3 text-sm font-medium whitespace-nowrap text-gray-600 after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 hover:text-immich-primary dark:text-gray-300 dark:hover:text-immich-dark-primary"
        class:after:bg-immich-primary={active === tab.id}
        class:text-immich-primary={active === tab.id}
        class:dark:after:bg-immich-dark-primary={active === tab.id}
        class:dark:text-immich-dark-primary={active === tab.id}
      >
        {tab.label}
        {#if tab.count !== undefined}
          <span class="rounded-full bg-gray-100 px-2 py-0.5 text-xs tabular-nums dark:bg-gray-800">
            {tab.count.toLocaleString($locale ?? undefined)}
          </span>
        {/if}
      </a>
    {/each}
  </div>

  {#if active === 'video' || active === 'image'}
    <div class="flex scrollbar-hidden overflow-x-auto border-t border-gray-100 px-2 sm:px-4 dark:border-gray-800">
      {#each active === 'video' ? orientationTabs : imageOrientationTabs as tab (tab.id)}
        <a
          href={tab.href}
          aria-current={orientation === tab.id ? 'page' : undefined}
          class="flex shrink-0 items-center gap-2 border-b-2 border-transparent px-3 py-2 text-sm whitespace-nowrap text-gray-500 hover:text-immich-primary dark:text-gray-400 dark:hover:text-immich-dark-primary"
          class:border-immich-primary={orientation === tab.id}
          class:text-immich-primary={orientation === tab.id}
          class:dark:border-immich-dark-primary={orientation === tab.id}
          class:dark:text-immich-dark-primary={orientation === tab.id}
        >
          {tab.label}
        </a>
      {/each}
    </div>
  {/if}
</nav>
