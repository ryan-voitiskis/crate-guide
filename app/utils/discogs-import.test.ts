import {
	createMockDiscogsRelease,
	createMockDiscogsReleaseFull,
	resetReleaseIdCounter
} from 'test/mocks/fixtures/discogs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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
					genre: [],
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

		expect(onProgress).toHaveBeenCalledWith(0, expect.any(Object)) // 0/4 = 0%
		expect(onProgress).toHaveBeenCalledWith(25, expect.any(Object)) // 1/4 = 25%
		expect(onProgress).toHaveBeenCalledWith(50, expect.any(Object)) // 2/4 = 50%
		expect(onProgress).toHaveBeenCalledWith(75, expect.any(Object)) // 3/4 = 75%
	})

	it('handles fetch failures gracefully', async () => {
		mockGetRelease
			.mockResolvedValueOnce(createMockDiscogsReleaseFull({ id: 1 }))
			.mockRejectedValueOnce(new Error('API Error'))
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
		expect(result.failed[0]?.error).toBe('API Error')
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
		expect(result.failed[0]?.error).toBe('Unknown error')
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
		expect(result.failed[0]?.error).toBe('Database error')
	})

	it('handles unknown error types', async () => {
		mockImportRecordWithTracks.mockRejectedValueOnce('String error')

		const releases = [createMockDiscogsReleaseFull({ id: 1 })]

		const result = await importFetchedReleases(releases, userId)

		expect(result.successful).toBe(0)
		expect(result.failed).toHaveLength(1)
		expect(result.failed[0]?.error).toBe('Failed to import')
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
})
