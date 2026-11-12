<script lang="ts">
  import MenuOption from '$lib/components/shared-components/context-menu/MenuOption.svelte';
  import { assetMultiSelectManager } from '$lib/managers/asset-multi-select-manager.svelte';
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import BulkRatingModal from '$lib/modals/BulkRatingModal.svelte';
  import { getOwnedAssetsWithWarning } from '$lib/utils/asset-utils';
  import { handleError } from '$lib/utils/handle-error';
  import { updateAssets } from '@immich/sdk';
  import { IconButton, modalManager, toastManager } from '@immich/ui';
  import { mdiStarOutline } from '@mdi/js';
  import { t } from 'svelte-i18n';

  interface Props {
    menuItem?: boolean;
  }

  let { menuItem = false }: Props = $props();

  const run = async () => {
    const rating = await modalManager.show(BulkRatingModal, { count: assetMultiSelectManager.assets.length });
    if (!rating) {
      return;
    }
    const ids = getOwnedAssetsWithWarning(assetMultiSelectManager.assets, authManager.user);
    try {
      await updateAssets({ assetBulkUpdateDto: { ids, rating } });
      toastManager.primary();
      assetMultiSelectManager.clear();
    } catch (error) {
      handleError(error, $t('errors.unable_to_set_rating'));
    }
  };
</script>

{#if menuItem}
  <MenuOption text={$t('rate_asset')} icon={mdiStarOutline} onClick={run} />
{:else}
  <IconButton
    shape="round"
    color="secondary"
    variant="ghost"
    aria-label={$t('rate_asset')}
    icon={mdiStarOutline}
    onclick={() => void run()}
  />
{/if}
