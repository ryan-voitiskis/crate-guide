<script setup lang="ts">
import {
	TRACK_EVIDENCE_AGREEMENT_POLICY_VERSION,
	type TrackEvidenceAgreementStatus
} from '~/utils/trackEvidenceAgreement'
import {
	DEFAULT_TRACK_EVIDENCE_LENS_FILTERS,
	type TrackEvidenceLensApplicationState,
	type TrackEvidenceLensFilters,
	type TrackEvidenceLensPresence,
	type TrackEvidenceLensRow,
	type TrackEvidenceLensVersion,
	countTrackEvidenceLensRows,
	filterTrackEvidenceLensRows,
	hasTrackEvidenceLensFilters
} from '~/utils/trackEvidenceLens'
import type { TrackEvidenceSourceKey } from '~~/shared/types/audioFeatures'
import type { LibraryKeyFormat, LibraryRecord } from '~~/shared/types/library'

type Density = 'compact' | 'comfortable'

const props = defineProps<{
	rows: readonly TrackEvidenceLensRow[]
	records: readonly LibraryRecord[]
	density: Density
	compact: boolean
	selectedTrackId: string | null
	keyFormat: LibraryKeyFormat
}>()

const emit = defineEmits<{
	select: [trackId: string]
}>()

const headingId = useId()
const filters = reactive<TrackEvidenceLensFilters>({
	...DEFAULT_TRACK_EVIDENCE_LENS_FILTERS
})

const SOURCE_OPTIONS = [
	{ value: 'rekordboxXml', label: 'Rekordbox', shortLabel: 'XML' },
	{ value: 'embeddedTags', label: 'Tags', shortLabel: 'Tags' },
	{ value: 'essentiaBrowser', label: 'Essentia', shortLabel: 'Essentia' }
] as const satisfies readonly {
	value: TrackEvidenceSourceKey
	label: string
	shortLabel: string
}[]

const counts = computed(() => countTrackEvidenceLensRows(props.rows))
const filteredRows = computed(() =>
	filterTrackEvidenceLensRows(props.rows, filters)
)
const hasActiveFilters = computed(() => hasTrackEvidenceLensFilters(filters))
const recordTitles = computed(
	() => new Map(props.records.map((record) => [record.id, record.title]))
)
const itemSize = computed(() => {
	if (props.compact) return 132
	return props.density === 'compact' ? 64 : 80
})
const headerSize = computed(() => (props.compact ? 0 : 36))

function getRowKey(row: TrackEvidenceLensRow): string {
	return row.id
}

function recordTitle(row: TrackEvidenceLensRow): string {
	return recordTitles.value.get(row.recordId) ?? 'Unknown release'
}

function togglePresence(value: TrackEvidenceLensPresence) {
	filters.presence = filters.presence === value ? 'all' : value
}

function toggleSource(value: TrackEvidenceSourceKey) {
	filters.source = filters.source === value ? 'all' : value
}

function toggleComparison(value: TrackEvidenceAgreementStatus) {
	filters.comparison = filters.comparison === value ? 'all' : value
}

function toggleChanged() {
	filters.application =
		filters.application === 'changed-since-application'
			? 'all'
			: 'changed-since-application'
}

function toggleVersion(value: TrackEvidenceLensVersion) {
	filters.version = filters.version === value ? 'all' : value
}

function clearFilters() {
	Object.assign(filters, DEFAULT_TRACK_EVIDENCE_LENS_FILTERS)
}

function filterClasses(active: boolean): string {
	return active
		? 'border-primary bg-primary/10 text-foreground'
		: 'border-border bg-background text-muted-foreground hover:bg-muted/60 hover:text-foreground'
}

function presenceLabel(presence: TrackEvidenceLensPresence): string {
	if (presence === 'retained') return 'Evidence retained'
	if (presence === 'none') return 'No Evidence'
	return 'Evidence unavailable'
}

function presenceClasses(presence: TrackEvidenceLensPresence): string {
	if (presence === 'retained') {
		return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
	}
	if (presence === 'unavailable') {
		return 'border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-300'
	}
	return 'border-border bg-muted/40 text-muted-foreground'
}

