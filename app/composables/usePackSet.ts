import { toast } from 'vue-sonner'
import {
	type PackSetResult,
	type PackSetTarget,
	describePackSetResult,
	packRecordsIntoCrate
} from '~/utils/packSet'
import { collectSetRecordIds } from '~/utils/setPlanner'

/** Session-page wiring for "Pack this set". */
export function usePackSet() {
	const session = useWorkbenchSessionStore()
	const tracks = useWorkbenchTracksStore()
	const crates = useWorkbenchCratesStore()
	const capabilities = useWorkbenchCapabilities()
	const runtime = useWorkbenchRuntime()

	const isPacking = ref(false)
	const canPack = computed(
		() => capabilities.canManageCrates && !runtime.descriptor.value.readOnly
	)
	const setRecords = computed(() =>
		collectSetRecordIds(session.currentSession, (trackId) =>
			tracks.getTrackById(trackId)
		)
	)
	const activeSetName = computed(() => {
		const id = session.activeSetId
		return id
			? (session.savedSets.find((savedSet) => savedSet.id === id)?.name ?? null)
			: null
	})

	async function pack(target: PackSetTarget): Promise<PackSetResult | null> {
		if (!canPack.value || isPacking.value) return null
		const recordIds = [...setRecords.value.recordIds]
		if (recordIds.length === 0) return null
		isPacking.value = true
		try {
			const result = await packRecordsIntoCrate(crates, recordIds, target)
			if (!result) {
				// createCrate reports its own failures; a vanished target does not.
				if (target.kind === 'existing') toast.error('Crate not found.')
				return null
			}
			const message = describePackSetResult(result)
			if (result.failed > 0) toast.warning(message)
			else toast.success(message)
			return result
		} finally {
			isPacking.value = false
		}
	}

	return {
		isPacking: readonly(isPacking),
		canPack,
		setRecords,
		activeSetName,
		crates: computed(() => crates.crates),
		pack
	}
}
