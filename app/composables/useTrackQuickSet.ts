import { type MaybeRefOrGetter, computed, ref, toValue } from 'vue'
import {
	QUICK_SET_FIELDS,
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
	field: QuickSetField
	kind: QuickSetIssue['kind']
	message: string
	canRetry: boolean
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

/**
 * Describes one rejected field. Recovery actions come from the same state as
 * the write lock: while the track needs a refresh nothing can be retried or
 * dismissed, and the panel offers a single Refresh instead.
 */
export function describeQuickSetIssue(
	issue: QuickSetIssue,
	keyFormat: LibraryKeyFormat,
	needsRefresh: boolean
): QuickSetIssueView {
	const value = describeQuickSetProposal(issue.proposal, keyFormat)
	const base = {
		field: issue.proposal.field,
		kind: issue.kind,
		canRetry: !needsRefresh,
		canDismiss: !needsRefresh
	}
	switch (issue.kind) {
		case 'conflict':
			return {
				...base,
				message: `This track changed elsewhere, so your ${value} was not saved. The latest saved values are shown.`
			}
		case 'conflict-unrefreshed':
			return {
				...base,
				message: `This track changed elsewhere, so your ${value} was not saved. Its latest version could not be loaded.`
			}
		case 'not-sent':
			return {
				...base,
				message: `Your ${value} was not sent because this track has to be refreshed first.`
			}
		case 'failed':
			return { ...base, message: `Your ${value} could not be saved.` }
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
	const issues = computed<QuickSetIssue[]>(() =>
		QUICK_SET_FIELDS.flatMap((field) => {
			const issue = entry.value?.issues[field]
			return issue ? [issue] : []
		})
	)
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
			// An earlier write in this queue may have found the track stale and
			// unloadable. Hold this one back instead of sending a stale version.
			if (store.entries[trackId]?.needsRefresh) {
				store.finishWrite(trackId, proposal.field, {
					kind: 'not-sent',
					proposal
				})
				return null
			}

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

	function retry(field: QuickSetField): Promise<LibraryTrack | null> {
		const proposal = entry.value?.issues[field]?.proposal
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

	function dismiss(field: QuickSetField) {
		const trackId = toValue(track)?.id
		if (trackId) store.dismissIssue(trackId, field)
	}

	return {
		pending,
		issues,
		needsRefresh,
		refreshing,
		setBpm,
		setKey,
		retry,
		refresh,
		dismiss
	}
}
