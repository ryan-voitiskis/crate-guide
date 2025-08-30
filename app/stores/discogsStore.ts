import { toast } from 'vue-sonner'

export const useDiscogsStore = defineStore('discogs', () => {
	const user = useUserStore()
	const supabase = useSupabaseClient<Database>()
	const folders = ref<DiscogsFolder[]>([])
	const selectedFolder = ref<string | undefined>(undefined)
	const releasesToImport = ref<DiscogsReleaseToFilter[]>([])
	const releaseBeingImported = ref<DiscogsReleaseToFilter | null>(null)

	const isLoadingFolders = ref(false)
	const isLoadingSelectedFolder = ref(false)

	const showFilterDialog = ref(false)
	const showImportProgressDialog = ref(false)
	const showGetFoldersDialog = ref(false)

	// Import progress and results
	const importProgress = ref(0)
	const isImporting = ref(false)
	const importResults = ref<{
		successful: number
		skipped: { label: string }[]
		failed: { label: string; error: string }[]
	}>({ successful: 0, skipped: [], failed: [] })

	async function getFolders() {
		isLoadingFolders.value = true
		folders.value = []
		try {
			const url = `${DISCOGS_API_URL}users/${user.profile?.discogs_username}/collection/folders`
			const { data, error } = await supabase.functions.invoke(
				'authenticated-discogs-request',
				{ body: JSON.stringify({ httpMethod: 'GET', url }) }
			)
			if (error) throw error
			if (!data.folders) toast.error('No folders found.')
			else folders.value = data.folders
		} catch (error) {
			toast.error('Error fetching folders.')
		} finally {
			isLoadingFolders.value = false
		}
	}

	async function getSelectedFolder() {
		if (!selectedFolder.value) return
		const folder = folders.value.find((f) => f.name === selectedFolder.value)
		if (!folder) return
		isLoadingSelectedFolder.value = true
		try {
			const url = `${DISCOGS_API_URL}users/${user.profile?.discogs_username}/collection/folders/${folder.id}/releases`
			const releases: DiscogsRelease[] = []
			let allReleasesFetched = false
			let page = 1
			while (!allReleasesFetched) {
				const { data, error } = await supabase.functions.invoke(
					'authenticated-discogs-request',
					{
						body: JSON.stringify({
							httpMethod: 'GET',
							url,
							page,
							per_page: 100
						})
					}
				)
				if (error) throw error
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

	async function importSelectedReleases() {
		const selectedReleases = releasesToImport.value.filter((r) => r.selected)
		if (selectedReleases.length === 0) {
			toast.error('No releases selected for import')
			return
		}
		showFilterDialog.value = false
		showImportProgressDialog.value = true

		isImporting.value = true
		importProgress.value = 0
		importResults.value = { successful: 0, skipped: [], failed: [] }

		try {
			// Step 1: Handle existing releases
			const { releasesToFetch, skipped } =
				await processExistingReleases(selectedReleases)
			importResults.value.skipped = skipped

			// Step 2: Fetch details with progress tracking
			const { releases, failed: fetchFailed } = await fetchReleaseDetails(
				releasesToFetch,
				(progress, current) => {
					importProgress.value = progress
					releaseBeingImported.value = current
				}
			)
			importResults.value.failed.push(...fetchFailed)

			// Step 3: Import to database
			const { successful, failed: importFailed } = await importFetchedReleases(
				releases,
				user.profile!.id
			)
			importResults.value.successful = successful
			importResults.value.failed.push(...importFailed)
		} finally {
			isImporting.value = false
			importProgress.value = 0
		}
	}

	return {
		folders,
		releasesToImport,
		isLoadingFolders,
		isLoadingSelectedFolder,
		selectedFolder,
		showFilterDialog,
		importProgress,
		isImporting,
		importResults,
		getFolders,
		getSelectedFolder,
		importSelectedReleases,
		showImportProgressDialog,
		showGetFoldersDialog,
		releaseBeingImported
	}
})
