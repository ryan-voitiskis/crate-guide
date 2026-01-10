import { toast } from 'vue-sonner'

export const useDiscogsStore = defineStore('discogs', () => {
	const user = useUserStore()
	const discogsApi = useDiscogsApi()
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

	async function getFolders() {
		isLoadingFolders.value = true
		folders.value = []
		try {
			const data = await discogsApi.getFolders()
			if (!data.folders) toast.error('No folders found.')
			else folders.value = data.folders
		} catch (e) {
			toast.error(isError(e) ? e.message : 'Error fetching folders.')
		} finally {
			isLoadingFolders.value = false
		}
	}

	async function fetchFolderReleases() {
		if (!selectedFolder.value) return
		const folder = folders.value.find((f) => f.name === selectedFolder.value)
		if (!folder) return
		isLoadingSelectedFolder.value = true
		try {
			const releases: DiscogsRelease[] = []
			let allReleasesFetched = false
			let page = 1
			while (!allReleasesFetched) {
				const data = await discogsApi.getFolderReleases(folder.id, page, 100)
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
			toast.error(isError(e) ? e.message : 'Error fetching folder.')
		} finally {
			isLoadingSelectedFolder.value = false
		}
	}

	async function disconnectDiscogs() {
		isDisconnecting.value = true
		try {
			const supabase = useSupabaseClient<Database>()
			const { data, error } = await supabase
				.from('profiles')
				.update({
					discogs_username: null,
					discogs_request_token: null,
					discogs_request_secret: null,
					discogs_access_token: null,
					discogs_access_secret: null,
					discogs_avatar_url: null
				})
				.eq('id', user.profile!.id)
				.select()
			if (error) {
				toast.error('Error disconnecting Discogs.')
			} else if (data && data.length > 0) {
				toast.success('Discogs disconnected.')
				user.profile = data[0] as Profile
			}
		} catch (error) {
			toast.error('Error disconnecting Discogs.')
		} finally {
			isDisconnecting.value = false
		}
	}

	function cancelImport() {
		shouldCancelImport.value = true
	}

	async function importSelectedReleases() {
		const selectedReleases = releasesToImport.value.filter((r) => r.selected)
		if (selectedReleases.length === 0) {
			toast.error('No releases selected for import')
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
			importResults.value.skipped = skipped

			// Step 2: Fetch details with progress tracking
			const {
				releases,
				failed: fetchFailed,
				cancelled
			} = await fetchReleaseDetails(
				releasesToFetch,
				(progress, current) => {
					importProgress.value = progress
					releaseBeingImported.value = current
				},
				() => shouldCancelImport.value
			)
			importResults.value.failed.push(...fetchFailed)

			if (cancelled) {
				toast.info('Import of Discogs records cancelled')
				showImportProgressDialog.value = false
				return
			}

			// Step 3: Import to database
			importPhase.value = 'saving'
			const { successful, failed: importFailed } = await importFetchedReleases(
				releases,
				user.profile!.id
			)
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
			}
		} finally {
			isImporting.value = false
			importProgress.value = 0
			importPhase.value = null
			releaseBeingImported.value = null
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
		disconnectDiscogs,
		showImportProgressDialog,
		showGetFoldersDialog,
		releaseBeingImported
	}
})
