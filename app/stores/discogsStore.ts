import { toast } from 'vue-sonner'

export const useDiscogsStore = defineStore('discogs', () => {
	const user = useUserStore()
	const discogsApi = useDiscogsApi()
	let accountGeneration = 0
	const folders = ref<DiscogsFolder[]>([])
	const selectedFolder = ref<string | undefined>(undefined)
	const releasesToImport = ref<DiscogsReleaseToFilter[]>([])
	const releaseBeingImported = ref<DiscogsReleaseToFilter | null>(null)

	const isLoadingFolders = ref(false)
	const isLoadingSelectedFolder = ref(false)
	const isDisconnecting = ref(false)

	const showFilterDialog = ref(false)
	const showImportProgressDialog = ref(false)
	const showGetFoldersDialog = ref(false)

	const importProgress = ref(0)
	const isImporting = ref(false)
	const importPhase = ref<'fetching' | 'saving' | null>(null)
	const shouldCancelImport = ref(false)
	const importResults = ref<{
		successful: number
		skipped: { label: string }[]
		failed: { label: string; error: string }[]
	}>({ successful: 0, skipped: [], failed: [] })

	type AccountOperationContext = {
		generation: number
		userId: string
	}

	function currentUserId(): string | null {
		return user.supaUser?.id ?? user.profile?.id ?? null
	}

	function captureAccountContext(): AccountOperationContext | null {
		const userId = currentUserId()
		return userId ? { generation: accountGeneration, userId } : null
	}

	function isCurrentAccountContext(context: AccountOperationContext): boolean {
		return (
			context.generation === accountGeneration &&
			currentUserId() === context.userId
		)
	}

	function resetAccountState() {
		accountGeneration += 1
		shouldCancelImport.value = true
		folders.value = []
		selectedFolder.value = undefined
		releasesToImport.value = []
		releaseBeingImported.value = null
		isLoadingFolders.value = false
		isLoadingSelectedFolder.value = false
		isDisconnecting.value = false
		showFilterDialog.value = false
		showImportProgressDialog.value = false
		showGetFoldersDialog.value = false
		importProgress.value = 0
		isImporting.value = false
		importPhase.value = null
		importResults.value = { successful: 0, skipped: [], failed: [] }
	}

	async function getFolders() {
		const context = captureAccountContext()
		if (!context) return
		isLoadingFolders.value = true
		folders.value = []
		try {
			const data = await discogsApi.getFolders()
			if (!isCurrentAccountContext(context)) return
			if (!data.folders) toast.error('No folders found.')
			else folders.value = data.folders
		} catch (e) {
			if (!isCurrentAccountContext(context)) return
			toast.error(isError(e) ? e.message : 'Error fetching folders.')
		} finally {
			if (isCurrentAccountContext(context)) isLoadingFolders.value = false
		}
	}

	async function fetchFolderReleases() {
		const context = captureAccountContext()
		if (!context) return
		if (!selectedFolder.value) return
		if (isLoadingSelectedFolder.value) return
		const folder = folders.value.find((f) => f.name === selectedFolder.value)
		if (!folder) return
		isLoadingSelectedFolder.value = true
		try {
			const releases: DiscogsRelease[] = []
			let allReleasesFetched = false
			let page = 1
			while (!allReleasesFetched) {
				if (!isCurrentAccountContext(context)) return
				const data = await discogsApi.getFolderReleases(folder.id, page, 100)
				if (!isCurrentAccountContext(context)) return
				if (!data.releases) throw new Error('No releases found.')
				if (!data.pagination) throw new Error('No pagination on response.')
				releases.push(...data.releases)
				allReleasesFetched = page >= data.pagination.pages
				page++
			}
			releasesToImport.value = releases.map((r) => ({ ...r, selected: true }))
			showGetFoldersDialog.value = false
			showFilterDialog.value = true
		} catch (e) {
			if (!isCurrentAccountContext(context)) return
			toast.error(isError(e) ? e.message : 'Error fetching folder.')
		} finally {
			if (isCurrentAccountContext(context)) {
				isLoadingSelectedFolder.value = false
			}
		}
	}

	async function disconnectDiscogs() {
		const context = captureAccountContext()
		if (!user.profile) {
			toast.error('Profile not loaded.')
			return
		}
		if (!context || user.profile.id !== context.userId) return
		isDisconnecting.value = true
		try {
			const supabase = useSupabaseClient<Database>()
			const { error } = await supabase.rpc('disconnect_discogs')
			if (!isCurrentAccountContext(context)) return
			if (error) {
				toast.error('Error disconnecting Discogs.')
				return
			}
			const refreshed = await user.fetchProfile()
			if (!isCurrentAccountContext(context)) return
			if (refreshed) toast.success('Discogs disconnected.')
			else toast.error('Error disconnecting Discogs.')
		} catch {
			if (!isCurrentAccountContext(context)) return
			toast.error('Error disconnecting Discogs.')
		} finally {
			if (isCurrentAccountContext(context)) isDisconnecting.value = false
		}
	}

	function cancelImport() {
		shouldCancelImport.value = true
	}

	async function importSelectedReleases() {
		const context = captureAccountContext()
		const selectedReleases = releasesToImport.value.filter((r) => r.selected)
		if (selectedReleases.length === 0) {
			toast.error('No releases selected for import')
			return
		}
		if (!context || !user.profile || user.profile.id !== context.userId) {
			toast.error('Profile not loaded.')
			return
		}
		showFilterDialog.value = false
		showImportProgressDialog.value = true

		isImporting.value = true
		shouldCancelImport.value = false
		importProgress.value = 0
		importPhase.value = 'fetching'
		importResults.value = { successful: 0, skipped: [], failed: [] }

		try {
			// Step 1: Handle existing releases
			const { releasesToFetch, skipped } =
				await filterOutExistingReleases(selectedReleases)
			if (!isCurrentAccountContext(context)) return
			importResults.value.skipped = skipped

			// Step 2: Fetch details with progress tracking
			const {
				releases,
				failed: fetchFailed,
				cancelled
			} = await fetchReleaseDetails(
				releasesToFetch,
				(progress, current) => {
					if (!isCurrentAccountContext(context)) return
					importProgress.value = progress
					releaseBeingImported.value = current
				},
				() => shouldCancelImport.value || !isCurrentAccountContext(context)
			)
			if (!isCurrentAccountContext(context)) return
			importResults.value.failed.push(...fetchFailed)

			if (cancelled) {
				toast.info('Import of Discogs records cancelled')
				showImportProgressDialog.value = false
				return
			}

			// Step 3: Import to database
			if (!isCurrentAccountContext(context)) return
			importPhase.value = 'saving'
			const { successful, failed: importFailed } = await importFetchedReleases(
				releases,
				context.userId,
				() => shouldCancelImport.value || !isCurrentAccountContext(context)
			)
			if (!isCurrentAccountContext(context)) return
			importResults.value.successful = successful
			importResults.value.failed.push(...importFailed)

			// Refresh local stores with newly imported data
			if (successful > 0) {
				const recordsStore = useRecordsStore()
				const tracksStore = useTracksStore()
				await Promise.all([
					recordsStore.fetchAllRecords(),
					tracksStore.fetchAllTracks()
				])
				if (!isCurrentAccountContext(context)) return
			}
		} finally {
			if (isCurrentAccountContext(context)) {
				isImporting.value = false
				importProgress.value = 0
				importPhase.value = null
				releaseBeingImported.value = null
			}
		}
	}

	watch(showGetFoldersDialog, (newValue) => {
		if (newValue && folders.value.length === 0) getFolders()
	})

	return {
		folders,
		releasesToImport,
		isLoadingFolders,
		isLoadingSelectedFolder,
		isDisconnecting,
		selectedFolder,
		showFilterDialog,
		importProgress,
		isImporting,
		importPhase,
		importResults,
		getFolders,
		fetchFolderReleases,
		importSelectedReleases,
		cancelImport,
		resetAccountState,
		disconnectDiscogs,
		showImportProgressDialog,
		showGetFoldersDialog,
		releaseBeingImported
	}
})
