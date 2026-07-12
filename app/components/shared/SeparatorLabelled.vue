<script setup lang="ts">
import type { HTMLAttributes } from 'vue'

const props = defineProps<{
	label: string
	class?: HTMLAttributes['class']
	labelClass?: HTMLAttributes['class']
	// Consume and reject the retired primitive extension instead of leaking it.
	spanClass?: never
}>()
</script>

<template>
	<div
		role="separator"
		aria-orientation="horizontal"
		:aria-label="label"
		:class="cn('bg-border relative h-px w-full shrink-0', props.class)"
	>
		<span
			:class="
				cn(
					'bg-card text-muted-foreground absolute top-1/2 left-1/2 flex h-px -translate-x-1/2 -translate-y-1/2 items-center justify-center px-2 py-1 text-xs',
					props.labelClass
				)
			"
		>
			{{ label }}
		</span>
	</div>
</template>
