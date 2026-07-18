<script setup lang="ts">
import { AlertTriangle, ArrowRight, Check, Loader2 } from 'lucide-vue-next'
import type { TrackEnrichmentReviewSortKey } from '~/composables/useTrackEnrichmentReviewTable'
import type { TrackEnrichmentRow } from '~/utils/trackEnrichment'
import { canStageTrackEnrichmentRow } from '~/utils/trackEnrichment'
import type { KeyFormat } from '~~/shared/types/supabase'

const props = defineProps<{
	rows: TrackEnrichmentRow[]
	stagedRowIds: Set<string>
	filteredSelectionState: boolean | 'indeterminate'
	stageableRowCount: number
	isApplying: boolean
	keyFormat: KeyFormat
	sourceLabel: string
	density: 'compact' | 'comfortable'
	sortKey: TrackEnrichmentReviewSortKey | null
	sortDirection: 'asc' | 'desc'
}>()

const emit = defineEmits<{
	'stage-all': [staged: boolean]
	'stage-row': [row: TrackEnrichmentRow, staged: boolean]
	sort: [key: TrackEnrichmentReviewSortKey]
}>()

function isRowStaged(row: TrackEnrichmentRow): boolean {
	return props.stagedRowIds.has(row.id)
}

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

function formatTrackArtists(row: TrackEnrichmentRow): string {
	if (!row.track) return 'Unknown artist'
	return (
		row.track.artists.map((artist) => artist.name).join(', ') ||
		'Unknown artist'
	)
}

function formatSeconds(value: number | null | undefined): string {
	if (value === null || value === undefined || !Number.isFinite(value))
		return '—'
	const roundedSeconds = Math.max(0, Math.round(value))
	const minutes = Math.floor(roundedSeconds / 60)
	return `${minutes}:${String(roundedSeconds % 60).padStart(2, '0')}`
}

function formatTrackDuration(value: number | null | undefined): string {
	return value === null || value === undefined
		? '—'
		: formatSeconds(value / 1000)
}

function getDurationDelta(row: TrackEnrichmentRow): string | null {
	if (
		row.track?.duration === null ||
		row.track?.duration === undefined ||
		row.source.totalTimeSeconds === null
	) {
		return null
	}
	const delta = Math.abs(
		Math.round(row.track.duration / 1000 - row.source.totalTimeSeconds)
	)
	return `Δ${delta}s`
}

function getSourceId(row: TrackEnrichmentRow): string | null {
	return row.source.sourceType === 'rekordboxXml' ? row.source.trackId : null
}

function getStageLabel(row: TrackEnrichmentRow): string | null {
	if (row.error) return 'Error'
	if (row.applied) return 'Applied'
	if (row.stagingBlockedReason) return 'Blocked'
	if (isRowStaged(row)) return 'Staged'
	if (canStageTrackEnrichmentRow(row)) return 'Ready'
	if (row.alreadyComplete) return 'Complete'
	return null
}

function getStageClasses(row: TrackEnrichmentRow): string {
	if (row.error) return 'text-destructive'
	if (row.stagingBlockedReason) return 'text-amber-700 dark:text-amber-400'
	if (isRowStaged(row) || row.applied)
		return 'text-emerald-700 dark:text-emerald-400'
	return 'text-muted-foreground'
}

function getConfidenceClasses(row: TrackEnrichmentRow): string {
	if (row.confidence === 'high')
		return 'bg-emerald-500 text-emerald-700 dark:text-emerald-400'
	if (row.confidence === 'medium')
		return 'bg-amber-500 text-amber-700 dark:text-amber-400'
	return 'bg-muted-foreground text-muted-foreground'
}

function getRowClasses(row: TrackEnrichmentRow): string {
	if (row.error) return 'border-l-2 border-l-destructive bg-destructive/5'
	if (row.stagingBlockedReason || row.hasConflict)
		return 'border-l-2 border-l-amber-500 bg-amber-500/5'
	if (isRowStaged(row))
		return 'border-l-2 border-l-emerald-500 bg-emerald-500/5'
	return 'border-l-2 border-l-transparent'
}

