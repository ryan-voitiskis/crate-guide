<script setup lang="ts">
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-vue-next'

defineProps<{
	label: string
	active?: boolean
	direction?: 'asc' | 'desc'
	align?: 'left' | 'right' | 'center'
}>()

defineEmits<{
	click: []
}>()
</script>

<template>
	<button
		type="button"
		class="text-muted-foreground hover:text-foreground flex w-full items-center gap-1 font-mono text-[9px] font-semibold tracking-[0.08em] uppercase transition-colors"
		:class="{
			'justify-end': align === 'right',
			'justify-center': align === 'center'
		}"
		@click="$emit('click')"
	>
		{{ label }}
		<ArrowUp v-if="active && direction === 'asc'" class="size-3" />
		<ArrowDown v-else-if="active" class="size-3" />
		<ChevronsUpDown v-else class="size-3 opacity-40" />
	</button>
</template>
