<script lang="ts">
  import { FormModal, Select } from '@immich/ui';
  import { mdiStarOutline } from '@mdi/js';
  import { t } from 'svelte-i18n';

  interface Props {
    count: number;
    onClose: (rating?: number) => void;
  }

  let { count, onClose }: Props = $props();
  const options = [1, 2, 3, 4, 5].map((rating) => ({
    label: '★'.repeat(rating),
    value: String(rating),
  }));
  let rating = $state('5');

  const submit = () => onClose(Number(rating));
</script>

<FormModal
  title={$t('rate_assets_count', { values: { count } })}
  icon={mdiStarOutline}
  size="small"
  {onClose}
  onSubmit={submit}
>
  <Select {options} bind:value={rating} />
</FormModal>
