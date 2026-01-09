<script setup lang="ts">
defineProps<{
	deckIndex: number
	deck: Deck
}>()
</script>

<template>
	<div class="relative h-48 w-48 shrink-0">
		<!-- Platter -->
		<TurntablePlatter
			:deck-index="deckIndex"
			:deck="deck"
			class="absolute inset-0"
		/>

		<!-- Tonearm -->
		<TurntableTonearm :is-playing="deck.isPlaying" />

		<!-- Controls row: Start/Stop + RPM selectors -->
		<div class="absolute bottom-2 left-2 flex items-end gap-1">
			<TurntableStartStop :deck-index="deckIndex" />
			<div class="flex flex-col gap-0.5">
				<TurntableRpmSelect :deck-index="deckIndex" :speed="33" />
				<TurntableRpmSelect :deck-index="deckIndex" :speed="45" />
			</div>
		</div>
	</div>
</template>