function comparisonLabel(status: TrackEvidenceAgreementStatus): string {
	if (status === 'agreement') return 'Agreement'
	if (status === 'conflict') return 'Conflict'
	return 'Insufficient evidence'
}

function comparisonClasses(status: TrackEvidenceAgreementStatus): string {
	if (status === 'agreement') {
		return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
	}
	if (status === 'conflict') {
		return 'border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-300'
	}
	return 'border-border bg-muted/40 text-muted-foreground'
}

function applicationLabel(state: TrackEvidenceLensApplicationState): string {
	if (state === 'applied') return 'Applied'
	if (state === 'changed-since-application') {
		return 'Changed since application'
	}
	if (state === 'source-missing') return 'Source missing'
	if (state === 'unattributed') return 'Unattributed'
	return 'No attribution'
}

function applicationClasses(state: TrackEvidenceLensApplicationState): string {
	if (state === 'applied') return 'text-emerald-700 dark:text-emerald-300'
	if (state === 'changed-since-application') {
		return 'text-amber-800 dark:text-amber-300'
	}
	if (state === 'source-missing') {
		return 'text-orange-800 dark:text-orange-300'
	}
	return 'text-muted-foreground'
}

function versionLabel(version: TrackEvidenceLensVersion | null): string {
	if (version === 'current-v2') return 'Current v2'
	if (version === 'legacy-v1') return 'Legacy v1'
	return '—'
}

function formatBpm(value: number | null): string {
	if (value === null || !Number.isFinite(value)) return 'Not set'
	return `${value.toFixed(1)} BPM`
}

function formatKey(row: TrackEvidenceLensRow): string {
	const { key, mode } = row.current
	if (
		key === null ||
		mode === null ||
		!Number.isInteger(key) ||
		key < 0 ||
		key > 11 ||
		(mode !== 0 && mode !== 1)
	) {
		return '—'
	}
	return getFormattedKeyString(key, mode, props.keyFormat, 'short')
}

function rowAriaLabel(row: TrackEvidenceLensRow): string {
	const parts = [row.title, presenceLabel(row.evidence.presence)]
	if (row.evidence.presence === 'retained') {
		parts.push(
			`${row.evidence.retainedSourceCount} of 3 sources retained`,
			`overall ${comparisonLabel(row.evidence.comparison.overall!)}`,
			`BPM ${comparisonLabel(row.evidence.comparison.bpm!)}`,
			`key ${comparisonLabel(row.evidence.comparison.keyMode!)}`,
			`BPM application ${applicationLabel(row.evidence.application.bpm)}`,
			`key application ${applicationLabel(row.evidence.application.keyMode)}`,
			versionLabel(row.evidence.version)
		)
	}
	return parts.join('; ')
}
</script>

