import { describe, expect, it } from 'vitest'
import type { TrackEnrichmentRow } from './trackEnrichment'
import { canStageTrackEnrichmentRow } from './trackEnrichment'
import {
	canStageTrackEnrichmentWorkflowRow,
	classifyTrackEnrichmentRowBuckets,
	classifyTrackEnrichmentRows,
	isTrackEnrichmentEvidenceOnlyRow,
	selectStagedTrackEnrichmentRows
} from './trackEnrichmentReviewView'

function createRow(
	id: string,
	overrides: Partial<TrackEnrichmentRow> = {}
): TrackEnrichmentRow {
	return {
		id,
		source: {} as TrackEnrichmentRow['source'],
		track: {
			id: `track-${id}`,
			updated_at: '2026-01-01T00:00:00.000Z'
		} as TrackEnrichmentRow['track'],
		record: null,
		confidence: 'high',
		score: 100,
		reasons: [],
		warnings: [],
		proposedBpm: 128,
		proposedKey: 9,
		proposedMode: 0,
		proposedBpmSource: 'rekordboxXml',
		proposedKeyModeSource: 'rekordboxXml',
		canFillBpm: true,
		canFillKeyMode: true,
		alreadyComplete: false,
		hasConflict: false,
		stagingBlockedReason: null,
		defaultStaged: true,
		error: null,
		applied: false,
		...overrides
	}
}

// One row per interesting combination of the flags the buckets read.
function createRows(): TrackEnrichmentRow[] {
	return [
		createRow('ready'),
		createRow('ready-bpm-only', { canFillKeyMode: false }),
		createRow('review', { defaultStaged: false, confidence: 'manual' }),
		createRow('blocked', {
			defaultStaged: false,
			canFillBpm: false,
			canFillKeyMode: false,
			stagingBlockedReason: 'Competing match',
			hasConflict: true
		}),
		createRow('evidence', {
			defaultStaged: false,
			canFillBpm: false,
			canFillKeyMode: false,
			alreadyComplete: true
		}),
		createRow('evidence-no-revision', {
			defaultStaged: false,
			canFillBpm: false,
			canFillKeyMode: false,
			track: { id: 'track-x', updated_at: null } as never
		}),
		createRow('applied', { applied: true }),
		createRow('applied-evidence', {
			applied: true,
			defaultStaged: false,
			canFillBpm: false,
			canFillKeyMode: false
		}),
		createRow('error', { error: 'Failed', defaultStaged: false }),
		createRow('unmatched', {
			track: null,
			record: null,
			defaultStaged: false,
			canFillBpm: false,
			canFillKeyMode: false
		})
	]
}

// The previous independent filter computeds, kept verbatim as the oracle.
function legacyView(
	rows: TrackEnrichmentRow[],
	staged: ReadonlySet<string>,
	changed: ReadonlySet<string>
) {
	const stagedRows = rows.filter(
		(row) => staged.has(row.id) && canStageTrackEnrichmentWorkflowRow(row)
	)
	return {
		matched: rows.filter((row) => !!row.track),
		ready: rows.filter((row) => row.defaultStaged && !row.applied),
		review: rows.filter(
			(row) =>
				!!row.track &&
				!row.applied &&
				!row.defaultStaged &&
				(row.canFillBpm || row.canFillKeyMode || !!row.stagingBlockedReason)
		),
		evidenceOnly: rows.filter(
			(row) => !row.applied && isTrackEnrichmentEvidenceOnlyRow(row)
		),
		unmatched: rows.filter((row) => !row.track),
		done: rows.filter((row) => row.applied || row.alreadyComplete),
		changed: rows.filter((row) => changed.has(row.id)),
		blockedCount: rows.filter((row) => !!row.stagingBlockedReason).length,
		rowErrorCount: rows.filter((row) => !!row.error).length,
		staged: {
			rows: stagedRows,
			bpmCount: stagedRows.filter((row) => row.canFillBpm).length,
			keyModeCount: stagedRows.filter((row) => row.canFillKeyMode).length,
			evidenceOnlyCount: stagedRows.filter(isTrackEnrichmentEvidenceOnlyRow)
				.length
		}
	}
}

describe('classifyTrackEnrichmentRows', () => {
	it('matches the legacy per-filter computeds for every bucket', () => {
		const rows = createRows()
		const staged = new Set(rows.map((row) => row.id))
		const changed = new Set(['review', 'evidence', 'missing-row'])
		expect(classifyTrackEnrichmentRows(rows, staged, changed)).toEqual(
			legacyView(rows, staged, changed)
		)
	})

	it('assigns rows to the expected buckets', () => {
		const rows = createRows()
		const view = classifyTrackEnrichmentRows(
			rows,
			new Set(['ready', 'evidence', 'evidence-no-revision', 'unmatched']),
			new Set(['blocked'])
		)
		const ids = (list: readonly TrackEnrichmentRow[]) =>
			list.map((row) => row.id)
		expect(ids(view.ready)).toEqual(['ready', 'ready-bpm-only'])
		expect(ids(view.review)).toEqual(['review', 'blocked', 'error'])
		expect(ids(view.evidenceOnly)).toEqual(['evidence', 'evidence-no-revision'])
		expect(ids(view.unmatched)).toEqual(['unmatched'])
		expect(ids(view.done)).toEqual(['evidence', 'applied', 'applied-evidence'])
		expect(ids(view.changed)).toEqual(['blocked'])
		expect(view.matched).toHaveLength(rows.length - 1)
		expect(view.blockedCount).toBe(1)
		expect(view.rowErrorCount).toBe(1)
		// Only stageable staged ids count: no revision and unmatched are inert.
		expect(ids(view.staged.rows)).toEqual(['ready', 'evidence'])
		expect(view.staged).toMatchObject({
			bpmCount: 1,
			keyModeCount: 1,
			evidenceOnlyCount: 1
		})
	})

	it('preserves row identity and source order', () => {
		const rows = createRows()
		const view = classifyTrackEnrichmentRows(rows, new Set(), new Set())
		expect(view.matched.every((row) => rows.includes(row))).toBe(true)
		expect(view.changed).toEqual([])
		expect(view.staged.rows).toEqual([])
	})

	it('keeps staging-independent buckets separate from staged selection', () => {
		const rows = createRows()
		const buckets = classifyTrackEnrichmentRowBuckets(rows, new Set())
		expect(buckets).not.toHaveProperty('staged')
		expect(
			selectStagedTrackEnrichmentRows(rows, new Set(['review'])).rows
		).toEqual([rows[2]])
	})

	it('agrees with the matcher stageability rule', () => {
		for (const row of createRows()) {
			if (canStageTrackEnrichmentRow(row)) {
				expect(canStageTrackEnrichmentWorkflowRow(row)).toBe(true)
			}
		}
	})
})
