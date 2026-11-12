<script lang="ts">
  import { assetViewerManager } from '$lib/managers/asset-viewer-manager.svelte';
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import MapModal from '$lib/modals/MapModal.svelte';
  import { handleError } from '$lib/utils/handle-error';
  import {
    createMapMarkerCacheKey,
    getCachedMapMarkers,
    isMapMarkerCacheFresh,
    setCachedMapMarkers,
  } from '$lib/utils/map-marker-cache';
  import { navigate } from '$lib/utils/navigation';
  import { getAlbumMapMarkers, type AlbumResponseDto, type MapMarkerResponseDto } from '@immich/sdk';
  import { IconButton, modalManager } from '@immich/ui';
  import { mdiMapOutline } from '@mdi/js';
  import { onDestroy, onMount } from 'svelte';
  import { t } from 'svelte-i18n';

  interface Props {
    album: AlbumResponseDto;
  }

  let { album }: Props = $props();
  let cancelable: AbortController;

  let returnToMap = $state(false);
  let mapMarkers: MapMarkerResponseDto[] = $state([]);

  onMount(async () => {
    const cacheKey = getMapMarkerCacheKey();
    const cached = await getCachedMapMarkers(cacheKey);
    if (cached) {
      mapMarkers = cached.markers;
    }

    if (!cached || !isMapMarkerCacheFresh(cached.cachedAt)) {
      const refreshed = await loadMapMarkers(cacheKey);
      if (refreshed) {
        mapMarkers = refreshed;
      }
    }
  });

  onDestroy(() => {
    cancelable?.abort();
    assetViewerManager.showAssetViewer(false);
  });

  $effect(() => {
    if (assetViewerManager.isViewing || !returnToMap) {
      return;
    }

    returnToMap = false;
    void onClick();
  });

  const getMapMarkerCacheKey = () => {
    const identity = authManager.isSharedLink
      ? `shared:${authManager.params.key}:${authManager.params.slug}`
      : `user:${authManager.user.id}`;
    return createMapMarkerCacheKey(identity, { albumId: album.id, updatedAt: album.updatedAt });
  };

  const loadMapMarkers = async (cacheKey = getMapMarkerCacheKey()) => {
    cancelable?.abort();
    cancelable = new AbortController();

    try {
      const markers = await getAlbumMapMarkers({ ...authManager.params, id: album.id }, { signal: cancelable.signal });
      await setCachedMapMarkers(cacheKey, markers);
      return markers;
    } catch (error) {
      handleError(error, $t('errors.something_went_wrong'));
      return;
    }
  };

  const onClick = async () => {
    const assetIds = await modalManager.show(MapModal, { mapMarkers });
    if (assetIds) {
      await navigate({ targetRoute: 'current', assetId: assetIds[0] });
      returnToMap = true;
    } else {
      returnToMap = false;
    }
  };
</script>

<IconButton
  variant="ghost"
  shape="round"
  color="secondary"
  icon={mdiMapOutline}
  onclick={onClick}
  aria-label={$t('map')}
/>
