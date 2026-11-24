export type QuickSetField = 'bpm' | 'key'

export const QUICK_SET_FIELDS: readonly QuickSetField[] = ['bpm', 'key']

export type QuickSetProposal =
	{ field: 'bpm'; bpm: number } | { field: 'key'; composite: string }

/**
 * - `conflict`: the server rejected the write; the latest version is loaded.
 * - `conflict-unrefreshed`: the write was rejected and the latest version
 *   could not be loaded.
 * - `not-sent`: the write was queued behind one that needs a refresh, so it
 *   was held back rather than sent with a version known to be stale.
 * - `failed`: the write failed for another reason.
 */
export type QuickSetIssueKind =
	'conflict' | 'conflict-unrefreshed' | 'not-sent' | 'failed'

export type QuickSetIssue = {
	kind: QuickSetIssueKind
	/** The value the user asked for, kept so it can be retried explicitly. */
	proposal: QuickSetProposal
}

export type QuickSetEntry = {
	pending: Record<QuickSetField, boolean>
	/** Rejected proposals, kept independently per field. */
	issues: Record<QuickSetField, QuickSetIssue | null>
	/** Writes stay disabled until the track's latest version has been loaded. */
	needsRefresh: boolean
}

/**
 * Per-track quick-set feedback that outlives the panels showing it. A panel
 * can unmount mid-write (the record dialog moves to the next track, a page
 * swaps layouts) and the result must still reach whichever surface shows that
 * track next. Writes for one track are serialized here so a second field can
 * build on the version acknowledged by this tab's own preceding write.
 */
export const useTrackQuickSetStore = defineStore('trackQuickSet', () => {
	const entries = ref<Record<string, QuickSetEntry>>({})
	const queues = new Map<string, Promise<void>>()
	const acknowledgedVersions = new Map<string, Map<string, string>>()

	function ensureEntry(trackId: string): QuickSetEntry {
		if (!entries.value[trackId]) {
			entries.value[trackId] = {
				pending: { bpm: false, key: false },
				issues: { bpm: null, key: null },
				needsRefresh: false
			}
		}
		return entries.value[trackId]!
	}

	/** A new write for a field supersedes only that field's rejected value. */
	function beginWrite(trackId: string, field: QuickSetField) {
		const entry = ensureEntry(trackId)
		entry.pending[field] = true
		entry.issues[field] = null
	}

	function finishWrite(
		trackId: string,
		field: QuickSetField,
		issue: QuickSetIssue | null
	) {
		const entry = ensureEntry(trackId)
		entry.pending[field] = false
		if (!issue) return
		entry.issues[field] = issue
		if (issue.kind !== 'conflict-unrefreshed') return
		entry.needsRefresh = true
		// The track has moved on again and could not be reloaded, so an earlier
		// conflict on the other field no longer shows the latest values either.
		for (const other of QUICK_SET_FIELDS) {
			const previous = entry.issues[other]
			if (other !== field && previous?.kind === 'conflict') {
				entry.issues[other] = { ...previous, kind: 'conflict-unrefreshed' }
			}
		}
	}

	function dismissIssue(trackId: string, field: QuickSetField) {
		const entry = entries.value[trackId]
		if (!entry || entry.needsRefresh) return
		entry.issues[field] = null
	}

	function markRefreshed(trackId: string) {
		const entry = entries.value[trackId]
		if (!entry) return
		entry.needsRefresh = false
		for (const field of QUICK_SET_FIELDS) {
			const issue = entry.issues[field]
			if (
				issue &&
				(issue.kind === 'conflict-unrefreshed' || issue.kind === 'not-sent')
			) {
				// The latest version is now shown, so the value can be retried.
				entry.issues[field] = { ...issue, kind: 'conflict' }
			}
		}
	}

	function hasActivity(trackId: string): boolean {
		const entry = entries.value[trackId]
		if (!entry) return false
		return QUICK_SET_FIELDS.some(
			(field) => entry.pending[field] || entry.issues[field] !== null
		)
	}

	function acknowledgeVersion(
		trackId: string,
		fromVersion: string | null | undefined,
		toVersion: string | null | undefined
	) {
		if (!fromVersion || !toVersion || fromVersion === toVersion) return
		let versions = acknowledgedVersions.get(trackId)
		if (!versions) {
			versions = new Map()
			acknowledgedVersions.set(trackId, versions)
		}
		versions.set(fromVersion, toVersion)
	}

	/**
	 * Maps a version the user saw to the version this tab's own queued writes
	 * produced from it. The server still rejects the write if anyone else has
	 * changed the track since.
	 */
	function resolveVersion(
		trackId: string,
		version: string | null
	): string | null {
		const versions = acknowledgedVersions.get(trackId)
		if (!versions || !version) return version
		let resolved = version
		const seen = new Set<string>()
		while (versions.has(resolved) && !seen.has(resolved)) {
			seen.add(resolved)
			resolved = versions.get(resolved)!
		}
		return resolved
	}

	function enqueue<T>(trackId: string, task: () => Promise<T>): Promise<T> {
		const previous = queues.get(trackId) ?? Promise.resolve()
		const run = previous.then(task)
		const completion = run.then(
			() => undefined,
			() => undefined
		)
		queues.set(trackId, completion)
		void completion.then(() => {
			if (queues.get(trackId) !== completion) return
			queues.delete(trackId)
			acknowledgedVersions.delete(trackId)
		})
		return run
	}

	return {
		entries,
		beginWrite,
		finishWrite,
		dismissIssue,
		markRefreshed,
		hasActivity,
		acknowledgeVersion,
		resolveVersion,
		enqueue
	}
})
