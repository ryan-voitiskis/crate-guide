<script setup lang="ts">
import { ArrowLeft, Search } from 'lucide-vue-next'

const props = defineProps<{
	open: boolean
	deckIndex: number
}>()

const emit = defineEmits<{
	'update:open': [value: boolean]
}>()

const ALL_RECORDS_SCOPE = '__all-records__'
const BROWSE_LIMIT = 100
const SEARCH_LIMIT = 50

const session = useWorkbenchSessionStore()
const tracks = useWorkbenchTracksStore()
const records = useWorkbenchRecordsStore()
const crates = useWorkbenchCratesStore()

const searchQuery = ref('')
const focusedRecordId = ref<string | null>(null)
const expandedRecordIds = ref(new Set<string>())
const resultsContentRef = ref<HTMLElement | null>(null)

const selectedCrate = computed(() =>
	session.loadTrackCrateId
		? crates.crates.find((crate) => crate.id === session.loadTrackCrateId)
		: undefined
)

const selectedCrateValue = computed({
	get: () => session.loadTrackCrateId ?? ALL_RECORDS_SCOPE,
	set: (value: string) => {
		session.loadTrackCrateId = value === ALL_RECORDS_SCOPE ? null : value
		focusedRecordId.value = null
		expandedRecordIds.value = new Set()
	}
})

const scopeRecordOrder = computed(() => selectedCrate.value?.records)

const allResults = computed(() =>
	buildLoadTrackRecordResults({
		records: records.records,
		tracks: tracks.tracks,
		query: searchQuery.value,
		recordOrder: scopeRecordOrder.value
	})
)

const browseResults = computed(() => allResults.value.slice(0, BROWSE_LIMIT))
const searchResults = computed(() => allResults.value.slice(0, SEARCH_LIMIT))

const focusedResult = computed(() =>
	focusedRecordId.value
		? allResults.value.find(
				(result) => result.record.id === focusedRecordId.value
			)
		: undefined
)

const hasQuery = computed(() => searchQuery.value.trim().length > 0)
const browseIsTruncated = computed(
	() => !hasQuery.value && allResults.value.length > BROWSE_LIMIT
)
const searchIsTruncated = computed(
	() => hasQuery.value && allResults.value.length > SEARCH_LIMIT
)

const playedTrackIds = computed(
	() => new Set(session.currentSession.map((entry) => entry.track_id))
)

const loadedDeckByTrackId = computed(() => {
	const loaded: Record<string, number> = {}
	session.decks.forEach((deck, index) => {
		if (deck.loadedTrack) loaded[deck.loadedTrack.id] = index + 1
	})
	return loaded
})

const resultSignature = computed(() =>
	searchResults.value
		.map((result) =>
			[
				result.record.id,
				result.matchedTrackIds.join(','),
				result.previewTracks.map((track) => track.id).join(',')
			].join(':')
		)
		.join('|')
)

watch(
	() => crates.crates.map((crate) => crate.id),
	() => {
		if (
			session.loadTrackCrateId &&
			!crates.crates.some((crate) => crate.id === session.loadTrackCrateId)
		) {
			session.loadTrackCrateId = null
			focusedRecordId.value = null
			expandedRecordIds.value = new Set()
		}
	},
	{ immediate: true }
)

watch(searchQuery, () => {
	focusedRecordId.value = null
	expandedRecordIds.value = new Set()
})

watch(
	[() => props.open, () => searchQuery.value, resultSignature],
	async ([open]) => {
		if (!open || !hasQuery.value) return
		await nextTick()
		resultsContentRef.value
			?.querySelector<HTMLElement>('[data-track-match="true"]')
			?.scrollIntoView({ block: 'nearest' })
	}
)

watch(
	() => props.open,
	async (open) => {
		if (!open) return
		await nextTick()
		getDialogElement()
			?.querySelector<HTMLInputElement>('[data-testid="load-track-search"]')
			?.focus()
	}
)

function getDialogElement(): HTMLElement | null {
	return (
		(resultsContentRef.value?.closest(
			'[data-testid="load-track-dialog"]'
		) as HTMLElement | null) ?? null
	)
}

function resetTransientState() {
	searchQuery.value = ''
	focusedRecordId.value = null
	expandedRecordIds.value = new Set()
}

function handleTrackClick(trackId: string) {
	session.loadTrack(trackId, props.deckIndex, false)
	emit('update:open', false)
	resetTransientState()
}

function handleOpenChange(open: boolean) {
	emit('update:open', open)
	if (!open) resetTransientState()
}

function focusFirstTrack() {
	resultsContentRef.value
		?.querySelector<HTMLButtonElement>('[data-testid="load-track-option"]')
		?.focus()
}

function toggleExpanded(recordId: string) {
	const expanded = new Set(expandedRecordIds.value)
	if (expanded.has(recordId)) expanded.delete(recordId)
	else expanded.add(recordId)
	expandedRecordIds.value = expanded
}
</script>

