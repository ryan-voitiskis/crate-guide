<script setup lang="ts">
import { Disc, Loader2, Search, Wand } from 'lucide-vue-next'

const records = useRecordsStore()
const beatport = useBeatportStore()
const tracks = useTracksStore()
const trackFilters = useTrackFiltersStore()

const isActive = usePageActive()

const selectedTrackId = ref<string | null>(null)
const beatportImportDialog = ref()

function showBeatportImportDialog() {
	beatportImportDialog.value.showDialog = true
}

function openTrackDetails(trackId: string) {
	selectedTrackId.value = trackId
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

async function fetchBeatportForTrack(track: Track, event: Event) {
	event.stopPropagation()
	await beatport.getBeatportData(track.id)
}

function getBeatportStatus(track: Track): 'none' | 'found' | 'not-found' {
	if (!track.beatport_data) return 'none'
	if (beatport.hasFoundData(track.beatport_data)) return 'found'
	if (beatport.hasBeenSearched(track.beatport_data)) return 'not-found'
	return 'none'
}
</script>

<template>
	<div class="flex h-full flex-col">
		<DialogTrackDetails
			:track-id="selectedTrackId"
			@close="selectedTrackId = null"
		/>
		<DialogBeatportImport ref="beatportImportDialog" />

		<Teleport to="#header-left" defer>
			<template v-if="isActive">
				<div class="relative max-w-md flex-1">
					<Search
						class="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
					/>
					<Input
						v-model="trackFilters.searchQuery"
						name="search"
						placeholder="Search"
						class="bg-background pr-3 pl-10"
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
			</template>
		</Teleport>

		<div class="scrollbar-hidden flex-1 overflow-y-auto">
			<div class="mx-auto max-w-[1600px] space-y-4 p-2">
				<StateLoading
					v-if="records.isLoadingRecords || tracks.isLoadingTracks"
					message="Loading tracks..."
				/>

				<div v-else-if="tracks.hasTracks" class="flex flex-col gap-4">
					<div class="flex items-center justify-between">
						<div class="text-muted-foreground text-sm">
							{{ trackFilters.filteredTracks.length }} of
							{{ tracks.tracksCount }} tracks
							<span v-if="trackFilters.hasActiveFilters">(filtered)</span>
						</div>
					</div>

					<div class="flex flex-col gap-2">
						<Card
							v-for="track in trackFilters.filteredTracks"
							:key="track.id"
							class="hover:bg-popover cursor-pointer overflow-hidden p-0 transition-all"
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
											<button
												class="hover:bg-accent mr-2 flex size-8 items-center justify-center rounded-md transition-colors"
												:disabled="beatport.loadingTrackId === track.id"
												@click="fetchBeatportForTrack(track, $event)"
												:title="
													getBeatportStatus(track) === 'found'
														? 'Beatport data found - click to refresh'
														: getBeatportStatus(track) === 'not-found'
															? 'Not found on Beatport - click to retry'
															: 'Search Beatport for BPM and key'
												"
											>
												<Loader2
													v-if="beatport.loadingTrackId === track.id"
													class="text-muted-foreground size-4 animate-spin"
												/>
												<Wand
													v-else
													class="size-4"
													:class="{
														'text-muted-foreground/50':
															getBeatportStatus(track) === 'none',
														'text-green-600 dark:text-green-400':
															getBeatportStatus(track) === 'found',
														'text-amber-600 dark:text-amber-400':
															getBeatportStatus(track) === 'not-found'
													}"
												/>
											</button>
										</div>
									</div>
								</div>
							</CardContent>
						</Card>
					</div>

					<div
						v-if="!trackFilters.filteredTracks.length"
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
						<Button
							v-if="trackFilters.searchQuery"
							@click="trackFilters.clearSearchQuery()"
							variant="outline"
						>
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
		</div>
	</div>
</template>
