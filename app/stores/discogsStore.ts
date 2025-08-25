import { toast } from 'vue-sonner'
import { defineStore } from 'pinia'

const API_URL = 'https://api.discogs.com/'

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
		skipped: { title: string; artists: string }[]
		failed: { title: string; artists: string; error: string }[]
	}>({ successful: 0, skipped: [], failed: [] })

	async function getFolders() {
		isLoadingFolders.value = true
		folders.value = []
		try {
			const url = `${API_URL}users/${user.profile?.discogs_username}/collection/folders`
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
			const url = `${API_URL}users/${user.profile?.discogs_username}/collection/folders/${folder.id}/releases`
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
			// Step 1: Fetch full release details for each selected release
			const fullReleases: DiscogsReleaseFull[] = []

			for (let i = 0; i < selectedReleases.length; i++) {
				releaseBeingImported.value = selectedReleases[i] || null
				if (!releaseBeingImported.value) break
				importProgress.value = Math.round((i / selectedReleases.length) * 100)
				try {
					const url = `${API_URL}releases/${releaseBeingImported.value.id}`
					const { data, error } = await supabase.functions.invoke(
						'authenticated-discogs-request',
						{ body: JSON.stringify({ httpMethod: 'GET', url }) }
					)

					if (error) {
						// TODO: Handle individual fetch errors - add to failed list
						// For now, we'll continue with other releases
						importResults.value.failed.push({
							title: releaseBeingImported.value.basic_information.title,
							artists: releaseBeingImported.value.basic_information.artists
								?.map((a: any) => a.name)
								.join(', '),
							error: 'Failed to fetch release details'
						})
						continue
					}

					fullReleases.push(data)
				} catch (e) {
					// TODO: More granular error handling for rate limits, 404s, etc.
					importResults.value.failed.push({
						title: releaseBeingImported.value.basic_information.title,
						artists: releaseBeingImported.value.basic_information.artists
							.map((a: any) => a.name)
							.join(', '),
						error: isError(e) ? e.message : 'Unknown error'
					})
				}
			}

			// Step 2: Check for existing records and filter out duplicates
			const discogsIds = fullReleases.map((r) => r.id)
			const { data: existingRecords } = await supabase
				.from('records')
				.select('discogs_id, title, artists')
				.in('discogs_id', discogsIds)

			const existingDiscogsIds = new Set(
				existingRecords?.map((r) => r.discogs_id) || []
			)

			// Add skipped records to results
			fullReleases.forEach((release) => {
				if (existingDiscogsIds.has(release.id)) {
					importResults.value.skipped.push({
						title: release.title,
						artists: release.artists
							.map((a: any) => normalizeArtist(a.name))
							.join(', ')
					})
				}
			})

			// Filter out existing releases
			const releasesToProcess = fullReleases.filter(
				(r) => !existingDiscogsIds.has(r.id)
			)

			// Step 3: Transform and batch insert records with tracks
			const batchSize = 10 // Process 10 records at a time
			let processedCount = 0

			for (let i = 0; i < releasesToProcess.length; i += batchSize) {
				const batch = releasesToProcess.slice(i, i + batchSize)

				for (const release of batch) {
					try {
						// Transform the release data
						const transformedRecord = transformRelease(
							release,
							user.profile!.id
						)

						// Insert record and tracks in a transaction
						const { data: insertedRecord, error: recordError } = await supabase
							.from('records')
							.insert({
								user_id: transformedRecord.user_id,
								discogs_id: transformedRecord.discogs_id,
								catno: transformedRecord.catno,
								title: transformedRecord.title,
								artists: transformedRecord.artists,
								label: transformedRecord.label,
								year: transformedRecord.year,
								cover: transformedRecord.cover
							})
							.select()
							.single()

						if (recordError) throw recordError

						// Insert tracks for this record
						if (transformedRecord.tracks.length > 0) {
							const tracksToInsert = transformedRecord.tracks.map((track) => ({
								...track,
								record_id: insertedRecord.id
							}))

							const { error: tracksError } = await supabase
								.from('tracks')
								.insert(tracksToInsert)

							if (tracksError) {
								// Rollback: delete the record if tracks fail
								await supabase
									.from('records')
									.delete()
									.eq('id', insertedRecord.id)
								throw tracksError
							}
						}

						importResults.value.successful++
					} catch (e) {
						importResults.value.failed.push({
							title: release.title,
							artists: release.artists
								.map((a: any) => normalizeArtist(a.name))
								.join(', '),
							error: isError(e) ? e.message : 'Failed to import'
						})
					}
				}

				processedCount += batch.length
				importProgress.value =
					50 + Math.round((processedCount / releasesToProcess.length) * 50) // Second 50% for importing
			}
		} finally {
			isImporting.value = false
			importProgress.value = 0
		}
	}

	// Helper function to transform Discogs release to our schema
	function transformRelease(release: DiscogsReleaseFull, userId: string) {
		const positionRx = /^[A-Z]\d{1,2}$/
		const positionRx2 = /^[A-Z]{1,20}$/ // some discogs position in format "AA", "AAA" etc.
		const titleSuffixableRoles = [
			'mix',
			'remix',
			're-mix',
			're-edit',
			'edit',
			'dub',
			'version'
		]

		return {
			user_id: userId,
			discogs_id: release.id,
			catno: release.labels?.[0]?.catno?.trim() || null,
			title: release.title.trim(),
			artists: release.artists
				.map((a: any) => normalizeArtist(a.name))
				.join(', '),
			label:
				release.labels?.[0]?.name?.trim().replace(/ \(\d{1,3}\)$/, '') || null,
			year: release.year || null,
			cover:
				release.images?.find((img: any) => img.type === 'primary')
					?.resource_url ||
				release.images?.[0]?.resource_url ||
				null,
			tracks:
				release.tracklist?.map((track: any) => {
					const extraArtists = track.extraartists || []
					const extraArtistsSuffixable = extraArtists.find((ea: any) =>
						titleSuffixableRoles.includes(ea.role?.toLowerCase())
					)

					// Build title with suffix if applicable
					let title = track.title?.trim() || 'Untitled'
					if (extraArtistsSuffixable && !title.endsWith(')')) {
						title = `${title} (${normalizeArtist(extraArtistsSuffixable.name)} ${extraArtistsSuffixable.role})`
					}

					// Build artists string
					const artists =
						track.artists?.map((a: any) => normalizeArtist(a.name)) || []
					const allArtists = [
						...artists,
						...extraArtists.map((ea: any) => normalizeArtist(ea.name))
					]

					// Process position
					let position = null
					if (track.position) {
						if (positionRx.test(track.position)) {
							position = track.position
						} else if (positionRx2.test(track.position)) {
							position = track.position[0] + track.position.length.toString()
						}
					}

					return {
						title,
						artists: allArtists.join(', ') || null,
						position,
						duration: parseDuration(track.duration) || null,
						bpm: null, // To be fetched from Spotify later
						rpm: release.formats?.[0]?.descriptions?.toString().includes('45')
							? 45
							: 33,
						key: null,
						mode: null,
						genre: release.styles?.join(', ') || null,
						time_signature_upper: null,
						time_signature_lower: null,
						playable: true,
						spotify_id: null
					}
				}) || []
		}
	}

	// Helper function to normalize artist names
	function normalizeArtist(artist: string): string {
		return artist?.trim().replace(/ \(\d{1,3}\)$/, '') || ''
	}

	// Helper function to parse duration string to milliseconds
	function parseDuration(duration: string): number | null {
		if (!duration) return null

		const match = duration.match(/(\d+):(\d+)/)
		if (match) {
			const minutes = parseInt(match[1])
			const seconds = parseInt(match[2])
			return (minutes * 60 + seconds) * 1000
		}
		return null
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
