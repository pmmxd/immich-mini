<script lang="ts">
  import FrameExportModal from '$lib/modals/FrameExportModal.svelte';
  import DownloadAction from '$lib/components/timeline/actions/DownloadAction.svelte';
  import { assetMultiSelectManager } from '$lib/managers/asset-multi-select-manager.svelte';
  import {
    chooseLocalExportFolder,
    exportAssetsToFolder,
    exportFramedAssets,
    openImagesWithFrameEditor,
    openMediaWithDefaultApp,
    openMediaWithEditor,
    openMediaInFolder,
    openMediaWithSystemChooser,
  } from '$lib/services/local-media-tools.service';
  import { IconButton, modalManager, toastManager } from '@immich/ui';
  import {
    mdiContentCut,
    mdiFolderDownloadOutline,
    mdiFolderOpenOutline,
    mdiImageEditOutline,
    mdiImageFrame,
    mdiImageMultipleOutline,
    mdiOpenInApp,
    mdiOpenInNew,
  } from '@mdi/js';

  let busy = $state(false);
  const assets = $derived(assetMultiSelectManager.assets);
  const singleAsset = $derived(assets.length === 1);
  const allVideos = $derived(assets.length > 0 && assets.every((asset) => asset.isVideo));
  const allImages = $derived(assets.length > 0 && assets.every((asset) => asset.isImage));

  const openDefault = async () => {
    busy = true;
    try {
      const opened = await openMediaWithDefaultApp(assets.map((asset) => asset.id));
      toastManager.primary(`已用默认软件打开 ${opened} 个媒体`);
    } catch (error) {
      toastManager.danger(error instanceof Error ? error.message : '默认软件打开失败');
    } finally {
      busy = false;
    }
  };

  const openExternal = async () => {
    busy = true;
    try {
      await openMediaWithSystemChooser(assets.map((asset) => asset.id));
      toastManager.primary('已交给 LocalDock 打开系统应用选择器');
    } catch (error) {
      toastManager.danger(error instanceof Error ? error.message : '打开外部应用失败');
    } finally {
      busy = false;
    }
  };

  const exportWithFrame = async () => {
    const style = await modalManager.show(FrameExportModal, {
      count: assets.length,
      previewAssetId: assets[0]!.id,
    });
    if (!style) {
      return;
    }
    busy = true;
    try {
      const destination = await chooseLocalExportFolder();
      if (destination.canceled) {
        return;
      }
      if (!destination.path) {
        throw new Error('未获得导出文件夹');
      }
      const result = await exportFramedAssets(
        assets.map((asset) => asset.id),
        style,
        destination.path,
      );
      if (result.failures?.length) {
        toastManager.danger(
          `已生成 ${result.copied} 张，失败 ${result.failures.length} 张：${result.failures[0]?.error ?? ''}`,
        );
      } else {
        toastManager.primary(`已生成 ${result.copied} 张相框图片`);
      }
    } catch (error) {
      toastManager.danger(error instanceof Error ? error.message : '生成相框失败');
    } finally {
      busy = false;
    }
  };

  const openFolder = async () => {
    busy = true;
    try {
      const opened = await openMediaInFolder(assets.map((asset) => asset.id));
      toastManager.primary(opened === 1 ? '已在文件夹中定位文件' : `已打开 ${opened} 个媒体所在的文件夹`);
    } catch (error) {
      toastManager.danger(error instanceof Error ? error.message : '打开文件夹失败');
    } finally {
      busy = false;
    }
  };

  const openEditor = async () => {
    busy = true;
    try {
      const opened = await openMediaWithEditor(assets.map((asset) => asset.id));
      toastManager.primary(`已用外部编辑软件打开 ${opened} 个媒体`);
    } catch (error) {
      toastManager.danger(error instanceof Error ? error.message : '打开外部编辑软件失败');
    } finally {
      busy = false;
    }
  };

  const openFrameEditor = async () => {
    busy = true;
    try {
      const opened = await openImagesWithFrameEditor(assets.map((asset) => asset.id));
      toastManager.primary(`已用相框软件打开 ${opened} 张图片`);
    } catch (error) {
      toastManager.danger(error instanceof Error ? error.message : '打开相框软件失败');
    } finally {
      busy = false;
    }
  };

  const exportToFolder = async () => {
    busy = true;
    try {
      const result = await exportAssetsToFolder(assets.map((asset) => asset.id));
      if (result.canceled) {
        toastManager.info('已取消导出');
      } else if (result.failures.length > 0) {
        toastManager.danger(
          `已导出 ${result.paths.length} 个，失败 ${result.failures.length} 个：${result.failures[0]}`,
        );
      } else {
        toastManager.primary(`已导出 ${result.paths.length} 个媒体`);
      }
    } catch (error) {
      toastManager.danger(error instanceof Error ? error.message : '导出失败');
    } finally {
      busy = false;
    }
  };
</script>

<div class="flex items-center">
  <DownloadAction />
  <IconButton
    shape="round"
    color="secondary"
    variant="ghost"
    icon={mdiOpenInApp}
    title="用默认软件打开"
    aria-label="用默认软件打开"
    disabled={busy}
    onclick={openDefault}
  />
  {#if singleAsset}
    <IconButton
      shape="round"
      color="secondary"
      variant="ghost"
      icon={mdiOpenInNew}
      title="用外部软件打开"
      aria-label="用外部软件打开"
      disabled={busy}
      onclick={openExternal}
    />
  {/if}
  <IconButton
    shape="round"
    color="secondary"
    variant="ghost"
    icon={mdiFolderOpenOutline}
    title="在文件夹中打开"
    aria-label="在文件夹中打开"
    disabled={busy}
    onclick={openFolder}
  />
  <IconButton
    shape="round"
    color="secondary"
    variant="ghost"
    icon={mdiFolderDownloadOutline}
    title="导出到文件夹"
    aria-label="导出到文件夹"
    disabled={busy}
    onclick={exportToFolder}
  />
  {#if allImages || allVideos}
    <IconButton
      shape="round"
      color="secondary"
      variant="ghost"
      icon={allImages ? mdiImageEditOutline : mdiContentCut}
      title={allImages ? '用图片编辑软件打开' : '用视频剪辑工具打开'}
      aria-label={allImages ? '用图片编辑软件打开' : '用视频剪辑工具打开'}
      disabled={busy}
      onclick={openEditor}
    />
  {/if}
  {#if allImages}
    <IconButton
      shape="round"
      color="secondary"
      variant="ghost"
      icon={mdiImageFrame}
      title="用相框软件打开"
      aria-label="用相框软件打开"
      disabled={busy}
      onclick={openFrameEditor}
    />
    <IconButton
      shape="round"
      color="secondary"
      variant="ghost"
      icon={mdiImageMultipleOutline}
      title="添加相框并导出"
      aria-label="添加相框并导出"
      disabled={busy}
      onclick={exportWithFrame}
    />
  {/if}
</div>
