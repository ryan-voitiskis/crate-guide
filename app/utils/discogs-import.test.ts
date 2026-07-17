import {
	createMockDiscogsRelease,
	createMockDiscogsReleaseFull,
	resetReleaseIdCounter
} from 'test/mocks/fixtures/discogs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DiscogsApiError } from './discogs-errors'
// Import after mocking
import {
	fetchReleaseDetails,
	filterOutExistingReleases,
	importFetchedReleases
} from './discogs-import'

// Mock dependencies - need to stub globals for Nuxt auto-imports
const mockGetExistingDiscogsIds = vi.fn()
const mockGetRelease = vi.fn()
const mockImportRecordWithTracks = vi.fn()
const mockFormatReleaseDisplayTitle = vi.fn(
	(r) => r.basic_information?.title || 'Unknown'
)
const mockFormatFullReleaseDisplayTitle = vi.fn((r) => r.title || 'Unknown')
const mockIsError = vi.fn((e) => e instanceof Error)
const mockIsDiscogsReleaseFull = vi.fn(() => true)

// Stub all auto-imported functions
vi.stubGlobal('getExistingDiscogsIds', mockGetExistingDiscogsIds)
vi.stubGlobal('formatReleaseDisplayTitle', mockFormatReleaseDisplayTitle)
vi.stubGlobal(
	'formatFullReleaseDisplayTitle',
	mockFormatFullReleaseDisplayTitle
)
vi.stubGlobal('isError', mockIsError)
vi.stubGlobal('isDiscogsReleaseFull', mockIsDiscogsReleaseFull)
vi.stubGlobal('importRecordWithTracks', mockImportRecordWithTracks)
vi.stubGlobal('useDiscogsApi', () => ({
	getRelease: mockGetRelease
}))

// Helper to create a selectable release (with selected: true)
function createSelectableRelease(
	overrides?: Parameters<typeof createMockDiscogsRelease>[0]
) {
	const release = createMockDiscogsRelease(overrides)
	return { ...release, selected: true }
}

describe('filterOutExistingReleases', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		resetReleaseIdCounter()
	})

	it('returns all releases when none exist in database', async () => {
		mockGetExistingDiscogsIds.mockResolvedValue(new Set())

		const releases = [
			createSelectableRelease({ id: 1 }),
			createSelectableRelease({ id: 2 }),
			createSelectableRelease({ id: 3 })
		]

		const result = await filterOutExistingReleases(releases)

		expect(result.releasesToFetch).toHaveLength(3)
		expect(result.skipped).toHaveLength(0)
	})

	it('filters out releases that already exist in database', async () => {
		mockGetExistingDiscogsIds.mockResolvedValue(new Set([1, 3]))

		const releases = [
			createSelectableRelease({ id: 1 }),
			createSelectableRelease({ id: 2 }),
			createSelectableRelease({ id: 3 })
		]

		const result = await filterOutExistingReleases(releases)

		expect(result.releasesToFetch).toHaveLength(1)
		expect(result.releasesToFetch[0]?.id).toBe(2)
		expect(result.skipped).toHaveLength(2)
	})

	it('includes formatted label in skipped items', async () => {
		mockGetExistingDiscogsIds.mockResolvedValue(new Set([1]))

		const releases = [
			createSelectableRelease({
				id: 1,
				basic_information: {
					id: 1,
					title: 'Test Album',
					year: 2024,
					thumb: '',
					cover_image: '',
					formats: [],
					labels: [
						{
							id: 1,
							name: 'Test Label',
							catno: 'TL001',
							entity_type: '',
							entity_type_name: '',
							resource_url: ''
						}
					],
					artists: [],
					genres: [],
					styles: []
				}
			})
		]

		const result = await filterOutExistingReleases(releases)

		expect(result.skipped).toHaveLength(1)
		expect(result.skipped[0]?.label).toBeDefined()
	})

	it('handles empty input array', async () => {
		mockGetExistingDiscogsIds.mockResolvedValue(new Set())

		const result = await filterOutExistingReleases([])

		expect(result.releasesToFetch).toHaveLength(0)
		expect(result.skipped).toHaveLength(0)
	})

	it('handles all releases already existing', async () => {
		mockGetExistingDiscogsIds.mockResolvedValue(new Set([1, 2, 3]))

		const releases = [
			createSelectableRelease({ id: 1 }),
			createSelectableRelease({ id: 2 }),
			createSelectableRelease({ id: 3 })
		]

		const result = await filterOutExistingReleases(releases)

		expect(result.releasesToFetch).toHaveLength(0)
		expect(result.skipped).toHaveLength(3)
	})
})

