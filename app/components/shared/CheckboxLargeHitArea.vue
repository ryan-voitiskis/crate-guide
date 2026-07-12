<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import Checkbox from '@/components/ui/checkbox/Checkbox.vue'
import { reactiveOmit } from '@vueuse/core'
import type { CheckboxRootEmits, CheckboxRootProps } from 'reka-ui'
import { useForwardPropsEmits } from 'reka-ui'

const props = defineProps<
	CheckboxRootProps & {
		class?: HTMLAttributes['class']
		// Consume and reject the retired primitive extension instead of leaking it.
		largeHitArea?: never
	}
>()
const emits = defineEmits<CheckboxRootEmits>()

const delegatedProps = reactiveOmit(props, 'class', 'largeHitArea')
const forwarded = useForwardPropsEmits(delegatedProps, emits)
</script>

<template>
	<Checkbox
		v-bind="forwarded"
		:class="
			cn(
				'before:border-input data-[state=checked]:before:border-primary data-[state=checked]:before:bg-primary relative inline-flex size-10 items-center justify-center border-0 bg-transparent shadow-none before:absolute before:size-5 before:rounded-[4px] before:border before:shadow-xs data-[state=checked]:border-transparent data-[state=checked]:bg-transparent',
				props.class
			)
		"
	>
		<template v-if="$slots.default" #default>
			<slot />
		</template>
	</Checkbox>
</template>
