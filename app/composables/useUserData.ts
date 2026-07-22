import { toast } from 'vue-sonner'
import { isPublicRoute } from '../utils/authRoutes'

export function useUserData() {
	const user = useUserStore()
	const records = useRecordsStore()
	const tracks = useTracksStore()
	const crates = useCratesStore()
	const session = useSessionStore()
	const preferences = useLibraryPreferencesStore()
	const discogs = useDiscogsStore()
	const runtime = useWorkbenchRuntime()
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
			preferences.isLoadingPreferences ||
			isLoadingUserData.value
	)

	const hasAnyData = computed(
		() => records.hasRecords || tracks.hasTracks || crates.hasCrates
	)

	function isStaleLoad(
		context: ReturnType<typeof runtime.capture>['context'],
		location: ReturnType<typeof runtime.capture>['descriptor']['location'],
		resolvedUserId: string,
		loadGeneration: number
	): boolean {
		if (!runtime.isCurrent(context)) return true
		if (location !== 'cloud') return false
		const reactiveUserId = user.supaUserId
		const didAuthenticationChange = loadGeneration !== authenticationGeneration
		const didUserIdentityChange =
			reactiveUserId !== null && reactiveUserId !== resolvedUserId

		return didAuthenticationChange || didUserIdentityChange
	}

	async function performLoadAllUserData(
		loadGeneration: number
	): Promise<boolean> {
		const captured = runtime.capture()
		let resolvedUserId = ''
		let storePromises: Promise<boolean>[] | null = null

		try {
			if (captured.descriptor.location === 'cloud') {
				resolvedUserId = await user.resolveAuthenticatedUserId().catch(() => '')
				if (!resolvedUserId) return false
			}
			if (
				isStaleLoad(
					captured.context,
					captured.descriptor.location,
					resolvedUserId,
					loadGeneration
				)
			) {
				return false
			}

			dataUserId =
				captured.descriptor.location === 'cloud' ? resolvedUserId : null
			storePromises = [
				records.fetchAllRecords(),
				tracks.fetchAllTracks(),
				crates.fetchAllCrates(),
				preferences.fetchPreferences()
			]
			const results = await Promise.all(storePromises)
			if (
				isStaleLoad(
					captured.context,
					captured.descriptor.location,
					resolvedUserId,
					loadGeneration
				)
			) {
				return false
			}
			const didLoadAllData = results.every(Boolean)
			hasLoadedData.value = didLoadAllData
			if (
				didLoadAllData &&
				captured.descriptor.location === 'cloud' &&
				!isStaleLoad(
					captured.context,
					captured.descriptor.location,
					resolvedUserId,
					loadGeneration
				)
			) {
				void records.drainCoverCleanup().catch(() => undefined)
			}
			return didLoadAllData
		} catch (error) {
			// Drain every started store action before a replacement user load begins.
			if (storePromises) await Promise.allSettled(storePromises)
			if (
				isStaleLoad(
					captured.context,
					captured.descriptor.location,
					resolvedUserId,
					loadGeneration
				)
			) {
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
		if (runtime.descriptor.value.location !== 'cloud') {
			if (!hasLoadedData.value && !isLoadingUserData.value) {
				await loadAllUserData()
			}
			return
		}
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
		preferences.clearPreferences()
		hasLoadedData.value = false
		dataUserId = null
	}

	function clearAllUserData(outgoingUserId: string | null = user.supaUserId) {
		clearLibraryData()
		session.resetAccountState()
		discogs.resetAccountState(outgoingUserId)
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
				if (runtime.descriptor.value.location !== 'cloud') {
					if (previousUserId && previousUserId !== userId)
						discogs.resetAccountState(previousUserId)
					return
				}
				const didAuthenticatedUserChange = Boolean(
					previousUserId && previousUserId !== userId
				)
				const hasDataForDifferentUser =
					dataUserId !== null && dataUserId !== userId
				if (didAuthenticatedUserChange || hasDataForDifferentUser) {
					clearAllUserData(previousUserId)
				}
				if (hasLoadedData.value) return
				void loadAllUserData()
			} else if (previousUserId) {
				if (runtime.descriptor.value.location === 'cloud') {
					clearAllUserData(previousUserId)
				} else {
					discogs.resetAccountState(previousUserId)
				}
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
