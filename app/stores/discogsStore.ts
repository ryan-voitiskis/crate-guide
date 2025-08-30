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
			// Step 1: Check for existing records and filter them out early
			const existingDiscogsIds = await getExistingDiscogsIds(selectedReleases)

			// Add skipped records to results
			selectedReleases.forEach((release) => {
				if (existingDiscogsIds.has(release.id)) {
					importResults.value.skipped.push({
						label: getResultLabel(release)
					})
				}
			})

			// Filter out existing releases before fetching details
			const releasesToFetch = selectedReleases.filter(
				(r) => !existingDiscogsIds.has(r.id)
			)

			// Step 2: Fetch full release details only for non-existing releases
			const fullReleases: DiscogsReleaseFull[] = []

			for (let i = 0; i < releasesToFetch.length; i++) {
				releaseBeingImported.value = releasesToFetch[i] || null
				if (!releaseBeingImported.value) break
				importProgress.value = Math.round((i / releasesToFetch.length) * 100)
				try {
					const url = `${DISCOGS_API_URL}releases/${releaseBeingImported.value.id}`
					const { data, error } = await supabase.functions.invoke(
						'authenticated-discogs-request',
						{ body: JSON.stringify({ httpMethod: 'GET', url }) }
					)

					if (error) {
						importResults.value.failed.push({
							label: getResultLabel(releaseBeingImported.value),
							error: error.message
						})
						continue
					}

					fullReleases.push(data)
				} catch (e) {
					importResults.value.failed.push({
						label: getResultLabel(releaseBeingImported.value),
						error: isError(e) ? e.message : 'Unknown error'
					})
				}
			}

			// Step 3: Transform and insert all fetched records (already filtered)
			for (const release of fullReleases) {
				try {
					await importRecordWithTracks(release, user.profile!.id)
					importResults.value.successful++
				} catch (e) {
					importResults.value.failed.push({
						label: getResultLabelFromFullRelease(release),
						error: isError(e) ? e.message : 'Failed to import'
					})
				}
			}
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
