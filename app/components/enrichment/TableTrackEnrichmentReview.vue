<script setup lang="ts">
import { AlertTriangle, ArrowRight, Check, Loader2 } from 'lucide-vue-next'
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
}>()

const emit = defineEmits<{
	'stage-all': [staged: boolean]
	'stage-row': [row: TrackEnrichmentRow, staged: boolean]
}>()

function isRowStaged(row: TrackEnrichmentRow): boolean {
	return props.stagedRowIds.has(row.id)
}

function formatBpm(value: number | null | undefined): string {
	return value === null || value === undefined ? '-' : value.toFixed(1)
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
		return '-'
	}
	return getFormattedKeyString(key, mode, props.keyFormat, 'short')
}

function formatTrackArtists(row: TrackEnrichmentRow): string {
	if (!row.track) return '-'
	return row.track.artists.map((artist) => artist.name).join(', ') || '-'
}

function getConfidenceVariant(confidence: TrackEnrichmentRow['confidence']) {
	if (confidence === 'high') return 'default'
	if (confidence === 'medium') return 'secondary'
	return 'outline'
}

function getRowClasses(row: TrackEnrichmentRow): string {
	if (row.error) return 'bg-destructive/5'
	if (isRowStaged(row)) {
		return 'border-l-2 border-l-emerald-500 bg-emerald-500/10 hover:bg-emerald-500/15'
	}
	if (row.stagingBlockedReason || row.hasConflict) return 'bg-amber-500/5'
	return ''
}
</script>

<template>
	<div class="border-border overflow-x-auto rounded-md border">
		<Table class="min-w-[1160px] table-fixed">
			<TableHeader>
				<TableRow>
					<TableHead class="w-32">
						<div class="flex items-center gap-2">
							<Checkbox
								:model-value="filteredSelectionState"
								:disabled="stageableRowCount === 0 || isApplying"
								large-hit-area
								aria-label="Stage all eligible tracks in this view"
								@update:model-value="emit('stage-all', $event === true)"
							/>
							<span>Stage</span>
						</div>
					</TableHead>
					<TableHead class="w-[21%]">Crate Guide match</TableHead>
					<TableHead class="w-[21%]">{{ sourceLabel }} source</TableHead>
					<TableHead class="w-32">BPM</TableHead>
					<TableHead class="w-36">Key</TableHead>
					<TableHead>Confidence</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				<TableRow v-for="row in rows" :key="row.id" :class="getRowClasses(row)">
					<TableCell>
						<div class="flex items-center gap-2">
							<Checkbox
								:model-value="isRowStaged(row)"
								:disabled="!canStageTrackEnrichmentRow(row) || isApplying"
								large-hit-area
								:aria-label="`Stage ${row.source.name || 'source track'}`"
								@update:model-value="emit('stage-row', row, $event === true)"
							/>
							<span
								v-if="isRowStaged(row)"
								class="text-xs font-medium text-emerald-700 dark:text-emerald-400"
							>
								Staged
							</span>
							<span
								v-else-if="canStageTrackEnrichmentRow(row)"
								class="text-muted-foreground text-xs"
							>
								Not staged
							</span>
							<span v-else class="text-muted-foreground text-xs">
								Unavailable
							</span>
						</div>
					</TableCell>
					<TableCell class="whitespace-normal">
						<div class="truncate font-medium">
							{{ row.track?.title || '-' }}
						</div>
						<div class="text-muted-foreground truncate text-xs">
							{{ formatTrackArtists(row) }}
						</div>
						<div class="text-muted-foreground truncate text-xs">
							{{ row.record?.title || '-' }}
						</div>
					</TableCell>
					<TableCell class="whitespace-normal">
						<div class="truncate font-medium">
							{{ row.source.name || '-' }}
						</div>
						<div class="text-muted-foreground truncate text-xs">
							{{ row.source.artist || '-' }}
						</div>
						<div class="text-muted-foreground truncate text-xs">
							{{ row.source.album || row.source.locationHint || '-' }}
						</div>
					</TableCell>
					<TableCell class="font-mono text-xs">
						<div class="grid grid-cols-[1fr_auto_1fr] items-center gap-1">
							<span class="text-muted-foreground text-right">
								{{ formatBpm(row.track?.bpm) }}
							</span>
							<ArrowRight class="text-muted-foreground size-3" />
							<span :class="row.canFillBpm ? 'font-semibold' : ''">
								{{ formatBpm(row.proposedBpm) }}
							</span>
						</div>
					</TableCell>
					<TableCell class="font-mono text-xs">
						<div class="grid grid-cols-[1fr_auto_1fr] items-center gap-1">
							<span class="text-muted-foreground text-right">
								{{ formatKeyValue(row.track?.key, row.track?.mode) }}
							</span>
							<ArrowRight class="text-muted-foreground size-3" />
							<span :class="row.canFillKeyMode ? 'font-semibold' : ''">
								{{ formatKeyValue(row.proposedKey, row.proposedMode) }}
							</span>
						</div>
					</TableCell>
					<TableCell class="whitespace-normal">
						<div class="mb-1 flex flex-wrap items-center gap-1">
							<Badge :variant="getConfidenceVariant(row.confidence)">
								{{ row.confidence }}
							</Badge>
							<Badge v-if="row.stagingBlockedReason" variant="outline">
								<AlertTriangle class="size-3" />
								Blocked
							</Badge>
							<Badge v-else-if="row.hasConflict" variant="outline">
								<AlertTriangle class="size-3" />
								Conflict
							</Badge>
							<Badge v-if="row.applied" variant="secondary">
								<Check class="size-3" />
								Applied
							</Badge>
							<Badge v-if="isApplying && isRowStaged(row)" variant="outline">
								<Loader2 class="size-3 animate-spin" />
								Queued
							</Badge>
						</div>
						<div class="text-muted-foreground line-clamp-2 text-xs">
							{{ row.reasons.join(', ') || 'No reliable match' }}
						</div>
						<div
							v-if="row.warnings.length"
							class="mt-1 line-clamp-2 text-xs text-amber-700 dark:text-amber-400"
						>
							{{ row.warnings.join(', ') }}
						</div>
						<div v-if="row.error" class="text-destructive mt-1 text-xs">
							{{ row.error }}
						</div>
					</TableCell>
				</TableRow>
			</TableBody>
		</Table>
	</div>
</template>
