<script setup lang="ts">
import { CircleX } from 'lucide-vue-next'

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
	<div class="flex h-full w-[380px] shrink-0 flex-col gap-2">
		<!-- Deck header -->
		<div class="flex items-center justify-between px-1">
			<span class="text-muted-foreground text-sm font-medium">
				Deck {{ deckIndex + 1 }}
			</span>
			<Button
				v-if="deck.loadedTrack"
				variant="ghost"
				size="icon"
				class="h-6 w-6"
				title="Eject track"
				@click="session.unloadDeck(deckIndex)"
			>
				<CircleX class="h-3.5 w-3.5" />
			</Button>
		</div>

		<!-- Turntable ON: SL-1200 style layout -->
		<template v-if="session.showTurntableSim">
			<div
				class="relative flex h-[250px] flex-col overflow-hidden"
				:style="{
					background: deckBackground,
					boxShadow:
						'inset 1px 1px 0 0 rgba(255,255,255,0.15), inset -1px -1px 0 0 rgba(0,0,0,0.3)'
				}"
			>
				<!-- Top: platter + pitch fader -->
				<div class="flex items-center p-3 pb-0">
					<TurntableSimulator :deck-index="deckIndex" :deck="deck" />
					<DeckPitchFader :deck-index="deckIndex" class="ml-auto" />
				</div>
				<!-- Bottom controls: start/stop + RPM -->
				<div class="relative z-10 -mt-6 flex items-end gap-2 px-3">
					<TurntableStartStop :deck-index="deckIndex" />
					<div class="flex gap-0.5">
						<TurntableRpmSelect :deck-index="deckIndex" :speed="33" />
						<TurntableRpmSelect :deck-index="deckIndex" :speed="45" />
					</div>
				</div>
			</div>

			<!-- Loaded track card below deck -->
			<DeckLoadedTrack
				:track="deck.loadedTrack ?? undefined"
				:deck-index="deckIndex"
				@load="showLoadDialog = true"
			/>
		</template>

		<!-- Turntable OFF: DeckLoadedTrack with pitch fader below -->
		<template v-else>
			<DeckLoadedTrack
				:track="deck.loadedTrack ?? undefined"
				:deck-index="deckIndex"
				@load="showLoadDialog = true"
			/>
			<DeckPitchFader :deck-index="deckIndex" compact />
		</template>

		<!-- Suggestions list -->
		<div class="min-h-0 flex-1">
			<SuggestionList :suggestions="suggestions" :deck-index="deckIndex" />
		</div>

		<!-- Load track dialog -->
		<DialogLoadTrack v-model:open="showLoadDialog" :deck-index="deckIndex" />
	</div>
</template>
