import {
	getExistingDiscogsIds,
	importRecordWithTracks
} from '~/utils/discogs-database'
import {
	formatFullReleaseDisplayTitle,
	formatReleaseDisplayTitle
} from '~/utils/discogs-formatting'

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
export async function filterOutExistingReleases(
	selectedReleases: DiscogsReleaseToFilter[]
): Promise<ProcessExistingResult> {
	const existingDiscogsIds = await getExistingDiscogsIds(selectedReleases)

	const skipped: Array<{ label: string }> = []
	selectedReleases.forEach((release) => {
		if (existingDiscogsIds.has(release.id)) {
			skipped.push({
				label: formatReleaseDisplayTitle(release)
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
	const discogsApi = useDiscogsApi()
	const releases: DiscogsReleaseFull[] = []
	const failed: Array<{ label: string; error: string }> = []

	for (let i = 0; i < releasesToFetch.length; i++) {
		const release = releasesToFetch[i]!
		onProgress(Math.round((i / releasesToFetch.length) * 100), release)

		try {
			const data = await discogsApi.getRelease(release.id)
			releases.push(data)
		} catch (e) {
			failed.push({
				label: formatReleaseDisplayTitle(release),
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
			if (!isDiscogsReleaseFull(release))
				throw new Error('Invalid release data structure from Discogs API')

			await importRecordWithTracks(release, userId)
			successful++
		} catch (e) {
			failed.push({
				label: formatFullReleaseDisplayTitle(release),
				error: isError(e) ? e.message : 'Failed to import'
			})
		}
	}

	return { successful, failed }
}
