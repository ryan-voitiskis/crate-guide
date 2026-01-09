<script setup lang="ts">
const session = useSessionStore()
const tracks = useTracksStore()

onMounted(() => {
	session.fetchSavedSets()
})
</script>

<template>
	<div class="flex h-full flex-col">
		<SessionHeader />

		<Separator />

		<!-- Main content area -->
		<div class="relative min-h-0 flex-1">
			<!-- Loading state -->
			<div
				v-if="tracks.isLoadingTracks"
				class="flex h-full items-center justify-center"
			>
				<div class="flex items-center gap-4">
					<div
						class="border-primary h-6 w-6 animate-spin rounded-full border-2 border-t-transparent"
					/>
					<span>Loading tracks...</span>
				</div>
			</div>

			<!-- Empty state: No tracks -->
			<div
				v-else-if="!tracks.hasTracks"
				class="flex h-full flex-col items-center justify-center gap-4 p-8"
			>
				<p class="text-muted-foreground text-center">
					Import your record collection first to start a session.
				</p>
			</div>

			<!-- Session layout -->
			<div v-else class="flex h-full">
				<!-- Decks container with horizontal scroll -->
				<ScrollArea
					class="flex-1"
					orientation="horizontal"
				>
					<div class="flex h-full gap-4 p-2">
						<DeckColumn
							v-for="(deck, index) in session.decks"
							:key="index"
							:deck-index="index"
							:deck="deck"
						/>
					</div>
				</ScrollArea>

				<!-- History panel (centered, toggleable) -->
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

		<!-- Dialogs -->
		<DialogSelectDeck />
		<DialogSetManager />
		<DialogSaveSession />
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
