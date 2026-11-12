<script lang="ts">
  import { addLocalLibrary } from '$lib/services/local-library.service';
  import { Field, FormModal, Input, Text, toastManager } from '@immich/ui';
  import { mdiFolderPlusOutline } from '@mdi/js';

  type Props = {
    onClose: (result?: boolean) => void;
  };

  const { onClose }: Props = $props();
  let value = $state('');
  let error = $state('');

  const onSubmit = async () => {
    const libraryPath = value.trim();
    if (!libraryPath) {
      error = '请输入媒体库路径';
      return;
    }

    try {
      await addLocalLibrary(libraryPath);
      toastManager.primary('媒体库已添加，正在后台扫描');
      onClose(true);
    } catch (submitError) {
      error = submitError instanceof Error ? submitError.message : '添加媒体库失败';
    }
  };
</script>

<FormModal
  title="添加媒体库"
  icon={mdiFolderPlusOutline}
  {onClose}
  {onSubmit}
  size="small"
  submitText="添加并扫描"
>
  <Text size="small" class="mb-4">输入本机照片或视频目录的绝对路径。</Text>
  <Field label="媒体库路径">
    <Input bind:value placeholder="D:\Photos" autocomplete="off" />
  </Field>
  {#if error}
    <Text size="small" class="mt-3 text-red-500">{error}</Text>
  {/if}
</FormModal>
