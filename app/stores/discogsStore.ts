import { toast } from 'vue-sonner'
import { defineStore } from 'pinia'

const API_URL = 'https://api.discogs.com/'

// Type for RPC function result
interface ImportRecordResult {
	success?: boolean
	record_id?: string
	tracks_inserted?: number
	error?: string
}

// Type guard to validate RPC result
function isValidImportResult(result: unknown): result is ImportRecordResult {
	return (
		typeof result === 'object' &&
		result !== null &&
		'success' in result &&
		typeof (result as any).success === 'boolean'
	)
}

// Helper to handle import result validation
function validateImportResult(result: unknown): ImportRecordResult {
	if (!isValidImportResult(result))
		throw new Error('Invalid response from import function')
	if (result.success !== true) throw new Error(result.error || 'Import failed')
	return result
}

// Helper to check for existing records by Discogs IDs
async function getExistingDiscogsIds(
	fullReleases: DiscogsReleaseFull[],
	supabase: any
): Promise<Set<number>> {
	const discogsIds = fullReleases.map((r) => r.id)

	const { data: existingRecords } = await supabase
		.from('records')
		.select('discogs_id')
		.in('discogs_id', discogsIds)

	return new Set(
		existingRecords?.map((r: { discogs_id: number }) => r.discogs_id) || []
	)
}

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

			// Step 2: Check for existing records and filter out duplicates
			const existingDiscogsIds = await getExistingDiscogsIds(
				fullReleases,
				supabase
			)

			// Add skipped records to results
			if (existingDiscogsIds)
				fullReleases.forEach((release) => {
					if (existingDiscogsIds.has(release.id))
						importResults.value.skipped.push({
							label: getResultLabelFromFullRelease(release)
						})
				})

			// Filter out existing releases
			const releasesToProcess = fullReleases.filter(
				(r) => !existingDiscogsIds.has(r.id)
			)

			// Step 3: Transform and insert records with tracks using RPC
			for (const release of releasesToProcess) {
				try {
					// Transform the release data
					const transformedRecord = transformRelease(release, user.profile!.id)

					// Separate tracks from record data
					const { tracks, ...record } = transformedRecord

					// Insert record and tracks in a single transaction using RPC
					const { data: result, error: rpcError } = await supabase.rpc(
						'import_record_with_tracks',
						{ record, tracks }
					)

					if (rpcError) throw rpcError

					// Validate the import result
					validateImportResult(result)

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
			title: release.title.trim(),
			artists: release.artists.map((a: any) => ({
				discogs_id: a.id,
				name: normalizeArtist(a.name),
				role: a.roll || null
			})),
			labels:
				release.labels?.map((label: any) => ({
					discogs_id: label.id,
					name: label.name?.trim().replace(/ \(\d{1,3}\)$/, '') || '',
					catno: label.catno?.trim() || '',
					entity_type: label.entity_type || '',
					thumbnail_url: label.thumbnail_url || ''
				})) || [],
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

					// Build track artists array
					const trackArtists =
						track.artists?.map((a: any) => ({
							discogs_id: a.id,
							name: normalizeArtist(a.name),
							role: a.role || null
						})) || []

					// If track has no artists, inherit from record artists
					const finalTrackArtists =
						trackArtists.length > 0
							? trackArtists
							: release.artists.map((a: any) => ({
									discogs_id: a.id,
									name: normalizeArtist(a.name),
									role: a.role || null
								}))

					// Build extraartists array
					const trackExtraArtists = extraArtists.map((ea: any) => ({
						discogs_id: ea.id || null,
						name: normalizeArtist(ea.name),
						role: ea.role || null
					}))

					// Process position
					let position = null
					if (track.position) {
						if (positionRx.test(track.position)) position = track.position
						else if (positionRx2.test(track.position))
							position = track.position[0] + track.position.length.toString()
					}

					return {
						title,
						artists: finalTrackArtists,
						extraartists: trackExtraArtists,
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
						playable: true
					}
				}) || []
		}
	}

	function getResultLabel(release: DiscogsReleaseToFilter): string {
		return release.basic_information.labels[0]?.catno
			? `${release.basic_information.labels[0].catno} - ${release.basic_information.title}`
			: `${release.basic_information.title}`
	}

	function getResultLabelFromFullRelease(release: DiscogsReleaseFull): string {
		return release.labels[0]?.catno
			? `${release.labels[0].catno} - ${release.title}`
			: `${release.title}`
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
			const minutes = parseInt(match[1]!)
			const seconds = parseInt(match[2]!)
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
