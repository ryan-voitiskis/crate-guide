<script setup lang="ts">
const records = useWorkbenchRecordsStore()
const session = useWorkbenchSessionStore()
const tracks = useWorkbenchTracksStore()
const capabilities = useWorkbenchCapabilities()

const isActive = usePageActive(true)

watchEffect(() => session.setTrackSource(tracks.tracks))

onMounted(() => {
	if (capabilities.canPersistSessions) session.fetchSavedSets()
})
</script>

<template>
	<div class="flex h-full flex-col">
		<DialogSelectDeck />
		<DialogSetManager />
		<DialogSaveSession />

		<Teleport to="#header-left" defer>
			<template v-if="isActive && records.hasRecords">
				<HeaderSessionControls />
			</template>
		</Teleport>

		<Separator class="opacity-70" />

		<div class="relative min-h-0 flex-1">
			<StateLoading
				v-if="records.isLoadingRecords || tracks.isLoadingTracks"
				message="Loading tracks..."
				class="h-full"
			/>

			<StateEmptyCollection
				v-else-if="!records.hasRecords"
				icon="session"
				title="Add records to start a session"
				description="Sessions are built from the tracks in your record library."
			/>

			<div
				v-else-if="!tracks.hasTracks"
				class="flex h-full flex-col items-center justify-center gap-4 p-8"
			>
				<p class="text-muted-foreground text-center">
					Add tracks to your records before starting a session.
				</p>
			</div>

			<div
				v-else
				class="flex h-full bg-[radial-gradient(circle_at_center,var(--muted),transparent_65%)]"
			>
				<ScrollArea class="flex-1" orientation="horizontal">
					<div class="flex h-full gap-3 p-2 sm:p-3">
						<DeckColumn
							v-for="(deck, index) in session.decks"
							:key="index"
							:deck-index="index"
							:deck="deck"
						/>
					</div>
				</ScrollArea>

				<Transition
					enter-active-class="transition-all duration-200"
					enter-from-class="translate-x-full opacity-0"
					leave-active-class="transition-all duration-200"
					leave-to-class="translate-x-full opacity-0"
				>
					<div
						v-if="session.showHistory"
						class="border-border bg-background/95 absolute inset-y-0 right-0 z-30 w-full shrink-0 border-l shadow-2xl backdrop-blur-sm sm:w-80 xl:relative xl:z-auto xl:shadow-none"
					>
						<PanelSessionHistory />
					</div>
				</Transition>
			</div>
		</div>
	</div>
</template>
