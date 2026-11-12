<script lang="ts">
  import { onMount, tick } from 'svelte';

  type AssetKind = 'image' | 'video';
  type Orientation = 'landscape' | 'portrait' | 'square';

  interface Asset {
    id: number;
    name: string;
    kind: AssetKind;
    orientation: Orientation | null;
    taken_at: string;
    duration_ms: number | null;
    thumbnail_status: 'pending' | 'ready' | 'failed';
  }

  interface Job {
    id: number;
    status: 'queued' | 'running' | 'succeeded' | 'failed';
    progress: number;
    total: number;
    message: string | null;
    error: string | null;
  }

  interface Summary {
    total: number;
    images: number;
    videos: number;
  }

  type Filter = 'all' | AssetKind;

  let assets: Asset[] = [];
  let summary: Summary = { total: 0, images: 0, videos: 0 };
  let libraryPath = '';
  let filter: Filter = 'all';
  let loading = true;
  let scanning = false;
  let error = '';
  let job: Job | null = null;
  let selected: Asset | null = null;
  let dialog: HTMLDialogElement | undefined;
  let hasLoaded = false;

  $: visibleAssets = filter === 'all' ? assets : assets.filter((asset) => asset.kind === filter);
  $: timeline = groupByMonth(visibleAssets);
  $: scanProgress =
    job && job.total > 0 ? Math.round((Math.min(job.progress, job.total) / job.total) * 100) : 0;

  function groupByMonth(items: Asset[]): Array<{ key: string; label: string; items: Asset[] }> {
    const groups = new Map<string, { key: string; label: string; items: Asset[] }>();
    for (const asset of items) {
      const date = new Date(asset.taken_at);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          label: new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long' }).format(date),
          items: [],
        });
      }
      groups.get(key)!.items.push(asset);
    }
    return [...groups.values()];
  }

  function formatDate(value: string): string {
    return new Intl.DateTimeFormat('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  }

  function formatDuration(durationMs: number | null): string {
    if (durationMs === null) {
      return '';
    }
    const totalSeconds = Math.max(0, Math.round(durationMs / 1_000));
    return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`;
  }

  async function api<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, init);
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error || `Request failed (${response.status})`);
    }
    return response.json() as Promise<T>;
  }

  async function loadLibrary(): Promise<void> {
    try {
      const [page, status] = await Promise.all([
        api<{ items: Asset[] }>('/api/assets?limit=200'),
        api<{ assets: Summary }>('/api/status'),
      ]);
      assets = page.items;
      summary = status.assets;
      error = '';
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    } finally {
      loading = false;
      hasLoaded = true;
    }
  }

  async function waitForJob(id: number): Promise<Job> {
    while (true) {
      const current = await api<Job>(`/api/jobs/${id}`);
      job = current;
      if (current.status === 'succeeded' || current.status === 'failed') {
        return current;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  async function startScan(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (scanning) {
      return;
    }

    scanning = true;
    error = '';
    job = null;
    try {
      const created = await api<Job>('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: libraryPath.trim() }),
      });
      job = created;
      const finished = await waitForJob(created.id);
      if (finished.status === 'failed') {
        throw new Error(finished.error || finished.message || 'Scan failed');
      }
      localStorage.setItem('immich-mini:library-path', libraryPath.trim());
      await loadLibrary();
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    } finally {
      scanning = false;
    }
  }

  async function openAsset(asset: Asset): Promise<void> {
    selected = asset;
    await tick();
    dialog?.showModal();
  }

  function closeViewer(): void {
    dialog?.close();
  }

  onMount(() => {
    libraryPath = localStorage.getItem('immich-mini:library-path') ?? '';
    void loadLibrary();
  });
</script>

<svelte:head>
  <title>Immich Mini</title>
</svelte:head>

<header class="app-header">
  <div class="brand">
    <span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></span>
    <div>
      <h1>Immich Mini</h1>
      <p>本地媒体库 · 127.0.0.1</p>
    </div>
  </div>

  <form class="scan-form" onsubmit={startScan}>
    <label for="library-path">媒体目录</label>
    <input
      id="library-path"
      bind:value={libraryPath}
      placeholder="D:\Pictures"
      autocomplete="off"
      spellcheck="false"
      disabled={scanning}
    />
    <button type="submit" disabled={scanning || !libraryPath.trim()}>
      {scanning ? '扫描中' : '开始扫描'}
    </button>
  </form>
</header>

{#if scanning || job}
  <section class="progress-band" aria-live="polite">
    <div class="progress-copy">
      <span>{job?.message ?? '正在创建扫描任务'}</span>
      <span>{job && job.total > 0 ? `${job.progress} / ${job.total}` : ''}</span>
    </div>
    <progress max="100" value={scanProgress}></progress>
  </section>
{/if}

{#if error}
  <div class="error-band" role="alert">
    <span>{error}</span>
    <button type="button" onclick={() => (error = '')} aria-label="关闭错误">关闭</button>
  </div>
{/if}

<main>
  <section class="toolbar" aria-label="媒体筛选">
    <div class="segmented">
      <button class:active={filter === 'all'} type="button" onclick={() => (filter = 'all')}>
        全部 <span>{summary.total}</span>
      </button>
      <button class:active={filter === 'image'} type="button" onclick={() => (filter = 'image')}>
        照片 <span>{summary.images}</span>
      </button>
      <button class:active={filter === 'video'} type="button" onclick={() => (filter = 'video')}>
        视频 <span>{summary.videos}</span>
      </button>
    </div>
    <button class="refresh-button" type="button" onclick={() => void loadLibrary()} disabled={loading}>
      刷新
    </button>
  </section>

  {#if loading}
    <section class="timeline" aria-label="正在加载">
      <div class="skeleton-title"></div>
      <div class="media-grid">
        {#each Array(8) as _}
          <div class="skeleton-tile"></div>
        {/each}
      </div>
    </section>
  {:else if timeline.length === 0}
    <section class="empty-state">
      <span class="empty-index">00</span>
      <h2>{hasLoaded && summary.total > 0 ? '当前筛选没有内容' : '尚未扫描本地目录'}</h2>
      <p>{hasLoaded && summary.total > 0 ? '切换到其他分类查看媒体。' : '输入一个本机绝对路径，建立第一条时间线。'}</p>
    </section>
  {:else}
    {#each timeline as group (group.key)}
      <section class="timeline" aria-labelledby={`month-${group.key}`}>
        <div class="month-heading">
          <h2 id={`month-${group.key}`}>{group.label}</h2>
          <span>{String(group.items.length).padStart(2, '0')}</span>
        </div>
        <div class="media-grid">
          {#each group.items as asset (asset.id)}
            <button
              class="media-tile"
              class:portrait={asset.orientation === 'portrait'}
              class:square={asset.orientation === 'square'}
              type="button"
              onclick={() => void openAsset(asset)}
              aria-label={`打开 ${asset.name}`}
            >
              {#if asset.thumbnail_status === 'ready'}
                <img
                  src={`/api/assets/${asset.id}/thumbnail`}
                  alt=""
                  loading="lazy"
                  decoding="async"
                />
              {:else}
                <span class="thumb-fallback">{asset.kind === 'video' ? 'VIDEO' : 'IMAGE'}</span>
              {/if}
              <span class="tile-shade"></span>
              <span class="tile-name">{asset.name}</span>
              <span class="tile-date">{formatDate(asset.taken_at)}</span>
              {#if asset.kind === 'video'}
                <span class="tile-kind">视频</span>
                <span class="tile-duration">{formatDuration(asset.duration_ms)}</span>
              {/if}
            </button>
          {/each}
        </div>
      </section>
    {/each}
  {/if}
</main>

<dialog bind:this={dialog} class="viewer" onclose={() => (selected = null)} onclick={(event) => {
  if (event.target === dialog) closeViewer();
}}>
  {#if selected}
    <div class="viewer-shell">
      <button class="viewer-close" type="button" onclick={closeViewer} aria-label="关闭预览">关闭</button>
      {#if selected.kind === 'image'}
        <img class="viewer-media" src={`/api/assets/${selected.id}/original`} alt={selected.name} />
      {:else}
        <!-- svelte-ignore a11y_media_has_caption -->
        <video
          class="viewer-media"
          src={`/api/assets/${selected.id}/original`}
          controls
          preload="metadata"
        ></video>
      {/if}
      <footer>
        <strong>{selected.name}</strong>
        <span>{formatDate(selected.taken_at)}</span>
      </footer>
    </div>
  {/if}
</dialog>
