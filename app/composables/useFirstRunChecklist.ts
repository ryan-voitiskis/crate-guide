import type { Ref } from 'vue'
import {
	deriveFirstRunChecklist,
	readFirstRunChecklistDismissed,
	writeFirstRunChecklistDismissed
} from '~/utils/firstRunChecklist'

/**
 * Derives the Session home first-run checklist from workbench state that is
 * already loaded. `savedSetsReady` must turn true only once the saved-set list
 * is known, so the "Plan a set" step never flashes as incomplete.
 */
export function useFirstRunChecklist(savedSetsReady: Readonly<Ref<boolean>>) {
	const records = useWorkbenchRecordsStore()
	const tracks = useWorkbenchTracksStore()
	const crates = useWorkbenchCratesStore()
	const session = useWorkbenchSessionStore()
	const discogsAuth = useWorkbenchDiscogsAuthStore()
	const runtime = useWorkbenchRuntime()

	// Per-browser convenience state; storage failures keep the dismissal for
	// this page lifetime only.
	const isDismissed = ref(readFirstRunChecklistDismissed())

	const checklist = computed(() =>
		deriveFirstRunChecklist({
			isDiscogsConnected: discogsAuth.isOAuthed,
			records: records.records,
			tracks: tracks.tracks,
			crateCount: crates.crates.length,
			savedSetCount: session.savedSets.length
		})
	)

	const isLibraryLoading = computed(
		() =>
			records.isLoadingRecords ||
			tracks.isLoadingTracks ||
			crates.isLoadingCrates
	)

	// Demo and other read-only workspaces cannot act on any step.
	const isVisible = computed(
		() =>
			runtime.descriptor.value.capabilities.canMutateLibrary &&
			!isDismissed.value &&
			!isLibraryLoading.value &&
			savedSetsReady.value &&
			!checklist.value.isComplete
	)

	function dismiss() {
		isDismissed.value = true
		writeFirstRunChecklistDismissed()
	}

	return { checklist, isVisible, dismiss }
}
