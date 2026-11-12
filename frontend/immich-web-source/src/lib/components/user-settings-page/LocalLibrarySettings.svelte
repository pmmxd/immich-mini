<script lang="ts">
  import { onMount } from 'svelte';
  import { Button, Icon, LoadingSpinner, Text, modalManager, toastManager } from '@immich/ui';
  import { mdiDeleteOutline, mdiFolderPlusOutline, mdiRefresh, mdiSync } from '@mdi/js';
  import SettingAccordion from '$lib/components/shared-components/settings/SettingAccordion.svelte';
  import SettingInputField from '$lib/components/shared-components/settings/SettingInputField.svelte';
  import SettingSwitch from '$lib/components/shared-components/settings/SettingSwitch.svelte';
  import { SettingInputFieldType } from '$lib/constants';
  import AddLocalLibraryModal from '$lib/modals/AddLocalLibraryModal.svelte';
  import {
    getLibraryAutomationSettings,
    getLocalLibraries,
    removeLocalLibrary,
    saveLibraryAutomationSettings,
    scanLocalLibrary,
    type LibraryAutomationSettings,
    type LocalLibrary,
  } from '$lib/services/local-library.service';

  const defaults: LibraryAutomationSettings = {
    watchEnabled: false,
    scanEnabled: false,
    scanIntervalMinutes: 360,
  };

  let libraries = $state<LocalLibrary[]>([]);
  let settings = $state<LibraryAutomationSettings>({ ...defaults });
  let savedSettings = $state<LibraryAutomationSettings>({ ...defaults });
  let loading = $state(true);
  let saving = $state(false);
  let scanningId = $state<number>();
  let removingId = $state<number>();
  let error = $state('');
  const changed = $derived(
    settings.watchEnabled !== savedSettings.watchEnabled ||
      settings.scanEnabled !== savedSettings.scanEnabled ||
      settings.scanIntervalMinutes !== savedSettings.scanIntervalMinutes,
  );

  const refresh = async () => {
    loading = true;
    error = '';
    try {
      const [libraryRows, automation] = await Promise.all([
        getLocalLibraries(),
        getLibraryAutomationSettings(),
      ]);
      libraries = libraryRows;
      Object.assign(settings, automation);
      Object.assign(savedSettings, automation);
    } catch (refreshError) {
      error = refreshError instanceof Error ? refreshError.message : '读取媒体库失败';
    } finally {
      loading = false;
    }
  };

  const openAddLibrary = async () => {
    await modalManager.show(AddLocalLibraryModal);
    await refresh();
  };

  const saveSettings = async () => {
    saving = true;
    error = '';
    try {
      const saved = await saveLibraryAutomationSettings({ ...settings });
      Object.assign(settings, saved);
      Object.assign(savedSettings, saved);
      toastManager.primary('媒体库监控设置已保存');
    } catch (saveError) {
      error = saveError instanceof Error ? saveError.message : '保存媒体库设置失败';
    } finally {
      saving = false;
    }
  };

  const resetSettings = () => {
    Object.assign(settings, defaults);
  };

  const scanLibrary = async (library: LocalLibrary) => {
    scanningId = library.id;
    error = '';
    try {
      await scanLocalLibrary(library.id);
      toastManager.primary(`已开始扫描 ${library.path}`);
    } catch (scanError) {
      error = scanError instanceof Error ? scanError.message : '启动媒体库扫描失败';
    } finally {
      scanningId = undefined;
    }
  };

  const removeLibrary = async (library: LocalLibrary) => {
    const confirmed = await modalManager.showDialog({
      icon: mdiDeleteOutline,
      title: '移除媒体库',
      prompt: `将从 Immich Mini 移除“${library.path}”的索引。原始媒体文件不会删除。`,
      confirmText: '移除',
      confirmColor: 'danger',
    });
    if (!confirmed) {
      return;
    }

    removingId = library.id;
    error = '';
    try {
      const result = await removeLocalLibrary(library.id);
      toastManager.primary(`已移除媒体库，清理 ${result.removedAssetCount} 项索引`);
      await refresh();
    } catch (removeError) {
      error = removeError instanceof Error ? removeError.message : '移除媒体库失败';
    } finally {
      removingId = undefined;
    }
  };

  onMount(refresh);
