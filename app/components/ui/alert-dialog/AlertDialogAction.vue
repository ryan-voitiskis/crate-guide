<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { buttonVariants } from '@/components/ui/button'
import { reactiveOmit } from '@vueuse/core'
import type { AlertDialogActionProps } from 'reka-ui'
import { AlertDialogAction } from 'reka-ui'

const props = defineProps<
	AlertDialogActionProps & {
		class?: HTMLAttributes['class']
		loading?: boolean
	}
>()

const delegatedProps = reactiveOmit(props, 'class', 'loading')
</script>

<template>
	<AlertDialogAction
		v-bind="delegatedProps"
		:class="cn(buttonVariants(), props.class, 'relative')"
		:disabled="loading"
	>
		<span
			v-if="loading"
			class="absolute inset-0 flex items-center justify-center"
		>
			<SpinnerLoading class="opacity-80" />
		</span>
		<div :class="['flex items-center', { 'opacity-0': loading }]">
			<slot />
		</div>
	</AlertDialogAction>
</template>
