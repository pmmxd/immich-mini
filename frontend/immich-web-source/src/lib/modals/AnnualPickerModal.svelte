<script lang="ts">
  import { FormModal, Select } from '@immich/ui';
  import { mdiCalendarStar } from '@mdi/js';
  import { t } from 'svelte-i18n';

  interface Props {
    onClose: (year?: number) => void;
  }

  let { onClose }: Props = $props();
  const currentYear = new Date().getFullYear();
  const options = Array.from({ length: 15 }, (_, index) => {
    const year = currentYear - index;
    return { label: String(year), value: String(year) };
  });
  let year = $state(String(currentYear));

  const submit = () => onClose(Number(year));
</script>

<FormModal title={$t('add_to_annual')} icon={mdiCalendarStar} size="small" {onClose} onSubmit={submit}>
  <Select {options} bind:value={year} />
</FormModal>
