<script setup lang="ts">
const props = defineProps<{
	deckIndex: number
	deck: Deck
}>()

const session = useSessionStore()
const user = useUserStore()

const suggestions = computed(() =>
	session.getSuggestionsForDeck(props.deckIndex)
)

const showLoadDialog = ref(false)

// Turntable theme backgrounds
const silverDeckBackground = `linear-gradient(
	to right bottom,
	#8f8d97, #9d9ca6, #acacb4, #bbbcc3, #cbccd2,
	#cfd0d6, #d3d4d9, #d7d8dd, #d0d0d6, #c8c9cf, #c1c1c9, #babac2
)`

const blackDeckBackground = `linear-gradient(
	to right bottom,
	#282727, #2d2c2c, #323132, #373737, #3c3c3c,
	#3c3c3c, #3c3c3c, #3c3c3c, #373737, #323132, #2d2c2c, #282727
)`

const deckBackground = computed(() => {
	const theme = user.profile?.turntable_theme ?? 'silver'
	return theme === 'black' ? blackDeckBackground : silverDeckBackground
})
</script>

<template>
	<div class="flex h-full max-w-[640px] min-w-80 flex-1 flex-col gap-2">
		<!-- Deck header -->
		<div class="flex items-center justify-between px-1">
			<span class="text-muted-foreground text-sm font-medium">
				Deck {{ deckIndex + 1 }}
			</span>
			<span
				v-if="deck.rpm && session.showTurntableSim"
				class="text-muted-foreground text-xs"
			>
				{{ deck.rpm }} RPM
			</span>
		</div>

		<!-- Turntable ON: deck background with turntable + pitch fader -->
		<template v-if="session.showTurntableSim">
			<div
				class="flex gap-3 rounded-lg p-3"
				:style="{ background: deckBackground }"
			>
				<TurntableSimulator :deck-index="deckIndex" :deck="deck" />
				<DeckPitchFader :deck-index="deckIndex" />
			</div>

			<!-- Loaded track card below deck -->
			<DeckLoadedTrack
				:track="deck.loadedTrack"
				:deck-index="deckIndex"
				@load="showLoadDialog = true"
			/>
		</template>

		<!-- Turntable OFF: DeckLoadedTrack + pitch fader in a row -->
		<template v-else>
			<div class="flex gap-2">
				<DeckLoadedTrack
					class="flex-1"
					:track="deck.loadedTrack"
					:deck-index="deckIndex"
					@load="showLoadDialog = true"
				/>
				<DeckPitchFader :deck-index="deckIndex" compact />
			</div>
		</template>

		<!-- Suggestions list -->
		<div class="min-h-0 flex-1">
			<SuggestionList :suggestions="suggestions" :deck-index="deckIndex" />
		</div>

		<!-- Load track dialog -->
		<DialogLoadTrack v-model:open="showLoadDialog" :deck-index="deckIndex" />
	</div>
</template>