describe('fetchReleaseDetails', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		resetReleaseIdCounter()
	})

	it('fetches all releases successfully', async () => {
		const fullRelease1 = createMockDiscogsReleaseFull({ id: 1 })
		const fullRelease2 = createMockDiscogsReleaseFull({ id: 2 })

		mockGetRelease
			.mockResolvedValueOnce(fullRelease1)
			.mockResolvedValueOnce(fullRelease2)

		const releases = [
			createSelectableRelease({ id: 1 }),
			createSelectableRelease({ id: 2 })
		]
		const onProgress = vi.fn()

		const result = await fetchReleaseDetails(releases, onProgress)

		expect(result.releases).toHaveLength(2)
		expect(result.failed).toHaveLength(0)
		expect(result.cancelled).toBe(false)
		expect(onProgress).toHaveBeenCalledTimes(2)
	})

	it('reports progress correctly', async () => {
		mockGetRelease.mockResolvedValue(createMockDiscogsReleaseFull())

		const releases = [
			createSelectableRelease({ id: 1 }),
			createSelectableRelease({ id: 2 }),
			createSelectableRelease({ id: 3 }),
			createSelectableRelease({ id: 4 })
		]
		const onProgress = vi.fn()

		await fetchReleaseDetails(releases, onProgress)

		expect(onProgress).toHaveBeenCalledWith(25, expect.any(Object)) // 1/4 = 25%
		expect(onProgress).toHaveBeenCalledWith(50, expect.any(Object)) // 2/4 = 50%
		expect(onProgress).toHaveBeenCalledWith(75, expect.any(Object)) // 3/4 = 75%
		expect(onProgress).toHaveBeenCalledWith(100, expect.any(Object)) // 4/4 = 100%
	})

	it('handles fetch failures gracefully', async () => {
		mockGetRelease
			.mockResolvedValueOnce(createMockDiscogsReleaseFull({ id: 1 }))
			.mockRejectedValueOnce(
				new DiscogsApiError('Release rejected.', {
					code: 'discogs_request_rejected',
					retryable: false,
					status: 400
				})
			)
			.mockResolvedValueOnce(createMockDiscogsReleaseFull({ id: 3 }))

		const releases = [
			createSelectableRelease({ id: 1 }),
			createSelectableRelease({ id: 2 }),
			createSelectableRelease({ id: 3 })
		]
		const onProgress = vi.fn()

		const result = await fetchReleaseDetails(releases, onProgress)

		expect(result.releases).toHaveLength(2)
		expect(result.failed).toHaveLength(1)
		expect(result.failed[0]).toMatchObject({
			releaseId: 2,
			error: 'Release rejected.',
			code: 'discogs_request_rejected',
			stage: 'fetch',
			retryable: false,
			attempts: 1
		})
		expect(result.cancelled).toBe(false)
	})

	it('handles unknown error types', async () => {
		mockGetRelease
			.mockResolvedValueOnce(createMockDiscogsReleaseFull({ id: 1 }))
			.mockRejectedValueOnce('String error') // Not an Error instance

		const releases = [
			createSelectableRelease({ id: 1 }),
			createSelectableRelease({ id: 2 })
		]
		const onProgress = vi.fn()

		const result = await fetchReleaseDetails(releases, onProgress)

		expect(result.failed).toHaveLength(1)
		expect(result.failed[0]).toMatchObject({
			error: 'Discogs could not fetch this release.',
			code: 'unknown_error',
			retryable: true
		})
	})

	it('retries transient failures with a stable request id', async () => {
		mockGetRelease
			.mockRejectedValueOnce(
				new DiscogsApiError('Discogs is temporarily unavailable.', {
					code: 'discogs_unavailable',
					retryable: true,
					status: 503
				})
			)
			.mockResolvedValueOnce(createMockDiscogsReleaseFull({ id: 1 }))
		const onAttemptStatus = vi.fn()
		const sleep = vi.fn().mockResolvedValue(undefined)

		const result = await fetchReleaseDetails(
			[createSelectableRelease({ id: 1 })],
			vi.fn(),
			() => false,
			{ onAttemptStatus, random: () => 0.5, sleep }
		)

		expect(result).toMatchObject({
			releases: [expect.objectContaining({ id: 1 })],
			failed: [],
			cancelled: false
		})
		expect(mockGetRelease).toHaveBeenCalledTimes(2)
		const firstContext = mockGetRelease.mock.calls[0]?.[1]
		const secondContext = mockGetRelease.mock.calls[1]?.[1]
		expect(firstContext).toMatchObject({ attempt: 1 })
		expect(secondContext).toMatchObject({
			attempt: 2,
			requestId: firstContext.requestId
		})
		expect(onAttemptStatus).toHaveBeenCalledWith(
			expect.objectContaining({
				attempt: 2,
				maxAttempts: 3,
				waitingMs: 1500
			})
		)
		expect(sleep).toHaveBeenCalled()
	})

	it('honours Retry-After and records exhausted attempts', async () => {
		mockGetRelease.mockRejectedValue(
			new DiscogsApiError('Discogs is receiving too many requests.', {
				code: 'discogs_rate_limited',
				retryable: true,
				status: 429,
				retryAfterMs: 5000,
				requestId: 'request-reference'
			})
		)
		const onAttemptStatus = vi.fn()

		const result = await fetchReleaseDetails(
			[createSelectableRelease({ id: 1 })],
			vi.fn(),
			() => false,
			{
				onAttemptStatus,
				random: () => 0.5,
				sleep: async () => undefined
			}
		)

		expect(mockGetRelease).toHaveBeenCalledTimes(3)
		expect(onAttemptStatus).toHaveBeenCalledWith(
			expect.objectContaining({ waitingMs: 5000 })
		)
		expect(result.failed[0]).toMatchObject({
			code: 'discogs_rate_limited',
			attempts: 3,
			retryable: true,
			requestId: 'request-reference'
		})
	})

	it('does not automatically retry invalid responses but allows manual retry', async () => {
		mockGetRelease.mockRejectedValueOnce(
			new DiscogsApiError('Discogs returned an invalid release response.', {
				code: 'invalid_upstream_response',
				retryable: false
			})
		)

		const result = await fetchReleaseDetails(
			[createSelectableRelease({ id: 1 })],
			vi.fn(),
			() => false,
			{ sleep: async () => undefined }
		)

		expect(mockGetRelease).toHaveBeenCalledOnce()
		expect(result.failed[0]).toMatchObject({
			code: 'invalid_upstream_response',
			attempts: 1,
			retryable: true
		})
	})

	it('cancels during retry backoff without starting another request', async () => {
		mockGetRelease.mockRejectedValueOnce(
			new DiscogsApiError('Discogs is temporarily unavailable.', {
				code: 'discogs_unavailable',
				retryable: true
			})
		)
		let cancelled = false

		const result = await fetchReleaseDetails(
			[createSelectableRelease({ id: 1 })],
			vi.fn(),
			() => cancelled,
			{
				sleep: async () => {
					cancelled = true
				}
			}
		)

		expect(result.cancelled).toBe(true)
		expect(mockGetRelease).toHaveBeenCalledOnce()
	})

	it('stops fetching when cancelled', async () => {
		mockGetRelease.mockResolvedValue(createMockDiscogsReleaseFull())

		const releases = [
			createSelectableRelease({ id: 1 }),
			createSelectableRelease({ id: 2 }),
			createSelectableRelease({ id: 3 })
		]
		const onProgress = vi.fn()

		let callCount = 0
		const shouldCancel = () => {
			callCount++
			return callCount > 1 // Cancel after first check
		}

		const result = await fetchReleaseDetails(releases, onProgress, shouldCancel)

		expect(result.cancelled).toBe(true)
		expect(result.releases.length).toBeLessThan(3)
	})

	it('handles empty input array', async () => {
		const onProgress = vi.fn()

		const result = await fetchReleaseDetails([], onProgress)

		expect(result.releases).toHaveLength(0)
		expect(result.failed).toHaveLength(0)
		expect(result.cancelled).toBe(false)
		expect(onProgress).not.toHaveBeenCalled()
	})
})

