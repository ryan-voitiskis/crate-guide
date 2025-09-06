<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import type { PrimitiveProps } from 'reka-ui'
import { Primitive } from 'reka-ui'
import type { ButtonVariants } from '.'
import { buttonVariants } from '.'

interface Props extends PrimitiveProps {
	variant?: ButtonVariants['variant']
	size?: ButtonVariants['size']
	class?: HTMLAttributes['class']
	loading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
	as: 'button'
})
</script>

<template>
	<Primitive
		data-slot="button"
		:as="as"
		:as-child="asChild"
		:class="cn(buttonVariants({ variant, size }), props.class, 'relative')"
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
	</Primitive>
</template>
