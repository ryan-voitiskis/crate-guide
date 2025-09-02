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
		if (!user.supaUser?.id) {
			console.warn('No user found, skipping data load')
			return
		}

		if (hasLoadedData.value) {
			console.log('User data already loaded')
			return
		}

		isLoadingUserData.value = true

		try {
			// Load all data in parallel since tracks depend on records existing,
			// but we don't need to wait for records to be in state first
			const [recordsResult, tracksResult, cratesResult] =
				await Promise.allSettled([
					records.fetchAllRecords(),
					tracks.fetchAllTracks(),
					crates.fetchAllCrates()
				])

			// Check for any failures
			const failures = []
			if (recordsResult.status === 'rejected') failures.push('records')
			if (tracksResult.status === 'rejected') failures.push('tracks')
			if (cratesResult.status === 'rejected') failures.push('crates')

			if (failures.length > 0) {
				toast.error(`Failed to load: ${failures.join(', ')}`)
			} else {
				hasLoadedData.value = true
				console.log('All user data loaded successfully')
			}
		} catch (error) {
			toast.error('Error loading user data.')
			console.error('Error loading user data:', error)
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
		console.log('All user data cleared')
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
