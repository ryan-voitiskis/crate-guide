import { createPinia, setActivePinia } from 'pinia'
import {
	createMockTrack,
	createMockTrackWithArtists,
	createMockTrackWithBpm,
	resetTrackIdCounter
} from 'test/mocks/fixtures/tracks'
import { beforeEach, describe, expect, it, vi } from 'vitest'
// Import after mocking
import { useTracksStore } from '../tracksStore'

const mockToast = vi.hoisted(() => ({
	success: vi.fn(),
	error: vi.fn(),
	info: vi.fn(),
	warning: vi.fn()
}))

vi.mock('vue-sonner', () => ({
	toast: mockToast
}))

// Mock dependencies
const mockUserStore: {
	supaUser: { id: string } | null
	resolveAuthenticatedUserId: ReturnType<typeof vi.fn>
} = {
	supaUser: { id: 'test-user-id' },
	resolveAuthenticatedUserId: vi.fn()
}

// Create a chainable mock query builder
function createMockQueryBuilder() {
	const builder = {
		select: vi.fn().mockReturnThis(),
		insert: vi.fn().mockReturnThis(),
		update: vi.fn().mockReturnThis(),
		delete: vi.fn().mockReturnThis(),
		eq: vi.fn().mockReturnThis(),
		is: vi.fn().mockReturnThis(),
		order: vi.fn().mockReturnThis(),
		single: vi.fn().mockResolvedValue({ data: null, error: null })
	}
	return builder
}

let mockQueryBuilder = createMockQueryBuilder()

const mockSupabaseClient = {
	from: vi.fn(() => mockQueryBuilder)
}

// Stub globals before importing the store
vi.stubGlobal('useUserStore', () => mockUserStore)
vi.stubGlobal('useSupabaseClient', () => mockSupabaseClient)

