<script lang="ts">
  import MenuOption from '$lib/components/shared-components/context-menu/MenuOption.svelte';
  import { annualManager } from '$lib/managers/annual-manager.svelte';
  import { assetMultiSelectManager } from '$lib/managers/asset-multi-select-manager.svelte';
  import AnnualPickerModal from '$lib/modals/AnnualPickerModal.svelte';
  import { handleError } from '$lib/utils/handle-error';
  import { IconButton, modalManager, toastManager } from '@immich/ui';
  import { mdiCalendarStar } from '@mdi/js';
  import { t } from 'svelte-i18n';

  interface Props {
    menuItem?: boolean;
    assetIds?: string[];
  }

  let { menuItem = false, assetIds }: Props = $props();

  const run = async () => {
    const year = await modalManager.show(AnnualPickerModal, {});
    if (!year) {
      return;
    }
    try {
      await annualManager.addAssets(year, assetIds ?? assetMultiSelectManager.assets.map((asset) => asset.id));
      toastManager.primary($t('added_to_annual', { values: { year } }));
      if (!assetIds) {
        assetMultiSelectManager.clear();
      }
    } catch (error) {
      handleError(error, $t('errors.something_went_wrong'));
    }
  };
</script>

{#if menuItem}
  <MenuOption text={$t('add_to_annual')} icon={mdiCalendarStar} onClick={run} />
{:else}
  <IconButton
    shape="round"
    color="secondary"
    variant="ghost"
    aria-label={$t('add_to_annual')}
    icon={mdiCalendarStar}
    onclick={() => void run()}
  />
{/if}
