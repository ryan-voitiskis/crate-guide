import type { LibraryRecord, LibraryTrack } from '~~/shared/types/library'
import {
	type TrackAnalysisCoverage,
	summarizeTrackAnalysisCoverage
} from './trackAnalysisCoverage'

/**
 * Share of tracks with both BPM and key at which the checklist treats the
 * library as annotated. It matches the product direction's activation target
 * for active accounts (docs/product-direction-2026-11.md, section 7).
 */
export const FIRST_RUN_BPM_KEY_TARGET_PERCENT = 60

export const FIRST_RUN_CHECKLIST_DISMISSED_STORAGE_KEY =
	'crate-guide-first-run-checklist-dismissed'

export type FirstRunChecklistStepId =
	| 'connect-discogs'
	| 'import-records'
	| 'add-bpm-key'
	| 'build-crate'
	| 'plan-set'

export type FirstRunChecklistStep = Readonly<{
	id: FirstRunChecklistStepId
	label: string
	description: string
	done: boolean
	/** Workbench-relative path for the page where the step is done. */
	path: string | null
	/**
	 * Link text. Deliberately avoids the navigation labels (Settings, Records,
	 * Tracks, Crates, BPM & Key) so each link has a distinct accessible name.
	 */
	actionLabel: string | null
}>

export type FirstRunChecklistInput = Readonly<{
	isDiscogsConnected: boolean
	records: readonly Pick<LibraryRecord, 'discogs_id'>[]
	tracks: readonly Pick<LibraryTrack, 'bpm' | 'key' | 'mode'>[]
	crateCount: number
	savedSetCount: number
}>

export type FirstRunChecklist = Readonly<{
	steps: readonly FirstRunChecklistStep[]
	completedCount: number
	isComplete: boolean
	coverage: TrackAnalysisCoverage
}>

export function deriveFirstRunChecklist(
	input: FirstRunChecklistInput
): FirstRunChecklist {
	const coverage = summarizeTrackAnalysisCoverage(input.tracks)
	const hasDiscogsRecords = input.records.some(
		(record) => record.discogs_id !== null
	)
	const steps: FirstRunChecklistStep[] = [
		{
			id: 'connect-discogs',
			label: 'Connect Discogs',
			description: 'Link your Discogs account to bring your collection in.',
			done: input.isDiscogsConnected || hasDiscogsRecords,
			path: '/settings',
			actionLabel: 'Connect Discogs'
		},
		{
			id: 'import-records',
			label: 'Import your records',
			description: 'Import from Discogs or add records by hand.',
			done: input.records.length > 0,
			path: '/records',
			actionLabel: 'Start importing'
		},
		{
			id: 'add-bpm-key',
			label: 'Add BPM and key',
			description:
				'Tap the tempo and pick the key as a record plays, or import them from Rekordbox.',
			done:
				coverage.total > 0 &&
				coverage.percentWithBpmAndKey >= FIRST_RUN_BPM_KEY_TARGET_PERCENT,
			path: '/tracks',
			actionLabel: 'Tap BPM and key'
		},
		{
			id: 'build-crate',
			label: 'Build a crate',
			description: 'Group records for a gig, a mood or a bag.',
			done: input.crateCount > 0,
			path: '/crates',
			actionLabel: 'Make a crate'
		},
		{
			id: 'plan-set',
			label: 'Plan a set',
			description:
				'Load tracks on the Session decks, follow the suggestions and save the set.',
			done: input.savedSetCount > 0,
			path: null,
			actionLabel: null
		}
	]
	const completedCount = steps.filter((step) => step.done).length
	return {
		steps,
		completedCount,
		isComplete: completedCount === steps.length,
		coverage
	}
}

export function readFirstRunChecklistDismissed(): boolean {
	if (typeof window === 'undefined') return false
	try {
		return (
			window.localStorage.getItem(FIRST_RUN_CHECKLIST_DISMISSED_STORAGE_KEY) ===
			'1'
		)
	} catch {
		return false
	}
}

/** Returns whether the dismissal was stored for later visits. */
export function writeFirstRunChecklistDismissed(): boolean {
	if (typeof window === 'undefined') return false
	try {
		window.localStorage.setItem(FIRST_RUN_CHECKLIST_DISMISSED_STORAGE_KEY, '1')
		return true
	} catch {
		return false
	}
}
