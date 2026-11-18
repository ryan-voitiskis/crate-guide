import type { TrackEnrichmentRow } from './trackEnrichment'
import { canStageTrackEnrichmentRow } from './trackEnrichment'

export function isTrackEnrichmentEvidenceOnlyRow(
	row: TrackEnrichmentRow
): boolean {
	return Boolean(
		row.track &&
		!row.canFillBpm &&
		!row.canFillKeyMode &&
		!row.stagingBlockedReason
	)
}

export function canStageTrackEnrichmentWorkflowRow(
	row: TrackEnrichmentRow
): boolean {
	if (canStageTrackEnrichmentRow(row)) return true
	return Boolean(
		isTrackEnrichmentEvidenceOnlyRow(row) &&
		!row.applied &&
		row.track?.updated_at
	)
}

/**
 * Staging-independent review buckets. Kept separate from the staged selection
 * so toggling one checkbox does not republish every filter list (and force the
 * review table to re-search and re-sort an unchanged view).
 */
export type TrackEnrichmentRowClassification = {
	matched: TrackEnrichmentRow[]
	ready: TrackEnrichmentRow[]
	review: TrackEnrichmentRow[]
	evidenceOnly: TrackEnrichmentRow[]
	unmatched: TrackEnrichmentRow[]
	done: TrackEnrichmentRow[]
	changed: TrackEnrichmentRow[]
	blockedCount: number
	rowErrorCount: number
}

export type TrackEnrichmentStagedSelection = {
	rows: TrackEnrichmentRow[]
	bpmCount: number
	keyModeCount: number
	evidenceOnlyCount: number
}

export type TrackEnrichmentReviewView = TrackEnrichmentRowClassification & {
	staged: TrackEnrichmentStagedSelection
}

export function classifyTrackEnrichmentRowBuckets(
	rows: readonly TrackEnrichmentRow[],
	changedRowIds: ReadonlySet<string>
): TrackEnrichmentRowClassification {
	const matched: TrackEnrichmentRow[] = []
	const ready: TrackEnrichmentRow[] = []
	const review: TrackEnrichmentRow[] = []
	const evidenceOnly: TrackEnrichmentRow[] = []
	const unmatched: TrackEnrichmentRow[] = []
	const done: TrackEnrichmentRow[] = []
	const changed: TrackEnrichmentRow[] = []
	let blockedCount = 0
	let rowErrorCount = 0
	const checkChanged = changedRowIds.size > 0

	for (const row of rows) {
		const hasTrack = !!row.track
		if (hasTrack) matched.push(row)
		else unmatched.push(row)
		if (row.defaultStaged && !row.applied) ready.push(row)
		if (
			hasTrack &&
			!row.applied &&
			!row.defaultStaged &&
			(row.canFillBpm || row.canFillKeyMode || !!row.stagingBlockedReason)
		) {
			review.push(row)
		}
		if (!row.applied && isTrackEnrichmentEvidenceOnlyRow(row)) {
			evidenceOnly.push(row)
		}
		if (row.applied || row.alreadyComplete) done.push(row)
		if (checkChanged && changedRowIds.has(row.id)) changed.push(row)
		if (row.stagingBlockedReason) blockedCount += 1
		if (row.error) rowErrorCount += 1
	}

	return {
		matched,
		ready,
		review,
		evidenceOnly,
		unmatched,
		done,
		changed,
		blockedCount,
		rowErrorCount
	}
}

export function selectStagedTrackEnrichmentRows(
	rows: readonly TrackEnrichmentRow[],
	stagedRowIds: ReadonlySet<string>
): TrackEnrichmentStagedSelection {
	const staged: TrackEnrichmentRow[] = []
	let bpmCount = 0
	let keyModeCount = 0
	let evidenceOnlyCount = 0
	if (stagedRowIds.size === 0) {
		return { rows: staged, bpmCount, keyModeCount, evidenceOnlyCount }
	}
	for (const row of rows) {
		if (!stagedRowIds.has(row.id) || !canStageTrackEnrichmentWorkflowRow(row))
			continue
		staged.push(row)
		if (row.canFillBpm) bpmCount += 1
		if (row.canFillKeyMode) keyModeCount += 1
		if (isTrackEnrichmentEvidenceOnlyRow(row)) evidenceOnlyCount += 1
	}
	return { rows: staged, bpmCount, keyModeCount, evidenceOnlyCount }
}

/** Pure view over every review bucket and the staged selection (one pass each). */
export function classifyTrackEnrichmentRows(
	rows: readonly TrackEnrichmentRow[],
	stagedRowIds: ReadonlySet<string>,
	changedRowIds: ReadonlySet<string>
): TrackEnrichmentReviewView {
	return {
		...classifyTrackEnrichmentRowBuckets(rows, changedRowIds),
		staged: selectStagedTrackEnrichmentRows(rows, stagedRowIds)
	}
}
