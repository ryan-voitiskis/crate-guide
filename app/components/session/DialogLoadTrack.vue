<script setup lang="ts">
import { ImageOff, Search } from 'lucide-vue-next'

const props = defineProps<{
	open: boolean
	deckIndex: number
}>()

const emit = defineEmits<{
	'update:open': [value: boolean]
}>()

const session = useSessionStore()
const tracks = useTracksStore()
const records = useRecordsStore()

const searchQuery = ref('')

const filteredTracks = computed(() => {
	const playable = tracks.playableTracks
	if (!searchQuery.value.trim()) return playable.slice(0, 100)
	return tracks
		.searchTracks(searchQuery.value)
		.filter((t) => t.playable)
		.slice(0, 100)
})

function handleTrackClick(trackId: string) {
	session.loadTrack(trackId, props.deckIndex, false)
	emit('update:open', false)
	searchQuery.value = ''
}

function handleOpenChange(open: boolean) {
	emit('update:open', open)
	if (!open) {
		searchQuery.value = ''
	}
}

function getArtistNames(track: Track): string {
	return track.artists.map((a) => a.name).join(', ')
}

function getTrackCover(track: Track): string | null {
	return records.getRecordById(track.record_id)?.cover ?? null
}

function getTrackKeyDisplay(track: Track): string | null {
	if (track.key === null || track.mode === null) return null
	return getCamelotString(track.key, track.mode)
}

function getTrackKeyColor(track: Track): string | null {
	if (track.key === null || track.mode === null) return null
	return getKeyColour(track.key, track.mode)
}
</script>

<template>
	<Dialog :open="open" @update:open="handleOpenChange">
		<DialogContent class="overflow-hidden sm:max-w-xl">
			<DialogHeader>
				<DialogTitle>Load Track to Deck {{ deckIndex + 1 }}</DialogTitle>
				<DialogDescription>
					Search and select a track to load.
				</DialogDescription>
			</DialogHeader>

			<div class="min-w-0 space-y-4 py-4">
				<!-- Search input -->
				<div class="relative w-full max-w-full">
					<Search
						class="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
					/>
					<Input
						v-model="searchQuery"
						placeholder="Search tracks..."
						class="w-full max-w-full pl-9"
					/>
				</div>

				<!-- Track list -->
				<ScrollArea class="h-[400px]">
					<div class="space-y-1 pr-2">
						<button
							v-for="track in filteredTracks"
							:key="track.id"
							class="hover:bg-accent flex w-full items-center gap-3 rounded-lg border p-2 text-left transition-colors"
							@click="handleTrackClick(track.id)"
						>
							<div
								class="bg-muted flex size-12 shrink-0 items-center justify-center overflow-hidden rounded bg-cover bg-center"
								:style="
									getTrackCover(track)
										? { backgroundImage: `url('${getTrackCover(track)}')` }
										: {}
								"
							>
								<ImageOff
									v-if="!getTrackCover(track)"
									class="text-muted-foreground size-4"
								/>
							</div>

							<div class="min-w-0 flex-1">
								<div class="truncate text-sm font-medium">
									{{ track.title }}
								</div>
								<div class="text-muted-foreground truncate text-xs">
									{{ getArtistNames(track) }}
								</div>
							</div>
							<div class="shrink-0 text-right text-xs">
								<div v-if="track.bpm" class="text-muted-foreground">
									{{ track.bpm.toFixed(1) }} BPM
								</div>
								<Badge
									v-if="getTrackKeyDisplay(track)"
									variant="outline"
									class="mt-1 min-w-9 justify-center px-1.5 font-medium"
									:style="{ color: getTrackKeyColor(track) ?? undefined }"
								>
									{{ getTrackKeyDisplay(track) }}
								</Badge>
							</div>
						</button>

						<div
							v-if="filteredTracks.length === 0"
							class="text-muted-foreground py-8 text-center text-sm"
						>
							No tracks found
						</div>
					</div>
				</ScrollArea>
			</div>
		</DialogContent>
	</Dialog>
</template>
