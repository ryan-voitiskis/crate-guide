<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import type { ButtonVariants } from '@/components/ui/button'
import Button from '@/components/ui/button/Button.vue'

interface Props {
	variant?: ButtonVariants['variant']
	size?: ButtonVariants['size']
	class?: HTMLAttributes['class']
	disabled?: boolean
	loading?: boolean
	// Consume and reject unsupported polymorphic inputs instead of leaking them.
	as?: never
	asChild?: never
}

const props = withDefaults(defineProps<Props>(), {
	loading: false
})
</script>

<template>
	<Button
		:variant="variant"
		:size="size"
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
	</Button>
</template>
