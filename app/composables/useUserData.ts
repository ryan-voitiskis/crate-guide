import { toast } from 'vue-sonner'

export function useUserData() {
	const user = useUserStore()
	const records = useRecordsStore()
	const tracks = useTracksStore()
	const crates = useCratesStore()

	const isLoadingUserData = ref(false)
	const hasLoadedData = ref(false)

	const isLoadingAny = computed(
		() =>
			records.isLoadingRecords ||
			tracks.isLoadingTracks ||
			crates.isLoadingCrates ||
			isLoadingUserData.value
	)

	const hasAnyData = computed(
		() => records.hasRecords || tracks.hasTracks || crates.hasCrates
	)

	async function loadAllUserData() {
		if (!user.supaUser?.id) return
		if (hasLoadedData.value) {
			toast.error('User data already loaded')
			return
		}

		isLoadingUserData.value = true

		try {
			const [recordsResult, tracksResult, cratesResult] =
				await Promise.allSettled([
					records.fetchAllRecords(),
					tracks.fetchAllTracks(),
					crates.fetchAllCrates()
				])

			const failures = []
			if (recordsResult.status === 'rejected') failures.push('records')
			if (tracksResult.status === 'rejected') failures.push('tracks')
			if (cratesResult.status === 'rejected') failures.push('crates')

			if (failures.length > 0)
				toast.error(`Failed to load: ${failures.join(', ')}`)
			else hasLoadedData.value = true
		} catch (error) {
			toast.error('Error loading user data.')
		} finally {
			isLoadingUserData.value = false
		}
	}

	async function refreshAllUserData() {
		hasLoadedData.value = false
		await loadAllUserData()
	}

	function clearAllUserData() {
		records.clearRecords()
		tracks.clearTracks()
		crates.clearCrates()
		hasLoadedData.value = false
	}

	// Auto-load data when user signs in
	watchEffect(() => {
		if (user.supaUser?.id && !hasLoadedData.value) {
			loadAllUserData()
		}
	})

	// Clear data when user signs out
	watch(
		() => user.supaUser,
		(newUser) => {
			if (!newUser) {
				clearAllUserData()
			}
		}
	)

	return {
		isLoadingUserData,
		isLoadingAny,
		hasLoadedData,
		hasAnyData,
		loadAllUserData,
		refreshAllUserData,
		clearAllUserData
	}
}
