<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { Check } from 'lucide-vue-next'
import type { CheckboxRootEmits, CheckboxRootProps } from 'reka-ui'
import { CheckboxIndicator, CheckboxRoot, useForwardPropsEmits } from 'reka-ui'

const props = defineProps<
	CheckboxRootProps & {
		class?: HTMLAttributes['class']
		largeHitArea?: boolean
	}
>()
const emits = defineEmits<CheckboxRootEmits>()

const delegatedProps = reactiveOmit(props, 'class', 'largeHitArea')

const forwarded = useForwardPropsEmits(delegatedProps, emits)
</script>

<template>
	<CheckboxRoot
		data-slot="checkbox"
		v-bind="forwarded"
		:class="
			cn(
				'peer border-input data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=checked]:border-primary focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive size-4 shrink-0 rounded-[4px] border shadow-xs transition-shadow outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50',
				props.largeHitArea &&
					'before:border-input data-[state=checked]:before:border-primary data-[state=checked]:before:bg-primary relative inline-flex size-10 items-center justify-center border-0 bg-transparent shadow-none before:absolute before:size-5 before:rounded-[4px] before:border before:shadow-xs data-[state=checked]:border-transparent data-[state=checked]:bg-transparent',
				props.class
			)
		"
	>
		<CheckboxIndicator
			data-slot="checkbox-indicator"
			class="relative z-10 flex items-center justify-center text-current transition-none"
		>
			<slot>
				<Check class="size-3.5" />
			</slot>
		</CheckboxIndicator>
	</CheckboxRoot>
</template>
