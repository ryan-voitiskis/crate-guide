<script setup lang="ts">
import { Disc, Search, Wand } from 'lucide-vue-next'

const user = useUserStore()
const records = useRecordsStore()
const tracks = useTracksStore()
const trackFilters = useTrackFiltersStore()

const trackDetails = ref<{
	selectedTrackId: string | null
}>({
	selectedTrackId: null
})

const searchQuery = ref('')

const beatportImportDialog = ref()

function showBeatportImportDialog() {
	beatportImportDialog.value.showDialog = true
}

// TODO: Move all of this to a store
const filteredTracks = computed(() => {
	let result = tracks.tracks

	// Search filter
	if (searchQuery.value.trim()) {
		const query = searchQuery.value.toLowerCase()
		result = result.filter(
			(track) =>
				track.title.toLowerCase().includes(query) ||
				track.artists.some((artist) =>
					artist.name.toLowerCase().includes(query)
				) ||
				track.extraartists.some((artist) =>
					artist.name.toLowerCase().includes(query)
				) ||
				track.genres.some((genre) => genre.toLowerCase().includes(query)) ||
				(track.position && track.position.toLowerCase().includes(query))
		)
	}

	// Playable filter
	if (trackFilters.showOnlyPlayable) {
		result = result.filter((track) => track.playable)
	}

	// BPM range filter
	if (trackFilters.bpmMin !== null || trackFilters.bpmMax !== null) {
		result = result.filter((track) => {
			if (!track.bpm) return false
			if (trackFilters.bpmMin !== null && track.bpm < trackFilters.bpmMin)
				return false
			if (trackFilters.bpmMax !== null && track.bpm > trackFilters.bpmMax)
				return false
			return true
		})
	}

	// Key filter
	if (trackFilters.selectedKey !== null) {
		result = result.filter((track) => track.key === trackFilters.selectedKey)
	}

	// Genre filter
	if (trackFilters.selectedGenres.length > 0) {
		result = result.filter((track) =>
			track.genres.some((genre) =>
				trackFilters.selectedGenres.includes(genre.toLowerCase())
			)
		)
	}

	return result
})

const hasFilters = computed(
	() =>
		trackFilters.showOnlyPlayable ||
		trackFilters.bpmMin !== null ||
		trackFilters.bpmMax !== null ||
		trackFilters.selectedKey !== null ||
		trackFilters.selectedGenres.length > 0
)

function openTrackDetails(trackId: string) {
	trackDetails.value.selectedTrackId = trackId
}

function getRecordForTrack(trackId: string) {
	const track = tracks.getTrackById(trackId)
	if (!track) return null
	return records.getRecordById(track.record_id)
}

function formatArtists(
	artists: DiscogsArtistDb[],
	extraartists: DiscogsArtistDb[]
) {
	const artistNames = artists.map((a) => a.name)
	const hasExtraArtists = extraartists.length > 0

	if (hasExtraArtists) {
		const extraNames = extraartists.map((a) =>
			a.role ? `${a.name} (${a.role})` : a.name
		)
		return [...artistNames, ...extraNames].join(', ')
	}

	return artistNames.join(', ')
}

function formatKey(track: Track): string {
	if (track.key === null || track.mode === null) return '–'
	return getKeyStringShort(track.key, track.mode)
}
</script>

