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
	let cleanupStartedUserId: string | null = null
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
		const reactiveUserId = user.supaUserId
		const didAuthenticationChange = loadGeneration !== authenticationGeneration
		const didUserIdentityChange =
			reactiveUserId !== null && reactiveUserId !== resolvedUserId

		return didAuthenticationChange || didUserIdentityChange
			? { replacementUserId: reactiveUserId }
			: null
	}

	function startCoverCleanup(userId: string, loadGeneration: number) {
		cleanupStartedUserId = userId
		void records.drainCoverCleanup().then(
			(didComplete) => {
				if (
					didComplete ||
					cleanupStartedUserId !== userId ||
					getStaleLoadTransition(userId, loadGeneration)
				)
					return
				cleanupStartedUserId = null
			},
			() => {
				if (
					cleanupStartedUserId === userId &&
					!getStaleLoadTransition(userId, loadGeneration)
				)
					cleanupStartedUserId = null
			}
		)
	}

	async function performLoadAllUserData(
		loadGeneration: number
	): Promise<boolean> {
		let resolvedUserId: string | null = null
		let storePromises: Promise<boolean>[] | null = null

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
				return false
			}
			const didLoadAllData = results.every(Boolean)
			hasLoadedData.value = didLoadAllData
			if (
				didLoadAllData &&
				cleanupStartedUserId !== resolvedUserId &&
				!getStaleLoadTransition(resolvedUserId, loadGeneration)
			) {
				startCoverCleanup(resolvedUserId, loadGeneration)
			}
			return didLoadAllData
		} catch (error) {
			// Drain every started store action before a replacement user load begins.
			if (storePromises) await Promise.allSettled(storePromises)
			const staleTransition = resolvedUserId
				? getStaleLoadTransition(resolvedUserId, loadGeneration)
				: null
			if (staleTransition) {
				return false
			}
			console.error('Failed to load user data:', error)
			toast.error('Error loading user data.')
			return false
		}
	}

	function loadAllUserData(): Promise<boolean> {
		if (loadPromise) return loadPromise
		if (hasLoadedData.value) return Promise.resolve(true)

		const loadGeneration = authenticationGeneration
		isLoadingUserData.value = true
		const createdPromise = performLoadAllUserData(loadGeneration).finally(
			() => {
				if (loadPromise !== createdPromise) return
				loadPromise = null
				if (loadGeneration === authenticationGeneration)
					isLoadingUserData.value = false
			}
		)
		loadPromise = createdPromise
		return createdPromise
	}

	async function bootstrapLoadFromSession() {
		if (user.supaUserId || hasLoadedData.value || isLoadingUserData.value)
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
		authenticationGeneration += 1
		loadPromise = null
		isLoadingUserData.value = false
		records.clearRecords()
		tracks.clearTracks()
		crates.clearCrates()
		hasLoadedData.value = false
		dataUserId = null
		cleanupStartedUserId = null
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
			userId: user.supaUserId
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
					clearAllUserData()
				}
				if (hasLoadedData.value) return
				void loadAllUserData()
			} else if (previousUserId) {
				clearAllUserData()
				if (!isSigningOut) void leaveProtectedRoute()
			}
		},
		{ flush: 'sync', immediate: true }
	)

	// Attempt initial load on app bootstrap only when a persisted session exists
	// but the reactive Supabase user hasn't hydrated yet.
	if (!user.supaUserId) void bootstrapLoadFromSession()

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