<template>
	<section class="flex min-h-0 flex-1 flex-col" :aria-labelledby="headingId">
		<header class="border-border bg-muted/10 shrink-0 border-b px-3 py-2.5">
			<div class="flex flex-wrap items-start justify-between gap-2">
				<div>
					<h2 :id="headingId" class="text-xs font-semibold">Evidence lens</h2>
					<p class="text-muted-foreground mt-0.5 text-[10px] leading-relaxed">
						Aggregate Agreement requires both BPM and key Agreement. Any field
						Conflict makes the row Conflict; other retained combinations are
						Insufficient evidence. Policy
						<span class="font-mono">
							{{ TRACK_EVIDENCE_AGREEMENT_POLICY_VERSION }}
						</span>
						.
					</p>
				</div>
				<div class="flex items-center gap-2">
					<p
						class="text-muted-foreground font-mono text-[10px]"
						aria-live="polite"
					>
						{{ filteredRows.length }} of {{ counts.total }} tracks
					</p>
					<button
						v-if="hasActiveFilters"
						type="button"
						class="border-border hover:bg-muted rounded-sm border px-2 py-1 text-[10px] font-medium"
						@click="clearFilters"
					>
						Clear Evidence filters
					</button>
				</div>
			</div>

			<div class="mt-2 flex flex-wrap gap-x-3 gap-y-2 text-[10px]">
				<div
					class="flex flex-wrap items-center gap-1"
					role="group"
					aria-label="Evidence presence filters"
				>
					<span class="text-muted-foreground mr-0.5 font-semibold">
						Evidence
					</span>
					<button
						type="button"
						class="rounded-sm border px-1.5 py-1 transition-colors"
						:class="filterClasses(filters.presence === 'retained')"
						:aria-pressed="filters.presence === 'retained'"
						:aria-label="`Retained Evidence: ${counts.retained} tracks`"
						@click="togglePresence('retained')"
					>
						Retained {{ counts.retained }}
					</button>
					<button
						type="button"
						class="rounded-sm border px-1.5 py-1 transition-colors"
						:class="filterClasses(filters.presence === 'none')"
						:aria-pressed="filters.presence === 'none'"
						:aria-label="`No retained Evidence: ${counts.none} tracks`"
						@click="togglePresence('none')"
					>
						None {{ counts.none }}
					</button>
					<button
						type="button"
						class="rounded-sm border px-1.5 py-1 transition-colors"
						:class="filterClasses(filters.presence === 'unavailable')"
						:aria-pressed="filters.presence === 'unavailable'"
						:aria-label="`Unavailable Evidence: ${counts.unavailable} tracks`"
						@click="togglePresence('unavailable')"
					>
						Unavailable {{ counts.unavailable }}
					</button>
				</div>

				<div
					class="flex flex-wrap items-center gap-1"
					role="group"
					aria-label="Evidence source coverage filters"
				>
					<span class="text-muted-foreground mr-0.5 font-semibold">
						Sources
					</span>
					<button
						v-for="option in SOURCE_OPTIONS"
						:key="option.value"
						type="button"
						class="rounded-sm border px-1.5 py-1 transition-colors"
						:class="filterClasses(filters.source === option.value)"
						:aria-pressed="filters.source === option.value"
						:aria-label="`${option.label} Evidence retained: ${counts.sources[option.value]} tracks`"
						@click="toggleSource(option.value)"
					>
						{{ option.label }} {{ counts.sources[option.value] }}
					</button>
				</div>

				<div
					class="flex flex-wrap items-center gap-1"
					role="group"
					aria-label="Evidence comparison filters"
				>
					<span class="text-muted-foreground mr-0.5 font-semibold">
						Comparison
					</span>
					<button
						type="button"
						class="rounded-sm border px-1.5 py-1 transition-colors"
						:class="filterClasses(filters.comparison === 'agreement')"
						:aria-pressed="filters.comparison === 'agreement'"
						:aria-label="`Agreement: ${counts.comparison.agreement} tracks`"
						@click="toggleComparison('agreement')"
					>
						Agreement {{ counts.comparison.agreement }}
					</button>
					<button
						type="button"
						class="rounded-sm border px-1.5 py-1 transition-colors"
						:class="filterClasses(filters.comparison === 'conflict')"
						:aria-pressed="filters.comparison === 'conflict'"
						:aria-label="`Conflict: ${counts.comparison.conflict} tracks`"
						@click="toggleComparison('conflict')"
					>
						Conflict {{ counts.comparison.conflict }}
					</button>
					<button
						type="button"
						class="rounded-sm border px-1.5 py-1 transition-colors"
						:class="
							filterClasses(filters.comparison === 'insufficient-evidence')
						"
						:aria-pressed="filters.comparison === 'insufficient-evidence'"
						:aria-label="`Insufficient evidence: ${counts.comparison['insufficient-evidence']} tracks`"
						@click="toggleComparison('insufficient-evidence')"
					>
						Insufficient {{ counts.comparison['insufficient-evidence'] }}
					</button>
				</div>

				<div
					class="flex flex-wrap items-center gap-1"
					role="group"
					aria-label="Evidence application filters"
				>
					<span class="text-muted-foreground mr-0.5 font-semibold">
						Application
					</span>
					<button
						type="button"
						class="rounded-sm border px-1.5 py-1 transition-colors"
						:class="
							filterClasses(filters.application === 'changed-since-application')
						"
						:aria-pressed="filters.application === 'changed-since-application'"
						:aria-label="`Changed since application: ${counts.changedSinceApplication} tracks`"
						@click="toggleChanged"
					>
						Changed {{ counts.changedSinceApplication }}
					</button>
				</div>

				<div
					class="flex flex-wrap items-center gap-1"
					role="group"
					aria-label="Evidence version filters"
				>
					<span class="text-muted-foreground mr-0.5 font-semibold">
						Version
					</span>
					<button
						type="button"
						class="rounded-sm border px-1.5 py-1 transition-colors"
						:class="filterClasses(filters.version === 'current-v2')"
						:aria-pressed="filters.version === 'current-v2'"
						:aria-label="`Current v2 Evidence: ${counts.versions['current-v2']} tracks`"
						@click="toggleVersion('current-v2')"
					>
						Current v2 {{ counts.versions['current-v2'] }}
					</button>
					<button
						type="button"
						class="rounded-sm border px-1.5 py-1 transition-colors"
						:class="filterClasses(filters.version === 'legacy-v1')"
						:aria-pressed="filters.version === 'legacy-v1'"
						:aria-label="`Legacy v1 Evidence: ${counts.versions['legacy-v1']} tracks`"
						@click="toggleVersion('legacy-v1')"
					>
						Legacy v1 {{ counts.versions['legacy-v1'] }}
					</button>
				</div>
			</div>
		</header>

		<!-- @vue-generic {TrackEvidenceLensRow} -->
		<ListWorkbenchVirtual
			v-if="filteredRows.length"
			:items="filteredRows"
			:get-item-key="getRowKey"
			:item-size="itemSize"
			:header-size="headerSize"
			:selected-key="selectedTrackId"
			label="Track Evidence collection"
			item-label="Evidence rows"
			data-testid="evidence-track-rows"
			class="workbench-scrollbar min-h-0 flex-1"
		>
			<template #header>
				<div
					v-if="!compact"
					class="border-border bg-muted/70 sticky top-0 z-10 grid h-9 min-w-300 grid-cols-[minmax(190px,1.2fr)_minmax(140px,0.8fr)_110px_210px_230px_220px_100px] items-center gap-2 border-b px-3 font-mono text-[9px] tracking-wide uppercase backdrop-blur-md"
				>
					<span>Track</span>
					<span>Release</span>
					<span>Current</span>
					<span>Source coverage</span>
					<span>Comparison</span>
					<span>Application</span>
					<span>Evidence</span>
				</div>
			</template>

			<template #default="{ item: row }">
				<button
					v-if="!compact"
					type="button"
					:data-evidence-track-id="row.id"
					:data-evidence-presence="row.evidence.presence"
					:aria-label="rowAriaLabel(row)"
					class="border-border hover:bg-accent/50 focus-visible:ring-ring grid h-full min-w-300 grid-cols-[minmax(190px,1.2fr)_minmax(140px,0.8fr)_110px_210px_230px_220px_100px] items-center gap-2 border-b px-3 text-left text-[10px] transition-colors focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset"
					:class="selectedTrackId === row.id && 'bg-accent'"
					data-virtual-focus-target
					@click="emit('select', row.id)"
				>
					<div class="min-w-0">
						<p class="truncate text-xs font-semibold">{{ row.title }}</p>
						<p class="text-muted-foreground truncate">
							{{ row.artistLabel || 'Unknown artist' }}
						</p>
					</div>
					<span class="text-muted-foreground truncate">
						{{ recordTitle(row) }}
					</span>
					<div class="font-mono tabular-nums">
						<p>{{ formatBpm(row.current.bpm) }}</p>
						<p class="text-muted-foreground">{{ formatKey(row) }}</p>
					</div>
					<div class="flex flex-wrap items-center gap-1">
						<span
							v-for="source in SOURCE_OPTIONS"
							:key="source.value"
							class="rounded-sm border px-1 py-0.5 font-medium"
							:class="
								row.evidence.sources[source.value]
									? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
									: 'border-border bg-muted/30 text-muted-foreground'
							"
							:aria-label="`${source.label}: ${row.evidence.sources[source.value] ? 'retained' : 'not retained'}`"
						>
							{{ source.shortLabel }}
							{{ row.evidence.sources[source.value] ? 'yes' : 'no' }}
						</span>
					</div>
					<div v-if="row.evidence.comparison.overall" class="min-w-0">
						<span
							class="inline-flex rounded-sm border px-1.5 py-0.5 font-semibold"
							:class="comparisonClasses(row.evidence.comparison.overall)"
						>
							Overall {{ comparisonLabel(row.evidence.comparison.overall) }}
						</span>
						<p class="mt-1 truncate">
							BPM {{ comparisonLabel(row.evidence.comparison.bpm!) }} · Key
							{{ comparisonLabel(row.evidence.comparison.keyMode!) }}
						</p>
					</div>
					<p v-else class="text-muted-foreground">Comparison unavailable</p>
					<div
						v-if="row.evidence.presence === 'retained'"
						class="min-w-0 space-y-0.5"
					>
						<p :class="applicationClasses(row.evidence.application.bpm)">
							BPM {{ applicationLabel(row.evidence.application.bpm) }}
						</p>
						<p :class="applicationClasses(row.evidence.application.keyMode)">
							Key {{ applicationLabel(row.evidence.application.keyMode) }}
						</p>
					</div>
					<p v-else class="text-muted-foreground">
						No derived application state
					</p>
					<div class="min-w-0">
						<span
							class="inline-flex rounded-sm border px-1.5 py-0.5 font-semibold"
							:class="presenceClasses(row.evidence.presence)"
						>
							{{ presenceLabel(row.evidence.presence) }}
						</span>
						<p class="text-muted-foreground mt-1 font-mono">
							{{ versionLabel(row.evidence.version) }}
						</p>
					</div>
				</button>

				<button
					v-else
					type="button"
					:data-evidence-track-id="row.id"
					:data-evidence-presence="row.evidence.presence"
					:aria-label="rowAriaLabel(row)"
					class="border-border hover:bg-accent/50 focus-visible:ring-ring flex h-full w-full flex-col justify-center gap-2 border-b px-3 py-2 text-left text-[10px] focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset"
					:class="selectedTrackId === row.id && 'bg-accent'"
					data-virtual-focus-target
					@click="emit('select', row.id)"
				>
					<div class="flex w-full items-start justify-between gap-2">
						<div class="min-w-0">
							<p class="truncate text-sm font-semibold">{{ row.title }}</p>
							<p class="text-muted-foreground truncate">
								{{ row.artistLabel || 'Unknown artist' }}
							</p>
						</div>
						<span
							class="shrink-0 rounded-sm border px-1.5 py-0.5 font-semibold"
							:class="presenceClasses(row.evidence.presence)"
						>
							{{ presenceLabel(row.evidence.presence) }}
						</span>
					</div>
					<div
						class="flex w-full flex-wrap items-center gap-x-2 gap-y-1 font-mono"
					>
						<span>{{ formatBpm(row.current.bpm) }}</span>
						<span>{{ formatKey(row) }}</span>
						<span class="text-muted-foreground">
							Sources {{ row.evidence.retainedSourceCount }}/3
						</span>
						<span
							v-if="row.evidence.comparison.overall"
							:class="comparisonClasses(row.evidence.comparison.overall)"
							class="rounded-sm border px-1 py-0.5 font-sans font-semibold"
						>
							{{ comparisonLabel(row.evidence.comparison.overall) }}
						</span>
					</div>
					<p
						v-if="row.evidence.presence === 'retained'"
						class="text-muted-foreground w-full truncate"
					>
						BPM {{ applicationLabel(row.evidence.application.bpm) }} · Key
						{{ applicationLabel(row.evidence.application.keyMode) }} ·
						{{ versionLabel(row.evidence.version) }}
					</p>
				</button>
			</template>
		</ListWorkbenchVirtual>

		<div
			v-else
			class="flex min-h-0 flex-1 flex-col items-center justify-center p-8 text-center"
			role="status"
		>
			<p class="text-sm font-semibold">
				{{
					counts.total
						? 'No tracks match the Evidence filters'
						: 'No tracks in this view'
				}}
			</p>
			<p class="text-muted-foreground mt-1 max-w-sm text-xs">
				{{
					counts.total
						? 'Clear or change the Evidence filters to widen the result set.'
						: 'The current library search and track filters returned no tracks.'
				}}
			</p>
			<button
				v-if="hasActiveFilters"
				type="button"
				class="border-border hover:bg-muted mt-3 rounded-sm border px-2.5 py-1.5 text-xs font-medium"
				@click="clearFilters"
			>
				Clear Evidence filters
			</button>
		</div>
	</section>
</template>
