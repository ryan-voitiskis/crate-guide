<script setup lang="ts">
import { X } from 'lucide-vue-next'

const model = defineModel<string | null>({ default: null })

const colors = [
	{ value: '#EF4444', label: 'Red' },
	{ value: '#F97316', label: 'Orange' },
	{ value: '#EAB308', label: 'Yellow' },
	{ value: '#22C55E', label: 'Green' },
	{ value: '#14B8A6', label: 'Teal' },
	{ value: '#3B82F6', label: 'Blue' },
	{ value: '#8B5CF6', label: 'Purple' },
	{ value: '#EC4899', label: 'Pink' }
] as const

function selectColor(color: string) {
	model.value = color
}

function clearColor() {
	model.value = null
}
</script>

<template>
	<div class="flex flex-wrap gap-2">
		<button
			v-for="color in colors"
			:key="color.value"
			type="button"
			:title="color.label"
			:aria-label="color.label"
			class="size-8 rounded-full border-2 transition-all hover:scale-110 focus:ring-2 focus:ring-offset-2 focus:outline-none"
			:class="[
				model === color.value
					? 'border-foreground ring-2 ring-offset-2'
					: 'border-transparent'
			]"
			:style="{ backgroundColor: color.value }"
			@click="selectColor(color.value)"
		/>
		<button
			type="button"
			title="No color"
			aria-label="No color"
			class="bg-muted text-muted-foreground flex size-8 items-center justify-center rounded-full border-2 transition-all hover:scale-110 focus:ring-2 focus:ring-offset-2 focus:outline-none"
			:class="[
				model === null
					? 'border-foreground ring-2 ring-offset-2'
					: 'border-transparent'
			]"
			@click="clearColor"
		>
			<X class="size-4" />
		</button>
	</div>
</template>