<template>
	<DialogTrackDetails
		:track-id="trackDetails.selectedTrackId"
		@close="trackDetails.selectedTrackId = null"
	/>

	<DialogBeatportImport ref="beatportImportDialog" />

	<div class="flex h-full flex-col space-y-4 p-2">
		<div
			v-if="records.isLoadingRecords || tracks.isLoadingTracks"
			class="flex items-center justify-center py-8"
		>
			<div class="flex items-center gap-2">
				<div
					class="border-primary h-6 w-6 animate-spin rounded-full border-2 border-t-transparent"
				/>
				<span>Loading tracks...</span>
			</div>
		</div>

		<div v-else-if="tracks.hasTracks" class="flex flex-col gap-4">
			<div class="flex items-start gap-2">
				<div class="relative max-w-md flex-1">
					<Search
						class="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
					/>
					<Input
						v-model="searchQuery"
						name="search"
						placeholder="Search"
						class="pr-3 pl-10"
					/>
				</div>
				<DialogTrackFilters />
				<Button
					@click="showBeatportImportDialog"
					variant="outline"
					size="default"
				>
					<Wand class="mr-2 size-4" />
					Get Beatport data
				</Button>
			</div>

			<div class="flex items-center justify-between">
				<div class="text-muted-foreground text-sm">
					{{ filteredTracks.length }} of {{ tracks.tracksCount }} tracks
					<span v-if="searchQuery || hasFilters">(filtered)</span>
				</div>
			</div>

			<div class="flex flex-col gap-2">
				<Card
					v-for="track in filteredTracks"
					:key="track.id"
					class="hover:bg-muted/50 cursor-pointer overflow-hidden p-0 transition-all"
					@click="openTrackDetails(track.id)"
				>
					<CardContent class="p-0">
						<div class="flex items-center gap-3">
							<div
								class="bg-muted relative size-14 shrink-0 overflow-hidden rounded bg-cover bg-center bg-no-repeat"
								:style="{
									backgroundImage: getRecordForTrack(track.id)?.cover
										? `url('${getRecordForTrack(track.id)!.cover}')`
										: 'none'
								}"
							>
								<div
									v-if="!getRecordForTrack(track.id)?.cover"
									class="flex h-full items-center justify-center"
								>
									<Disc class="text-muted-foreground size-6" />
								</div>
							</div>

							<div class="flex min-w-0 flex-1 items-center gap-6">
								<div class="min-w-0 flex-1">
									<div class="flex items-baseline gap-2">
										<h3 class="truncate text-sm font-medium">
											{{ track.title }}
										</h3>
										<span
											v-if="track.position"
											class="text-muted-foreground shrink-0 font-mono text-xs"
										>
											{{ track.position }}
										</span>
									</div>
									<div class="text-muted-foreground truncate text-xs">
										{{ formatArtists(track.artists, track.extraartists) }}
									</div>
									<div
										v-if="track.genres.length > 0"
										class="text-muted-foreground mt-0.5 truncate text-xs"
									>
										{{ track.genres.join(', ') }}
									</div>
								</div>

								<div
									class="text-muted-foreground flex shrink-0 items-center gap-4 text-sm"
								>
									<span
										v-if="getRecordForTrack(track.id)?.labels?.[0]?.catno"
										class="hidden text-xs font-medium sm:block"
									>
										{{ getRecordForTrack(track.id)!.labels[0]!.catno }}
									</span>
									<span class="w-10 text-center font-mono text-xs">
										{{ msToMMSS(track.duration) || '–' }}
									</span>
									<span class="w-10 text-center text-xs">
										{{ track.bpm ? Math.round(track.bpm) : '–' }}
									</span>
									<span
										class="w-10 text-center text-xs font-medium"
										:style="{
											color:
												track.key !== null && track.mode !== null
													? getKeyColour(track.key, track.mode)
													: undefined
										}"
									>
										{{ formatKey(track) }}
									</span>
									<span
										v-if="!track.playable"
										class="text-destructive-foreground bg-destructive/10 rounded px-1.5 py-0.5 text-xs"
									>
										Unplayable
									</span>
								</div>
							</div>
						</div>
					</CardContent>
				</Card>
			</div>

			<div
				v-if="!filteredTracks.length"
				class="flex flex-col items-center justify-center py-16 text-center"
			>
				<div class="bg-muted mb-4 rounded-full p-6">
					<div class="text-muted-foreground text-4xl">🔍</div>
				</div>
				<h3 class="text-lg font-semibold">No tracks found</h3>
				<p class="text-muted-foreground mb-4 max-w-md">
					No tracks match your current filters. Try adjusting your search or
					filters.
				</p>
				<Button v-if="searchQuery" @click="searchQuery = ''" variant="outline">
					Clear Search
				</Button>
			</div>
		</div>

		<div
			v-else
			class="mx-auto flex max-w-sm flex-col items-center justify-center py-16 text-center"
		>
			<h3 class="mb-2 text-lg font-semibold">No tracks yet</h3>
			<p class="text-muted-foreground max-w-sm">
				Import some records to see your tracks here.
			</p>
		</div>
	</div>
</template>
