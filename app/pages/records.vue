<script setup lang="ts">
import {
	CloudDownload,
	Disc3,
	Grid2X2,
	KeyRound,
	List,
	MoreHorizontal,
	Plus
} from 'lucide-vue-next'

type RecordSortKey = 'artist' | 'title' | 'label' | 'catno' | 'year' | 'tracks'
type SortDirection = 'asc' | 'desc'
type Density = 'compact' | 'comfortable'
type ViewMode = 'table' | 'covers'

const discogs = useDiscogsStore()
const discogsAuth = useDiscogsAuthStore()
const manualEntry = useManualRecordEntryStore()
const records = useRecordsStore()
const tracks = useTracksStore()
const crates = useCratesStore()
const recordDetails = useRecordDetailsStore()

const isActive = usePageActive()
const isMobile = useMediaQuery('(max-width: 1279px)')

const selectedRecordId = ref<string | null>(null)
const mobileInspectorOpen = ref(false)
const viewMode = ref<ViewMode>('table')
const density = useState<Density>('workbench-density', () => 'compact')
const sortKey = ref<RecordSortKey>('artist')
const sortDirection = ref<SortDirection>('asc')

const discogsImportLabel = computed(() =>
	discogsAuth.isOAuthed ? 'Import' : 'Connect Discogs'
)

const trackCounts = computed(() => {
	const counts = new Map<string, number>()
	for (const track of tracks.tracks)
		counts.set(track.record_id, (counts.get(track.record_id) || 0) + 1)
	return counts
})

const selectedRecord = computed(() =>
	selectedRecordId.value ? records.getRecordById(selectedRecordId.value) : null
)

const sortedRecords = computed(() => {
	const collator = new Intl.Collator(undefined, {
		numeric: true,
		sensitivity: 'base'
	})
	const direction = sortDirection.value === 'asc' ? 1 : -1

	return [...records.displayedRecords].sort((a, b) => {
		let aValue: string | number = ''
		let bValue: string | number = ''

		switch (sortKey.value) {
			case 'artist':
				aValue = a.artists[0]?.name || ''
				bValue = b.artists[0]?.name || ''
				break
			case 'title':
				aValue = a.title
				bValue = b.title
				break
			case 'label':
				aValue = a.labels[0]?.name || ''
				bValue = b.labels[0]?.name || ''
				break
			case 'catno':
				aValue = a.labels[0]?.catno || ''
				bValue = b.labels[0]?.catno || ''
				break
			case 'year':
				aValue = a.year || 0
				bValue = b.year || 0
				break
			case 'tracks':
				aValue = trackCounts.value.get(a.id) || 0
				bValue = trackCounts.value.get(b.id) || 0
				break
		}

		return collator.compare(String(aValue), String(bValue)) * direction
	})
})

function handleDiscogsImport() {
	if (discogsAuth.isOAuthed) {
		discogs.showGetFoldersDialog = true
		return
	}

	discogsAuth.initDiscogsOAuthFlow()
}

function setSort(key: RecordSortKey) {
	if (sortKey.value === key)
		sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc'
	else {
		sortKey.value = key
		sortDirection.value = 'asc'
	}
}

function selectRecord(recordId: string) {
	selectedRecordId.value = recordId
	if (isMobile.value) mobileInspectorOpen.value = true
}

function artistNames(record: DatabaseRecord) {
	return record.artists.map((artist) => artist.name).join(', ')
}

function openRecordMenu(record: DatabaseRecord) {
	recordDetails.openRecord(record.id)
}

watch(
	() => records.displayedRecords,
	(displayed) => {
		if (
			selectedRecordId.value &&
			!displayed.some((record) => record.id === selectedRecordId.value)
		)
			selectedRecordId.value = null
	}
)
</script>

