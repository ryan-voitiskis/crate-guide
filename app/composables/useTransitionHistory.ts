import { type ComputedRef, computed, onMounted, toRaw } from 'vue'
import {
	EMPTY_TRANSITION_HISTORY,
	type TransitionHistoryIndex,
	buildTransitionHistoryIndex
} from '~/utils/transitionHistory'
import type { LibrarySavedSet } from '~~/shared/types/library'

// The session store replaces its `savedSets` array on every change (save,
// delete, fetch, account reset) and never mutates it in place, so the raw
// array identity is a safe cache key. One build is shared by every deck and
// the inspector until the saved sets change.
const indexBySavedSets = new WeakMap<
	readonly LibrarySavedSet[],
	TransitionHistoryIndex
>()

export function getTransitionHistoryForSavedSets(
	savedSets: readonly LibrarySavedSet[]
): TransitionHistoryIndex {
	const raw = toRaw(savedSets)
	if (raw.length === 0) return EMPTY_TRANSITION_HISTORY
	let index = indexBySavedSets.get(raw)
	if (!index) {
		index = buildTransitionHistoryIndex(raw)
		indexBySavedSets.set(raw, index)
	}
	return index
}

/**
 * Transition pair history from the workspace's saved sets. The live session
 * reaches it through auto-save, which keeps the active set current.
 */
export function useTransitionHistory(): ComputedRef<TransitionHistoryIndex> {
	const session = useWorkbenchSessionStore()
	return computed(() => getTransitionHistoryForSavedSets(session.savedSets))
}

/**
 * Pages other than the session page do not load saved sets. On mount, ask the
 * session store for them once when the workspace keeps sessions and none are
 * loaded. `fetchSavedSets` already shares an in-flight request.
 */
export function useSavedSetsOnMount() {
	const session = useWorkbenchSessionStore()
	const capabilities = useWorkbenchCapabilities()
	onMounted(() => {
		if (
			capabilities.canPersistSessions &&
			session.savedSets.length === 0 &&
			!session.isLoadingSets
		) {
			void session.fetchSavedSets()
		}
	})
}
