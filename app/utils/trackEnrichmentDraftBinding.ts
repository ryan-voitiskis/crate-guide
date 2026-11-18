import type { Ref } from 'vue'
import type { BrowserWorkflowDraft } from '~/repositories/deviceDrafts/contracts'
import type {
	TrackEnrichmentDraftDecision,
	TrackEnrichmentDraftPartialOutcome
} from '~/types/trackEnrichmentDraft'

export type TrackEnrichmentDraftBindingDependencies = {
	hasUnsavedChanges: Ref<boolean>
	saveState: Ref<'idle' | 'saving' | 'saved' | 'failed'>
}

/**
 * The in-memory binding between an open review and its stored device draft:
 * which draft (and revision) it was last saved as, the apply outcomes and
 * approval history to carry into the next save, and the dirty-revision pair
 * that decides whether a save is still owed.
 *
 * Fields stay plain mutable properties so the draft session can keep its
 * existing ordering of reads and writes around every await.
 */
export type TrackEnrichmentDraftBinding = {
	persistedDraft: BrowserWorkflowDraft | null
	draftId: string | null
	draftCreatedAt: string | null
	partialOutcomes: TrackEnrichmentDraftPartialOutcome[]
	attemptedDecisions: readonly TrackEnrichmentDraftDecision[] | null
	/** Increments for every review change that should be saved. */
	dirtyRevision: number
	/** Highest dirty revision known to be stored. */
	persistedDirtyRevision: number
	/** Forget the stored draft, its history, and every dirty revision. */
	reset: () => void
	/** Forget only the stored draft identity, outcomes, and approval history. */
	forgetDraft: () => void
	/** Bind to a stored draft: identity, creation time, and its outcomes. */
	bindStored: (draft: BrowserWorkflowDraft) => void
	/**
	 * Record that the review has changes which could not be saved. Repeated
	 * failures reuse one dirty revision rather than inventing new ones.
	 */
	markFailedDirty: () => void
}

function cloneOutcomes(
	draft: BrowserWorkflowDraft
): TrackEnrichmentDraftPartialOutcome[] {
	return draft.payload.partialOutcomes.map((outcome) =>
		structuredClone(outcome)
	)
}

export function createTrackEnrichmentDraftBinding({
	hasUnsavedChanges,
	saveState
}: TrackEnrichmentDraftBindingDependencies): TrackEnrichmentDraftBinding {
	const binding: TrackEnrichmentDraftBinding = {
		persistedDraft: null,
		draftId: null,
		draftCreatedAt: null,
		partialOutcomes: [],
		attemptedDecisions: null,
		dirtyRevision: 0,
		persistedDirtyRevision: 0,
		reset() {
			binding.forgetDraft()
			binding.dirtyRevision = 0
			binding.persistedDirtyRevision = 0
		},
		forgetDraft() {
			binding.persistedDraft = null
			binding.draftId = null
			binding.draftCreatedAt = null
			binding.partialOutcomes = []
			binding.attemptedDecisions = null
		},
		bindStored(draft) {
			binding.persistedDraft = draft
			binding.draftId = draft.id
			binding.draftCreatedAt = draft.payload.createdAt
			binding.partialOutcomes = cloneOutcomes(draft)
		},
		markFailedDirty() {
			if (!hasUnsavedChanges.value) binding.dirtyRevision += 1
			hasUnsavedChanges.value = true
			saveState.value = 'failed'
		}
	}
	return binding
}
