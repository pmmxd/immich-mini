<script lang="ts">
  import { onMount } from 'svelte';
  import { Button, LoadingSpinner, Text, modalManager, toastManager } from '@immich/ui';
  import SettingInputField from '$lib/components/shared-components/settings/SettingInputField.svelte';
  import { SettingInputFieldType } from '$lib/constants';
  import {
    getFaceRecognitionSettings,
    reprocessFaces,
    saveFaceRecognitionSettings,
    type FaceRecognitionSettings,
  } from '$lib/services/face-recognition.service';

  let settings = $state<FaceRecognitionSettings>();
  let detectionThreshold = $state(0.7);
  let clusterThreshold = $state(0.45);
  let loading = $state(true);
  let saving = $state(false);
  let error = $state('');

  const refresh = async () => {
    loading = true;
    error = '';
    try {
      settings = await getFaceRecognitionSettings();
      detectionThreshold = settings.detectionThreshold;
      clusterThreshold = settings.clusterThreshold;
    } catch (loadError) {
      error = loadError instanceof Error ? loadError.message : '读取人脸设置失败';
    } finally {
      loading = false;
    }
  };

  const saveAndReprocess = async () => {
    const confirmed = await modalManager.showDialog({
      title: '重新识别人脸',
      prompt:
        '将使用新的阈值重新检测和聚类全部图片。已命名人物会保留，未命名聚类会重建。原图不会被修改。',
      confirmText: '保存并重新识别',
      confirmColor: 'danger',
    });
    if (!confirmed) {
      return;
    }
    saving = true;
    error = '';
    try {
      settings = await saveFaceRecognitionSettings({ detectionThreshold, clusterThreshold });
      const result = await reprocessFaces();
      toastManager.primary(`已重新排队 ${result.queued} 张图片的人脸识别`);
      await refresh();
    } catch (saveError) {
      error = saveError instanceof Error ? saveError.message : '保存人脸设置失败';
    } finally {
      saving = false;
    }
  };

  onMount(refresh);
</script>

{#if loading}
  <div class="flex min-h-20 items-center justify-center"><LoadingSpinner /></div>
{:else}
  <div class="flex flex-col gap-4">
    <Text size="small" color="muted">
      检测阈值越高，误检越少；聚类阈值越高，人物分组越严格。取值范围为 0.1 到 0.99。
    </Text>
    <SettingInputField
      inputType={SettingInputFieldType.NUMBER}
      min={0.1}
      max={0.99}
      step="0.01"
      label="人脸检测阈值"
      description="默认 0.70"
      bind:value={detectionThreshold}
    />
    <SettingInputField
      inputType={SettingInputFieldType.NUMBER}
      min={0.1}
      max={0.99}
      step="0.01"
      label="人物聚类阈值"
      description="默认 0.45"
      bind:value={clusterThreshold}
    />
    {#if settings}
      <Text size="small" color="muted">
        当前任务：运行 {settings.running}，等待 {settings.queued}，完成 {settings.succeeded}，失败
        {settings.failed}
      </Text>
    {/if}
    {#if error}
      <Text class="text-red-500">{error}</Text>
    {/if}
    <div class="flex justify-end">
      <Button shape="round" color="primary" size="small" loading={saving} onclick={saveAndReprocess}>
        保存并重新识别
      </Button>
    </div>
  </div>
{/if}
