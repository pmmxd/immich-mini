<script lang="ts">
  import { FormModal, Icon, LoadingSpinner } from '@immich/ui';
  import {
    mdiArrowExpand,
    mdiCheckCircle,
    mdiClose,
    mdiImageFrame,
    mdiLockOutline,
    mdiMagnifyMinusOutline,
    mdiMagnifyPlusOutline,
  } from '@mdi/js';

  type Props = {
    count: number;
    previewAssetId: string;
    onClose: (style?: 'light' | 'dark') => void;
  };

  let { count, previewAssetId, onClose }: Props = $props();
  let style = $state<'light' | 'dark'>('light');
  let previewLoading = $state(true);
  let previewSize = $state('');
  let zoom = $state(100);
  let expanded = $state(false);
  const options = [
    { label: '暖白', description: '轻盈留白', value: 'light', swatch: '#f8f7f3' },
    { label: '深灰', description: '沉静质感', value: 'dark', swatch: '#181a1c' },
  ] as const;

  const setStyle = (value: 'light' | 'dark') => {
    style = value;
    previewLoading = true;
  };

  const setZoom = (value: number) => {
    zoom = Math.min(300, Math.max(75, value));
  };

  const onKeydown = (event: KeyboardEvent) => {
    if (expanded && event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      expanded = false;
    }
  };
</script>

<svelte:window onkeydowncapture={onKeydown} />

<FormModal
  title={`为 ${count} 张图片添加相框`}
  icon={mdiImageFrame}
  size="medium"
  submitText="选择文件夹并导出"
  {onClose}
  onSubmit={() => onClose(style)}
