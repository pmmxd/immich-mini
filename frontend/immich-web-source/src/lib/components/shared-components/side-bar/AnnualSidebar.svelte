<script lang="ts">
  import { annualManager } from '$lib/managers/annual-manager.svelte';
  import { Route } from '$lib/route';
  import { NavbarItem } from '@immich/ui';
  import { mdiCalendarStar, mdiCalendarStarOutline } from '@mdi/js';
  import { t } from 'svelte-i18n';
  import { onMount } from 'svelte';

  let expanded = $state(false);

  onMount(() => {
    if (!annualManager.loaded) {
      void annualManager.load();
    }
  });

  const items = $derived(
    annualManager.years.map(({ year, album }) => ({
      title: String(year),
      href: Route.viewAlbum(album),
      icon: mdiCalendarStar,
    })),
  );

  const href = $derived(
    annualManager.years.length > 0 ? Route.viewAlbum(annualManager.years[0].album) : Route.albums(),
  );
</script>

<NavbarItem
  title={$t('annual')}
  {href}
  icon={mdiCalendarStarOutline}
  activeIcon={mdiCalendarStar}
  bind:expanded
  items={items.length > 0 ? items : undefined}
/>
