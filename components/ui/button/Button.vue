<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { Primitive, type PrimitiveProps } from 'radix-vue'
import { type ButtonVariants, buttonVariants } from '.'

interface Props extends PrimitiveProps {
	variant?: ButtonVariants['variant']
	size?: ButtonVariants['size']
	class?: HTMLAttributes['class']
	loading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
	as: 'button',
	loading: false
})
</script>

<template>
	<Primitive
		:as="as"
		:as-child="asChild"
		:class="cn(buttonVariants({ variant, size }), props.class, 'relative')"
		:disabled="loading"
	>
		<span
			v-if="loading"
			class="opacity-1 absolute inset-0 flex items-center justify-center"
		>
			<LoadingSpinner class="opacity-80" />
		</span>
		<div :class="{ 'opacity-0': loading }">
			<slot />
		</div>
	</Primitive>
</template>
