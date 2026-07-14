<script setup lang="ts">
import { AlignJustify, Rows3 } from 'lucide-vue-next'

const props = defineProps<{
	modelValue: 'compact' | 'comfortable'
}>()

const emit = defineEmits<{
	'update:modelValue': [value: 'compact' | 'comfortable']
}>()

function setDensity(value: 'compact' | 'comfortable') {
	emit('update:modelValue', value)
	localStorage.setItem('crate-guide-density', value)
}
</script>

<template>
	<div
		class="border-border bg-background inline-flex items-center rounded-md border p-0.5"
		aria-label="Row density"
	>
		<Button
			variant="ghost"
			size="icon"
			class="size-7 rounded-sm"
			:class="props.modelValue === 'compact' && 'bg-muted text-foreground'"
			:aria-pressed="props.modelValue === 'compact'"
			title="Compact rows"
			@click="setDensity('compact')"
		>
			<AlignJustify class="size-3.5" />
			<span class="sr-only">Compact rows</span>
		</Button>
		<Button
			variant="ghost"
			size="icon"
			class="size-7 rounded-sm"
			:class="props.modelValue === 'comfortable' && 'bg-muted text-foreground'"
			:aria-pressed="props.modelValue === 'comfortable'"
			title="Cozy rows"
			@click="setDensity('comfortable')"
		>
			<Rows3 class="size-3.5" />
			<span class="sr-only">Cozy rows</span>
		</Button>
	</div>
</template>
