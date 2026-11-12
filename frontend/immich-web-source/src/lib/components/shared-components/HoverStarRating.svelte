<script lang="ts">
  import { Icon } from '@immich/ui';
  import { mdiStar, mdiStarOutline } from '@mdi/js';
  import { t } from 'svelte-i18n';

  interface Props {
    rating: number | null;
    onRate: (rating: number) => void;
  }

  let { rating, onRate }: Props = $props();
  let hoverRating = $state<number | null>(null);

  const selectRating = (event: MouseEvent, value: number) => {
    event.preventDefault();
    event.stopPropagation();
    onRate(value);
  };
</script>

<div
  class="flex items-center rounded-full bg-black/70 p-1 shadow-lg backdrop-blur-sm"
  role="group"
  aria-label={$t('rating')}
  onmouseleave={() => (hoverRating = null)}
  onpointerdown={(event) => event.stopPropagation()}
>
  {#each [1, 2, 3, 4, 5] as value (value)}
    {@const filled = (hoverRating ?? rating ?? 0) >= value}
    <button
      type="button"
      class="flex size-6 items-center justify-center text-amber-400 transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-white"
      aria-label={$t('rating_count', { values: { count: value } })}
      title={$t('rating_count', { values: { count: value } })}
      onmouseenter={() => (hoverRating = value)}
      onfocus={() => (hoverRating = value)}
      onblur={() => (hoverRating = null)}
      onclick={(event) => selectRating(event, value)}
    >
      <Icon icon={filled ? mdiStar : mdiStarOutline} size="18" />
    </button>
  {/each}
</div>
