<script setup lang="ts">
defineProps<{
	deckIndex: number
	deck: Deck
}>()
</script>

<template>
	<div class="relative h-56 w-56 shrink-0 overflow-visible">
		<!-- Tonearm base (below platter) -->
		<TurntableTonearm :is-playing="deck.isPlaying" layer="base" />

		<!-- Platter -->
		<TurntablePlatter
			:deck-index="deckIndex"
			:deck="deck"
			class="absolute inset-0 z-10"
		/>

		<!-- Tonearm arm (above platter) -->
		<TurntableTonearm :is-playing="deck.isPlaying" layer="arm" />
	</div>
</template>
