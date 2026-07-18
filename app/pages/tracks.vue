<script setup lang="ts">
import {
	Disc3,
	Gauge,
	KeyRound,
	Search,
	ShieldAlert,
	WandSparkles
} from 'lucide-vue-next'

type TrackSortKey =
	| 'position'
	| 'title'
	| 'artist'
	| 'release'
	| 'duration'
	| 'bpm'
	| 'key'
	| 'genre'
type SortDirection = 'asc' | 'desc'
type Density = 'compact' | 'comfortable'

const records = useWorkbenchRecordsStore()
const tracks = useWorkbenchTracksStore()
const trackFilters = useWorkbenchTrackFiltersStore()
const user = useWorkbenchUserStore()
const capabilities = useWorkbenchCapabilities()
const { getHref } = useNavigation()

const isActive = usePageActive()
const isMobile = useMediaQuery('(max-width: 1279px)')

const selectedTrackId = ref<string | null>(null)
const editingTrackId = ref<string | null>(null)
const mobileInspectorOpen = ref(false)
const density = useState<Density>('workbench-density', () => 'compact')
const sortKey = ref<TrackSortKey>('artist')
const sortDirection = ref<SortDirection>('asc')

watchEffect(() => trackFilters.setTrackSource(tracks.tracks))

const selectedTrack = computed(() =>
	selectedTrackId.value ? tracks.getTrackById(selectedTrackId.value) : null
)

const selectedRecord = computed(() =>
	selectedTrack.value
		? (records.getRecordById(selectedTrack.value.record_id) ?? null)
		: null
)

const missingBpmCount = computed(
	() => tracks.tracks.filter((track) => track.bpm === null).length
)
const missingKeyCount = computed(
	() =>
		tracks.tracks.filter((track) => track.key === null || track.mode === null)
			.length
)
const missingAnalysisCount = computed(
	() =>
		tracks.tracks.filter(
			(track) => track.bpm === null || track.key === null || track.mode === null
		).length
)

function getRecordForTrack(track: Track) {
	return records.getRecordById(track.record_id)
}

function formatArtists(track: Track) {
	return [...track.artists, ...track.extraartists]
		.map((artist) => artist.name)
		.join(', ')
}

function formatKey(track: Track): string {
	if (track.key === null || track.mode === null) return '—'
	return getFormattedKeyString(
		track.key,
		track.mode,
		user.currentKeyFormat,
		'short'
	)
}

function keyStyle(track: Track) {
	if (track.key === null || track.mode === null) return {}
	return { color: getKeyColour(track.key, track.mode) }
}

const sortedTracks = computed(() => {
	const collator = new Intl.Collator(undefined, {
		numeric: true,
		sensitivity: 'base'
	})
	const direction = sortDirection.value === 'asc' ? 1 : -1

	return [...trackFilters.filteredTracks].sort((a, b) => {
		const aRecord = getRecordForTrack(a)
		const bRecord = getRecordForTrack(b)
		let aValue: string | number = ''
		let bValue: string | number = ''

		switch (sortKey.value) {
			case 'position':
				aValue = a.position || ''
				bValue = b.position || ''
				break
			case 'title':
				aValue = a.title
				bValue = b.title
				break
			case 'artist':
				aValue = a.artists[0]?.name || ''
				bValue = b.artists[0]?.name || ''
				break
			case 'release':
				aValue = aRecord?.title || ''
				bValue = bRecord?.title || ''
				break
			case 'duration':
				aValue = a.duration || 0
				bValue = b.duration || 0
				break
			case 'bpm':
				aValue = a.bpm || 0
				bValue = b.bpm || 0
				break
			case 'key':
				aValue = a.key === null ? -1 : a.key
				bValue = b.key === null ? -1 : b.key
				break
			case 'genre':
				aValue = a.genres[0] || ''
				bValue = b.genres[0] || ''
				break
		}

		return collator.compare(String(aValue), String(bValue)) * direction
	})
})

function setSort(key: TrackSortKey) {
	if (sortKey.value === key)
		sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc'
	else {
		sortKey.value = key
		sortDirection.value = 'asc'
	}
}

function selectTrack(trackId: string) {
	selectedTrackId.value = trackId
	if (isMobile.value) mobileInspectorOpen.value = true
}

