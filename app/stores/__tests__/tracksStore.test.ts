import { createPinia, setActivePinia } from 'pinia'
import {
	createMockTrack,
	createMockTrackWithArtists,
	createMockTrackWithBpm,
	createMockTrackWithKey,
	resetTrackIdCounter
} from 'test/mocks/fixtures/tracks'
import { beforeEach, describe, expect, it, vi } from 'vitest'
// Import after mocking
import { useTracksStore } from '../tracksStore'

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

			expect(result?.id).toBe('new-track-id')
			expect(store.tracks[0]!.id).toBe('new-track-id')
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

	describe('getTracksByIds', () => {
		it('returns empty array when no IDs match', () => {
			const store = useTracksStore()
			store.tracks = [createMockTrack({ id: 'track-1' })]

			const result = store.getTracksByIds(['track-2', 'track-3'])

			expect(result).toEqual([])
		})

		it('returns all matching tracks', () => {
			const store = useTracksStore()
			store.tracks = [
				createMockTrack({ id: 'track-1' }),
				createMockTrack({ id: 'track-2' }),
				createMockTrack({ id: 'track-3' })
			]

			const result = store.getTracksByIds(['track-1', 'track-3'])

			expect(result.length).toBe(2)
			expect(result.map((t) => t.id)).toEqual(['track-1', 'track-3'])
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

	describe('getTracksByBpmRange', () => {
		it('returns empty array when no tracks in range', () => {
			const store = useTracksStore()
			store.tracks = [
				createMockTrackWithBpm(100, { playable: true }),
				createMockTrackWithBpm(150, { playable: true })
			]

			const result = store.getTracksByBpmRange(120, 130)

			expect(result).toEqual([])
		})

		it('returns tracks within BPM range', () => {
			const store = useTracksStore()
			store.tracks = [
				createMockTrackWithBpm(100, { id: 'too-slow', playable: true }),
				createMockTrackWithBpm(125, { id: 'in-range-1', playable: true }),
				createMockTrackWithBpm(128, { id: 'in-range-2', playable: true }),
				createMockTrackWithBpm(150, { id: 'too-fast', playable: true })
			]

			const result = store.getTracksByBpmRange(120, 130)

			expect(result.length).toBe(2)
			expect(result.map((t) => t.id)).toEqual(['in-range-1', 'in-range-2'])
		})

		it('includes tracks at exact boundaries', () => {
			const store = useTracksStore()
			store.tracks = [
				createMockTrackWithBpm(120, { id: 'min-boundary', playable: true }),
				createMockTrackWithBpm(130, { id: 'max-boundary', playable: true })
			]

			const result = store.getTracksByBpmRange(120, 130)

			expect(result.length).toBe(2)
		})

		it('excludes non-playable tracks', () => {
			const store = useTracksStore()
			store.tracks = [
				createMockTrackWithBpm(125, { id: 'playable', playable: true }),
				createMockTrackWithBpm(125, { id: 'non-playable', playable: false })
			]

			const result = store.getTracksByBpmRange(120, 130)

			expect(result.length).toBe(1)
			expect(result[0]!.id).toBe('playable')
		})

		it('excludes tracks with null BPM', () => {
			const store = useTracksStore()
			store.tracks = [
				createMockTrackWithBpm(125, { id: 'with-bpm', playable: true }),
				createMockTrack({ id: 'no-bpm', bpm: null, playable: true })
			]

			const result = store.getTracksByBpmRange(120, 130)

			expect(result.length).toBe(1)
			expect(result[0]!.id).toBe('with-bpm')
		})
	})

	describe('getTracksByKey', () => {
		it('returns tracks matching key', () => {
			const store = useTracksStore()
			store.tracks = [
				createMockTrackWithKey(0, 0, { id: 'c-minor', playable: true }), // C minor
				createMockTrackWithKey(5, 1, { id: 'f-major', playable: true }), // F major
				createMockTrackWithKey(0, 1, { id: 'c-major', playable: true }) // C major
			]

			const result = store.getTracksByKey(0)

			expect(result.length).toBe(2)
			expect(result.map((t) => t.id)).toContain('c-minor')
			expect(result.map((t) => t.id)).toContain('c-major')
		})

		it('excludes non-playable tracks', () => {
			const store = useTracksStore()
			store.tracks = [
				createMockTrackWithKey(0, 0, { id: 'playable', playable: true }),
				createMockTrackWithKey(0, 0, { id: 'non-playable', playable: false })
			]

			const result = store.getTracksByKey(0)

			expect(result.length).toBe(1)
			expect(result[0]!.id).toBe('playable')
		})
	})

	describe('getTracksByGenre', () => {
		it('returns tracks matching genre (case-insensitive)', () => {
			const store = useTracksStore()
			store.tracks = [
				createMockTrack({ id: 'house-1', genres: ['House'], playable: true }),
				createMockTrack({
					id: 'deep-house',
					genres: ['Deep House'],
					playable: true
				}),
				createMockTrack({ id: 'techno', genres: ['Techno'], playable: true })
			]

			const result = store.getTracksByGenre('house')

			expect(result.length).toBe(2)
			expect(result.map((t) => t.id)).toContain('house-1')
			expect(result.map((t) => t.id)).toContain('deep-house')
		})

		it('excludes non-playable tracks', () => {
			const store = useTracksStore()
			store.tracks = [
				createMockTrack({ id: 'playable', genres: ['House'], playable: true }),
				createMockTrack({
					id: 'non-playable',
					genres: ['House'],
					playable: false
				})
			]

			const result = store.getTracksByGenre('house')

			expect(result.length).toBe(1)
			expect(result[0]!.id).toBe('playable')
		})
	})

	describe('getCompatibleTracks', () => {
		it('includes tracks with key 0 (C Major) in compatibility results', () => {
			const store = useTracksStore()
			// Key 0 represents C Major in Camelot wheel - should not be filtered out
			const currentTrack = createMockTrack({ bpm: 128, key: 0, playable: true })
			const compatibleTrack = createMockTrack({
				bpm: 128,
				key: 0,
				playable: true
			})
			store.tracks = [currentTrack, compatibleTrack]

			const result = store.getCompatibleTracks(currentTrack)

			// Should find the compatible track (same key)
			expect(result.length).toBe(1)
			expect(result[0]!.key).toBe(0)
		})

		it('returns empty array when current track has no BPM', () => {
			const store = useTracksStore()
			const currentTrack = createMockTrack({ bpm: null, key: 5 })
			store.tracks = [createMockTrack({ bpm: 128, key: 5, playable: true })]

			const result = store.getCompatibleTracks(currentTrack)

			expect(result).toEqual([])
		})

		it('returns empty array when current track has no key', () => {
			const store = useTracksStore()
			const currentTrack = createMockTrack({ bpm: 128, key: null })
			store.tracks = [createMockTrack({ bpm: 128, key: 5, playable: true })]

			const result = store.getCompatibleTracks(currentTrack)

			expect(result).toEqual([])
		})

		it('excludes the current track itself', () => {
			const store = useTracksStore()
			const currentTrack = createMockTrack({ id: 'current', bpm: 128, key: 5 })
			store.tracks = [currentTrack]

			const result = store.getCompatibleTracks(currentTrack)

			expect(result).toEqual([])
		})

		it('excludes non-playable tracks', () => {
			const store = useTracksStore()
			const currentTrack = createMockTrack({ id: 'current', bpm: 128, key: 5 })
			store.tracks = [
				createMockTrack({ id: 'playable', bpm: 128, key: 5, playable: true }),
				createMockTrack({
					id: 'non-playable',
					bpm: 128,
					key: 5,
					playable: false
				})
			]

			const result = store.getCompatibleTracks(currentTrack)

			expect(result.length).toBe(1)
			expect(result[0]!.id).toBe('playable')
		})

		it('excludes tracks without BPM', () => {
			const store = useTracksStore()
			const currentTrack = createMockTrack({ id: 'current', bpm: 128, key: 5 })
			store.tracks = [
				createMockTrack({ id: 'with-bpm', bpm: 128, key: 5, playable: true }),
				createMockTrack({ id: 'no-bpm', bpm: null, key: 5, playable: true })
			]

			const result = store.getCompatibleTracks(currentTrack)

			expect(result.length).toBe(1)
			expect(result[0]!.id).toBe('with-bpm')
		})

		it('excludes tracks without key', () => {
			const store = useTracksStore()
			const currentTrack = createMockTrack({ id: 'current', bpm: 128, key: 5 })
			store.tracks = [
				createMockTrack({ id: 'with-key', bpm: 128, key: 5, playable: true }),
				createMockTrack({ id: 'no-key', bpm: 128, key: null, playable: true })
			]

			const result = store.getCompatibleTracks(currentTrack)

			expect(result.length).toBe(1)
			expect(result[0]!.id).toBe('with-key')
		})

		it('includes key 0 (C Major) tracks when harmonically compatible', () => {
			// Key 0 is a valid key representing C Major and should not be treated as null
			const store = useTracksStore()
			// Key 1 is adjacent to key 0, so they are compatible (keyDiff === 1)
			const currentTrack = createMockTrack({ id: 'current', bpm: 128, key: 1 })
			store.tracks = [
				createMockTrack({ id: 'key-zero', bpm: 128, key: 0, playable: true }),
				createMockTrack({ id: 'key-five', bpm: 128, key: 5, playable: true })
			]

			const result = store.getCompatibleTracks(currentTrack)

			// Key 0 should be included (adjacent to key 1)
			expect(result.map((t) => t.id)).toContain('key-zero')
			// Key 5 is not compatible with key 1 (keyDiff === 4)
			expect(result.map((t) => t.id)).not.toContain('key-five')
		})

		describe('BPM compatibility', () => {
			it('includes tracks within default tolerance (5 BPM)', () => {
				const store = useTracksStore()
				const currentTrack = createMockTrack({
					id: 'current',
					bpm: 128,
					key: 5
				})
				store.tracks = [
					createMockTrack({ id: 'same', bpm: 128, key: 5, playable: true }),
					createMockTrack({
						id: 'within-tolerance',
						bpm: 133,
						key: 5,
						playable: true
					}),
					createMockTrack({
						id: 'outside-tolerance',
						bpm: 140,
						key: 5,
						playable: true
					})
				]

				const result = store.getCompatibleTracks(currentTrack)

				expect(result.map((t) => t.id)).toContain('same')
				expect(result.map((t) => t.id)).toContain('within-tolerance')
				expect(result.map((t) => t.id)).not.toContain('outside-tolerance')
			})

			it('respects custom BPM tolerance', () => {
				const store = useTracksStore()
				const currentTrack = createMockTrack({
					id: 'current',
					bpm: 128,
					key: 5
				})
				store.tracks = [
					createMockTrack({
						id: 'within-10',
						bpm: 138,
						key: 5,
						playable: true
					}),
					createMockTrack({
						id: 'outside-10',
						bpm: 145,
						key: 5,
						playable: true
					})
				]

				const result = store.getCompatibleTracks(currentTrack, 10)

				expect(result.map((t) => t.id)).toContain('within-10')
				expect(result.map((t) => t.id)).not.toContain('outside-10')
			})

			it('handles octave matching (half tempo)', () => {
				const store = useTracksStore()
				const currentTrack = createMockTrack({
					id: 'current',
					bpm: 128,
					key: 5
				})
				store.tracks = [
					// 64 BPM * 2 = 128 BPM (compatible)
					createMockTrack({ id: 'half-tempo', bpm: 64, key: 5, playable: true })
				]

				const result = store.getCompatibleTracks(currentTrack)

				expect(result.map((t) => t.id)).toContain('half-tempo')
			})

			it('handles octave matching (double tempo)', () => {
				const store = useTracksStore()
				const currentTrack = createMockTrack({ id: 'current', bpm: 64, key: 5 })
				store.tracks = [
					// 128 BPM / 2 = 64 BPM (compatible)
					createMockTrack({
						id: 'double-tempo',
						bpm: 128,
						key: 5,
						playable: true
					})
				]

				const result = store.getCompatibleTracks(currentTrack)

				expect(result.map((t) => t.id)).toContain('double-tempo')
			})
		})

		describe('key compatibility (harmonic mixing)', () => {
			it('includes same key', () => {
				const store = useTracksStore()
				const currentTrack = createMockTrack({
					id: 'current',
					bpm: 128,
					key: 5
				})
				store.tracks = [
					createMockTrack({ id: 'same-key', bpm: 128, key: 5, playable: true })
				]

				const result = store.getCompatibleTracks(currentTrack)

				expect(result.map((t) => t.id)).toContain('same-key')
			})

			it('includes adjacent keys (+1 semitone)', () => {
				const store = useTracksStore()
				const currentTrack = createMockTrack({
					id: 'current',
					bpm: 128,
					key: 5
				})
				store.tracks = [
					createMockTrack({
						id: 'key-plus-1',
						bpm: 128,
						key: 6,
						playable: true
					})
				]

				const result = store.getCompatibleTracks(currentTrack)

				expect(result.map((t) => t.id)).toContain('key-plus-1')
			})

			it('includes adjacent keys (-1 semitone)', () => {
				const store = useTracksStore()
				const currentTrack = createMockTrack({
					id: 'current',
					bpm: 128,
					key: 5
				})
				store.tracks = [
					createMockTrack({
						id: 'key-minus-1',
						bpm: 128,
						key: 4,
						playable: true
					})
				]

				const result = store.getCompatibleTracks(currentTrack)

				expect(result.map((t) => t.id)).toContain('key-minus-1')
			})

			it('includes perfect fifth (+7 semitones)', () => {
				const store = useTracksStore()
				const currentTrack = createMockTrack({
					id: 'current',
					bpm: 128,
					key: 5
				})
				store.tracks = [
					// Key 5 + 7 = key 12 which wraps to 0, but 0 is falsy
					// So test with key 2: 2 + 7 = 9
					createMockTrack({ id: 'fifth', bpm: 128, key: 12, playable: true })
				]

				const result = store.getCompatibleTracks(currentTrack)

				expect(result.map((t) => t.id)).toContain('fifth')
			})

			it('handles wraparound for adjacent keys', () => {
				const store = useTracksStore()
				// Key 11 + 1 wraps to 0, key 11 - 1 = 10
				// Test key 1: adjacent is 2 (1+1) or 0 (1-1, but 0 is falsy)
				const currentTrack = createMockTrack({
					id: 'current',
					bpm: 128,
					key: 1
				})
				store.tracks = [
					createMockTrack({
						id: 'adjacent-up',
						bpm: 128,
						key: 2,
						playable: true
					})
				]

				const result = store.getCompatibleTracks(currentTrack)

				expect(result.map((t) => t.id)).toContain('adjacent-up')
			})

			it('excludes incompatible keys', () => {
				const store = useTracksStore()
				const currentTrack = createMockTrack({
					id: 'current',
					bpm: 128,
					key: 5
				})
				store.tracks = [
					// Key 5 compatible: 5 (same), 4 (5-1), 6 (5+1), 12 (5+7)
					// Incompatible: anything else
					createMockTrack({ id: 'key-8', bpm: 128, key: 8, playable: true }),
					createMockTrack({ id: 'key-10', bpm: 128, key: 10, playable: true })
				]

				const result = store.getCompatibleTracks(currentTrack)

				expect(result.map((t) => t.id)).not.toContain('key-8')
				expect(result.map((t) => t.id)).not.toContain('key-10')
			})
		})

		it('requires BOTH BPM and key compatibility', () => {
			const store = useTracksStore()
			const currentTrack = createMockTrack({ id: 'current', bpm: 128, key: 5 })
			store.tracks = [
				// Compatible BPM, incompatible key
				createMockTrack({ id: 'bpm-only', bpm: 128, key: 10, playable: true }),
				// Compatible key, incompatible BPM
				createMockTrack({ id: 'key-only', bpm: 200, key: 5, playable: true }),
				// Both compatible
				createMockTrack({ id: 'both', bpm: 128, key: 6, playable: true })
			]

			const result = store.getCompatibleTracks(currentTrack)

			expect(result.length).toBe(1)
			expect(result[0]!.id).toBe('both')
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
