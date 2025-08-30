import { DISCOGS_API_URL } from '~/utils/discogs-api'
import {
	getExistingDiscogsIds,
	importRecordWithTracks
} from '~/utils/discogs-database'
import {
	getResultLabel,
	getResultLabelFromFullRelease
} from '~/utils/discogs-formatting'

// Types for return values
interface ProcessExistingResult {
	releasesToFetch: DiscogsReleaseToFilter[]
	skipped: Array<{ label: string }>
}

interface FetchDetailsResult {
	releases: DiscogsReleaseFull[]
	failed: Array<{ label: string; error: string }>
}

interface ImportResult {
	successful: number
	failed: Array<{ label: string; error: string }>
}

// Step 1: Process existing releases and filter out duplicates
export async function processExistingReleases(
	selectedReleases: DiscogsReleaseToFilter[]
): Promise<ProcessExistingResult> {
	const existingDiscogsIds = await getExistingDiscogsIds(selectedReleases)

	const skipped: Array<{ label: string }> = []
	selectedReleases.forEach((release) => {
		if (existingDiscogsIds.has(release.id)) {
			skipped.push({
				label: getResultLabel(release)
			})
		}
	})

	const releasesToFetch = selectedReleases.filter(
		(r) => !existingDiscogsIds.has(r.id)
	)

	return { releasesToFetch, skipped }
}

// Step 2: Fetch full release details from Discogs API
export async function fetchReleaseDetails(
	releasesToFetch: DiscogsReleaseToFilter[],
	onProgress: (progress: number, current: DiscogsReleaseToFilter) => void
): Promise<FetchDetailsResult> {
	const supabase = getSupabase()
	const releases: DiscogsReleaseFull[] = []
	const failed: Array<{ label: string; error: string }> = []

	for (let i = 0; i < releasesToFetch.length; i++) {
		const release = releasesToFetch[i]!
		onProgress(Math.round((i / releasesToFetch.length) * 100), release)

		try {
			const url = `${DISCOGS_API_URL}releases/${release.id}`
			const { data, error } = await supabase.functions.invoke(
				'authenticated-discogs-request',
				{ body: JSON.stringify({ httpMethod: 'GET', url }) }
			)

			if (error) {
				failed.push({
					label: getResultLabel(release),
					error: error.message
				})
				continue
			}

			releases.push(data)
		} catch (e) {
			failed.push({
				label: getResultLabel(release),
				error: isError(e) ? e.message : 'Unknown error'
			})
		}
	}

	return { releases, failed }
}

// Step 3: Import fetched releases to database
export async function importFetchedReleases(
	releases: DiscogsReleaseFull[],
	userId: string
): Promise<ImportResult> {
	let successful = 0
	const failed: Array<{ label: string; error: string }> = []

	for (const release of releases) {
		try {
			await importRecordWithTracks(release, userId)
			successful++
		} catch (e) {
			failed.push({
				label: getResultLabelFromFullRelease(release),
				error: isError(e) ? e.message : 'Failed to import'
			})
		}
	}

	return { successful, failed }
}
