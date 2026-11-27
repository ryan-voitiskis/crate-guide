import { type ComputedRef, computed, onMounted, toRaw } from 'vue'
import type { WorkspaceOperationContext } from '~/repositories/library/contracts'
import {
	EMPTY_TRANSITION_HISTORY,
	type TransitionHistoryIndex,
	buildTransitionHistoryIndex
} from '~/utils/transitionHistory'
import type { WorkbenchRuntime } from '~/utils/workbenchPinia'
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

// Last workspace activation whose saved sets a page outside the session page
// loaded successfully, per runtime. Keyed by activation rather than by
// `savedSets.length` so an empty library is not refetched on every mount and
// sets left over from another account (whose reset ran while no workbench was
// mounted) are replaced on first use.
const loadedActivationByRuntime = new WeakMap<WorkbenchRuntime, string>()

function activationKey(context: WorkspaceOperationContext): string {
	return `${context.workspaceId}\u0000${context.repositoryId}\u0000${context.activationGeneration}`
}

/**
 * Pages other than the session page do not load saved sets. On mount, ask the
 * session store for them once per workspace activation when the workspace
 * keeps sessions. `fetchSavedSets` shares an in-flight request for the same
 * workspace. A successful fetch always publishes a new `savedSets` array and a
 * failed one leaves it untouched, so an unchanged array means "retry on the
 * next mount".
 */
export function useSavedSetsOnMount() {
	const session = useWorkbenchSessionStore()
	const runtime = useWorkbenchRuntime()
	onMounted(async () => {
		const captured = runtime.capture()
		if (
			!captured.descriptor.capabilities.canPersistSessions ||
			captured.descriptor.readOnly
		)
			return
		const key = activationKey(captured.context)
		if (loadedActivationByRuntime.get(runtime) === key) return

		const before = toRaw(session.savedSets)
		await session.fetchSavedSets()
		if (
			toRaw(session.savedSets) !== before &&
			runtime.isCurrent(captured.context)
		) {
			loadedActivationByRuntime.set(runtime, key)
		}
	})
}
