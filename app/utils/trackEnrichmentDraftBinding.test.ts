import { ref } from 'vue'
import { describe, expect, it } from 'vitest'
import type { BrowserWorkflowDraft } from '~/repositories/deviceDrafts/contracts'
import type { TrackEnrichmentDraftPartialOutcome } from '~/types/trackEnrichmentDraft'
import { createTrackEnrichmentDraftBinding } from './trackEnrichmentDraftBinding'

const outcome: TrackEnrichmentDraftPartialOutcome = {
	intentKind: 'fill-empty-fields',
	sourceFingerprint: 'source-1',
	targetTrackId: 'track-1',
	status: 'succeeded',
	applied: { bpm: true, keyMode: false },
	attemptedAt: '2026-07-23T01:00:00.000Z',
	failureCode: null
}

function storedDraft(): BrowserWorkflowDraft {
	return {
		id: 'draft-1',
		kind: 'track-enrichment',
		draftRevision: 2,
		updatedAt: '2026-07-23T02:00:00.000Z',
		payload: {
			id: 'draft-1',
			createdAt: '2026-07-23T00:00:00.000Z',
			partialOutcomes: [outcome]
		}
	} as unknown as BrowserWorkflowDraft
}

function createBinding() {
	const hasUnsavedChanges = ref(false)
	const saveState = ref<'idle' | 'saving' | 'saved' | 'failed'>('idle')
	return {
		binding: createTrackEnrichmentDraftBinding({
			hasUnsavedChanges,
			saveState
		}),
		hasUnsavedChanges,
		saveState
	}
}

describe('createTrackEnrichmentDraftBinding', () => {
	it('binds a stored draft without sharing its outcome objects', () => {
		const { binding } = createBinding()
		const draft = storedDraft()
		binding.attemptedDecisions = []

		binding.bindStored(draft)

		expect(binding.persistedDraft).toBe(draft)
		expect(binding.draftId).toBe('draft-1')
		expect(binding.draftCreatedAt).toBe('2026-07-23T00:00:00.000Z')
		expect(binding.partialOutcomes).toEqual([outcome])
		expect(binding.partialOutcomes[0]).not.toBe(outcome)
		// Approval history belongs to the in-memory review, not the stored row.
		expect(binding.attemptedDecisions).toEqual([])
	})

	it('forgets the stored draft without touching dirty revisions', () => {
		const { binding } = createBinding()
		binding.bindStored(storedDraft())
		binding.attemptedDecisions = []
		binding.dirtyRevision = 4
		binding.persistedDirtyRevision = 3

		binding.forgetDraft()

		expect(binding).toMatchObject({
			persistedDraft: null,
			draftId: null,
			draftCreatedAt: null,
			partialOutcomes: [],
			attemptedDecisions: null,
			dirtyRevision: 4,
			persistedDirtyRevision: 3
		})
	})

	it('resets every binding field including dirty revisions', () => {
		const { binding } = createBinding()
		binding.bindStored(storedDraft())
		binding.dirtyRevision = 4
		binding.persistedDirtyRevision = 3

		binding.reset()

		expect(binding).toMatchObject({
			persistedDraft: null,
			draftId: null,
			partialOutcomes: [],
			dirtyRevision: 0,
			persistedDirtyRevision: 0
		})
	})

	it('marks unsaved failure once per dirty period', () => {
		const { binding, hasUnsavedChanges, saveState } = createBinding()

		binding.markFailedDirty()
		binding.markFailedDirty()

		expect(binding.dirtyRevision).toBe(1)
		expect(hasUnsavedChanges.value).toBe(true)
		expect(saveState.value).toBe('failed')
	})
})
