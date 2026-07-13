import { toast } from 'vue-sonner'
import { isPublicRoute } from '../utils/authRoutes'

export function useUserData() {
	const user = useUserStore()
	const records = useRecordsStore()
	const tracks = useTracksStore()
	const crates = useCratesStore()
	const session = useSessionStore()
	const discogs = useDiscogsStore()
	const route = useRoute()
	const router = useRouter()

	const isLoadingUserData = ref(false)
	const hasLoadedData = ref(false)
	let loadPromise: Promise<boolean> | null = null
	let authenticationGeneration = 0
	let dataUserId: string | null = null
	let isReplacingProtectedRoute = false

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
				clearLibraryData()
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
				clearLibraryData()
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
				clearLibraryData()
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

	function clearLibraryData() {
		records.clearRecords()
		tracks.clearTracks()
		crates.clearCrates()
		hasLoadedData.value = false
		dataUserId = null
	}

	function clearAllUserData() {
		clearLibraryData()
		session.resetAccountState()
		discogs.resetAccountState()
	}

	async function leaveProtectedRoute() {
		if (isPublicRoute(route.path) || isReplacingProtectedRoute) return
		isReplacingProtectedRoute = true
		try {
			await router.replace('/login')
		} catch (error) {
			console.error('Failed to leave protected route:', error)
		} finally {
			isReplacingProtectedRoute = false
		}
	}

	watch(
		() => ({
			isSigningOut: user.isSigningOut,
			userId: user.supaUser?.id ?? null
		}),
		({ isSigningOut, userId }, previousState) => {
			const previousUserId = previousState?.userId ?? null
			const didUserIdChange = userId !== previousUserId
			if (!didUserIdChange) {
				if (!userId && previousState?.isSigningOut && !isSigningOut)
					void leaveProtectedRoute()
				return
			}
			if (userId) {
				const didAuthenticatedUserChange = Boolean(
					previousUserId && previousUserId !== userId
				)
				const hasDataForDifferentUser =
					dataUserId !== null && dataUserId !== userId
				if (didAuthenticatedUserChange || hasDataForDifferentUser) {
					authenticationGeneration += 1
					clearAllUserData()
				}
				if (hasLoadedData.value) return
				void loadAllUserData()
			} else if (previousUserId) {
				authenticationGeneration += 1
				clearAllUserData()
				if (!isSigningOut) void leaveProtectedRoute()
			}
		},
		{ flush: 'sync', immediate: true }
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