<template>
	<Dialog :open="open" @update:open="handleOpenChange">
		<DialogContent
			class="max-h-[88dvh] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden rounded-sm p-0 sm:max-w-4xl"
		>
			<div data-testid="load-track-dialog" class="contents">
				<div class="space-y-3 px-4 pt-4 pr-11 pb-3 sm:px-5 sm:pt-5 sm:pr-12">
					<div
						class="text-muted-foreground font-mono text-[9px] tracking-[0.18em] uppercase"
					>
						Deck {{ String(deckIndex + 1).padStart(2, '0') }} / Source browser
					</div>
					<DialogHeader>
						<DialogTitle class="text-base tracking-tight">
							Load a physical track
						</DialogTitle>
						<DialogDescription>
							Find a physical record, then choose the track you are loading.
						</DialogDescription>
					</DialogHeader>

					<div class="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
						<div class="relative min-w-0 flex-1">
							<Search
								class="text-muted-foreground pointer-events-none absolute top-1/2 left-3 z-10 size-4 -translate-y-1/2"
							/>
							<Input
								v-model="searchQuery"
								data-testid="load-track-search"
								placeholder="Search records, tracks, artists, labels or cat. no."
								class="w-full rounded-sm pl-9"
								@keydown.down.prevent="focusFirstTrack"
							/>
						</div>

						<Select v-if="crates.crates.length" v-model="selectedCrateValue">
							<SelectTrigger class="w-full sm:w-64">
								<SelectValue placeholder="All records" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem :value="ALL_RECORDS_SCOPE">All records</SelectItem>
								<SelectItem
									v-for="crate in crates.crates"
									:key="crate.id"
									:value="crate.id"
								>
									{{ crate.name }} ({{ crate.records.length }})
								</SelectItem>
							</SelectContent>
						</Select>
					</div>
				</div>

				<ScrollArea
					data-testid="load-track-results"
					class="bg-workbench-inset min-h-0 border-t"
				>
					<div ref="resultsContentRef" class="p-3 sm:p-4">
						<template v-if="hasQuery">
							<div
								v-if="allResults.length"
								class="text-muted-foreground mb-2 font-mono text-[10px] tracking-wide uppercase"
							>
								{{ allResults.length }}
								{{ allResults.length === 1 ? 'record' : 'records' }} found
							</div>
							<div v-if="searchResults.length" class="space-y-3">
								<CardRecordLoadTrack
									v-for="result in searchResults"
									:key="result.record.id"
									:result="result"
									:expanded="expandedRecordIds.has(result.record.id)"
									:loaded-deck-by-track-id="loadedDeckByTrackId"
									:played-track-ids="playedTrackIds"
									@select-track="handleTrackClick"
									@toggle-expanded="toggleExpanded(result.record.id)"
								/>
							</div>
							<p
								v-if="searchIsTruncated"
								class="text-muted-foreground pt-4 text-center text-xs"
							>
								Showing the first {{ SEARCH_LIMIT }} records. Refine your search
								to see more.
							</p>
							<div
								v-if="!allResults.length"
								class="text-muted-foreground py-12 text-center text-sm"
							>
								No records match “{{ searchQuery.trim() }}”.
							</div>
						</template>

						<template v-else-if="focusedRecordId">
							<Button
								variant="ghost"
								size="sm"
								class="mb-3 -ml-2"
								@click="focusedRecordId = null"
							>
								<ArrowLeft class="size-4" />
								Back to records
							</Button>
							<CardRecordLoadTrack
								v-if="focusedResult"
								:result="focusedResult"
								expanded
								:show-expansion-control="false"
								:loaded-deck-by-track-id="loadedDeckByTrackId"
								:played-track-ids="playedTrackIds"
								@select-track="handleTrackClick"
							/>
							<div
								v-else
								class="text-muted-foreground py-12 text-center text-sm"
							>
								This record is no longer available in the selected scope.
							</div>
						</template>

						<template v-else>
							<div
								v-if="browseResults.length"
								class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
							>
								<CardRecordBrowse
									v-for="result in browseResults"
									:key="result.record.id"
									:record="result.record"
									@select="focusedRecordId = result.record.id"
								/>
							</div>
							<p
								v-if="browseIsTruncated"
								class="text-muted-foreground pt-4 text-center text-xs"
							>
								Showing the first {{ BROWSE_LIMIT }} records. Search or choose a
								crate to narrow the list.
							</p>
							<div
								v-if="!allResults.length"
								class="text-muted-foreground py-12 text-center text-sm"
							>
								{{
									selectedCrate
										? 'There are no playable records in this crate.'
										: 'There are no playable records in your collection.'
								}}
							</div>
						</template>
					</div>
				</ScrollArea>
			</div>
		</DialogContent>
	</Dialog>
</template>
