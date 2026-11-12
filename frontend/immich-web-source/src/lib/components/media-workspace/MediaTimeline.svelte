<script lang="ts">
  import MediaCard from './MediaCard.svelte';
  import { getByteUnitString } from '$lib/utils/byte-units';
  import type { AssetResponseDto } from '@immich/sdk';
  import { DateTime } from 'luxon';
  import { locale, t } from 'svelte-i18n';

  interface Props {
    assets: AssetResponseDto[];
    cardSize: number;
    portrait?: 'image' | 'video' | false;
    onOpen: (asset: AssetResponseDto) => void;
  }

  let { assets, cardSize, portrait = false, onOpen }: Props = $props();
  let collapsedYears = $state<number[]>([]);
  let initialized = $state(false);

  interface DateGroup {
    key: string;
    title: string;
    assets: AssetResponseDto[];
  }

  interface MonthGroup {
    key: string;
    title: string;
    days: DateGroup[];
  }

  interface YearGroup {
    year: number;
    assets: AssetResponseDto[];
    months: MonthGroup[];
  }

  const dateFor = (asset: AssetResponseDto) => DateTime.fromISO(asset.localDateTime).setLocale($locale ?? 'en');

  const groups = $derived.by(() => {
    const years: Record<string, AssetResponseDto[]> = {};
    for (const asset of assets) {
      const year = dateFor(asset).year;
      years[year] = [...(years[year] ?? []), asset];
    }

    return Object.keys(years)
      .map(Number)
      .sort((a, b) => b - a)
      .map((year): YearGroup => {
        const yearAssets = years[year];
        const months: Record<string, AssetResponseDto[]> = {};
        for (const asset of yearAssets) {
          const date = dateFor(asset);
          const key = `${date.year}-${String(date.month).padStart(2, '0')}`;
          months[key] = [...(months[key] ?? []), asset];
        }

        return {
          year,
          assets: yearAssets,
          months: Object.keys(months)
            .sort((a, b) => b.localeCompare(a))
            .map((key): MonthGroup => {
              const monthAssets = months[key];
              const days: Record<string, AssetResponseDto[]> = {};
              for (const asset of monthAssets) {
                const date = dateFor(asset);
                const dayKey = date.toISODate() ?? '';
                days[dayKey] = [...(days[dayKey] ?? []), asset];
              }
              return {
                key,
                title: dateFor(monthAssets[0]).toLocaleString({ month: 'long' }),
                days: Object.keys(days)
                  .sort((a, b) => b.localeCompare(a))
                  .map((dayKey) => {
                    const dayAssets = days[dayKey];
                    return {
                      key: dayKey,
                      title: dateFor(dayAssets[0]).toLocaleString({ month: 'long', day: 'numeric', weekday: 'short' }),
                      assets: dayAssets,
                    };
                  }),
              };
            }),
        };
      });
  });

  $effect(() => {
    if (!initialized && groups.length > 0) {
      collapsedYears = groups.slice(1).map((group) => group.year);
      initialized = true;
    }
  });

  const toggleYear = (year: number) => {
    if (collapsedYears.includes(year)) {
      collapsedYears = collapsedYears.filter((item) => item !== year);
    } else {
      collapsedYears = [...collapsedYears, year];
    }
  };

  const stats = (items: AssetResponseDto[]) => ({
    images: items.filter((asset) => asset.type === 'IMAGE').length,
    videos: items.filter((asset) => asset.type === 'VIDEO').length,
    bytes: items.reduce((sum, asset) => sum + (asset.exifInfo?.fileSizeInByte ?? 0), 0),
  });
</script>

<div class="flex flex-col gap-3">
  {#each groups as group (group.year)}
    {@const yearStats = stats(group.assets)}
    <section class="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
      <button
        type="button"
        class="flex w-full items-center gap-3 bg-gray-50 px-4 py-3 text-left hover:bg-gray-100 dark:bg-neutral-900 dark:hover:bg-neutral-800"
        aria-expanded={!collapsedYears.includes(group.year)}
        onclick={() => toggleYear(group.year)}
      >
        <span class="text-lg font-semibold">{group.year}</span>
        <span class="text-xs text-gray-500">
          {group.assets.length} · {$t('image')}
          {yearStats.images} · {$t('videos')}
          {yearStats.videos} ·
          {getByteUnitString(yearStats.bytes, $locale ?? undefined)}
        </span>
        <span class="ms-auto text-sm">{collapsedYears.includes(group.year) ? '＋' : '－'}</span>
      </button>

      {#if !collapsedYears.includes(group.year)}
        <div class="flex flex-col gap-4 p-3">
          {#each group.months as month (month.key)}
            <section>
              <h3 class="mb-2 px-1 text-sm font-semibold text-gray-600 dark:text-gray-300">{month.title}</h3>
              {#each month.days as day (day.key)}
                {@const dayStats = stats(day.assets)}
                <div class="media-day-group mb-4">
                  <div class="mb-2 flex flex-wrap items-center gap-2 px-1">
                    <h4 class="text-xs font-medium">{day.title}</h4>
                    <span class="text-xs text-gray-500">
                      {day.assets.length} · {getByteUnitString(dayStats.bytes, $locale ?? undefined)}
                    </span>
                  </div>
                  <div class="flex flex-wrap gap-2">
                    {#each day.assets as asset (asset.id)}
                      <MediaCard {asset} {cardSize} {portrait} {onOpen} />
                    {/each}
                  </div>
                </div>
              {/each}
            </section>
          {/each}
        </div>
      {/if}
    </section>
  {/each}
</div>

<style>
  .media-day-group {
    content-visibility: auto;
    contain-intrinsic-size: 320px;
  }
</style>
