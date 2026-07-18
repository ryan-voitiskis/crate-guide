<script setup lang="ts">
import type { TrackEnrichmentReviewSortKey } from '~/composables/useTrackEnrichmentReviewTable'
import type { TrackEnrichmentRow } from '~/utils/trackEnrichment'
import type { KeyFormat } from '~~/shared/types/supabase'

const props = defineProps<{
	rows: TrackEnrichmentRow[]
	keyFormat: KeyFormat
	sourceLabel: string
	density: 'compact' | 'comfortable'
	sortKey: TrackEnrichmentReviewSortKey | null
	sortDirection: 'asc' | 'desc'
}>()

const emit = defineEmits<{
	sort: [key: TrackEnrichmentReviewSortKey]
}>()

function formatBpm(value: number | null | undefined): string {
	return value === null || value === undefined ? '—' : value.toFixed(1)
}

function formatKeyValue(
	key: number | null | undefined,
	mode: number | null | undefined
): string {
	if (
		key === null ||
		key === undefined ||
		mode === null ||
		mode === undefined
	) {
		return '—'
	}
	return getFormattedKeyString(key, mode, props.keyFormat, 'short')
}

function getKeyStyle(
	key: number | null | undefined,
	mode: number | null | undefined
) {
	if (
		key === null ||
		key === undefined ||
		mode === null ||
		mode === undefined
	) {
		return {}
	}
	return { color: getKeyColour(key, mode) }
}

function formatSeconds(value: number | null | undefined): string {
	if (value === null || value === undefined || !Number.isFinite(value))
		return '—'
	const roundedSeconds = Math.max(0, Math.round(value))
	const minutes = Math.floor(roundedSeconds / 60)
	return minutes + ':' + String(roundedSeconds % 60).padStart(2, '0')
}

function getSourceId(row: TrackEnrichmentRow): string | null {
	return row.source.sourceType === 'rekordboxXml' ? row.source.trackId : null
}

function getSourceDetails(row: TrackEnrichmentRow): string {
	return [
		row.source.artist || 'Unknown artist',
		row.source.album || row.source.locationHint || 'No release'
	].join(' · ')
}
</script>

