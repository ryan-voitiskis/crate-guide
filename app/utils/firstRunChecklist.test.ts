import { afterEach, describe, expect, it, vi } from 'vitest'
import {
	FIRST_RUN_BPM_KEY_TARGET_PERCENT,
	FIRST_RUN_CHECKLIST_DISMISSED_STORAGE_KEY,
	type FirstRunChecklistInput,
	deriveFirstRunChecklist,
	readFirstRunChecklistDismissed,
	writeFirstRunChecklistDismissed
} from './firstRunChecklist'

const emptyInput: FirstRunChecklistInput = {
	isDiscogsConnected: false,
	records: [],
	tracks: [],
	crateCount: 0,
	savedSetCount: 0
}

function annotatedTracks(withBoth: number, total: number) {
	return Array.from({ length: total }, (_, index) =>
		index < withBoth
			? { bpm: 124, key: 7, mode: 1 }
			: { bpm: null, key: null, mode: null }
	)
}

function doneById(input: FirstRunChecklistInput) {
	return Object.fromEntries(
		deriveFirstRunChecklist(input).steps.map((step) => [step.id, step.done])
	)
}

describe('deriveFirstRunChecklist', () => {
	it('lists the five steps in loop order, all pending for a new account', () => {
		const checklist = deriveFirstRunChecklist(emptyInput)
		expect(checklist.steps.map((step) => step.id)).toEqual([
			'connect-discogs',
			'import-records',
			'add-bpm-key',
			'build-crate',
			'plan-set'
		])
		expect(checklist.completedCount).toBe(0)
		expect(checklist.isComplete).toBe(false)
		expect(checklist.coverage.percentWithBpmAndKey).toBe(0)
	})

	it('links every actionable step to the page where it is done', () => {
		const paths = Object.fromEntries(
			deriveFirstRunChecklist(emptyInput).steps.map((step) => [
				step.id,
				step.path
			])
		)
		expect(paths).toEqual({
			'connect-discogs': '/settings',
			'import-records': '/records',
			'add-bpm-key': '/tracks',
			'build-crate': '/crates',
			'plan-set': null
		})
	})

	it('gives every link a name distinct from the navigation labels', () => {
		const navigationLabels = [
			'session',
			'tracks',
			'records',
			'crates',
			'bpm & key',
			'settings'
		]
		for (const step of deriveFirstRunChecklist(emptyInput).steps) {
			if (step.path !== null) expect(step.actionLabel?.trim()).toBeTruthy()
			const name = step.actionLabel?.toLowerCase() ?? ''
			for (const label of navigationLabels) expect(name).not.toContain(label)
		}
	})

	it('treats a Discogs-imported record as a completed connection', () => {
		expect(
			doneById({ ...emptyInput, records: [{ discogs_id: 42 }] })[
				'connect-discogs'
			]
		).toBe(true)
		expect(
			doneById({ ...emptyInput, records: [{ discogs_id: null }] })
		).toMatchObject({ 'connect-discogs': false, 'import-records': true })
		expect(
			doneById({ ...emptyInput, isDiscogsConnected: true })['connect-discogs']
		).toBe(true)
	})

	it('completes the BPM and key step at the target share, not before', () => {
		const target = FIRST_RUN_BPM_KEY_TARGET_PERCENT
		expect(
			doneById({ ...emptyInput, tracks: annotatedTracks(target - 1, 100) })[
				'add-bpm-key'
			]
		).toBe(false)
		expect(
			doneById({ ...emptyInput, tracks: annotatedTracks(target, 100) })[
				'add-bpm-key'
			]
		).toBe(true)
	})

	it('derives crate and saved-set steps from counts and reports completion', () => {
		const checklist = deriveFirstRunChecklist({
			isDiscogsConnected: true,
			records: [{ discogs_id: 1 }],
			tracks: annotatedTracks(1, 1),
			crateCount: 1,
			savedSetCount: 1
		})
		expect(checklist.completedCount).toBe(5)
		expect(checklist.isComplete).toBe(true)
	})
})

describe('first-run checklist dismissal storage', () => {
	afterEach(() => {
		vi.unstubAllGlobals()
	})

	function stubStorage(storage: Partial<Storage>) {
		vi.stubGlobal('window', { localStorage: storage })
	}

	it('round-trips the dismissal through localStorage', () => {
		const stored = new Map<string, string>()
		stubStorage({
			getItem: (key) => stored.get(key) ?? null,
			setItem: (key, value) => void stored.set(key, value)
		})
		expect(readFirstRunChecklistDismissed()).toBe(false)
		expect(writeFirstRunChecklistDismissed()).toBe(true)
		expect(stored.get(FIRST_RUN_CHECKLIST_DISMISSED_STORAGE_KEY)).toBe('1')
		expect(readFirstRunChecklistDismissed()).toBe(true)
	})

	it('reports storage failures instead of throwing', () => {
		stubStorage({
			getItem: () => {
				throw new DOMException('denied', 'SecurityError')
			},
			setItem: () => {
				throw new DOMException('full', 'QuotaExceededError')
			}
		})
		expect(readFirstRunChecklistDismissed()).toBe(false)
		expect(writeFirstRunChecklistDismissed()).toBe(false)
	})
})
