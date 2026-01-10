<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import type { ToggleGroupRootEmits, ToggleGroupRootProps } from 'reka-ui'
import { ToggleGroupRoot as RekaToggleGroupRoot } from 'reka-ui'
import type { ToggleGroupVariants } from '.'
import { toggleGroupVariants } from '.'

const props = withDefaults(
	defineProps<
		ToggleGroupRootProps & {
			class?: HTMLAttributes['class']
			variant?: ToggleGroupVariants['variant']
		}
	>(),
	{
		variant: 'default'
	}
)

const emits = defineEmits<ToggleGroupRootEmits>()
</script>

<template>
	<RekaToggleGroupRoot
		data-slot="toggle-group"
		:class="cn(toggleGroupVariants({ variant }), props.class)"
		:type="props.type"
		:model-value="props.modelValue"
		:default-value="props.defaultValue"
		:disabled="props.disabled"
		:roving-focus="props.rovingFocus"
		:loop="props.loop"
		:orientation="props.orientation"
		:dir="props.dir"
		@update:model-value="(val) => emits('update:modelValue', val)"
	>
		<slot />
	</RekaToggleGroupRoot>
</template>
