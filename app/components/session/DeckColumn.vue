<script setup lang="ts">
import { CircleX } from 'lucide-vue-next'

const props = defineProps<{
	deckIndex: number
	deck: Deck
}>()

const session = useWorkbenchSessionStore()
const user = useWorkbenchUserStore()

const suggestions = computed(() =>
	session.getSuggestionsForDeck(props.deckIndex)
)

const showLoadDialog = ref(false)

// Turntable theme backgrounds
const silverDeckBackground = `linear-gradient(
	135deg,
	#d8d8cc 0%,
	#cacabd 16%,
	#e1e0d5 34%,
	#c5c5b8 52%,
	#dad9cd 70%,
	#babab0 100%
)`
const silverDeckOverlay = `radial-gradient(
	circle at 12% 11%,
	rgba(255, 255, 246, 0.64) 0%,
	rgba(255, 255, 246, 0.22) 9%,
	transparent 21%
), radial-gradient(
	ellipse at 78% 17%,
	rgba(255, 255, 244, 0.36) 0%,
	transparent 34%
), radial-gradient(
	ellipse at 86% 82%,
	rgba(91, 91, 86, 0.16) 0%,
	transparent 48%
)`
const silverDeckMaterial = `${silverDeckOverlay}, ${silverDeckBackground}`

const blackDeckBackground = `linear-gradient(
	to right bottom,
	#282727, #2d2c2c, #323132, #373737, #3c3c3c,
	#3c3c3c, #3c3c3c, #3c3c3c, #373737, #323132, #2d2c2c, #282727
)`

const deckBackground = computed(() => {
	const theme = user.profile?.turntable_theme ?? 'silver'
	return theme === 'black' ? blackDeckBackground : silverDeckMaterial
})
</script>

<template>
	<div class="flex h-full w-[380px] shrink-0 flex-col gap-2">
		<!-- Deck header -->
		<div class="flex h-6 items-center justify-between px-1">
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
				:data-testid="`deck-${deckIndex}-turntable`"
				class="relative flex h-[250px] flex-col overflow-hidden"
				:style="{
					background: deckBackground,
					boxShadow:
						'inset 1px 1px 0 0 rgba(255,255,255,0.15), inset -1px -1px 0 0 rgba(0,0,0,0.3)'
				}"
			>
				<!-- Top: platter + pitch fader -->
				<div class="flex items-start p-1 pb-0">
					<TurntableSimulator :deck-index="deckIndex" :deck="deck" />
					<DeckPitchFader :deck-index="deckIndex" class="ml-auto" />
				</div>
				<!-- Bottom controls: start/stop + RPM -->
				<div class="absolute bottom-1 left-1.5 z-10 flex items-end gap-1.5">
					<TurntableStartStop :deck-index="deckIndex" />
					<div
						:data-testid="`deck-${deckIndex}-rpm-housing`"
						class="flex h-4 items-center gap-px overflow-hidden rounded-[2px] border-[0.5px] border-[#11110f] bg-[#292824] p-[0.5px]"
					>
						<TurntableSelectRpm :deck-index="deckIndex" :speed="33" />
						<TurntableSelectRpm :deck-index="deckIndex" :speed="45" />
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
			<ListTrackSuggestions
				:suggestions="suggestions"
				:deck-index="deckIndex"
			/>
		</div>

		<!-- Load track dialog -->
		<DialogLoadTrack v-model:open="showLoadDialog" :deck-index="deckIndex" />
	</div>
</template>
