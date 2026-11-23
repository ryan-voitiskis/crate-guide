import { type MaybeRefOrGetter, computed, ref, toValue } from 'vue'
import {
	type QuickSetField,
	type QuickSetIssue,
	type QuickSetProposal,
	useTrackQuickSetStore
} from '~/stores/trackQuickSetStore'
import { getWheelSegment, getWheelSegmentLabel } from '~/utils/camelotWheel'
import { isBpmInRange } from '~/utils/formatting'
import { parseKeyComposite } from '~/utils/keyFunctions'
import type {
	LibraryKeyFormat,
	LibraryTrack,
	LibraryTrackUpdateInput
} from '~~/shared/types/library'

export type QuickSetIssueView = {
	kind: QuickSetIssue['kind']
	message: string
	canRetry: boolean
	canRefresh: boolean
	canDismiss: boolean
}

export function describeQuickSetProposal(
	proposal: QuickSetProposal,
	keyFormat: LibraryKeyFormat
): string {
	if (proposal.field === 'bpm') return `BPM ${proposal.bpm.toFixed(1)}`
	const segment = getWheelSegment(proposal.composite)
	return segment
		? `key ${getWheelSegmentLabel(segment, keyFormat)}`
		: 'key removal'
}

export function describeQuickSetIssue(
	issue: QuickSetIssue,
	keyFormat: LibraryKeyFormat
): QuickSetIssueView {
	const value = describeQuickSetProposal(issue.proposal, keyFormat)
	switch (issue.kind) {
		case 'conflict':
			return {
				kind: issue.kind,
				message: `This track changed elsewhere, so your ${value} was not saved. The latest saved values are shown.`,
				canRetry: true,
				canRefresh: false,
				canDismiss: true
			}
		case 'conflict-unrefreshed':
			return {
				kind: issue.kind,
				message: `This track changed elsewhere, so your ${value} was not saved. Its latest version could not be loaded. Refresh before trying again.`,
				canRetry: false,
				canRefresh: true,
				canDismiss: false
			}
		case 'failed':
			return {
				kind: issue.kind,
				message: `Your ${value} could not be saved.`,
				canRetry: true,
				canRefresh: false,
				canDismiss: true
			}
	}
}

function updatesFor(proposal: QuickSetProposal): LibraryTrackUpdateInput {
	if (proposal.field === 'bpm') return { bpm: proposal.bpm }
	const { key, mode } = parseKeyComposite(proposal.composite)
	// Key and mode are only ever written as a pair.
	return { key, mode }
}

/**
 * Writes single BPM or key changes for one track through the library store,
 * carrying the version the user saw as a precondition so a stale panel never
 * overwrites another session's edit. Pending state and rejected changes live
 * in a per-track store, so they survive this panel unmounting.
 */
export function useTrackQuickSet(track: MaybeRefOrGetter<LibraryTrack | null>) {
	const tracks = useWorkbenchTracksStore()
	const store = useTrackQuickSetStore(useWorkbenchPinia())
	const refreshing = ref(false)

	const entry = computed(() => {
		const id = toValue(track)?.id
		return id ? (store.entries[id] ?? null) : null
	})
	const pending = computed<Record<QuickSetField, boolean>>(() => ({
		bpm: entry.value?.pending.bpm ?? false,
		key: entry.value?.pending.key ?? false
	}))
	const issue = computed(() => entry.value?.issue ?? null)
	const needsRefresh = computed(() => entry.value?.needsRefresh ?? false)

	function submit(proposal: QuickSetProposal): Promise<LibraryTrack | null> {
		const current = toValue(track)
		if (!current) return Promise.resolve(null)
		const trackId = current.id
		const existing = store.entries[trackId]
		if (existing?.needsRefresh || existing?.pending[proposal.field])
			return Promise.resolve(null)

		const seenVersion = current.updated_at
		store.beginWrite(trackId, proposal.field)
		return store.enqueue(trackId, async () => {
			const expectedUpdatedAt = store.resolveVersion(trackId, seenVersion)
			const outcome: { conflict?: LibraryTrack | null } = {}
			let result: LibraryTrack | null
			try {
				result = await tracks.updateTrack(trackId, updatesFor(proposal), {
					silent: true,
					expectedUpdatedAt,
					onConflict: (latest) => {
						outcome.conflict = latest
					}
				})
			} catch {
				result = null
			}

			if (result) {
				store.acknowledgeVersion(trackId, expectedUpdatedAt, result.updated_at)
				store.finishWrite(trackId, proposal.field, null)
				return result
			}

			const kind =
				'conflict' in outcome
					? outcome.conflict
						? 'conflict'
						: 'conflict-unrefreshed'
					: 'failed'
			store.finishWrite(trackId, proposal.field, { kind, proposal })
			return null
		})
	}

	function setBpm(bpm: number): Promise<LibraryTrack | null> {
		// Defence in depth: never send NaN, which serializes to null.
		if (!Number.isFinite(bpm) || !isBpmInRange(bpm))
			return Promise.resolve(null)
		return submit({ field: 'bpm', bpm })
	}

	function setKey(composite: string): Promise<LibraryTrack | null> {
		const { key } = parseKeyComposite(composite)
		if (key === null && composite !== 'none') return Promise.resolve(null)
		return submit({
			field: 'key',
			composite: key === null ? 'none' : composite
		})
	}

	function retry(): Promise<LibraryTrack | null> {
		const proposal = issue.value?.proposal
		if (!proposal || needsRefresh.value) return Promise.resolve(null)
		return submit(proposal)
	}

	async function refresh(): Promise<boolean> {
		const trackId = toValue(track)?.id
		if (!trackId || refreshing.value) return false
		refreshing.value = true
		try {
			const refreshed = await tracks.fetchAllTracks({ fresh: true })
			if (refreshed) store.markRefreshed(trackId)
			return refreshed
		} finally {
			refreshing.value = false
		}
	}

	function dismiss() {
		const trackId = toValue(track)?.id
		if (trackId) store.dismissIssue(trackId)
	}

	return {
		pending,
		issue,
		needsRefresh,
		refreshing,
		setBpm,
		setKey,
		retry,
		refresh,
		dismiss
	}
}
