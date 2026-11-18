<script setup lang="ts">
import {
	AlertTriangle,
	ArrowLeft,
	ArrowRight,
	ListChecks,
	RefreshCw,
	Search,
	ShieldCheck,
	X
} from '@lucide/vue'
import type { TrackEnrichmentReviewSortKey } from '~/composables/useTrackEnrichmentReviewTable'
import type { ReviewFilter } from '~/composables/useTrackEnrichmentWorkflow'
import type { TrackEnrichmentRow } from '~/utils/trackEnrichment'
import type { TrackEnrichmentDraftResumeSummary } from '~/utils/trackEnrichmentDraftResume'
import type { KeyFormat } from '~~/shared/types/supabase'

const props = defineProps<{
	selectedFilter: ReviewFilter
	query: string
	density: 'compact' | 'comfortable'
	currentPage: number
	isReadOnly: boolean
	isDraftMissingConflict: boolean
	isDraftTakingOver: boolean
	isDraftTransitioning: boolean
	resumeSummary: TrackEnrichmentDraftResumeSummary | null
	requiresSourceReconnect: boolean
	sourceLabel: string
	rowCount: number
	matchedCount: number
	matchRate: string
	readyCount: number
	reviewCount: number
	unmatchedCount: number
	blockedCount: number
	errorCount: number
	filterOptions: { value: ReviewFilter; label: string; count: number }[]
	searchedCount: number
	stageableCount: number
	selectionState: boolean | 'indeterminate'
	pagedRows: TrackEnrichmentRow[]
	stagedRowIds: ReadonlySet<string>
	isApplying: boolean
	keyFormat: KeyFormat
	sortKey: TrackEnrichmentReviewSortKey | null
	sortDirection: 'asc' | 'desc'
	shownStart: number
	shownEnd: number
	sortedCount: number
	pageCount: number
	stagedCount: number
	stagedEvidenceCount: number
	stagedBpmCount: number
	stagedKeyModeCount: number
	stagedEvidenceOnlyCount: number
	draftSaveStatusLabel: string | null
	draftSavedAtAccessibleLabel: string | null
}>()

const emit = defineEmits<{
	'update:selectedFilter': [filter: ReviewFilter]
	'update:query': [query: string]
	'update:density': [density: 'compact' | 'comfortable']
	'update:currentPage': [page: number]
	'start-fresh': []
	'take-over': []
	'stage-visible': [staged: boolean]
	'stage-row': [row: TrackEnrichmentRow, staged: boolean]
	'clear-staged': []
	sort: [key: TrackEnrichmentReviewSortKey]
	'open-apply-review': []
}>()

// Writable computeds (not defineModel) so every write reaches the page's
// workflow refs immediately, exactly like the former inline v-model bindings.
const selectedFilter = computed({
	get: () => props.selectedFilter,
	set: (value) => emit('update:selectedFilter', value)
})
const reviewQuery = computed({
	get: () => props.query,
	set: (value) => emit('update:query', value)
})
const density = computed({
	get: () => props.density,
	set: (value) => emit('update:density', value)
})
const currentPage = computed({
	get: () => props.currentPage,
	set: (value) => emit('update:currentPage', value)
})
</script>

