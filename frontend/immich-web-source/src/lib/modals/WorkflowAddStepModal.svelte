<script lang="ts">
  import SchemaConfiguration from '$lib/components/SchemaConfiguration.svelte';
  import PluginMethodPicker from '$lib/modals/PluginMethodPicker.svelte';
  import { type JSONSchemaProperty, type SchemaConfig } from '$lib/types';
  import { localizeWorkflowMethod } from '$lib/utils/workflow-localization';
  import { getWorkflowDefaultConfig } from '$lib/utils/workflow';
  import { WorkflowTrigger, type PluginMethodResponseDto, type WorkflowStepDto } from '@immich/sdk';
  import { FormModal, IconButton, modalManager, Stack, Text, Textarea } from '@immich/ui';
  import { mdiPencilOutline } from '@mdi/js';
  import { locale, t } from 'svelte-i18n';

  type Props = {
    trigger: WorkflowTrigger;
    onClose: (step?: WorkflowStepDto) => void;
  };

  const { trigger, onClose }: Props = $props();

  const onSubmit = () => {
    if (method) {
      onClose({ method: method.key, config, enabled: true });
    }
  };

  let method = $state<PluginMethodResponseDto>();
  const displayMethod = $derived(method ? localizeWorkflowMethod(method, $locale) : undefined);
  let config = $state<SchemaConfig>({});
  let debug = $state(false);

  const onPickMethod = async () => {
    const selected = await modalManager.show(PluginMethodPicker, { trigger, selectedKey: method?.key });
    if (!selected) {
      return;
    }

    method = selected;
    config = selected.schema ? getWorkflowDefaultConfig(selected.schema as JSONSchemaProperty) : null;
  };

  void onPickMethod();
</script>

{#if method && displayMethod}
  <FormModal title={$t('add_step')} {onClose} {onSubmit} disabled={!method} size="medium">
    <div class="flex items-center justify-between gap-2">
      <div class="grow text-start">
        <Text fontWeight="medium">{displayMethod.title}</Text>
        {#if displayMethod.description}
          <Text size="tiny" color="muted">{displayMethod.description}</Text>
        {/if}
      </div>
      <IconButton
        icon={mdiPencilOutline}
        onclick={onPickMethod}
        variant="ghost"
        shape="round"
        color="secondary"
        aria-label={$t('edit')}
      />
    </div>

    {#if displayMethod.schema}
      <hr class="my-4" />
      <div class="mt-4 grow text-start">
        <Text fontWeight="medium">{$t('configuration')}</Text>
        <Stack gap={4}>
          <SchemaConfiguration schema={displayMethod.schema as JSONSchemaProperty} bind:config root />
        </Stack>
      </div>
    {/if}

    {#if debug}
      <hr class="my-4" />
      <Text fontWeight="medium">{$t('preview')}</Text>
      <Textarea class="mt-2" readonly grow value={JSON.stringify({ method: method.key, config }, null, 2)} />
    {/if}
  </FormModal>
{/if}
