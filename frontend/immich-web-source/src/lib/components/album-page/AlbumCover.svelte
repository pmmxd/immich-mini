<script lang="ts">
  import AssetCover from '$lib/components/sharedlinks-page/covers/AssetCover.svelte';
  import NoCover from '$lib/components/sharedlinks-page/covers/NoCover.svelte';
  import { getAssetMediaUrl } from '$lib/utils';
  import { AssetMediaSize, type AlbumResponseDto } from '@immich/sdk';
  import { t } from 'svelte-i18n';

  interface Props {
    album: AlbumResponseDto;
    preload?: boolean;
    class?: string;
  }

  let { album, preload = false, class: className }: Props = $props();

  let alt = $derived(album.albumName || $t('unnamed_album'));
  let coverKind = $derived(
    (album as AlbumResponseDto & { albumThumbnailAssetType?: 'image' | 'video' })
      .albumThumbnailAssetType === 'video'
      ? 'video'
      : 'image',
  );
  let thumbnailUrl = $derived(
    album.albumThumbnailAssetId
      ? getAssetMediaUrl({ id: album.albumThumbnailAssetId, size: AssetMediaSize.Original })
      : null,
  );
</script>

{#if thumbnailUrl}
  <AssetCover {alt} class={className} kind={coverKind} src={thumbnailUrl} {preload} />
{:else}
  <NoCover {alt} class={className} {preload} />
{/if}
