import { toast } from 'vue-sonner'

export function useUserData() {
	const user = useUserStore()
	const records = useRecordsStore()
	const tracks = useTracksStore()
	const crates = useCratesStore()

	const isLoadingUserData = ref(false)
	const hasLoadedData = ref(false)
	let loadPromise: Promise<boolean> | null = null
	let authenticationGeneration = 0
	let dataUserId: string | null = null

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

	function getStaleLoadTransition(
		resolvedUserId: string,
		loadGeneration: number
	): { replacementUserId: string | null } | null {
		const reactiveUserId = user.supaUser?.id ?? null
		const didAuthenticationChange = loadGeneration !== authenticationGeneration
		const didUserIdentityChange =
			reactiveUserId !== null && reactiveUserId !== resolvedUserId

		return didAuthenticationChange || didUserIdentityChange
			? { replacementUserId: reactiveUserId }
			: null
	}

	async function performLoadAllUserData(): Promise<boolean> {
		const loadGeneration = authenticationGeneration
		let resolvedUserId: string | null = null
		let reloadUserId: string | null = null
		let storePromises: Promise<boolean>[] | null = null
		isLoadingUserData.value = true

		try {
			resolvedUserId = await user
				.resolveAuthenticatedUserId()
				.catch(() => null as string | null)
			if (!resolvedUserId) return false
			const transitionBeforeFetch = getStaleLoadTransition(
				resolvedUserId,
				loadGeneration
			)
			if (transitionBeforeFetch) {
				reloadUserId = transitionBeforeFetch.replacementUserId
				clearAllUserData()
				return false
			}

			dataUserId = resolvedUserId
			storePromises = []
			storePromises.push(records.fetchAllRecords())
			storePromises.push(tracks.fetchAllTracks())
			storePromises.push(crates.fetchAllCrates())
			const results = await Promise.all(storePromises)
			const transitionAfterFetch = getStaleLoadTransition(
				resolvedUserId,
				loadGeneration
			)
			if (transitionAfterFetch) {
				reloadUserId = transitionAfterFetch.replacementUserId
				clearAllUserData()
				return false
			}
			const didLoadAllData = results.every(Boolean)
			hasLoadedData.value = didLoadAllData
			return didLoadAllData
		} catch (error) {
			// Drain every started store action before a replacement user load begins.
			if (storePromises) await Promise.allSettled(storePromises)
			const staleTransition = resolvedUserId
				? getStaleLoadTransition(resolvedUserId, loadGeneration)
				: null
			if (staleTransition) {
				reloadUserId = staleTransition.replacementUserId
				clearAllUserData()
				return false
			}
			console.error('Failed to load user data:', error)
			toast.error('Error loading user data.')
			return false
		} finally {
			isLoadingUserData.value = false
			loadPromise = null
			if (reloadUserId) {
				const expectedUserId = reloadUserId
				void Promise.resolve().then(() => {
					if (
						user.supaUser?.id === expectedUserId &&
						!hasLoadedData.value &&
						!loadPromise
					)
						void loadAllUserData()
				})
			}
		}
	}

	function loadAllUserData(): Promise<boolean> {
		if (loadPromise) return loadPromise
		if (hasLoadedData.value) return Promise.resolve(true)

		loadPromise = performLoadAllUserData()
		return loadPromise
	}

	async function bootstrapLoadFromSession() {
		if (user.supaUser?.id || hasLoadedData.value || isLoadingUserData.value)
			return
		const userId = await user
			.resolveAuthenticatedUserId()
			.catch(() => null as string | null)
		if (!userId) return
		await loadAllUserData()
	}

	function refreshAllUserData(): Promise<boolean> {
		hasLoadedData.value = false
		return loadAllUserData()
	}

	function clearAllUserData() {
		records.clearRecords()
		tracks.clearTracks()
		crates.clearCrates()
		hasLoadedData.value = false
		dataUserId = null
	}

	watch(
		() => user.supaUser?.id,
		(userId, previousUserId) => {
			if (userId) {
				const didUserIdChange = Boolean(
					previousUserId && previousUserId !== userId
				)
				const hasDataForDifferentUser =
					dataUserId !== null && dataUserId !== userId
				if (didUserIdChange || hasDataForDifferentUser) {
					authenticationGeneration += 1
					clearAllUserData()
				}
				if (hasLoadedData.value) return
				void loadAllUserData()
			} else if (previousUserId) {
				authenticationGeneration += 1
				clearAllUserData()
			}
		},
		{ immediate: true }
	)

	// Attempt initial load on app bootstrap only when a persisted session exists
	// but the reactive Supabase user hasn't hydrated yet.
	if (!user.supaUser?.id) void bootstrapLoadFromSession()

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