function editTrack(trackId: string) {
	if (!capabilities.canMutateLibrary) return
	editingTrackId.value = trackId
	mobileInspectorOpen.value = false
}

watch(
	() => trackFilters.filteredTracks,
	(filtered) => {
		if (
			selectedTrackId.value &&
			!filtered.some((track) => track.id === selectedTrackId.value)
		)
			selectedTrackId.value = null
	}
)
</script>

<template>
	<div class="flex h-full min-h-0 flex-col">
		<DialogTrackDetails
			v-if="capabilities.canMutateLibrary"
			:track-id="editingTrackId"
			@close="editingTrackId = null"
		/>

		<Teleport to="#header-left" defer>
			<template v-if="isActive && tracks.hasTracks">
				<div class="relative max-w-md flex-1">
					<Search
						class="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
					/>
					<Input
						v-model="trackFilters.searchQuery"
						name="search"
						placeholder="Search tracks, artists or genres"
						class="bg-background pr-3 pl-10"
					/>
				</div>
				<DialogTrackFilters />
			</template>
		</Teleport>

		<StateLoading
			v-if="records.isLoadingRecords || tracks.isLoadingTracks"
			message="Loading tracks..."
		/>

		<StateEmptyCollection
			v-else-if="!records.hasRecords"
			icon="tracks"
			title="Add records to build your track list"
			description="Tracks appear automatically from imported or manually added records."
		/>

		<div v-else-if="tracks.hasTracks" class="flex min-h-0 flex-1">
			<section class="flex min-w-0 flex-1 flex-col">
				<div
					v-if="missingAnalysisCount > 0"
					class="border-border bg-muted/25 flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-3 py-2"
				>
					<div class="flex min-w-0 items-center gap-2.5">
						<div
							class="bg-primary/10 text-primary flex size-7 shrink-0 items-center justify-center rounded-sm"
						>
							<WandSparkles class="size-3.5" />
						</div>
						<div class="min-w-0">
							<p class="text-xs font-semibold">Analysis data incomplete</p>
							<p class="text-muted-foreground hidden text-[11px] sm:block">
								Enrich missing tempo and key data from your Rekordbox library.
							</p>
						</div>
					</div>
					<div class="flex items-center gap-1.5">
						<Badge
							variant="outline"
							class="h-6 gap-1 rounded-sm font-mono text-[9px]"
							:aria-label="
								'BPM available for ' +
								(tracks.tracksCount - missingBpmCount) +
								' of ' +
								tracks.tracksCount +
								' tracks'
							"
						>
							<Gauge class="size-3" />
							BPM {{ tracks.tracksCount - missingBpmCount }}/{{
								tracks.tracksCount
							}}
						</Badge>
						<Badge
							variant="outline"
							class="h-6 gap-1 rounded-sm font-mono text-[9px]"
							:aria-label="
								'Key available for ' +
								(tracks.tracksCount - missingKeyCount) +
								' of ' +
								tracks.tracksCount +
								' tracks'
							"
						>
							<KeyRound class="size-3" />
							KEY {{ tracks.tracksCount - missingKeyCount }}/{{
								tracks.tracksCount
							}}
						</Badge>
						<Button
							size="sm"
							class="h-7 text-xs"
							@click="navigateTo(getHref('/enrichment'))"
						>
							Enrich
						</Button>
					</div>
				</div>

				<div
					class="border-border flex min-h-11 shrink-0 flex-wrap items-center justify-between gap-2 border-b px-3 py-1.5"
				>
					<div class="flex items-center gap-3 text-sm">
						<span class="text-muted-foreground">
							{{ trackFilters.filteredTracks.length }} of
							{{ tracks.tracksCount }} tracks
							<span v-if="trackFilters.hasActiveFilters">(filtered)</span>
						</span>
						<span class="text-border hidden sm:inline">/</span>
						<span
							class="text-muted-foreground hidden font-mono text-[10px] tracking-wide uppercase sm:inline"
						>
							Sorted by {{ sortKey }}
						</span>
					</div>
					<ControlLibraryDensity v-model="density" />
				</div>

				<div
					v-if="sortedTracks.length"
					class="workbench-scrollbar min-h-0 flex-1 overflow-auto"
				>
					<div
						class="border-border bg-muted/70 sticky top-0 z-10 hidden min-w-270 grid-cols-[36px_42px_64px_minmax(170px,1.2fr)_minmax(140px,0.9fr)_minmax(140px,0.85fr)_66px_64px_58px_minmax(110px,0.7fr)_30px] items-center gap-2 border-b px-2 backdrop-blur-md md:grid"
						:class="density === 'compact' ? 'h-8' : 'h-10'"
					>
						<span class="text-muted-foreground font-mono text-[9px]">ST</span>
						<span class="text-muted-foreground font-mono text-[9px]">ART</span>
						<ButtonLibrarySort
							label="Pos"
							:active="sortKey === 'position'"
							:direction="sortDirection"
							@click="setSort('position')"
						/>
						<ButtonLibrarySort
							label="Title"
							:active="sortKey === 'title'"
							:direction="sortDirection"
							@click="setSort('title')"
						/>
						<ButtonLibrarySort
							label="Artist"
							:active="sortKey === 'artist'"
							:direction="sortDirection"
							@click="setSort('artist')"
						/>
						<ButtonLibrarySort
							label="Release"
							:active="sortKey === 'release'"
							:direction="sortDirection"
							@click="setSort('release')"
						/>
						<ButtonLibrarySort
							label="Time"
							align="right"
							:active="sortKey === 'duration'"
							:direction="sortDirection"
							@click="setSort('duration')"
						/>
						<ButtonLibrarySort
							label="BPM"
							align="right"
							:active="sortKey === 'bpm'"
							:direction="sortDirection"
							@click="setSort('bpm')"
						/>
						<ButtonLibrarySort
							label="Key"
							align="center"
							:active="sortKey === 'key'"
							:direction="sortDirection"
							@click="setSort('key')"
						/>
						<ButtonLibrarySort
							label="Genre"
							:active="sortKey === 'genre'"
							:direction="sortDirection"
							@click="setSort('genre')"
						/>
						<span />
					</div>

					<div class="hidden min-w-270 md:block">
						<div
							v-for="track in sortedTracks"
							:key="track.id"
							role="button"
							tabindex="0"
							class="border-border hover:bg-accent/50 focus-visible:ring-ring grid w-full grid-cols-[36px_42px_64px_minmax(170px,1.2fr)_minmax(140px,0.9fr)_minmax(140px,0.85fr)_66px_64px_58px_minmax(110px,0.7fr)_30px] items-center gap-2 border-b px-2 text-left text-xs transition-colors focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset"
							:class="[
								density === 'compact' ? 'h-10' : 'h-14',
								selectedTrackId === track.id && 'bg-accent'
							]"
							@click="selectTrack(track.id)"
							@dblclick="editTrack(track.id)"
							@keydown.enter="selectTrack(track.id)"
						>
							<div class="flex items-center justify-center">
								<span
									class="size-1.5 rounded-full"
									:class="track.playable ? 'bg-emerald-500' : 'bg-destructive'"
									title="Playable status"
								/>
							</div>
							<div class="bg-muted size-7 rounded-sm border">
								<ImageRecordCover
									v-if="getRecordForTrack(track)"
									:record="getRecordForTrack(track)!"
									class="size-full rounded-sm"
								/>
								<Disc3
									v-if="!getRecordForTrack(track)"
									class="text-muted-foreground m-auto mt-1 size-4"
								/>
							</div>
							<span class="font-mono text-[10px]">
								{{ track.position || '—' }}
							</span>
							<span class="truncate font-semibold">{{ track.title }}</span>
							<span class="text-muted-foreground truncate">
								{{ formatArtists(track) || 'Unknown artist' }}
							</span>
							<span class="text-muted-foreground truncate">
								{{ getRecordForTrack(track)?.title || 'Unknown release' }}
							</span>
							<span class="text-right font-mono tabular-nums">
								{{ msToMMSS(track.duration) || '—' }}
							</span>
							<span class="text-right font-mono font-semibold tabular-nums">
								{{ track.bpm ? track.bpm.toFixed(1) : '—' }}
							</span>
							<span
								class="text-center font-mono font-semibold"
								:style="keyStyle(track)"
							>
								{{ formatKey(track) }}
							</span>
							<span class="text-muted-foreground truncate">
								{{ track.genres.join(' · ') || '—' }}
							</span>
							<ShieldAlert
								v-if="!track.playable"
								class="text-destructive size-3.5"
							/>
						</div>
					</div>

					<div class="divide-border divide-y md:hidden">
						<button
							v-for="track in sortedTracks"
							:key="track.id"
							type="button"
							class="hover:bg-accent/50 flex w-full items-center gap-3 px-3 py-2.5 text-left"
							@click="selectTrack(track.id)"
						>
							<div class="bg-muted size-10 shrink-0 rounded-sm border">
								<ImageRecordCover
									v-if="getRecordForTrack(track)"
									:record="getRecordForTrack(track)!"
									class="size-full rounded-sm"
								/>
								<Disc3
									v-if="!getRecordForTrack(track)"
									class="text-muted-foreground m-auto mt-2 size-5"
								/>
							</div>
							<div class="min-w-0 flex-1">
								<div class="flex items-baseline gap-2">
									<p class="truncate text-sm font-medium">{{ track.title }}</p>
									<span
										class="text-muted-foreground shrink-0 font-mono text-[10px]"
									>
										{{ track.position || '—' }}
									</span>
								</div>
								<p class="text-muted-foreground truncate text-xs">
									{{ formatArtists(track) || 'Unknown artist' }}
								</p>
								<div class="mt-1 flex items-center gap-2 font-mono text-[10px]">
									<span>{{ track.bpm ? track.bpm.toFixed(1) : '—' }} BPM</span>
									<span :style="keyStyle(track)">{{ formatKey(track) }}</span>
									<span class="text-muted-foreground">
										{{ msToMMSS(track.duration) || '—' }}
									</span>
								</div>
							</div>
							<span
								class="size-1.5 shrink-0 rounded-full"
								:class="track.playable ? 'bg-emerald-500' : 'bg-destructive'"
							/>
						</button>
					</div>
				</div>

				<div
					v-else
					class="flex min-h-0 flex-1 flex-col items-center justify-center p-8 text-center"
				>
					<Search class="text-muted-foreground/40 mb-3 size-9 stroke-1" />
					<h3 class="text-sm font-semibold">No tracks match this view</h3>
					<p class="text-muted-foreground mt-1 max-w-sm text-xs">
						Adjust your search, tempo, key or genre filters to widen the result
						set.
					</p>
					<Button
						v-if="trackFilters.hasActiveFilters"
						variant="outline"
						size="sm"
						class="mt-4"
						@click="trackFilters.resetAllFilters"
					>
						Clear filters
					</Button>
				</div>
			</section>

			<aside
				class="border-border bg-background/70 hidden w-75 shrink-0 border-l xl:block"
			>
				<InspectorTrack
					v-if="selectedTrack"
					:track="selectedTrack"
					:record="selectedRecord"
					show-close
					:read-only="!capabilities.canMutateLibrary"
					@close="selectedTrackId = null"
					@edit="editTrack(selectedTrack.id)"
				/>
				<div
					v-else
					class="flex h-full flex-col items-center justify-center px-8 text-center"
				>
					<Disc3 class="text-muted-foreground/40 mb-3 size-9 stroke-1" />
					<p
						class="font-mono text-[10px] font-semibold tracking-wider uppercase"
					>
						No track selected
					</p>
					<p class="text-muted-foreground mt-2 text-xs">
						Select a track to inspect tempo, key, condition and release context.
					</p>
				</div>
			</aside>
		</div>

		<div
			v-else
			class="flex flex-1 flex-col items-center justify-center p-8 text-center"
		>
			<Disc3 class="text-muted-foreground/40 mb-3 size-9 stroke-1" />
			<h3 class="text-sm font-semibold">No tracks yet</h3>
			<p class="text-muted-foreground mt-1 text-xs">
				Add tracks to your records to build the library view.
			</p>
		</div>

		<Sheet v-model:open="mobileInspectorOpen">
			<SheetContent side="right" class="w-[min(92vw,360px)] p-0 sm:max-w-90">
				<SheetHeader class="sr-only">
					<SheetTitle>Track inspector</SheetTitle>
					<SheetDescription>
						Selected track details and edit action.
					</SheetDescription>
				</SheetHeader>
				<InspectorTrack
					v-if="selectedTrack"
					:track="selectedTrack"
					:record="selectedRecord"
					:read-only="!capabilities.canMutateLibrary"
					@edit="editTrack(selectedTrack.id)"
				/>
			</SheetContent>
		</Sheet>
	</div>
</template>