function getEvidenceText(row: TrackEnrichmentRow): string {
	if (row.error) return row.error
	if (row.stagingBlockedReason) return row.stagingBlockedReason
	if (row.warnings.length) return row.warnings.join(' · ')
	return row.reasons.join(' · ') || 'No reliable match evidence'
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
				<div class="flex items-center gap-2">
					<CheckboxLargeHitArea
						:model-value="filteredSelectionState"
						:disabled="stageableRowCount === 0 || isApplying"
						aria-label="Stage all eligible tracks in this view"
						@update:model-value="emit('stage-all', $event === true)"
					/>
					<span
						class="text-muted-foreground font-mono text-[9px] font-semibold tracking-[0.08em] uppercase"
					>
						Stage view
					</span>
				</div>
				<span class="text-muted-foreground font-mono text-[10px]">
					{{ rows.length }} rows
				</span>
			</div>

			<div
				v-for="row in rows"
				:key="row.id"
				class="px-3 py-2.5"
				:class="getRowClasses(row)"
			>
				<div class="flex items-start gap-2.5">
					<CheckboxLargeHitArea
						:model-value="isRowStaged(row)"
						:disabled="!canStageTrackEnrichmentRow(row) || isApplying"
						:aria-label="`Stage ${row.source.name || 'source track'}`"
						@update:model-value="emit('stage-row', row, $event === true)"
					/>
					<div class="min-w-0 flex-1">
						<div class="flex min-w-0 items-center gap-1.5">
							<span
								v-if="row.track?.position"
								class="text-muted-foreground shrink-0 font-mono text-[9px]"
							>
								{{ row.track.position }}
							</span>
							<span class="truncate text-sm font-semibold">
								{{ row.track?.title || row.source.name || 'Unknown track' }}
							</span>
						</div>
						<div class="text-muted-foreground truncate text-xs">
							{{ formatTrackArtists(row) }} ·
							{{ row.record?.title || 'No release' }}
						</div>
						<div
							v-if="row.track && row.source.name !== row.track.title"
							class="mt-0.5 flex min-w-0 items-center gap-1 text-xs"
						>
							<ArrowRight class="text-muted-foreground size-3 shrink-0" />
							<span class="truncate">
								{{ row.source.name || 'Unknown source' }}
							</span>
						</div>
					</div>
					<div class="shrink-0 text-right">
						<div
							class="flex items-center justify-end gap-1 font-mono text-[9px] font-semibold tracking-wide uppercase"
							:class="getConfidenceClasses(row).split(' ').slice(1).join(' ')"
						>
							<span
								class="size-1.5 rounded-full"
								:class="getConfidenceClasses(row).split(' ')[0]"
							/>
							{{ row.confidence }} {{ row.score }}
						</div>
						<div
							v-if="getStageLabel(row)"
							class="mt-1 font-mono text-[9px] uppercase"
							:class="getStageClasses(row)"
						>
							{{ getStageLabel(row) }}
						</div>
					</div>
				</div>

				<div
					class="border-border bg-background/60 mt-2 grid grid-cols-3 divide-x rounded-sm border"
				>
					<div class="px-2 py-1.5 text-center">
						<div class="text-muted-foreground font-mono text-[8px] uppercase">
							BPM
						</div>
						<div class="mt-0.5 font-mono text-xs font-semibold tabular-nums">
							{{ formatBpm(row.track?.bpm) }} →
							<span :class="row.canFillBpm && 'text-primary'">
								{{ formatBpm(row.proposedBpm) }}
							</span>
						</div>
					</div>
					<div class="px-2 py-1.5 text-center">
						<div class="text-muted-foreground font-mono text-[8px] uppercase">
							Key
						</div>
						<div class="mt-0.5 font-mono text-xs font-semibold">
							{{ formatKeyValue(row.track?.key, row.track?.mode) }} →
							<span :style="getKeyStyle(row.proposedKey, row.proposedMode)">
								{{ formatKeyValue(row.proposedKey, row.proposedMode) }}
							</span>
						</div>
					</div>
					<div class="px-2 py-1.5 text-center">
						<div class="text-muted-foreground font-mono text-[8px] uppercase">
							Time
						</div>
						<div class="mt-0.5 font-mono text-xs tabular-nums">
							{{ formatTrackDuration(row.track?.duration) }} →
							{{ formatSeconds(row.source.totalTimeSeconds) }}
						</div>
					</div>
				</div>
				<p
					class="mt-1.5 truncate text-[11px]"
					:class="
						row.warnings.length || row.stagingBlockedReason
							? 'text-amber-700 dark:text-amber-400'
							: 'text-muted-foreground'
					"
					:title="getEvidenceText(row)"
				>
					{{ getEvidenceText(row) }}
				</p>
			</div>
		</div>

		<div
			data-testid="enrichment-review-table-scroll"
			class="workbench-scrollbar hidden min-h-0 flex-1 overflow-auto md:block"
		>
			<Table
				data-testid="enrichment-review-desktop-table"
				class="min-w-[1260px] table-fixed"
			>
				<TableHeader
					class="bg-muted/70 sticky top-0 z-10 shadow-[0_1px_0_var(--border)] backdrop-blur-md [&_th]:h-8 [&_th]:font-mono [&_th]:text-[9px] [&_th]:tracking-wide [&_th]:uppercase"
				>
					<TableRow>
						<TableHead class="w-24">
							<div class="flex items-center gap-2">
								<CheckboxLargeHitArea
									:model-value="filteredSelectionState"
									:disabled="stageableRowCount === 0 || isApplying"
									aria-label="Stage all eligible tracks in this view"
									@update:model-value="emit('stage-all', $event === true)"
								/>
								<span>Stage</span>
							</div>
						</TableHead>
						<TableHead class="w-[22%]">
							<ButtonLibrarySort
								label="Crate Guide match"
								:active="sortKey === 'library'"
								:direction="sortDirection"
								@click="emit('sort', 'library')"
							/>
						</TableHead>
						<TableHead class="w-[22%]">
							<ButtonLibrarySort
								:label="`${sourceLabel} source`"
								:active="sortKey === 'source'"
								:direction="sortDirection"
								@click="emit('sort', 'source')"
							/>
						</TableHead>
						<TableHead class="w-28">
							<ButtonLibrarySort
								label="Time"
								align="right"
								:active="sortKey === 'duration'"
								:direction="sortDirection"
								@click="emit('sort', 'duration')"
							/>
						</TableHead>
						<TableHead class="w-28">
							<ButtonLibrarySort
								label="BPM"
								align="right"
								:active="sortKey === 'bpm'"
								:direction="sortDirection"
								@click="emit('sort', 'bpm')"
							/>
						</TableHead>
						<TableHead class="w-28">
							<ButtonLibrarySort
								label="Key"
								align="right"
								:active="sortKey === 'key'"
								:direction="sortDirection"
								@click="emit('sort', 'key')"
							/>
						</TableHead>
						<TableHead>
							<ButtonLibrarySort
								label="Match quality"
								:active="sortKey === 'confidence'"
								:direction="sortDirection"
								@click="emit('sort', 'confidence')"
							/>
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					<TableRow
						v-for="row in rows"
						:key="row.id"
						:data-enrichment-row-id="row.id"
						:class="[
							getRowClasses(row),
							density === 'compact'
								? '[&_td]:h-11 [&_td]:py-1'
								: '[&_td]:h-14 [&_td]:py-2'
						]"
					>
						<TableCell>
							<div class="flex items-center gap-2">
								<CheckboxLargeHitArea
									:model-value="isRowStaged(row)"
									:disabled="!canStageTrackEnrichmentRow(row) || isApplying"
									:aria-label="`Stage ${row.source.name || 'source track'}`"
									@update:model-value="emit('stage-row', row, $event === true)"
								/>
								<div class="min-w-0">
									<div
										v-if="getStageLabel(row)"
										class="font-mono text-[9px] font-semibold tracking-wide uppercase"
										:class="getStageClasses(row)"
									>
										{{ getStageLabel(row) }}
									</div>
									<div
										v-if="isApplying && isRowStaged(row)"
										class="text-muted-foreground mt-0.5 flex items-center gap-1 font-mono text-[8px] uppercase"
									>
										<Loader2 class="size-2.5 animate-spin" />
										Queued
									</div>
								</div>
							</div>
						</TableCell>

						<TableCell class="whitespace-normal">
							<div class="flex min-w-0 items-center gap-1.5">
								<span
									v-if="row.track?.position"
									class="text-muted-foreground shrink-0 font-mono text-[9px]"
								>
									{{ row.track.position }}
								</span>
								<span
									class="truncate text-xs font-semibold"
									:title="row.track?.title || undefined"
								>
									{{ row.track?.title || 'No collection match' }}
								</span>
							</div>
							<div
								class="text-muted-foreground mt-0.5 truncate text-[10px] leading-tight"
								:title="`${formatTrackArtists(row)} · ${row.record?.title || 'No release'}`"
							>
								{{ formatTrackArtists(row) }}
								<span class="text-border px-1">/</span>
								{{ row.record?.title || 'No release' }}
								<span v-if="row.record?.labels[0]?.catno" class="font-mono">
									<span class="text-border px-1">/</span>
									{{ row.record.labels[0].catno }}
								</span>
							</div>
						</TableCell>

						<TableCell class="whitespace-normal">
							<div
								class="truncate text-xs font-semibold"
								:title="row.source.name || undefined"
							>
								{{ row.source.name || 'Unknown source track' }}
							</div>
							<div
								class="text-muted-foreground mt-0.5 truncate text-[10px] leading-tight"
								:title="`${row.source.artist || 'Unknown artist'} · ${row.source.album || row.source.locationHint || 'No release'}`"
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

						<TableCell class="font-mono text-[10px]">
							<div
								class="grid grid-cols-[1fr_auto_1fr] items-center gap-1 tabular-nums"
							>
								<span class="text-muted-foreground text-right">
									{{ formatTrackDuration(row.track?.duration) }}
								</span>
								<ArrowRight class="text-muted-foreground size-3" />
								<span class="text-right">
									{{ formatSeconds(row.source.totalTimeSeconds) }}
								</span>
							</div>
							<div
								v-if="getDurationDelta(row)"
								class="text-muted-foreground mt-0.5 text-right text-[8px]"
							>
								{{ getDurationDelta(row) }}
							</div>
						</TableCell>

						<TableCell
							class="font-mono text-[11px]"
							:class="row.canFillBpm && 'bg-primary/5'"
						>
							<div
								class="grid grid-cols-[1fr_auto_1fr] items-center gap-1 tabular-nums"
							>
								<span class="text-muted-foreground text-right">
									{{ formatBpm(row.track?.bpm) }}
								</span>
								<ArrowRight class="text-muted-foreground size-3" />
								<span
									class="text-right font-semibold"
									:class="row.canFillBpm && 'text-primary'"
								>
									{{ formatBpm(row.proposedBpm) }}
								</span>
							</div>
						</TableCell>

						<TableCell
							class="font-mono text-[11px]"
							:class="row.canFillKeyMode && 'bg-primary/5'"
						>
							<div class="grid grid-cols-[1fr_auto_1fr] items-center gap-1">
								<span class="text-muted-foreground text-right">
									{{ formatKeyValue(row.track?.key, row.track?.mode) }}
								</span>
								<ArrowRight class="text-muted-foreground size-3" />
								<span
									class="text-right font-semibold"
									:style="getKeyStyle(row.proposedKey, row.proposedMode)"
								>
									{{ formatKeyValue(row.proposedKey, row.proposedMode) }}
								</span>
							</div>
						</TableCell>

						<TableCell class="whitespace-normal">
							<div class="flex min-w-0 items-center gap-1.5">
								<span
									class="size-1.5 shrink-0 rounded-full"
									:class="getConfidenceClasses(row).split(' ')[0]"
								/>
								<span
									class="font-mono text-[9px] font-semibold tracking-wide uppercase"
									:class="
										getConfidenceClasses(row).split(' ').slice(1).join(' ')
									"
								>
									{{ row.confidence }}
								</span>
								<span class="text-muted-foreground font-mono text-[9px]">
									Score {{ row.score }}
								</span>
								<AlertTriangle
									v-if="
										row.warnings.length ||
										row.stagingBlockedReason ||
										row.hasConflict
									"
									class="size-3 shrink-0 text-amber-600"
								/>
								<Check
									v-else-if="row.applied"
									class="size-3 shrink-0 text-emerald-600"
								/>
							</div>
							<div
								class="mt-0.5 truncate text-[10px] leading-tight"
								:class="
									row.warnings.length || row.stagingBlockedReason
										? 'text-amber-700 dark:text-amber-400'
										: 'text-muted-foreground'
								"
								:title="getEvidenceText(row)"
							>
								{{ getEvidenceText(row) }}
							</div>
						</TableCell>
					</TableRow>
				</TableBody>
			</Table>
		</div>
	</div>
</template>
