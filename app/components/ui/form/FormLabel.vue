<script lang="ts" setup>
import type { HTMLAttributes } from 'vue'
import { Label } from '@/components/ui/label'
import type { LabelProps } from 'reka-ui'
import { useFormField } from './useFormField'

const props = defineProps<LabelProps & { class?: HTMLAttributes['class'] }>()

const { error, formItemId } = useFormField()
</script>

<template>
	<Label
		data-slot="form-label"
		:data-error="!!error"
		:class="cn('data-[error=true]:text-destructive-foreground', props.class)"
		:for="formItemId"
	>
		<slot />
	</Label>
</template>
