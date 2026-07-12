<script setup lang="ts">
const session = useSessionStore()
const tracks = useTracksStore()

const selectedTrack = computed(() => {
	if (!session.deckSelectDialog.trackId) return null
	return tracks.getTrackById(session.deckSelectDialog.trackId)
})

const artistNames = computed(() => {
	if (!selectedTrack.value) return ''
	return selectedTrack.value.artists.map((a) => a.name).join(', ')
})

function selectDeck(deckIndex: number) {
	session.loadToSelectedDeck(deckIndex)
}

function handleOpenChange(open: boolean) {
	if (!open) {
		session.closeDeckSelectDialog()
	}
}
</script>

<template>
	<Dialog :open="session.deckSelectDialog.open" @update:open="handleOpenChange">
		<DialogContent class="sm:max-w-md">
			<DialogHeader>
				<DialogTitle>Load to Deck</DialogTitle>
				<DialogDescription v-if="selectedTrack">
					{{ selectedTrack.title }} - {{ artistNames }}
				</DialogDescription>
			</DialogHeader>

			<div class="grid grid-cols-2 gap-3 py-4">
				<Button
					v-for="(deck, index) in session.decks"
					:key="index"
					variant="outline"
					size="lg"
					class="h-16 text-lg"
					:disabled="index === session.deckSelectDialog.sourceDeck"
					@click="selectDeck(index)"
				>
					Deck {{ index + 1 }}
				</Button>
			</div>

			<DialogFooter>
				<Button variant="ghost" @click="session.closeDeckSelectDialog()">
					Cancel
				</Button>
			</DialogFooter>
		</DialogContent>
	</Dialog>
</template>
