<script setup lang="ts">
import { Star } from 'lucide-vue-next'

const props = defineProps<{
	rating: number | null
}>()

const emit = defineEmits<{
	update: [rating: number | null]
}>()

const hoveredRating = ref<number | null>(null)

function handleClick(value: number) {
	// Toggle off if clicking the same value
	if (props.rating === value) {
		emit('update', null)
	} else {
		emit('update', value)
	}
}

function handleMouseEnter(value: number) {
	hoveredRating.value = value
}

function handleMouseLeave() {
	hoveredRating.value = null
}
</script>

<template>
	<div class="flex gap-0.5">
		<button
			v-for="value in 5"
			:key="value"
			@click="handleClick(value)"
			@mouseenter="handleMouseEnter(value)"
			@mouseleave="handleMouseLeave"
			class="p-0.5 transition-colors"
		>
			<Star
				class="h-3.5 w-3.5"
				:class="{
					'fill-yellow-500 text-yellow-500':
						(hoveredRating !== null && value <= hoveredRating) ||
						(hoveredRating === null && rating !== null && value <= rating),
					'text-muted-foreground/50':
						(hoveredRating !== null && value > hoveredRating) ||
						(hoveredRating === null && (rating === null || value > rating))
				}"
			/>
		</button>
	</div>
</template>
