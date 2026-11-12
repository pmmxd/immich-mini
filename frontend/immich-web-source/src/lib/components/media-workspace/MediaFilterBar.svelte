<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import type { MediaType } from '$lib/utils/media-workspace';
  import { smartAlbumManager } from '$lib/managers/smart-album-manager.svelte';
  import { FILTER_KEYS, parseMediaFilters, type MediaSort } from '$lib/utils/media-filters';
  import { handleError } from '$lib/utils/handle-error';
  import { normalizeDisplayText } from '$lib/utils/text-repair';
  import { toChineseCityName } from '$lib/utils/city-names-zh';
  import { getAllTags, getSearchSuggestions, SearchSuggestionType, type TagResponseDto } from '@immich/sdk';
  import { Button, Field, Icon, Input, Select, Switch, toastManager } from '@immich/ui';
  import { mdiFilterVariant } from '@mdi/js';
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';

  interface Props {
    mediaType?: MediaType;
    cardSize: number;
    pinned: boolean;
  }

  let { mediaType, cardSize = $bindable(), pinned = $bindable() }: Props = $props();
  let draft = $state(parseMediaFilters(page.url.searchParams));
  let tags = $state<TagResponseDto[]>([]);
  let cities = $state<string[]>([]);
  let makes = $state<string[]>([]);
  let models = $state<string[]>([]);
  let lensModels = $state<string[]>([]);
  let smartAlbumName = $state('');
  let savingSmartAlbum = $state(false);

  const ratingOptions = $derived([
    { label: $t('all'), value: 'all' },
    ...Array.from({ length: 5 }, (_, index) => ({
      label: '★'.repeat(index + 1),
      value: String(index + 1),
    })),
  ]);
  const directionOptions = $derived([
    { label: $t('all'), value: 'all' },
    { label: $t('landscape'), value: 'landscape' },
    { label: $t('portrait'), value: 'portrait' },
  ]);
  const gpsOptions = $derived([
    { label: $t('all'), value: 'all' },
    { label: $t('gps'), value: 'yes' },
    { label: $t('none'), value: 'no' },
  ]);
  const sortOptions = $derived([
    { label: $t('date'), value: 'date' },
    { label: $t('rating'), value: 'rating' },
    { label: $t('filename'), value: 'name' },
    { label: $t('file_size'), value: 'size' },
  ]);
  const orderOptions = $derived([
    { label: $t('newest_first'), value: 'desc' },
    { label: $t('oldest_first'), value: 'asc' },
  ]);
  const tagOptions = $derived([
    { label: $t('all'), value: '' },
    ...tags.map((tag) => ({ label: normalizeDisplayText(tag.value), value: tag.id })),
  ]);
  const cityOptions = $derived([
    { label: $t('all'), value: '' },
    ...cities.map((value) => ({ label: toChineseCityName(value), value })),
  ]);
  const makeOptions = $derived([{ label: $t('all'), value: '' }, ...makes.map((value) => ({ label: value, value }))]);
  const modelOptions = $derived([{ label: $t('all'), value: '' }, ...models.map((value) => ({ label: value, value }))]);
  const lensOptions = $derived([
    { label: $t('all'), value: '' },
    ...lensModels.map((value) => ({ label: value, value })),
  ]);
  const durationOptions = $derived([
    { label: $t('all'), value: 'all' },
    { label: '< 15s', value: '0-15' },
    { label: '15–60s', value: '15-60' },
    { label: '1–5min', value: '60-300' },
    { label: '> 5min', value: '300-' },
  ]);
  const resolutionOptions = $derived([
    { label: $t('all'), value: 'all' },
    { label: '720p+', value: '720' },
    { label: '1080p+', value: '1080' },
    { label: '1440p+', value: '1440' },
    { label: '2160p+', value: '2160' },
  ]);
  const sizeOptions = $derived([
    { label: $t('all'), value: 'all' },
    { label: '< 100 MB', value: '0-100' },
    { label: '100–500 MB', value: '100-500' },
    { label: '500 MB–1 GB', value: '500-1024' },
    { label: '> 1 GB', value: '1024-' },
  ]);
  const durationValue = $derived(
    draft.minDuration === null && draft.maxDuration === null
      ? 'all'
      : draft.minDuration === null && draft.maxDuration === 15
        ? '0-15'
        : draft.minDuration === 15 && draft.maxDuration === 60
          ? '15-60'
          : draft.minDuration === 60 && draft.maxDuration === 300
            ? '60-300'
            : draft.minDuration === 300 && draft.maxDuration === null
              ? '300-'
              : 'all',
  );
  const resolutionValue = $derived(
    draft.minWidth === 3840 && draft.minHeight === 2160
      ? '2160'
      : draft.minWidth === 2560 && draft.minHeight === 1440
        ? '1440'
        : draft.minWidth === 1920 && draft.minHeight === 1080
          ? '1080'
          : draft.minWidth === 1280 && draft.minHeight === 720
            ? '720'
            : 'all',
  );
  const sizeValue = $derived(
    draft.minSize === null && draft.maxSize === null
      ? 'all'
      : draft.minSize === null && draft.maxSize === 100
        ? '0-100'
        : draft.minSize === 100 && draft.maxSize === 500
          ? '100-500'
          : draft.minSize === 500 && draft.maxSize === 1024
            ? '500-1024'
            : draft.minSize === 1024 && draft.maxSize === null
              ? '1024-'
              : 'all',
  );

  const setDuration = (value: string) => {
    const ranges: Record<string, [number | null, number | null]> = {
      '0-15': [null, 15],
      '15-60': [15, 60],
      '60-300': [60, 300],
      '300-': [300, null],
    };
    const range = ranges[value] ?? [null, null];
    draft.minDuration = range[0];
    draft.maxDuration = range[1];
  };
  const setResolution = (value: string) => {
    const [minWidth, minHeight] =
      value === '2160'
        ? [3840, 2160]
        : value === '1440'
          ? [2560, 1440]
          : value === '1080'
            ? [1920, 1080]
            : value === '720'
              ? [1280, 720]
              : [null, null];
    draft.minWidth = minWidth;
    draft.minHeight = minHeight;
  };
  const setSize = (value: string) => {
    const ranges: Record<string, [number | null, number | null]> = {
      '0-100': [null, 100],
      '100-500': [100, 500],
      '500-1024': [500, 1024],
      '1024-': [1024, null],
    };
    const range = ranges[value] ?? [null, null];
    draft.minSize = range[0];
    draft.maxSize = range[1];
  };

  $effect(() => {
    const search = page.url.search;
    draft = parseMediaFilters(new URLSearchParams(search));
  });

  onMount(async () => {
    [tags, cities, makes] = await Promise.all([
      getAllTags().catch(() => []),
      getSearchSuggestions({ $type: SearchSuggestionType.City }).catch(() => []),
      getSearchSuggestions({ $type: SearchSuggestionType.CameraMake }).catch(() => []),
    ]);
  });

  $effect(() => {
    const make = draft.make;
    void getSearchSuggestions({
      $type: SearchSuggestionType.CameraModel,
      make: make || undefined,
    }).then((results) => (models = results));
  });

  $effect(() => {
    const make = draft.make;
    const model = draft.model;
    void getSearchSuggestions({
      $type: SearchSuggestionType.CameraLensModel,
      make: make || undefined,
      model: model || undefined,
    }).then((results) => (lensModels = results));
  });

  const currentUrl = () => {
    const url = new URL(page.url);
    for (const key of FILTER_KEYS) {
      url.searchParams.delete(key);
    }
    return url;
  };

  const apply = async () => {
    const url = currentUrl();
    const values: Record<string, string | number | boolean | null> = {
      q: draft.query,
      path: draft.path,
      city: draft.city,
      make: draft.make,
      model: draft.model,
      lens: draft.lens,
      tag: draft.tagId,
      rating: draft.minRating,
      year: draft.year,
      month: draft.month,
      direction: draft.direction === 'all' ? null : draft.direction,
      gps: draft.gps === 'all' ? null : draft.gps,
      minDuration: draft.minDuration,
      maxDuration: draft.maxDuration,
      minWidth: draft.minWidth,
      minHeight: draft.minHeight,
      minSize: draft.minSize,
      maxSize: draft.maxSize,
      raw: draft.raw ? 1 : null,
      favorite: draft.favorite ? 1 : null,
      sort: draft.sort === 'date' ? null : draft.sort,
      order: draft.order === 'desc' ? null : draft.order,
    };

    for (const [key, value] of Object.entries(values)) {
      if (value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }

    await goto(`${url.pathname}${url.search}`);
  };

  const clear = async () => {
    await goto(`${currentUrl().pathname}${currentUrl().search}`);
  };

  const saveSmartAlbum = async () => {
    const name = smartAlbumName.trim();
    if (!name || savingSmartAlbum) {
      return;
    }
    savingSmartAlbum = true;
    try {
      await smartAlbumManager.create(name, page.url.search);
      smartAlbumName = '';
      toastManager.primary($t('smart_album_saved'));
    } catch (error) {
      handleError(error, $t('errors.something_went_wrong'));
    } finally {
      savingSmartAlbum = false;
    }
  };

  const updateNumber = (
    event: Event,
    key: 'year' | 'month' | 'minDuration' | 'maxDuration' | 'minWidth' | 'minHeight',
  ) => {
    const value = (event.currentTarget as HTMLInputElement).value;
    draft[key] = value ? Number(value) : null;
  };
</script>

<form
  class={[
    'shrink-0 border-b border-gray-200 bg-white/95 p-3 backdrop-blur-sm dark:border-gray-700 dark:bg-immich-dark-bg/95',
    { 'sticky top-0 z-10 shadow-sm': pinned },
  ]}
  onsubmit={(event) => {
    event.preventDefault();
    void apply();
  }}
>
  <details class="rounded-lg bg-gray-50 p-3 dark:bg-neutral-900">
    <summary
      class="flex cursor-pointer items-center gap-2 text-sm font-medium text-immich-primary select-none dark:text-immich-dark-primary"
    >
      <Icon icon={mdiFilterVariant} size="1em" />
      {$t('filters')}
    </summary>
    <div class="mt-3 grid grid-cols-2 items-end gap-3 md:grid-cols-4 xl:grid-cols-8">
      <Field label={$t('filename')} class="col-span-2">
        <Input bind:value={draft.query} placeholder={$t('search')} />
      </Field>
      <Field label={$t('path')} class="col-span-2">
        <Input bind:value={draft.path} placeholder={$t('folder')} />
      </Field>
      <Field label={$t('year')}>
        <Input
          type="number"
          min="1900"
          max="2100"
          value={draft.year?.toString() ?? ''}
          oninput={(event) => updateNumber(event, 'year')}
        />
      </Field>
      <Field label={$t('month')}>
        <Input
          type="number"
          min="1"
          max="12"
          value={draft.month?.toString() ?? ''}
          oninput={(event) => updateNumber(event, 'month')}
        />
      </Field>
      <Field label={$t('rating')}>
        <Select
          options={ratingOptions}
          value={draft.minRating?.toString() ?? 'all'}
          onChange={(value) => (draft.minRating = value === 'all' ? null : Number(value))}
        />
      </Field>
      <Field label={$t('favorite')}>
        <Switch bind:checked={draft.favorite} />
      </Field>
      <Field label={$t('city')}>
        <Select options={cityOptions} value={draft.city} onChange={(value) => (draft.city = value)} />
      </Field>
      <Field label={$t('camera_brand')}>
        <Select options={makeOptions} value={draft.make} onChange={(value) => (draft.make = value)} />
      </Field>
      <Field label={$t('camera_model')}>
        <Select options={modelOptions} value={draft.model} onChange={(value) => (draft.model = value)} />
      </Field>
      <Field label={$t('lens_model')}>
        <Select options={lensOptions} value={draft.lens} onChange={(value) => (draft.lens = value)} />
      </Field>
      <Field label={$t('tags')}>
        <Select options={tagOptions} value={draft.tagId} onChange={(value) => (draft.tagId = value)} />
      </Field>
      <Field label={$t('gps')}>
        <Select
          options={gpsOptions}
          value={draft.gps}
          onChange={(value) => (draft.gps = value === 'yes' || value === 'no' ? value : 'all')}
        />
      </Field>
      <Field label={$t('file_size')}>
        <Select options={sizeOptions} value={sizeValue} onChange={setSize} />
      </Field>

      {#if mediaType !== 'video'}
        <Field label={$t('orientation')}>
          <Select
            options={directionOptions}
            value={draft.direction}
            onChange={(value) => (draft.direction = value === 'landscape' || value === 'portrait' ? value : 'all')}
          />
        </Field>
        <Field label="RAW">
          <Switch bind:checked={draft.raw} />
        </Field>
      {/if}

      {#if mediaType !== 'image'}
        <Field label={$t('duration')}>
          <Select options={durationOptions} value={durationValue} onChange={setDuration} />
        </Field>
        <Field label={$t('resolution')}>
          <Select options={resolutionOptions} value={resolutionValue} onChange={setResolution} />
        </Field>
      {/if}

      <Field label={$t('sort')}>
        <Select
          options={sortOptions}
          value={draft.sort}
          onChange={(value) =>
            (draft.sort = ['rating', 'name', 'size'].includes(value) ? (value as MediaSort) : 'date')}
        />
      </Field>
      <Field label={$t('sort_order')}>
        <Select
          options={orderOptions}
          value={draft.order}
          onChange={(value) => (draft.order = value === 'asc' ? 'asc' : 'desc')}
        />
      </Field>
    </div>
    <div class="mt-3 flex flex-wrap items-end gap-2 border-t border-gray-200 pt-3 dark:border-gray-700">
      <Field label={$t('smart_album_name')} class="min-w-56 flex-1">
        <Input bind:value={smartAlbumName} placeholder={$t('enter_album_name')} />
      </Field>
      <Button
        type="button"
        size="small"
        variant="outline"
        loading={savingSmartAlbum}
        onclick={() => void saveSmartAlbum()}
      >
        {$t('save_smart_album')}
      </Button>
    </div>
    <div class="mt-3 flex flex-wrap items-center justify-end gap-2 border-t border-gray-200 pt-3 dark:border-gray-700">
      <Button type="button" size="small" variant="ghost" color="secondary" onclick={() => void clear()}>
        {$t('clear_all')}
      </Button>
      <Button type="submit" size="small" leadingIcon={mdiFilterVariant}>{$t('search')}</Button>
    </div>
  </details>

  <div class="mt-3 flex flex-wrap items-center gap-4">
    <Field label={$t('pinned')} class="w-fit min-w-36">
      <Switch bind:checked={pinned} />
    </Field>
    <label class="flex min-w-52 flex-1 items-center gap-3 text-xs text-gray-600 sm:max-w-96 dark:text-gray-300">
      <span class="whitespace-nowrap">{$t('card_size')}: {cardSize}px</span>
      <input class="min-w-0 flex-1 accent-primary" type="range" min="160" max="420" step="10" bind:value={cardSize} />
    </label>
  </div>
</form>
