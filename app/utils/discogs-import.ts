import type {
	DiscogsImportFailure,
	DiscogsReleaseFull,
	DiscogsReleaseToFilter
} from '../../shared/types/discogs'
import type {
	ExternalRecordImportResult,
	ExternalRecordWithTracksInput
} from '../../shared/types/library'
import { transformReleaseDomain } from './discogs-data'
import {
	canManuallyRetryDiscogsError,
	createDiscogsRequestContext,
	isDiscogsApiError
} from './discogs-errors'
import {
	calculateDiscogsRetryDelay,
	waitForDiscogsRetry
} from './discogs-retry'

interface ProcessExistingResult {
	releasesToFetch: DiscogsReleaseToFilter[]
	skipped: Array<{ label: string }>
}

export type DiscogsReleaseTarget =
	| DiscogsReleaseToFilter
	| { id: number; label: string }

interface FetchDetailsResult {
	releases: DiscogsReleaseFull[]
	failed: DiscogsImportFailure[]
	cancelled: boolean
}

interface ImportResult {
	successful: number
	skipped: Array<{
		label: string
		releaseId: number
		reason: 'duplicate' | 'cancelled'
	}>
	confirmedReleaseIds: number[]
	failed: DiscogsImportFailure[]
}

export type FindExistingDiscogsIds = (
	discogsIds: readonly number[]
) => Promise<Set<number>>

export type ImportExternalRecord = (
	input: ExternalRecordWithTracksInput
) => Promise<ExternalRecordImportResult>

interface FetchAttemptStatus {
	target: DiscogsReleaseTarget
	attempt: number
	maxAttempts: number
	waitingMs: number | null
}

interface FetchReleaseDetailsOptions {
	maxAttempts?: number
	onAttemptStatus?: (status: FetchAttemptStatus) => void
	random?: () => number
	sleep?: (delay: number) => Promise<void>
}

function targetLabel(target: DiscogsReleaseTarget): string {
	return 'label' in target ? target.label : formatReleaseDisplayTitle(target)
}

// Step 1: Process existing releases and filter out duplicates
export async function filterOutExistingReleases(
	selectedReleases: DiscogsReleaseToFilter[],
	findExistingDiscogsIds: FindExistingDiscogsIds
): Promise<ProcessExistingResult> {
	const existingDiscogsIds = await findExistingDiscogsIds(
		selectedReleases.map((release) => release.id)
	)

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
	releasesToFetch: DiscogsReleaseTarget[],
	onProgress: (progress: number, current: DiscogsReleaseTarget) => void,
	shouldCancel: () => boolean = () => false,
	options: FetchReleaseDetailsOptions = {}
): Promise<FetchDetailsResult> {
	const discogsApi = useDiscogsApi()
	const releases: DiscogsReleaseFull[] = []
	const failed: DiscogsImportFailure[] = []
	const maxAttempts = Math.min(3, Math.max(1, options.maxAttempts ?? 3))
	const sleep = options.sleep

	for (let i = 0; i < releasesToFetch.length; i++) {
		if (shouldCancel()) {
			return { releases, failed, cancelled: true }
		}

		const release = releasesToFetch[i]!
		onProgress(Math.round(((i + 1) / releasesToFetch.length) * 100), release)
		const requestId = crypto.randomUUID()

		for (let attempt = 1; attempt <= maxAttempts; attempt++) {
			if (shouldCancel()) {
				return { releases, failed, cancelled: true }
			}
			options.onAttemptStatus?.({
				target: release,
				attempt,
				maxAttempts,
				waitingMs: null
			})

			try {
				const data = await discogsApi.getRelease(
					release.id,
					createDiscogsRequestContext(attempt, requestId)
				)
				releases.push(data)
				break
			} catch (error) {
				const shouldRetryAutomatically =
					isDiscogsApiError(error) && error.retryable && attempt < maxAttempts
				if (shouldRetryAutomatically) {
					const waitingMs = calculateDiscogsRetryDelay(
						attempt,
						error.retryAfterMs,
						options.random
					)
					options.onAttemptStatus?.({
						target: release,
						attempt: attempt + 1,
						maxAttempts,
						waitingMs
					})
					const completedWait = await waitForDiscogsRetry(
						waitingMs,
						shouldCancel,
						sleep
					)
					if (!completedWait) {
						return { releases, failed, cancelled: true }
					}
					continue
				}

				failed.push({
					releaseId: release.id,
					label: targetLabel(release),
					error: isDiscogsApiError(error)
						? error.message
						: 'Discogs could not fetch this release.',
					code: isDiscogsApiError(error) ? error.code : 'unknown_error',
					stage: 'fetch',
					retryable: canManuallyRetryDiscogsError(error),
					attempts: attempt,
					...(isDiscogsApiError(error) && error.requestId
						? { requestId: error.requestId }
						: {})
				})
				break
			}
		}

		// Discogs rate limit: 60 req/min, 1 req/sec burst
		if (i < releasesToFetch.length - 1) {
			const completedWait = await waitForDiscogsRetry(1000, shouldCancel, sleep)
			if (!completedWait) return { releases, failed, cancelled: true }
		}
	}

	return { releases, failed, cancelled: false }
}

// Step 3: Import fetched releases to database
export async function importFetchedReleases(
	releases: DiscogsReleaseFull[],
	importExternalRecord: ImportExternalRecord,
	shouldCancel: () => boolean = () => false
): Promise<ImportResult> {
	let successful = 0
	const skipped: ImportResult['skipped'] = []
	const confirmedReleaseIds: number[] = []
	const failed: DiscogsImportFailure[] = []

	for (const [index, release] of releases.entries()) {
		if (shouldCancel()) {
			skipped.push(
				...releases.slice(index).map((unattempted) => ({
					label: formatFullReleaseDisplayTitle(unattempted),
					releaseId: unattempted.id,
					reason: 'cancelled' as const
				}))
			)
			break
		}
		try {
			if (!isDiscogsReleaseFull(release))
				throw new Error('Invalid release data structure from Discogs API')

			const result = await importExternalRecord(transformReleaseDomain(release))
			confirmedReleaseIds.push(release.id)
			if (result.inserted) successful++
			else {
				skipped.push({
					label: formatFullReleaseDisplayTitle(release),
					releaseId: release.id,
					reason: 'duplicate'
				})
			}
		} catch {
			failed.push({
				releaseId: release.id,
				label: formatFullReleaseDisplayTitle(release),
				error: 'Could not save this record to your library.',
				code: 'database_write_failed',
				stage: 'save',
				retryable: true,
				attempts: 1
			})
		}
	}

	return { successful, skipped, confirmedReleaseIds, failed }
}
