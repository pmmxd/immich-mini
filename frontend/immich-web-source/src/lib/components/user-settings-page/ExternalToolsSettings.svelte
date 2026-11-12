<script lang="ts">
  import { onMount } from 'svelte';
  import { Button, LoadingSpinner, Text, toastManager } from '@immich/ui';
  import SettingInputField from '$lib/components/shared-components/settings/SettingInputField.svelte';
  import { SettingInputFieldType } from '$lib/constants';
  import {
    chooseExternalTool,
    getExternalToolSettings,
    saveExternalToolSettings,
    type ExternalToolSettings,
  } from '$lib/services/external-tools.service';

  let settings = $state<ExternalToolSettings>({
    videoEditorPath: '',
    imageEditorPath: '',
    frameEditorPath: '',
  });
  let loading = $state(true);
  let saving = $state(false);
  let choosing = $state<keyof ExternalToolSettings>();
  let error = $state('');

  const rows: Array<{
    key: keyof ExternalToolSettings;
    title: string;
    label: string;
    description: string;
  }> = [
    {
      key: 'videoEditorPath',
      title: '选择视频剪辑工具',
      label: '视频剪辑工具',
      description: '批量选择视频后使用该程序打开',
    },
    {
      key: 'imageEditorPath',
      title: '选择图片编辑工具',
      label: '图片编辑工具',
      description: '批量选择图片后使用该程序编辑',
    },
    {
      key: 'frameEditorPath',
      title: '选择相框外部工具',
      label: '相框外部工具',
      description: '从批量栏将图片交给该相框软件打开',
    },
  ];

  const load = async () => {
    loading = true;
    error = '';
    try {
      settings = await getExternalToolSettings();
    } catch (loadError) {
      error = loadError instanceof Error ? loadError.message : '读取外部工具设置失败';
    } finally {
      loading = false;
    }
  };

  const choose = async (row: (typeof rows)[number]) => {
    choosing = row.key;
    error = '';
    try {
      const result = await chooseExternalTool(row.title);
      if (!result.cancelled && result.path) {
        settings[row.key] = result.path;
      }
    } catch (chooseError) {
      error = chooseError instanceof Error ? chooseError.message : '选择应用失败';
    } finally {
      choosing = undefined;
    }
  };

  const save = async () => {
    saving = true;
    error = '';
    try {
      settings = await saveExternalToolSettings({ ...settings });
      toastManager.primary('外部工具设置已保存');
    } catch (saveError) {
      error = saveError instanceof Error ? saveError.message : '保存外部工具失败';
    } finally {
      saving = false;
    }
  };

  onMount(load);
</script>

{#if loading}
  <div class="flex min-h-20 items-center justify-center"><LoadingSpinner /></div>
{:else}
  <div class="flex flex-col gap-4">
    {#each rows as row (row.key)}
      <div class="grid items-end gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
        <SettingInputField
          inputType={SettingInputFieldType.TEXT}
          label={row.label}
          description={row.description}
          bind:value={settings[row.key]}
        />
        <Button shape="round" color="secondary" size="small" loading={choosing === row.key} onclick={() => choose(row)}>
          选择 EXE
        </Button>
      </div>
    {/each}
    {#if error}<Text class="text-red-500">{error}</Text>{/if}
    <div class="flex justify-end">
      <Button shape="round" color="primary" size="small" loading={saving} onclick={save}>保存</Button>
    </div>
  </div>
{/if}
