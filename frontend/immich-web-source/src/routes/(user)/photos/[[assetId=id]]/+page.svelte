<script lang="ts">
  import { page } from '$app/state';
  import ActionMenuItem from '$lib/components/ActionMenuItem.svelte';
  import UserPageLayout from '$lib/components/layouts/UserPageLayout.svelte';
  import MediaFilterBar from '$lib/components/media-workspace/MediaFilterBar.svelte';
  import MediaSearchWorkspace from '$lib/components/media-workspace/MediaSearchWorkspace.svelte';
  import MediaWorkspaceNavigation from '$lib/components/media-workspace/MediaWorkspaceNavigation.svelte';
  import ButtonContextMenu from '$lib/components/shared-components/context-menu/ButtonContextMenu.svelte';
  import EmptyPlaceholder from '$lib/components/shared-components/EmptyPlaceholder.svelte';
  import Portal from '$lib/elements/Portal.svelte';
  import AnnualAction from '$lib/components/timeline/actions/AnnualAction.svelte';
  import ArchiveAction from '$lib/components/timeline/actions/ArchiveAction.svelte';
  import ChangeDate from '$lib/components/timeline/actions/ChangeDateAction.svelte';
  import ChangeDescription from '$lib/components/timeline/actions/ChangeDescriptionAction.svelte';
  import ChangeLocation from '$lib/components/timeline/actions/ChangeLocationAction.svelte';
  import DeleteAssets from '$lib/components/timeline/actions/DeleteAssetsAction.svelte';
  import DownloadAction from '$lib/components/timeline/actions/DownloadAction.svelte';
  import FavoriteAction from '$lib/components/timeline/actions/FavoriteAction.svelte';
  import RateAssetsAction from '$lib/components/timeline/actions/RateAssetsAction.svelte';
  import LinkLivePhotoAction from '$lib/components/timeline/actions/LinkLivePhotoAction.svelte';
  import SelectAllAssets from '$lib/components/timeline/actions/SelectAllAction.svelte';
  import SetVisibilityAction from '$lib/components/timeline/actions/SetVisibilityAction.svelte';
  import AssetSelectControlBar from '$lib/components/timeline/AssetSelectControlBar.svelte';
  import Timeline from '$lib/components/timeline/Timeline.svelte';
  import { AssetAction } from '$lib/constants';
  import { assetMultiSelectManager } from '$lib/managers/asset-multi-select-manager.svelte';
  import { assetViewerManager } from '$lib/managers/asset-viewer-manager.svelte';
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import { memoryManager } from '$lib/managers/memory-manager.svelte';
  import { TimelineManager } from '$lib/managers/timeline-manager/timeline-manager.svelte';
  import { Route } from '$lib/route';
  import { getAssetBulkActions } from '$lib/services/asset.service';
  import { getStackBulkActions } from '$lib/services/stack.service';
  import { getAssetMediaUrl, memoryLaneTitle } from '$lib/utils';
  import { hasWorkspaceFilters, parseMediaWorkspace } from '$lib/utils/media-workspace';
  import { type OnLink, type OnUnlink } from '$lib/utils/actions';
  import { openFileUploadDialog } from '$lib/utils/file-uploader';
  import { navigate } from '$lib/utils/navigation';
  import { getAltText } from '$lib/utils/thumbnail-util';
  import { toTimelineAsset } from '$lib/utils/timeline-util';
  import { AssetVisibility } from '@immich/sdk';
  import MemoryCard from '$lib/components/memories/MemoryCard.svelte';
  import { ActionButton, CommandPaletteDefaultProvider, ImageCarousel } from '@immich/ui';
  import { mdiDotsVertical } from '@mdi/js';
  import { onMount } from 'svelte';
  import { DateTime } from 'luxon';
  import { t } from 'svelte-i18n';

  let timelineManager = $state<TimelineManager>() as TimelineManager;
  let cardSize = $state(240);
  let pinned = $state(false);
  const workspace = $derived(parseMediaWorkspace(page.url.searchParams));
  const options = $derived({
    visibility: AssetVisibility.Timeline,
    withStacked: true,
    withPartners: true,
    mediaType: workspace.mediaType,
    mediaOrientation: workspace.orientation,
  });
  const groupedTimeline = $derived(workspace.tab === 'timeline');
  const useSearchWorkspace = $derived(
    workspace.tab === 'image' ||
      workspace.tab === 'video' ||
      workspace.tab === 'timeline' ||
      hasWorkspaceFilters(page.url.searchParams),
  );

  let selectedAssets = $derived(assetMultiSelectManager.assets);
  let isLinkActionAvailable = $derived.by(() => {
    const isLivePhoto = selectedAssets.length === 1 && !!selectedAssets[0].livePhotoVideoId;
    const isLivePhotoCandidate =
      selectedAssets.length === 2 &&
      selectedAssets.some((asset) => asset.isImage) &&
      selectedAssets.some((asset) => asset.isVideo);

    return assetMultiSelectManager.isAllUserOwned && (isLivePhoto || isLivePhotoCandidate);
  });

  const handleEscape = () => {
    if (assetViewerManager.isViewing) {
      return;
    }
    if (assetMultiSelectManager.selectionActive) {
      assetMultiSelectManager.clear();
      return;
    }
  };

  const handleLink: OnLink = ({ still, motion }) => {
    timelineManager?.removeAssets([motion.id]);
    timelineManager?.upsertAssets([still]);
  };

  const handleUnlink: OnUnlink = ({ still, motion }) => {
    timelineManager?.upsertAssets([motion]);
    timelineManager?.upsertAssets([still]);
  };

  const handleSetVisibility = (assetIds: string[]) => {
    timelineManager?.removeAssets(assetIds);
    assetMultiSelectManager.clear();
  };

  const items = $derived(
    memoryManager.memories.map((memory) => ({
      id: memory.id,
      title: $memoryLaneTitle(memory),
      href: Route.viewMemory({ id: memory.id, assetId: memory.assets[0].id }),
      alt: $t('memory_lane_title', { values: { title: $getAltText(toTimelineAsset(memory.assets[0])) } }),
      src: getAssetMediaUrl({ id: memory.assets[0].id }),
      type: memory.type,
    })),
  );

  memoryManager.setFilters({ $for: DateTime.now().toISODate() });

  onMount(() => {
    cardSize = Number(localStorage.getItem('media-workspace-card-size')) || 240;
    pinned = localStorage.getItem('media-workspace-pinned') === '1';
    const preloadViewer = setTimeout(() => {
      void import('$lib/components/asset-viewer/AssetViewer.svelte');
    }, 1500);
    return () => clearTimeout(preloadViewer);
  });

  $effect(() => {
    localStorage.setItem('media-workspace-card-size', String(cardSize));
    localStorage.setItem('media-workspace-pinned', pinned ? '1' : '0');
  });
