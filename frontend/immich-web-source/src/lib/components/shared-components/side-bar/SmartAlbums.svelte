<script lang="ts">
  import AlbumCover from '$lib/components/album-page/AlbumCover.svelte';
  import NoCover from '$lib/components/sharedlinks-page/covers/NoCover.svelte';
  import { smartAlbumManager } from '$lib/managers/smart-album-manager.svelte';
  import { Route } from '$lib/route';
  import { getAlbumInfo, type AlbumResponseDto } from '@immich/sdk';
  import { Badge } from '@immich/ui';
  import { t } from 'svelte-i18n';
  import { onMount } from 'svelte';

  let covers = $state<Record<string, AlbumResponseDto>>({});

  onMount(() => {
    if (!smartAlbumManager.loaded) {
      smartAlbumManager.load();
    }
    const sixHours = 6 * 60 * 60 * 1000;
    const timer = setTimeout(() => {
      for (const album of smartAlbumManager.albums) {
        if (Date.now() - new Date(album.updatedAt).getTime() > sixHours) {
          void smartAlbumManager.sync(album).catch(() => {});
        }
      }
    }, 3000);
    return () => clearTimeout(timer);
  });

  $effect(() => {
    const albums = smartAlbumManager.albums.map(({ albumId }) => albumId);
    if (albums.length === 0) {
      return;
    }
    void Promise.all(
      albums.map(async (albumId) => {
        try {
          return [albumId, await getAlbumInfo({ id: albumId })] as const;
        } catch {
          return undefined;
        }
      }),
    ).then((items) => {
      covers = Object.fromEntries(items.filter((item) => item !== undefined));
    });
  });
</script>

{#if smartAlbumManager.albums.length > 0}
  {#each smartAlbumManager.albums as album (album.id)}
    <a
      href={Route.viewAlbum({ id: album.albumId })}
      title={album.name}
      class="group flex w-full place-items-center justify-between gap-4 rounded-e-full py-3 ps-10 transition-[padding] delay-100 duration-100 hover:cursor-pointer hover:bg-subtle hover:text-immich-primary group-hover:sm:px-10 md:px-10 dark:text-immich-dark-fg dark:hover:bg-immich-dark-gray dark:hover:text-immich-dark-primary"
    >
      <div>
        {#if covers[album.albumId]}
          <AlbumCover album={covers[album.albumId]} class="size-6 rounded-sm" />
        {:else}
          <div class="size-6">
            <NoCover alt={album.name} class="rounded-sm" />
          </div>
        {/if}
      </div>
      <div class="flex min-w-0 grow items-center gap-2">
        <span class="truncate text-sm font-medium">{album.name}</span>
        <Badge size="tiny" class="shrink-0">{$t('smart_badge')}</Badge>
      </div>
    </a>
  {/each}
{/if}