<template>
	<div
		class="border-border overflow-hidden rounded-sm border md:flex md:min-h-0 md:flex-col"
	>
		<div class="divide-border divide-y md:hidden">
			<div
				class="bg-muted/70 sticky top-0 z-10 flex h-9 items-center justify-between px-3 backdrop-blur-md"
			>
				<span
					class="text-muted-foreground font-mono text-[9px] font-semibold tracking-[0.08em] uppercase"
				>
					{{ sourceLabel }} tracks
				</span>
				<span class="text-muted-foreground font-mono text-[10px]">
					{{ rows.length }} not in collection
				</span>
			</div>

			<div
				v-for="row in rows"
				:key="row.id"
				data-testid="enrichment-unmatched-mobile-row"
				class="px-3 py-2.5"
			>
				<div
					class="truncate text-sm font-semibold"
					:title="row.source.name || undefined"
				>
					{{ row.source.name || 'Unknown source track' }}
				</div>
				<div
					class="text-muted-foreground mt-0.5 truncate text-xs"
					:title="getSourceDetails(row)"
				>
					{{ row.source.artist || 'Unknown artist' }}
					<span class="text-border px-1">/</span>
					{{ row.source.album || row.source.locationHint || 'No release' }}
					<span v-if="getSourceId(row)" class="font-mono">
						<span class="text-border px-1">/</span>
						ID {{ getSourceId(row) }}
					</span>
				</div>

				<div
					class="border-border bg-background/60 mt-2 grid grid-cols-3 divide-x rounded-sm border"
				>
					<div class="px-2 py-1.5 text-center">
						<div class="text-muted-foreground font-mono text-[8px] uppercase">
							Time
						</div>
						<div class="mt-0.5 font-mono text-xs tabular-nums">
							{{ formatSeconds(row.source.totalTimeSeconds) }}
						</div>
					</div>
					<div class="px-2 py-1.5 text-center">
						<div class="text-muted-foreground font-mono text-[8px] uppercase">
							BPM
						</div>
						<div class="mt-0.5 font-mono text-xs font-semibold tabular-nums">
							{{ formatBpm(row.proposedBpm) }}
						</div>
					</div>
					<div class="px-2 py-1.5 text-center">
						<div class="text-muted-foreground font-mono text-[8px] uppercase">
							Key
						</div>
						<div
							class="mt-0.5 font-mono text-xs font-semibold"
							:style="getKeyStyle(row.proposedKey, row.proposedMode)"
						>
							{{ formatKeyValue(row.proposedKey, row.proposedMode) }}
						</div>
					</div>
				</div>
			</div>
		</div>

		<div
			data-testid="enrichment-unmatched-table-scroll"
			class="workbench-scrollbar hidden min-h-0 flex-1 overflow-auto md:block"
		>
			<Table
				data-testid="enrichment-unmatched-desktop-table"
				class="min-w-[720px] table-fixed"
			>
				<TableHeader
					class="bg-muted/70 sticky top-0 z-10 shadow-[0_1px_0_var(--border)] backdrop-blur-md [&_th]:h-8 [&_th]:font-mono [&_th]:text-[9px] [&_th]:tracking-wide [&_th]:uppercase"
				>
					<TableRow>
						<TableHead>
							<ButtonLibrarySort
								:label="sourceLabel + ' track'"
								:active="sortKey === 'source'"
								:direction="sortDirection"
								@click="emit('sort', 'source')"
							/>
						</TableHead>
						<TableHead class="w-36">
							<ButtonLibrarySort
								label="Time"
								align="right"
								:active="sortKey === 'duration'"
								:direction="sortDirection"
								@click="emit('sort', 'duration')"
							/>
						</TableHead>
						<TableHead class="w-36">
							<ButtonLibrarySort
								label="BPM"
								align="right"
								:active="sortKey === 'bpm'"
								:direction="sortDirection"
								@click="emit('sort', 'bpm')"
							/>
						</TableHead>
						<TableHead class="w-36">
							<ButtonLibrarySort
								label="Key"
								align="right"
								:active="sortKey === 'key'"
								:direction="sortDirection"
								@click="emit('sort', 'key')"
							/>
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					<TableRow
						v-for="row in rows"
						:key="row.id"
						:data-enrichment-row-id="row.id"
						:class="
							density === 'compact'
								? '[&_td]:h-11 [&_td]:py-1'
								: '[&_td]:h-14 [&_td]:py-2'
						"
					>
						<TableCell class="whitespace-normal">
							<div
								class="truncate text-xs font-semibold"
								:title="row.source.name || undefined"
							>
								{{ row.source.name || 'Unknown source track' }}
							</div>
							<div
								class="text-muted-foreground mt-0.5 truncate text-[10px] leading-tight"
								:title="getSourceDetails(row)"
							>
								{{ row.source.artist || 'Unknown artist' }}
								<span class="text-border px-1">/</span>
								{{
									row.source.album || row.source.locationHint || 'No release'
								}}
								<span v-if="getSourceId(row)" class="font-mono">
									<span class="text-border px-1">/</span>
									ID {{ getSourceId(row) }}
								</span>
							</div>
						</TableCell>

						<TableCell class="text-right font-mono text-[11px] tabular-nums">
							{{ formatSeconds(row.source.totalTimeSeconds) }}
						</TableCell>

						<TableCell
							class="text-right font-mono text-[11px] font-semibold tabular-nums"
						>
							{{ formatBpm(row.proposedBpm) }}
						</TableCell>

						<TableCell
							class="text-right font-mono text-[11px] font-semibold"
							:style="getKeyStyle(row.proposedKey, row.proposedMode)"
						>
							{{ formatKeyValue(row.proposedKey, row.proposedMode) }}
						</TableCell>
					</TableRow>
				</TableBody>
			</Table>
		</div>
	</div>
</template>