<template>
	<div class="flex h-full min-h-0 flex-col">
		<DialogAddToCrate />
		<AlertConfirmRemoveRecord />

		<Teleport to="#header-left" defer>
			<template v-if="isActive && records.hasRecords">
				<InputRecordsSearch />
				<ButtonLoading
					variant="secondary"
					:loading="discogsAuth.isDiscogsConnecting"
					@click="handleDiscogsImport"
				>
					<CloudDownload v-if="discogsAuth.isOAuthed" class="mr-2" />
					<KeyRound v-else class="mr-2" />
					{{ discogsImportLabel }}
				</ButtonLoading>
				<Button variant="outline" @click="manualEntry.openDialog">
					<Plus class="mr-2" />
					Add manually
				</Button>
			</template>
		</Teleport>

		<StateLoading
			v-if="
				records.isLoadingRecords ||
				tracks.isLoadingTracks ||
				crates.isLoadingCrates
			"
			message="Loading collection..."
		/>

		<div v-else-if="records.hasRecords" class="flex min-h-0 flex-1">
			<section class="flex min-w-0 flex-1 flex-col">
				<div
					class="border-border flex min-h-11 shrink-0 flex-wrap items-center justify-between gap-2 border-b px-3 py-1.5"
				>
					<div class="flex items-center gap-3">
						<DetailResultsCount />
						<span class="text-border hidden sm:inline">/</span>
						<span
							class="text-muted-foreground hidden font-mono text-[10px] tracking-wide uppercase sm:inline"
						>
							Sorted by {{ sortKey }}
						</span>
					</div>
					<div class="flex items-center gap-2">
						<ControlLibraryDensity
							v-if="viewMode === 'table'"
							v-model="density"
						/>
						<div
							class="border-border bg-background inline-flex items-center rounded-md border p-0.5"
						>
							<Button
								variant="ghost"
								size="icon"
								class="size-7 rounded-sm"
								:class="viewMode === 'table' && 'bg-muted text-foreground'"
								:aria-pressed="viewMode === 'table'"
								title="Table view"
								@click="viewMode = 'table'"
							>
								<List class="size-3.5" />
								<span class="sr-only">Table view</span>
							</Button>
							<Button
								variant="ghost"
								size="icon"
								class="size-7 rounded-sm"
								:class="viewMode === 'covers' && 'bg-muted text-foreground'"
								:aria-pressed="viewMode === 'covers'"
								title="Cover view"
								@click="viewMode = 'covers'"
							>
								<Grid2X2 class="size-3.5" />
								<span class="sr-only">Cover view</span>
							</Button>
						</div>
					</div>
				</div>

				<div v-if="viewMode === 'table'" class="min-h-0 flex-1 overflow-auto">
					<div
						class="border-border bg-muted/70 sticky top-0 z-10 hidden min-w-[920px] grid-cols-[48px_minmax(140px,0.9fr)_minmax(190px,1.25fr)_minmax(130px,0.8fr)_110px_64px_58px_36px] items-center gap-3 border-b px-2 backdrop-blur-md md:grid"
						:class="density === 'compact' ? 'h-8' : 'h-10'"
					>
						<span class="text-muted-foreground font-mono text-[9px]">ART</span>
						<ButtonLibrarySort
							label="Artist"
							:active="sortKey === 'artist'"
							:direction="sortDirection"
							@click="setSort('artist')"
						/>
						<ButtonLibrarySort
							label="Title"
							:active="sortKey === 'title'"
							:direction="sortDirection"
							@click="setSort('title')"
						/>
						<ButtonLibrarySort
							label="Label"
							:active="sortKey === 'label'"
							:direction="sortDirection"
							@click="setSort('label')"
						/>
						<ButtonLibrarySort
							label="Catalogue"
							:active="sortKey === 'catno'"
							:direction="sortDirection"
							@click="setSort('catno')"
						/>
						<ButtonLibrarySort
							label="Year"
							align="right"
							:active="sortKey === 'year'"
							:direction="sortDirection"
							@click="setSort('year')"
						/>
						<ButtonLibrarySort
							label="Trks"
							align="right"
							:active="sortKey === 'tracks'"
							:direction="sortDirection"
							@click="setSort('tracks')"
						/>
						<span />
					</div>

					<div class="hidden min-w-[920px] md:block">
						<div
							v-for="record in sortedRecords"
							:key="record.id"
							role="button"
							tabindex="0"
							class="border-border hover:bg-accent/50 focus-visible:ring-ring grid w-full grid-cols-[48px_minmax(140px,0.9fr)_minmax(190px,1.25fr)_minmax(130px,0.8fr)_110px_64px_58px_36px] items-center gap-3 border-b px-2 text-left text-xs transition-colors focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset"
							:class="[
								density === 'compact' ? 'h-11' : 'h-14',
								selectedRecordId === record.id && 'bg-accent'
							]"
							@click="selectRecord(record.id)"
							@dblclick="recordDetails.openRecord(record.id)"
							@keydown.enter="selectRecord(record.id)"
						>
							<div class="bg-muted size-8 overflow-hidden rounded-sm border">
								<img
									v-if="record.cover"
									:src="record.cover"
									:alt="`${record.title} cover`"
									class="h-full w-full object-cover"
								/>
								<Disc3
									v-else
									class="text-muted-foreground m-auto mt-1.5 size-4.5"
								/>
							</div>
							<span class="truncate font-medium">
								{{ artistNames(record) || 'Unknown artist' }}
							</span>
							<span class="truncate font-medium">{{ record.title }}</span>
							<span class="text-muted-foreground truncate">
								{{ record.labels[0]?.name || '—' }}
							</span>
							<span class="truncate font-mono text-[11px]">
								{{ record.labels[0]?.catno || '—' }}
							</span>
							<span class="text-right font-mono tabular-nums">
								{{ record.year || '—' }}
							</span>
							<span class="text-right font-mono tabular-nums">
								{{ trackCounts.get(record.id) || 0 }}
							</span>
							<Button
								variant="ghost"
								size="icon"
								class="size-7"
								aria-label="Open record details"
								@click.stop="openRecordMenu(record)"
							>
								<MoreHorizontal class="size-3.5" />
							</Button>
						</div>
					</div>

					<div class="divide-border divide-y md:hidden">
						<button
							v-for="record in sortedRecords"
							:key="record.id"
							type="button"
							class="hover:bg-accent/50 flex w-full items-center gap-3 px-3 py-2.5 text-left"
							@click="selectRecord(record.id)"
						>
							<div
								class="bg-muted size-11 shrink-0 overflow-hidden rounded-sm border"
							>
								<img
									v-if="record.cover"
									:src="record.cover"
									:alt="`${record.title} cover`"
									class="h-full w-full object-cover"
								/>
								<Disc3
									v-else
									class="text-muted-foreground m-auto mt-2.5 size-5"
								/>
							</div>
							<div class="min-w-0 flex-1">
								<p class="truncate text-sm font-medium">{{ record.title }}</p>
								<p class="text-muted-foreground truncate text-xs">
									{{ artistNames(record) || 'Unknown artist' }}
								</p>
								<p
									class="text-muted-foreground mt-0.5 truncate font-mono text-[10px]"
								>
									{{ record.labels[0]?.catno || 'NO CAT' }} ·
									{{ record.year || 'YEAR —' }} ·
									{{ trackCounts.get(record.id) || 0 }} TRKS
								</p>
							</div>
						</button>
					</div>
				</div>

				<div
					v-else
					class="scrollbar-hidden grid min-h-0 flex-1 grid-cols-2 gap-x-2 gap-y-4 overflow-y-auto p-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6"
				>
					<CardRecordShort
						v-for="record in sortedRecords"
						:key="record.id"
						:record="record"
						:selected="selectedRecordId === record.id"
						@select="selectRecord(record.id)"
					/>
				</div>

				<StateNoSearchResults
					v-if="records.hasSearchQuery && !records.hasSearchResults"
				/>
			</section>

			<aside
				class="border-border bg-background/70 hidden w-[300px] shrink-0 border-l xl:block"
			>
				<InspectorRecord
					v-if="selectedRecord"
					:record="selectedRecord"
					:track-count="trackCounts.get(selectedRecord.id) || 0"
					show-close
					@close="selectedRecordId = null"
				/>
				<div
					v-else
					class="flex h-full flex-col items-center justify-center px-8 text-center"
				>
					<Disc3 class="text-muted-foreground/40 mb-3 size-9 stroke-1" />
					<p
						class="font-mono text-[10px] font-semibold tracking-wider uppercase"
					>
						No record selected
					</p>
					<p class="text-muted-foreground mt-2 text-xs">
						Select a row to inspect its catalogue data and collection actions.
					</p>
				</div>
			</aside>
		</div>

		<StateEmptyCollection
			v-else
			icon="records"
			title="Start your record library"
			description="Import your Discogs collection in one pass, or add records manually."
		/>

		<Sheet v-model:open="mobileInspectorOpen">
			<SheetContent
				side="right"
				class="w-[min(92vw,360px)] p-0 sm:max-w-[360px]"
			>
				<SheetHeader class="sr-only">
					<SheetTitle>Record inspector</SheetTitle>
					<SheetDescription>
						Selected record details and actions.
					</SheetDescription>
				</SheetHeader>
				<InspectorRecord
					v-if="selectedRecord"
					:record="selectedRecord"
					:track-count="trackCounts.get(selectedRecord.id) || 0"
				/>
			</SheetContent>
		</Sheet>
	</div>
</template>
