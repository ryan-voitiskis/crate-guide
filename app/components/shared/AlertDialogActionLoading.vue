<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import AlertDialogAction from '@/components/ui/alert-dialog/AlertDialogAction.vue'

const props = withDefaults(
	defineProps<{
		class?: HTMLAttributes['class']
		disabled?: boolean
		loading?: boolean
		// Consume and reject unsupported polymorphic inputs instead of leaking them.
		as?: never
		asChild?: never
	}>(),
	{
		loading: false
	}
)
</script>

<template>
	<AlertDialogAction
		:class="cn(props.class, 'relative')"
		:disabled="disabled || loading"
		:aria-busy="loading || undefined"
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