describe('importFetchedReleases', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		resetReleaseIdCounter()
	})

	const userId = 'test-user-id'

	it('imports all releases successfully', async () => {
		mockImportRecordWithTracks.mockResolvedValue(undefined)

		const releases = [
			createMockDiscogsReleaseFull({ id: 1 }),
			createMockDiscogsReleaseFull({ id: 2 })
		]

		const result = await importFetchedReleases(releases, userId)

		expect(result.successful).toBe(2)
		expect(result.failed).toHaveLength(0)
		expect(mockImportRecordWithTracks).toHaveBeenCalledTimes(2)
	})

	it('handles import failures', async () => {
		mockImportRecordWithTracks
			.mockResolvedValueOnce(undefined)
			.mockRejectedValueOnce(new Error('Database error'))
			.mockResolvedValueOnce(undefined)

		const releases = [
			createMockDiscogsReleaseFull({ id: 1 }),
			createMockDiscogsReleaseFull({ id: 2 }),
			createMockDiscogsReleaseFull({ id: 3 })
		]

		const result = await importFetchedReleases(releases, userId)

		expect(result.successful).toBe(2)
		expect(result.failed).toHaveLength(1)
		expect(result.failed[0]).toMatchObject({
			releaseId: 2,
			error: 'Could not save this record to your library.',
			code: 'database_write_failed',
			stage: 'save',
			retryable: true,
			attempts: 1
		})
	})

	it('handles unknown error types', async () => {
		mockImportRecordWithTracks.mockRejectedValueOnce('String error')

		const releases = [createMockDiscogsReleaseFull({ id: 1 })]

		const result = await importFetchedReleases(releases, userId)

		expect(result.successful).toBe(0)
		expect(result.failed).toHaveLength(1)
		expect(result.failed[0]?.error).toBe(
			'Could not save this record to your library.'
		)
	})

	it('handles empty input array', async () => {
		const result = await importFetchedReleases([], userId)

		expect(result.successful).toBe(0)
		expect(result.failed).toHaveLength(0)
		expect(mockImportRecordWithTracks).not.toHaveBeenCalled()
	})

	it('passes userId to import function', async () => {
		mockImportRecordWithTracks.mockResolvedValue(undefined)

		const releases = [createMockDiscogsReleaseFull({ id: 1 })]

		await importFetchedReleases(releases, userId)

		expect(mockImportRecordWithTracks).toHaveBeenCalledWith(
			expect.any(Object),
			userId
		)
	})

	it('stops before the next write when cancelled during an in-flight import', async () => {
		let resolveFirstImport!: () => void
		const firstImport = new Promise<void>((resolve) => {
			resolveFirstImport = resolve
		})
		mockImportRecordWithTracks
			.mockReturnValueOnce(firstImport)
			.mockResolvedValueOnce(undefined)
		const releases = [
			createMockDiscogsReleaseFull({ id: 1 }),
			createMockDiscogsReleaseFull({ id: 2 })
		]
		let cancelled = false

		const importPromise = importFetchedReleases(
			releases,
			userId,
			() => cancelled
		)
		expect(mockImportRecordWithTracks).toHaveBeenCalledTimes(1)

		cancelled = true
		resolveFirstImport()
		const result = await importPromise

		expect(mockImportRecordWithTracks).toHaveBeenCalledTimes(1)
		expect(result).toEqual({ successful: 1, failed: [] })
	})
})