describe('tracksStore', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mockToast.success.mockClear()
		mockToast.error.mockClear()
		resetTrackIdCounter()
		setActivePinia(createPinia())

		// Reset mock query builder
		mockQueryBuilder = createMockQueryBuilder()
		mockSupabaseClient.from.mockReturnValue(mockQueryBuilder)

		// Reset user store
		mockUserStore.supaUser = { id: 'test-user-id' }
		mockUserStore.resolveAuthenticatedUserId.mockImplementation(async () => {
			if (!mockUserStore.supaUser?.id) throw new Error('User not logged in.')
			return mockUserStore.supaUser.id
		})
	})

	describe('initial state', () => {
		it('starts with empty tracks array', () => {
			const store = useTracksStore()
			expect(store.tracks).toEqual([])
		})

		it('starts with loading states as false', () => {
			const store = useTracksStore()
			expect(store.isLoadingTracks).toBe(false)
			expect(store.isCreatingTrack).toBe(false)
			expect(store.isUpdatingTrack).toBe(false)
		})
	})

	describe('computed properties', () => {
		it('tracksCount returns correct count', () => {
			const store = useTracksStore()
			store.tracks = [createMockTrack(), createMockTrack(), createMockTrack()]

			expect(store.tracksCount).toBe(3)
		})

		it('hasTracks returns false when empty', () => {
			const store = useTracksStore()
			expect(store.hasTracks).toBe(false)
		})

		it('hasTracks returns true when tracks exist', () => {
			const store = useTracksStore()
			store.tracks = [createMockTrack()]

			expect(store.hasTracks).toBe(true)
		})

		it('playableTracks filters out non-playable tracks', () => {
			const store = useTracksStore()
			store.tracks = [
				createMockTrack({ id: 'playable-1', playable: true }),
				createMockTrack({ id: 'non-playable', playable: false }),
				createMockTrack({ id: 'playable-2', playable: true })
			]

			const playable = store.playableTracks
			expect(playable.length).toBe(2)
			expect(playable.map((t) => t.id)).toEqual(['playable-1', 'playable-2'])
		})
	})

	describe('fetchAllTracks', () => {
		it('does nothing when user is not signed in', async () => {
			mockUserStore.supaUser = null
			const store = useTracksStore()

			await store.fetchAllTracks()

			expect(mockSupabaseClient.from).not.toHaveBeenCalled()
		})

		it('sets isLoadingTracks during fetch', async () => {
			const store = useTracksStore()
			mockQueryBuilder.order.mockResolvedValue({ data: [], error: null })

			const fetchPromise = store.fetchAllTracks()
			expect(store.isLoadingTracks).toBe(true)

			await fetchPromise
			expect(store.isLoadingTracks).toBe(false)
		})

		it('populates tracks from response', async () => {
			const store = useTracksStore()
			const mockData = [
				{
					...createMockTrack({ id: 'track-1' }),
					records: { user_id: 'test-user-id' }
				},
				{
					...createMockTrack({ id: 'track-2' }),
					records: { user_id: 'test-user-id' }
				}
			]
			mockQueryBuilder.order.mockResolvedValue({ data: mockData, error: null })

			await store.fetchAllTracks()

			expect(store.tracks.length).toBe(2)
			expect(store.tracks[0]!.id).toBe('track-1')
		})

		it('preserves audio_features from response mapping', async () => {
			const store = useTracksStore()
			const audioFeatures = {
				version: 1 as const,
				updatedAt: '2026-07-09T00:00:00.000Z',
				applied: {
					bpm: {
						source: 'rekordboxXml' as const,
						appliedAt: '2026-07-09T00:00:00.000Z'
					},
					keyMode: null
				},
				match: {
					confidence: 'high' as const,
					score: 100,
					reasons: ['Title match'],
					warnings: []
				},
				sources: {}
			}
			const mockData = [
				{
					...createMockTrack({ id: 'track-1', audio_features: audioFeatures }),
					records: { user_id: 'test-user-id' }
				}
			]
			mockQueryBuilder.order.mockResolvedValue({ data: mockData, error: null })

			await store.fetchAllTracks()

			expect(store.tracks[0]!.audio_features).toEqual(audioFeatures)
		})

		it('handles fetch error gracefully', async () => {
			const store = useTracksStore()
			mockQueryBuilder.order.mockResolvedValue({
				data: null,
				error: new Error('Database error')
			})

			await store.fetchAllTracks()

			expect(store.tracks).toEqual([])
			expect(store.isLoadingTracks).toBe(false)
		})
	})

	describe('createTrack', () => {
		it('returns null when user is not signed in', async () => {
			mockUserStore.supaUser = null
			const store = useTracksStore()

			const result = await store.createTrack({
				record_id: 'record-1',
				title: 'New Track',
				artists: [],
				extraartists: [],
				position: 'A1',
				duration: 180000,
				bpm: 128,
				rpm: 33,
				key: 0,
				mode: 0,
				genres: [],
				time_signature_upper: null,
				time_signature_lower: null,
				playable: true,
				beatport_data: null
			})

			expect(result).toBeNull()
		})

		it('adds created track to local state', async () => {
			const store = useTracksStore()
			const newTrackData = {
				record_id: 'record-1',
				title: 'New Track',
				artists: [],
				extraartists: [],
				position: 'A1',
				duration: 180000,
				bpm: 128,
				rpm: 33,
				key: 0,
				mode: 0,
				genres: [],
				time_signature_upper: null,
				time_signature_lower: null,
				playable: true,
				beatport_data: null
			}
			const createdTrack = createMockTrack({
				...newTrackData,
				id: 'new-track-id'
			})
			mockQueryBuilder.single.mockResolvedValue({
				data: createdTrack,
				error: null
			})

			const result = await store.createTrack(newTrackData)

			expect(mockQueryBuilder.insert).toHaveBeenCalledWith(
				expect.objectContaining({ beatport_data: null })
			)
			expect(result?.id).toBe('new-track-id')
			expect(store.tracks[0]!.id).toBe('new-track-id')
		})

		it('serializes legacy Beatport data in create payloads', async () => {
			const store = useTracksStore()
			const beatportData = {
				accessed: 1783832400000,
				url: 'https://www.beatport.com/track/legacy-track/123',
				genre: 'Deep House',
				bpm: 124,
				key: 'A Minor',
				img: 'https://example.test/legacy-track.jpg'
			}
			mockQueryBuilder.single.mockResolvedValue({
				data: createMockTrack({ beatport_data: beatportData }),
				error: null
			})

			await store.createTrack({
				record_id: 'record-1',
				title: 'Legacy Track',
				artists: [],
				extraartists: [],
				position: 'A1',
				duration: 180000,
				bpm: 124,
				rpm: 33,
				key: 9,
				mode: 0,
				genres: ['Deep House'],
				time_signature_upper: null,
				time_signature_lower: null,
				playable: true,
				beatport_data: beatportData
			})

			expect(mockQueryBuilder.insert).toHaveBeenCalledWith(
				expect.objectContaining({ beatport_data: beatportData })
			)
		})

		it('sets isCreatingTrack during creation', async () => {
			const store = useTracksStore()
			mockQueryBuilder.single.mockResolvedValue({
				data: createMockTrack(),
				error: null
			})

			const createPromise = store.createTrack({
				record_id: 'record-1',
				title: 'New Track',
				artists: [],
				extraartists: [],
				position: 'A1',
				duration: 180000,
				bpm: 128,
				rpm: 33,
				key: 0,
				mode: 0,
				genres: [],
				time_signature_upper: null,
				time_signature_lower: null,
				playable: true,
				beatport_data: null
			})

			expect(store.isCreatingTrack).toBe(true)
			await createPromise
			expect(store.isCreatingTrack).toBe(false)
		})

		it('returns null on creation error', async () => {
			const store = useTracksStore()
			mockQueryBuilder.single.mockResolvedValue({
				data: null,
				error: new Error('Creation failed')
			})

			const result = await store.createTrack({
				record_id: 'record-1',
				title: 'New Track',
				artists: [],
				extraartists: [],
				position: 'A1',
				duration: 180000,
				bpm: 128,
				rpm: 33,
				key: 0,
				mode: 0,
				genres: [],
				time_signature_upper: null,
				time_signature_lower: null,
				playable: true,
				beatport_data: null
			})

			expect(result).toBeNull()
		})
	})

	describe('updateTrack', () => {
		it('returns null when track not found', async () => {
			const store = useTracksStore()
			store.tracks = [createMockTrack({ id: 'existing-track' })]

			const result = await store.updateTrack('non-existent', {
				title: 'Updated'
			})

			expect(result).toBeNull()
		})

		it('performs optimistic update', async () => {
			const store = useTracksStore()
			store.tracks = [createMockTrack({ id: 'track-1', title: 'Original' })]

			// Start update but don't await yet
			const updatePromise = store.updateTrack('track-1', { title: 'Updated' })

			// Track should be optimistically updated
			expect(store.tracks[0]!.title).toBe('Updated')

			mockQueryBuilder.single.mockResolvedValue({
				data: createMockTrack({ id: 'track-1', title: 'Updated' }),
				error: null
			})

			await updatePromise
		})

		it('reverts on update error', async () => {
			const store = useTracksStore()
			store.tracks = [createMockTrack({ id: 'track-1', title: 'Original' })]
			mockQueryBuilder.single.mockResolvedValue({
				data: null,
				error: new Error('Update failed')
			})

			await store.updateTrack('track-1', { title: 'Updated' })

			// Should revert to original
			expect(store.tracks[0]!.title).toBe('Original')
		})

		it('updates with server response on success', async () => {
			const store = useTracksStore()
			store.tracks = [createMockTrack({ id: 'track-1', title: 'Original' })]
			const serverResponse = createMockTrack({
				id: 'track-1',
				title: 'Updated',
				updated_at: '2024-01-01T00:00:00Z'
			})
			mockQueryBuilder.single.mockResolvedValue({
				data: serverResponse,
				error: null
			})

			await store.updateTrack('track-1', { title: 'Updated' })

			expect(store.tracks[0]!.updated_at).toBe('2024-01-01T00:00:00Z')
		})

		it('sets isUpdatingTrack during update', async () => {
			const store = useTracksStore()
			store.tracks = [createMockTrack({ id: 'track-1' })]
			mockQueryBuilder.single.mockResolvedValue({
				data: createMockTrack({ id: 'track-1' }),
				error: null
			})

			const updatePromise = store.updateTrack('track-1', { title: 'Updated' })
			expect(store.isUpdatingTrack).toBe(true)

			await updatePromise
			expect(store.isUpdatingTrack).toBe(false)
		})

		it('serializes audio_features in update payloads', async () => {
			const store = useTracksStore()
			store.tracks = [createMockTrack({ id: 'track-1' })]
			mockQueryBuilder.single.mockResolvedValue({
				data: createMockTrack({ id: 'track-1' }),
				error: null
			})

			await store.updateTrack('track-1', {
				audio_features: {
					version: 1,
					updatedAt: '2026-07-09T00:00:00.000Z',
					applied: {
						bpm: null,
						keyMode: null
					},
					match: {
						confidence: 'manual',
						score: 0,
						reasons: [],
						warnings: []
					},
					sources: {}
				}
			})

			expect(mockQueryBuilder.update).toHaveBeenCalledWith(
				expect.objectContaining({
					audio_features: expect.objectContaining({
						version: 1,
						updatedAt: '2026-07-09T00:00:00.000Z'
					})
				})
			)
		})

		it('serializes legacy Beatport not-found markers in update payloads', async () => {
			const store = useTracksStore()
			const beatportNotFound = {
				searched: true,
				notFound: true,
				searchedAt: 1783832400000
			}
			store.tracks = [createMockTrack({ id: 'track-1' })]
			mockQueryBuilder.single.mockResolvedValue({
				data: createMockTrack({
					id: 'track-1',
					beatport_data: beatportNotFound
				}),
				error: null
			})

			await store.updateTrack('track-1', {
				beatport_data: beatportNotFound
			})

			expect(mockQueryBuilder.update).toHaveBeenCalledWith(
				expect.objectContaining({ beatport_data: beatportNotFound })
			)
		})
	})

	describe('updateTracksBatch', () => {
		it('returns per-row results and suppresses per-row toasts', async () => {
			const store = useTracksStore()
			store.tracks = [
				createMockTrack({ id: 'track-1', title: 'Original 1' }),
				createMockTrack({ id: 'track-2', title: 'Original 2' })
			]
			mockQueryBuilder.single
				.mockResolvedValueOnce({
					data: createMockTrack({ id: 'track-1', title: 'Updated 1' }),
					error: null
				})
				.mockResolvedValueOnce({
					data: null,
					error: new Error('Update failed')
				})

			const progress: number[] = []
			const results = await store.updateTracksBatch(
				[
					{
						id: 'track-1',
						updates: { title: 'Updated 1' },
						preconditions: {
							bpmMustBeNull: true,
							keyModeMustBeNull: true
						}
					},
					{ id: 'track-2', updates: { title: 'Updated 2' } }
				],
				{
					onProgress: (completed) => progress.push(completed)
				}
			)

			expect(results).toMatchObject([
				{ id: 'track-1', success: true, error: null },
				{ id: 'track-2', success: false, error: 'Update failed' }
			])
			expect(progress).toEqual([1, 2])
			expect(store.tracks[0]!.title).toBe('Updated 1')
			expect(store.tracks[1]!.title).toBe('Original 2')
			expect(mockQueryBuilder.is).toHaveBeenCalledWith('bpm', null)
			expect(mockQueryBuilder.is).toHaveBeenCalledWith('key', null)
			expect(mockQueryBuilder.is).toHaveBeenCalledWith('mode', null)
			expect(mockToast.success).not.toHaveBeenCalled()
			expect(mockToast.error).not.toHaveBeenCalled()
		})
	})

	describe('deleteTrack', () => {
		it('returns false when track not found', async () => {
			const store = useTracksStore()
			store.tracks = [createMockTrack({ id: 'existing-track' })]

			const result = await store.deleteTrack('non-existent')

			expect(result).toBe(false)
		})

		it('performs optimistic delete', async () => {
			const store = useTracksStore()
			store.tracks = [
				createMockTrack({ id: 'track-1' }),
				createMockTrack({ id: 'track-2' })
			]

			// Start delete but don't await
			const deletePromise = store.deleteTrack('track-1')

			// Track should be optimistically removed
			expect(store.tracks.length).toBe(1)
			expect(store.tracks[0]!.id).toBe('track-2')

			mockQueryBuilder.eq.mockResolvedValue({ data: null, error: null })
			await deletePromise
		})

		it('reverts on delete error', async () => {
			const store = useTracksStore()
			const track1 = createMockTrack({ id: 'track-1' })
			const track2 = createMockTrack({ id: 'track-2' })
			store.tracks = [track1, track2]
			mockQueryBuilder.eq.mockResolvedValue({
				data: null,
				error: new Error('Delete failed')
			})

			await store.deleteTrack('track-1')

			// Should revert deletion
			expect(store.tracks.length).toBe(2)
			expect(store.tracks[0]!.id).toBe('track-1')
		})

		it('returns true on successful delete', async () => {
			const store = useTracksStore()
			store.tracks = [createMockTrack({ id: 'track-1' })]
			mockQueryBuilder.eq.mockResolvedValue({ data: null, error: null })

			const result = await store.deleteTrack('track-1')

			expect(result).toBe(true)
			expect(store.tracks.length).toBe(0)
		})
	})

	describe('getTrackById', () => {
		it('returns undefined when track not found', () => {
			const store = useTracksStore()
			store.tracks = [createMockTrack({ id: 'track-1' })]

			const result = store.getTrackById('non-existent')

			expect(result).toBeUndefined()
		})

		it('returns track when found', () => {
			const store = useTracksStore()
			const track = createMockTrack({ id: 'track-1', title: 'Found Track' })
			store.tracks = [track]

			const result = store.getTrackById('track-1')

			expect(result?.title).toBe('Found Track')
		})
	})

	describe('getTracksByRecordId', () => {
		it('returns empty array when no tracks match', () => {
			const store = useTracksStore()
			store.tracks = [createMockTrack({ record_id: 'record-1' })]

			const result = store.getTracksByRecordId('record-2')

			expect(result).toEqual([])
		})

		it('returns all tracks for a record', () => {
			const store = useTracksStore()
			store.tracks = [
				createMockTrack({ id: 'track-1', record_id: 'record-1' }),
				createMockTrack({ id: 'track-2', record_id: 'record-1' }),
				createMockTrack({ id: 'track-3', record_id: 'record-2' })
			]

			const result = store.getTracksByRecordId('record-1')

			expect(result.length).toBe(2)
			expect(result.map((t) => t.id)).toEqual(['track-1', 'track-2'])
		})
	})

	describe('searchTracks', () => {
		it('returns all tracks for empty query', () => {
			const store = useTracksStore()
			store.tracks = [createMockTrack(), createMockTrack()]

			const result = store.searchTracks('')

			expect(result.length).toBe(2)
		})

		it('returns all tracks for whitespace-only query', () => {
			const store = useTracksStore()
			store.tracks = [createMockTrack(), createMockTrack()]

			const result = store.searchTracks('   ')

			expect(result.length).toBe(2)
		})

		it('searches in title (case-insensitive)', () => {
			const store = useTracksStore()
			store.tracks = [
				createMockTrack({ id: 'match', title: 'Funky Groove' }),
				createMockTrack({ id: 'no-match', title: 'Techno Beat' })
			]

			const result = store.searchTracks('funky')

			expect(result.length).toBe(1)
			expect(result[0]!.id).toBe('match')
		})

		it('searches in artists', () => {
			const store = useTracksStore()
			store.tracks = [
				createMockTrackWithArtists(
					[{ discogs_id: 1, name: 'Daft Punk', role: null }],
					{ id: 'match' }
				),
				createMockTrackWithArtists(
					[{ discogs_id: 2, name: 'Chemical Brothers', role: null }],
					{ id: 'no-match' }
				)
			]

			const result = store.searchTracks('daft')

			expect(result.length).toBe(1)
			expect(result[0]!.id).toBe('match')
		})

		it('searches in extraartists', () => {
			const store = useTracksStore()
			store.tracks = [
				createMockTrack({
					id: 'match',
					extraartists: [{ discogs_id: 1, name: 'DJ Premier', role: 'Remix' }]
				}),
				createMockTrack({
					id: 'no-match',
					extraartists: []
				})
			]

			const result = store.searchTracks('premier')

			expect(result.length).toBe(1)
			expect(result[0]!.id).toBe('match')
		})

		it('searches in genres', () => {
			const store = useTracksStore()
			store.tracks = [
				createMockTrack({ id: 'match', genres: ['Deep House', 'Techno'] }),
				createMockTrack({ id: 'no-match', genres: ['Drum and Bass'] })
			]

			const result = store.searchTracks('house')

			expect(result.length).toBe(1)
			expect(result[0]!.id).toBe('match')
		})

		it('searches in position', () => {
			const store = useTracksStore()
			store.tracks = [
				createMockTrack({ id: 'match', position: 'B2' }),
				createMockTrack({ id: 'no-match', position: 'A1' })
			]

			const result = store.searchTracks('B2')

			expect(result.length).toBe(1)
			expect(result[0]!.id).toBe('match')
		})

		it('searches in BPM', () => {
			const store = useTracksStore()
			store.tracks = [
				createMockTrackWithBpm(128, { id: 'match' }),
				createMockTrackWithBpm(130, { id: 'no-match' })
			]

			const result = store.searchTracks('128')

			expect(result.length).toBe(1)
			expect(result[0]!.id).toBe('match')
		})

		it('handles tracks with null position', () => {
			const store = useTracksStore()
			store.tracks = [
				createMockTrack({
					id: 'no-position',
					position: null as unknown as string
				}),
				createMockTrack({ id: 'with-position', position: 'A1' })
			]

			const result = store.searchTracks('A1')

			expect(result.length).toBe(1)
			expect(result[0]!.id).toBe('with-position')
		})

		it('handles tracks with null BPM', () => {
			const store = useTracksStore()
			store.tracks = [
				createMockTrack({ id: 'no-bpm', bpm: null }),
				createMockTrackWithBpm(128, { id: 'with-bpm' })
			]

			const result = store.searchTracks('128')

			expect(result.length).toBe(1)
			expect(result[0]!.id).toBe('with-bpm')
		})
	})

	describe('clearTracks', () => {
		it('empties the tracks array', () => {
			const store = useTracksStore()
			store.tracks = [createMockTrack(), createMockTrack()]

			store.clearTracks()

			expect(store.tracks).toEqual([])
		})
	})
})