</script>

<UserPageLayout hideNavbar={assetMultiSelectManager.selectionActive} scrollbar={false}>
  <div class="flex h-full min-h-0 flex-col">
    <MediaWorkspaceNavigation
      active={workspace.tab}
      mediaType={workspace.mediaType}
      orientation={workspace.orientation}
    />
    <MediaFilterBar mediaType={workspace.mediaType} bind:cardSize bind:pinned />

    {#if useSearchWorkspace}
      <MediaSearchWorkspace
        mediaType={workspace.mediaType}
        orientation={workspace.orientation}
        {cardSize}
        grouped={groupedTimeline}
      />
    {:else}
      <div class="min-h-0 flex-1">
        <Timeline
          enableRouting={true}
          bind:timelineManager
          {options}
          assetInteraction={assetMultiSelectManager}
          removeAction={AssetAction.ARCHIVE}
          onEscape={handleEscape}
          withStacked
        >
          {#if authManager.preferences.memories.enabled}
            <ImageCarousel {items}>
              {#snippet child(item)}
                <MemoryCard {item} />
              {/snippet}
            </ImageCarousel>
          {/if}
          {#snippet empty()}
            <EmptyPlaceholder
              text={$t('no_assets_message')}
              onClick={() => openFileUploadDialog()}
              class="mx-auto mt-10"
            />
          {/snippet}
        </Timeline>
      </div>
    {/if}
  </div>
</UserPageLayout>

{#if useSearchWorkspace}
  <Portal target="body">
    {#if assetViewerManager.isViewing && assetViewerManager.asset}
      {#await import('$lib/components/asset-viewer/AssetViewer.svelte') then { default: AssetViewer }}
        <AssetViewer
          cursor={{ current: assetViewerManager.asset }}
          showNavigation={false}
          isShared={false}
          onClose={() => {
            assetViewerManager.showAssetViewer(false);
            void navigate({ targetRoute: 'current', assetId: null });
          }}
        />
      {/await}
    {/if}
  </Portal>
{/if}

{#if assetMultiSelectManager.selectionActive}
  <AssetSelectControlBar>
    {@const Actions = getAssetBulkActions($t)}
    {@const StackActions = getStackBulkActions($t)}
    <CommandPaletteDefaultProvider name={$t('assets')} actions={Object.values(Actions)} />

    <ActionButton action={Actions.CreateSharedLink} />
    {#if !useSearchWorkspace}
      <SelectAllAssets {timelineManager} assetInteraction={assetMultiSelectManager} />
    {/if}
    <ActionButton action={Actions.AddToAlbum} />

    {#if assetMultiSelectManager.isAllUserOwned}
      <FavoriteAction
        removeFavorite={assetMultiSelectManager.isAllFavorite}
        onFavorite={(ids, isFavorite) => timelineManager?.update(ids, (asset) => (asset.isFavorite = isFavorite))}
      />
      <ChangeDate />
      <ChangeLocation />
      <RateAssetsAction />
      <AnnualAction />
      <ArchiveAction
        unarchive={assetMultiSelectManager.isAllArchived}
        onArchive={(ids, visibility) => timelineManager?.update(ids, (asset) => (asset.visibility = visibility))}
      />

      <ButtonContextMenu icon={mdiDotsVertical} title={$t('menu')}>
        <DownloadAction menuItem />
        <ActionMenuItem action={StackActions.Stack} />
        <ActionMenuItem action={StackActions.Unstack} />
        {#if isLinkActionAvailable}
          <LinkLivePhotoAction
            menuItem
            unlink={assetMultiSelectManager.assets.length === 1}
            onLink={handleLink}
            onUnlink={handleUnlink}
          />
        {/if}
        <ChangeDescription menuItem />
        <ActionMenuItem action={Actions.Tag} />
        <DeleteAssets
          menuItem
          onAssetDelete={(assetIds) => timelineManager?.removeAssets(assetIds)}
          onUndoDelete={(assets) => timelineManager?.upsertAssets(assets)}
        />
        <SetVisibilityAction menuItem onVisibilitySet={handleSetVisibility} />
        <hr />
        <ActionMenuItem action={Actions.RegenerateThumbnailJob} />
        <ActionMenuItem action={Actions.RefreshMetadataJob} />
        <ActionMenuItem action={Actions.TranscodeVideoJob} />
      </ButtonContextMenu>
    {:else}
      <DownloadAction />
    {/if}
  </AssetSelectControlBar>
{/if}