>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div class="flex items-center gap-2 text-sm font-medium">
        <span class="rounded-full bg-primary/10 px-3 py-1 text-primary">{count} 张图片</span>
        <span class="text-gray-500 dark:text-gray-400">自适应排版</span>
      </div>
      <span
        class="flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400"
      >
        <Icon icon={mdiLockOutline} size="14" />
        原图只读
      </span>
    </div>

    <div class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-700">
      <div class="flex items-center gap-1">
        <button
          type="button"
          class="flex size-8 items-center justify-center rounded-full text-gray-600 transition-colors hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-700"
          title="缩小预览"
          aria-label="缩小预览"
          onclick={() => setZoom(zoom - 25)}
        >
          <Icon icon={mdiMagnifyMinusOutline} size="18" />
        </button>
        <span class="min-w-12 text-center font-mono text-xs tabular-nums text-gray-600 dark:text-gray-300">{zoom}%</span>
        <button
          type="button"
          class="flex size-8 items-center justify-center rounded-full text-gray-600 transition-colors hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-700"
          title="放大预览"
          aria-label="放大预览"
          onclick={() => setZoom(zoom + 25)}
        >
          <Icon icon={mdiMagnifyPlusOutline} size="18" />
        </button>
      </div>
      <input
        class="min-w-32 flex-1 accent-immich-primary"
        type="range"
        min="75"
        max="300"
        step="25"
        aria-label="预览缩放"
        bind:value={zoom}
      />
      <button
        type="button"
        class="flex size-8 items-center justify-center rounded-full text-gray-600 transition-colors hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-700"
        title="全屏预览"
        aria-label="全屏预览"
        onclick={() => (expanded = true)}
      >
        <Icon icon={mdiArrowExpand} size="18" />
      </button>
    </div>

    <div
      class="relative h-[min(56vh,560px)] min-h-64 overflow-auto rounded-lg border border-gray-200 bg-[linear-gradient(45deg,#ececea_25%,transparent_25%),linear-gradient(-45deg,#ececea_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#ececea_75%),linear-gradient(-45deg,transparent_75%,#ececea_75%)] bg-[length:20px_20px] bg-[position:0_0,0_10px,10px_-10px,-10px_0px] dark:border-gray-700 dark:bg-[linear-gradient(45deg,#202322_25%,transparent_25%),linear-gradient(-45deg,#202322_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#202322_75%),linear-gradient(-45deg,transparent_75%,#202322_75%)]"
    >
      {#if previewLoading}
        <div class="absolute inset-0 z-1 flex items-center justify-center backdrop-blur-[1px]">
          <LoadingSpinner />
        </div>
      {/if}
      <div class="flex min-h-full min-w-full items-center justify-center p-4">
        <button
          type="button"
          class="block cursor-zoom-in border-0 bg-transparent p-0"
          aria-label="全屏预览相框"
          onclick={() => (expanded = true)}
        >
          <img
            src={`/api/local/assets/${previewAssetId}/frame-preview?style=${style}`}
            alt="相框效果预览"
            class={[
              'block h-auto rounded-[3px] object-contain shadow-[0_18px_50px_rgba(0,0,0,0.24)] ring-1 ring-black/10',
              zoom === 100 ? 'max-h-[calc(56vh-32px)] max-w-full' : 'max-h-none max-w-none',
            ]}
            style:width={zoom === 100 ? undefined : `${zoom}%`}
            onload={(event) => {
              const image = event.currentTarget as HTMLImageElement;
              previewSize = `${image.naturalWidth} × ${image.naturalHeight}`;
              previewLoading = false;
            }}
            onerror={() => (previewLoading = false)}
          />
        </button>
      </div>
      {#if previewSize && !previewLoading}
        <span
          class="absolute bottom-2 right-2 rounded bg-black/55 px-2 py-1 font-mono text-[10px] text-white/85 backdrop-blur-sm"
        >
          {previewSize}
        </span>
      {/if}
    </div>

    <div class="grid grid-cols-2 gap-3">
      {#each options as option (option.value)}
        <button
          type="button"
          class={[
            'relative flex min-h-16 items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors',
            style === option.value
              ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
              : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:hover:border-gray-600 dark:hover:bg-gray-800',
          ]}
          aria-pressed={style === option.value}
          onclick={() => setStyle(option.value)}
        >
          <span
            class="flex size-11 shrink-0 flex-col overflow-hidden rounded-md border border-black/10 shadow-sm"
            style:background={option.swatch}
          >
            <span class="m-1 flex-1 rounded-[2px] bg-gray-400/40"></span>
            <span class="mx-1 mb-1.5 h-1 rounded-full bg-current opacity-25"></span>
          </span>
          <span class="min-w-0">
            <span class="block text-sm font-medium">{option.label}</span>
            <span class="block text-xs text-gray-500 dark:text-gray-400">{option.description}</span>
          </span>
          {#if style === option.value}
            <Icon icon={mdiCheckCircle} size="18" class="absolute right-2 top-2 text-primary" />
          {/if}
        </button>
      {/each}
    </div>
  </div>
</FormModal>

{#if expanded}
  <div
    class="fixed inset-0 z-[1000] flex flex-col bg-black/95 p-4 text-white backdrop-blur-sm"
    role="dialog"
    aria-modal="true"
    aria-label="相框全屏预览"
  >
    <div class="mb-3 flex items-center justify-between gap-3">
      <div class="flex items-center gap-1">
        <button
          type="button"
          class="flex size-8 items-center justify-center rounded-full text-white transition-colors hover:bg-white/10"
          title="缩小预览"
          aria-label="缩小预览"
          onclick={() => setZoom(zoom - 25)}
        >
          <Icon icon={mdiMagnifyMinusOutline} size="18" />
        </button>
        <span class="min-w-12 text-center font-mono text-xs tabular-nums text-white/80">{zoom}%</span>
        <button
          type="button"
          class="flex size-8 items-center justify-center rounded-full text-white transition-colors hover:bg-white/10"
          title="放大预览"
          aria-label="放大预览"
          onclick={() => setZoom(zoom + 25)}
        >
          <Icon icon={mdiMagnifyPlusOutline} size="18" />
        </button>
      </div>
      <button
        type="button"
        class="flex size-8 items-center justify-center rounded-full text-white transition-colors hover:bg-white/10"
        title="关闭全屏预览"
        aria-label="关闭全屏预览"
        onclick={() => (expanded = false)}
      >
        <Icon icon={mdiClose} size="18" />
      </button>
    </div>
    <div class="min-h-0 flex-1 overflow-auto">
      <div class="flex min-h-full min-w-full items-center justify-center">
        <img
          src={`/api/local/assets/${previewAssetId}/frame-preview?style=${style}`}
          alt="相框全屏预览"
          class={[
            'block h-auto rounded-[3px] shadow-2xl ring-1 ring-white/15',
            zoom === 100 ? 'max-h-[calc(100vh-88px)] max-w-full' : 'max-h-none max-w-none',
          ]}
          style:width={zoom === 100 ? undefined : `${zoom}%`}
        />
      </div>
    </div>
  </div>
{/if}
