<script setup lang="ts">
const session = useSessionStore()
const tracks = useTracksStore()

const isActive = usePageActive(true)

onMounted(() => {
	session.fetchSavedSets()
})
</script>

<template>
	<div class="flex h-full flex-col">
		<DialogSelectDeck />
		<DialogSetManager />
		<DialogSaveSession />

		<Teleport to="#header-left" defer>
			<template v-if="isActive">
				<SessionHeaderControls />
			</template>
		</Teleport>

		<Separator />

		<div class="relative min-h-0 flex-1">
			<StateLoading
				v-if="tracks.isLoadingTracks"
				message="Loading tracks..."
				class="h-full"
			/>

			<div
				v-else-if="!tracks.hasTracks"
				class="flex h-full flex-col items-center justify-center gap-4 p-8"
			>
				<p class="text-muted-foreground text-center">
					Import your record collection first to start a session.
				</p>
			</div>

			<div v-else class="flex h-full">
				<ScrollArea class="flex-1" orientation="horizontal">
					<div class="flex h-full gap-4 p-2">
						<DeckColumn
							v-for="(deck, index) in session.decks"
							:key="index"
							:deck-index="index"
							:deck="deck"
						/>
					</div>
				</ScrollArea>

				<Transition name="slide">
					<div
						v-if="session.showHistory"
						class="border-border w-80 shrink-0 border-l"
					>
						<HistoryPanel />
					</div>
				</Transition>
			</div>
		</div>
	</div>
</template>

<style scoped>
.slide-enter-active,
.slide-leave-active {
	transition: all 0.2s ease;
}

.slide-enter-from,
.slide-leave-to {
	transform: translateX(100%);
	opacity: 0;
}
</style>