<template>
	<div
		data-testid="enrichment-review-workspace"
		class="flex flex-col md:min-h-0 md:flex-1"
	>
		<div
			v-if="isReadOnly"
			data-testid="enrichment-draft-read-only"
			class="border-border flex shrink-0 flex-wrap items-center justify-between gap-2 border-b bg-amber-500/10 px-3 py-2 text-xs"
		>
			<span>
				{{
					isDraftMissingConflict
						? 'This saved review was deleted in another tab. Start fresh to continue.'
						: 'Read-only: another tab owns this device-local review.'
				}}
			</span>
			<Button
				v-if="isDraftMissingConflict"
				variant="outline"
				size="sm"
				:disabled="isDraftTransitioning"
				@click="emit('start-fresh')"
			>
				Start fresh
			</Button>
			<Button
				v-else
				variant="outline"
				size="sm"
				:disabled="isDraftTakingOver || isDraftTransitioning"
				@click="emit('take-over')"
			>
				{{ isDraftTakingOver ? 'Taking over…' : 'Take over' }}
			</Button>
		</div>

		<div
			v-if="resumeSummary"
			data-testid="enrichment-resume-summary"
			class="border-border bg-muted/30 flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b px-3 py-2 text-xs"
		>
			<span class="font-medium">Rematched with the current library</span>
			<span class="text-muted-foreground">
				{{ resumeSummary.retained }} retained
			</span>
			<span class="text-muted-foreground">
				{{ resumeSummary.changed }} changed
			</span>
			<span class="text-muted-foreground">
				{{ resumeSummary.dropped }} dropped
			</span>
		</div>

		<div
			v-if="requiresSourceReconnect"
			data-testid="enrichment-reconnect-required"
			class="border-border shrink-0 border-b bg-sky-500/10 px-3 py-2 text-xs"
		>
			Saved audio evidence is available for review. Reconnect the folder to
			continue scanning or reanalysis; file access is not retained.
		</div>

		<div
			class="border-border bg-card/40 grid shrink-0 grid-cols-2 divide-x divide-y overflow-hidden border-b sm:grid-cols-6 sm:divide-y-0"
		>
			<div class="px-3 py-2">
				<div
					class="text-muted-foreground font-mono text-[9px] tracking-[0.08em] uppercase"
				>
					{{ sourceLabel }} tracks
				</div>
				<div class="mt-0.5 text-base font-semibold tabular-nums">
					{{ rowCount }}
				</div>
			</div>
			<div class="px-3 py-2">
				<div
					class="text-muted-foreground font-mono text-[9px] tracking-[0.08em] uppercase"
				>
					Matched
				</div>
				<div class="mt-0.5 flex items-baseline gap-1.5">
					<span class="text-base font-semibold tabular-nums">
						{{ matchedCount }}
					</span>
					<span class="text-muted-foreground font-mono text-[10px]">
						{{ matchRate }}
					</span>
				</div>
			</div>
			<div class="px-3 py-2">
				<div
					class="text-muted-foreground font-mono text-[9px] tracking-[0.08em] uppercase"
				>
					Ready
				</div>
				<div class="text-primary mt-0.5 text-base font-semibold tabular-nums">
					{{ readyCount }}
				</div>
			</div>
			<div class="px-3 py-2">
				<div
					class="text-muted-foreground font-mono text-[9px] tracking-[0.08em] uppercase"
				>
					Needs review
				</div>
				<div class="mt-0.5 text-base font-semibold tabular-nums">
					{{ reviewCount }}
				</div>
			</div>
			<div class="px-3 py-2">
				<div
					class="text-muted-foreground font-mono text-[9px] tracking-[0.08em] uppercase"
				>
					Staged
				</div>
				<div
					class="mt-0.5 text-base font-semibold text-emerald-700 tabular-nums dark:text-emerald-400"
				>
					{{ stagedCount }}
				</div>
			</div>
			<div class="px-3 py-2">
				<div
					class="text-muted-foreground font-mono text-[9px] tracking-[0.08em] uppercase"
				>
					Not in collection
				</div>
				<div class="mt-0.5 text-base font-semibold tabular-nums">
					{{ unmatchedCount }}
				</div>
			</div>
		</div>

		<div
			v-if="blockedCount || errorCount"
			class="border-border text-muted-foreground flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b px-3 py-1.5 text-xs"
		>
			<span v-if="blockedCount" class="flex items-center gap-1.5">
				<AlertTriangle class="size-3.5 text-amber-600" />
				{{ blockedCount }} competing matches blocked
			</span>
			<span v-if="errorCount" class="text-destructive">
				{{ errorCount }} errors
			</span>
		</div>

		<div
			class="border-border bg-muted/20 flex shrink-0 flex-col gap-1.5 border-b p-1.5 xl:flex-row xl:items-center xl:justify-between"
		>
			<div class="workbench-scrollbar overflow-x-auto">
				<ToggleGroup
					v-model="selectedFilter"
					type="single"
					variant="outline"
					class="w-max justify-start"
				>
					<ToggleGroupItem
						v-for="option in filterOptions"
						:key="option.value"
						:value="option.value"
						size="sm"
						class="h-7 gap-1.5 rounded-sm px-2 text-xs"
					>
						{{ option.label }}
						<span class="text-muted-foreground font-mono tabular-nums">
							{{ option.count }}
						</span>
					</ToggleGroupItem>
				</ToggleGroup>
			</div>

			<div class="flex min-w-0 flex-wrap items-center justify-end gap-1.5">
				<label
					class="border-border bg-background flex h-8 min-w-52 flex-1 items-center gap-2 rounded-sm border px-2 xl:w-72 xl:flex-none"
				>
					<Search class="text-muted-foreground size-3.5 shrink-0" />
					<input
						v-model="reviewQuery"
						type="search"
						class="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-xs outline-none"
						placeholder="Filter title, artist, release, ID..."
						aria-label="Filter enrichment matches"
					/>
					<span
						class="text-muted-foreground font-mono text-[10px] tabular-nums"
					>
						{{ searchedCount }}
					</span>
					<button
						v-if="reviewQuery"
						type="button"
						class="text-muted-foreground hover:text-foreground -mr-1 flex size-6 items-center justify-center rounded-sm"
						aria-label="Clear match filter"
						@click="reviewQuery = ''"
					>
						<X class="size-3.5" />
					</button>
				</label>

				<ControlLibraryDensity v-model="density" class="hidden md:flex" />

				<Button
					v-if="selectedFilter !== 'unmatched'"
					variant="ghost"
					size="sm"
					class="h-8 px-2 text-xs"
					:disabled="stageableCount === 0 || selectionState === true"
					@click="emit('stage-visible', true)"
				>
					<ListChecks class="mr-1.5 size-3.5" />
					Stage eligible ({{ stageableCount }})
				</Button>
				<Button
					variant="ghost"
					size="sm"
					class="h-8 px-2 text-xs"
					:disabled="stagedCount === 0"
					@click="emit('clear-staged')"
				>
					<X class="mr-1.5 size-3.5" />
					Clear staged
				</Button>
			</div>
		</div>

		<div
			v-if="searchedCount === 0"
			class="border-border flex min-h-40 flex-1 items-center justify-center border-b border-dashed"
		>
			<div class="flex flex-col items-center gap-2 text-center">
				<RefreshCw class="size-4" />
				<div class="text-muted-foreground text-sm">
					{{
						reviewQuery ? 'No matches for this filter' : 'No rows in this view'
					}}
				</div>
				<Button
					v-if="reviewQuery"
					variant="outline"
					size="sm"
					@click="reviewQuery = ''"
				>
					Clear filter
				</Button>
			</div>
		</div>

		<template v-else>
			<TableTrackEnrichmentUnmatched
				v-if="selectedFilter === 'unmatched'"
				class="shrink-0 md:min-h-0 md:flex-1 md:shrink md:rounded-none md:border-x-0"
				:rows="pagedRows"
				:key-format="keyFormat"
				:source-label="sourceLabel"
				:density="density"
				:sort-key="sortKey"
				:sort-direction="sortDirection"
				@sort="emit('sort', $event)"
			/>

			<TableTrackEnrichmentReview
				v-else
				class="shrink-0 md:min-h-0 md:flex-1 md:shrink md:rounded-none md:border-x-0"
				:rows="pagedRows"
				:staged-row-ids="stagedRowIds"
				:filtered-selection-state="selectionState"
				:stageable-row-count="stageableCount"
				:is-applying="isApplying"
				:key-format="keyFormat"
				:source-label="sourceLabel"
				:density="density"
				:sort-key="sortKey"
				:sort-direction="sortDirection"
				@sort="emit('sort', $event)"
				@stage-all="emit('stage-visible', $event)"
				@stage-row="(row, staged) => emit('stage-row', row, staged)"
			/>

			<div
				class="border-border flex shrink-0 items-center justify-between gap-3 border-t px-3 py-1.5 text-xs"
			>
				<div class="text-muted-foreground font-mono tabular-nums">
					{{ shownStart }}-{{ shownEnd }} of
					{{ sortedCount }}
				</div>
				<div class="flex items-center gap-2">
					<Button
						variant="outline"
						size="sm"
						:disabled="currentPage === 1"
						@click="currentPage--"
					>
						<ArrowLeft class="size-4" />
						<span class="sr-only">Previous page</span>
					</Button>
					<span class="text-muted-foreground font-mono tabular-nums">
						{{ currentPage }} / {{ pageCount }}
					</span>
					<Button
						variant="outline"
						size="sm"
						:disabled="currentPage === pageCount"
						@click="currentPage++"
					>
						<ArrowRight class="size-4" />
						<span class="sr-only">Next page</span>
					</Button>
				</div>
			</div>
		</template>

		<div
			class="border-border bg-background/95 sticky bottom-0 z-10 flex shrink-0 flex-col gap-2 border-t-2 border-t-emerald-500 px-3 py-2.5 backdrop-blur sm:flex-row sm:items-center sm:justify-between md:static"
		>
			<div class="flex min-w-0 items-center gap-3">
				<div
					class="flex size-9 shrink-0 items-center justify-center rounded-md bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
				>
					<ListChecks class="size-4" />
				</div>
				<div class="min-w-0">
					<div class="text-sm font-semibold">
						{{ stagedCount }} tracks staged
					</div>
					<div class="text-muted-foreground text-xs">
						Evidence saved for {{ stagedEvidenceCount }} ·
						{{ stagedBpmCount }} BPM and {{ stagedKeyModeCount }} key values
						filled
						<template v-if="stagedEvidenceOnlyCount">
							· {{ stagedEvidenceOnlyCount }} Evidence only
						</template>
					</div>
					<div
						v-if="draftSaveStatusLabel"
						class="text-muted-foreground mt-0.5 font-mono text-[10px]"
						role="status"
						aria-live="polite"
						:title="draftSavedAtAccessibleLabel ?? undefined"
					>
						{{ draftSaveStatusLabel }}
					</div>
				</div>
			</div>
			<Button
				:disabled="stagedCount === 0 || isApplying || isReadOnly"
				@click="emit('open-apply-review')"
			>
				<ShieldCheck class="mr-2 size-4" />
				Review staged changes ({{ stagedCount }})
			</Button>
		</div>
	</div>
</template>