</script>

<div class="flex flex-col gap-4">
  <div class="flex flex-wrap items-center justify-between gap-3">
    <Text size="small" color="muted">可以添加多个本机目录，媒体原文件不会被移动。</Text>
    <div class="flex shrink-0 gap-2">
      <Button shape="round" color="secondary" size="small" onclick={refresh}>
        <Icon icon={mdiRefresh} size="18" /> 刷新
      </Button>
      <Button shape="round" color="primary" size="small" onclick={openAddLibrary}>
        <Icon icon={mdiFolderPlusOutline} size="18" /> 添加媒体库
      </Button>
    </div>
  </div>

  <SettingAccordion
    key="local-library-watching"
    title="资源库监控 [实验性功能]"
    subtitle="媒体目录变化时自动触发扫描"
  >
    <div class="ms-4 mt-4 flex flex-col gap-4">
      <SettingSwitch
        title="启用资源库监控"
        subtitle="使用 Windows 文件变更通知，短时间内的多个变化会合并处理"
        bind:checked={settings.watchEnabled}
      />
    </div>
  </SettingAccordion>

  <SettingAccordion key="local-library-scanning" title="定期扫描" subtitle="按固定间隔重新扫描全部媒体库">
    <div class="ms-4 mt-4 flex flex-col gap-4">
      <SettingSwitch
        title="启用定期扫描"
        subtitle="定时扫描全部媒体库，发现新增、修改和删除文件"
        bind:checked={settings.scanEnabled}
      />
      <SettingInputField
        inputType={SettingInputFieldType.NUMBER}
        min={5}
        max={10080}
        required={true}
        disabled={!settings.scanEnabled}
        label="扫描间隔（分钟）"
        description="最低 5 分钟，最高 7 天"
        bind:value={settings.scanIntervalMinutes}
      />
    </div>
  </SettingAccordion>

  <div class="flex flex-wrap items-center justify-between gap-3">
    <Text size="small" color="muted">
      {changed ? '监控设置尚未保存' : '监控设置已保存'}
    </Text>
    <div class="flex gap-2">
      <Button shape="round" color="secondary" size="small" onclick={resetSettings}>
        恢复默认
      </Button>
      <Button
        shape="round"
        color="primary"
        size="small"
        loading={saving}
        disabled={!changed}
        onclick={saveSettings}
      >
        保存
      </Button>
    </div>
  </div>

  {#if loading}
    <div class="flex min-h-20 items-center justify-center">
      <LoadingSpinner />
    </div>
  {:else if error}
    <Text class="text-red-500">{error}</Text>
  {:else if libraries.length === 0}
    <Text color="muted">还没有媒体库。</Text>
  {:else}
    <div class="flex flex-col gap-3">
      {#each libraries as library (library.id)}
        <div class="flex items-center justify-between gap-4 rounded-lg border border-primary/20 p-4">
          <div class="min-w-0">
            <Text class="break-all">{library.path}</Text>
            <Text size="small" color="muted">已索引 {library.assetCount} 项</Text>
          </div>
          <div class="flex shrink-0 gap-2">
            <Button
              shape="round"
              color="secondary"
              size="small"
              loading={scanningId === library.id}
              disabled={removingId === library.id}
              aria-label={`扫描媒体库 ${library.path}`}
              title="扫描媒体库"
              onclick={() => scanLibrary(library)}
            >
              <Icon icon={mdiSync} size="18" />
            </Button>
            <Button
              shape="round"
              color="danger"
              size="small"
              loading={removingId === library.id}
              disabled={scanningId === library.id}
              aria-label={`移除媒体库 ${library.path}`}
              title="移除媒体库（不会删除原文件）"
              onclick={() => removeLibrary(library)}
            >
              <Icon icon={mdiDeleteOutline} size="18" />
            </Button>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
