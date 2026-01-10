<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import type { ToggleGroupItemProps } from 'reka-ui'
import { ToggleGroupItem as RekaToggleGroupItem } from 'reka-ui'
import type { ToggleGroupItemVariants } from '.'
import { toggleGroupItemVariants } from '.'

const props = withDefaults(
	defineProps<
		ToggleGroupItemProps & {
			class?: HTMLAttributes['class']
			variant?: ToggleGroupItemVariants['variant']
			size?: ToggleGroupItemVariants['size']
		}
	>(),
	{
		variant: 'default',
		size: 'default'
	}
)
</script>

<template>
	<RekaToggleGroupItem
		data-slot="toggle-group-item"
		:class="
			cn(
				toggleGroupItemVariants({ variant, size }),
				'first:rounded-l-md last:rounded-r-md',
				props.class
			)
		"
		:value="props.value"
		:disabled="props.disabled"
	>
		<slot />
	</RekaToggleGroupItem>
</template>
