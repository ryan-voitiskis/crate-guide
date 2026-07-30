import { ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock tracks data
const mockTracks = [
	{
		id: 'track-1',
		title: 'Deep House Groove',
		artists: [{ name: 'Artist One' }],
		extraartists: [{ name: 'Remixer X' }],
		genres: ['House', 'Deep House'],
		position: 'A1',
		bpm: 122,
		key: 5,
		mode: 0,
		playable: true
	},
	{
		id: 'track-2',
		title: 'Techno Banger',
		artists: [{ name: 'Artist Two' }],
		extraartists: [],
		genres: ['Techno'],
		position: 'B1',
		bpm: 138,
		key: 8,
		mode: 1,
		playable: true
	},
	{
		id: 'track-3',
		title: 'Ambient Journey',
		artists: [{ name: 'Ambient Artist' }],
		extraartists: [{ name: 'Vocalist' }],
		genres: ['Ambient', 'Electronic'],
		position: 'A2',
		bpm: 95,
		key: 2,
		mode: 0,
		playable: false
	},
	{
		id: 'track-4',
		title: 'Progressive Mix',
		artists: [{ name: 'DJ Progressive' }],
		extraartists: [],
		genres: ['House', 'Progressive House'],
		position: 'B2',
		bpm: 128,
		key: 5,
		mode: 1,
		playable: true
	},
	{
		id: 'track-5',
		title: 'No BPM Track',
		artists: [{ name: 'Unknown' }],
		extraartists: [],
		genres: ['Experimental'],
		position: null,
		bpm: null,
		key: null,
		mode: null,
		playable: true
	}
]

// Mock tracksStore
const mockTracksStore = {
	tracks: mockTracks
}

const mockCurrentKeyFormat = ref<'key' | 'camelot'>('key')
const mockPreferencesStore = {
	get currentKeyFormat() {
		return mockCurrentKeyFormat.value
	}
}

// Mock utility functions
const mockGetFormattedKeyString = vi.fn(
	(key: number, mode: number, format: 'key' | 'camelot') => {
		const keys = [
			'C',
			'Db',
			'D',
			'Eb',
			'E',
			'F',
			'Gb',
			'G',
			'Ab',
			'A',
			'Bb',
			'B'
		]
		return format === 'camelot'
			? `${key + 1}${mode === 0 ? 'A' : 'B'}`
			: `${keys[key]}${mode === 0 ? 'm' : ''}`
	}
)

const mockGetKeyColour = vi.fn((key: number) => `hsl(${key * 30}, 70%, 50%)`)

// Stub globals before importing store
vi.stubGlobal('useTracksStore', () => mockTracksStore)
vi.stubGlobal('useLibraryPreferencesStore', () => mockPreferencesStore)
vi.stubGlobal('getFormattedKeyString', mockGetFormattedKeyString)
vi.stubGlobal('getKeyColour', mockGetKeyColour)

// Import store after mocks
const { useTrackFiltersStore } = await import('../trackFiltersStore')

describe('trackFiltersStore', () => {
	let store: ReturnType<typeof useTrackFiltersStore>

	beforeEach(() => {
		setActivePinia(createPinia())
		store = useTrackFiltersStore()
		vi.clearAllMocks()
		mockCurrentKeyFormat.value = 'key'
	})

	describe('initial state', () => {
		it('has empty search query', () => {
			expect(store.searchQuery).toBe('')
		})

		it('has showOnlyPlayable as false', () => {
			expect(store.showOnlyPlayable).toBe(false)
		})

		it('has null bpm range', () => {
			expect(store.bpmMin).toBeNull()
			expect(store.bpmMax).toBeNull()
		})

		it('has null selected key and mode', () => {
			expect(store.selectedKeyComposite).toBeNull()
		})

		it('has empty selected genres', () => {
			expect(store.selectedGenres).toEqual([])
		})

		it('has no active filters', () => {
			expect(store.hasActiveFilters).toBe(false)
			expect(store.activeFiltersCount).toBe(0)
		})
	})

	describe('keyOptions', () => {
		it('generates 24 key options (12 keys x 2 modes)', () => {
			expect(store.keyOptions).toHaveLength(24)
		})

		it('includes value, label, and color for each option', () => {
			const firstOption = store.keyOptions[0]
			expect(firstOption).toHaveProperty('value', '000')
			expect(firstOption).toHaveProperty('label')
			expect(firstOption).toHaveProperty('color')
		})

		it('gives every key and mode option a unique composite value', () => {
			const values = store.keyOptions.map((option) => option.value)

			expect(new Set(values).size).toBe(24)
			expect(values).toContain('005')
			expect(values).toContain('105')
		})

		it('calls getFormattedKeyString for labels', () => {
			// Access keyOptions to trigger computed
			const options = store.keyOptions
			expect(mockGetFormattedKeyString).toHaveBeenCalled()
			expect(options.length).toBe(24)
		})

		it('uses the active user key format', () => {
			mockCurrentKeyFormat.value = 'camelot'

			const options = store.keyOptions

			expect(mockGetFormattedKeyString).toHaveBeenCalledWith(0, 0, 'camelot')
			expect(options[0]?.label).toBe('1A')
		})

		it('recomputes labels when currentKeyFormat changes', () => {
			const keyOptions = store.keyOptions
			expect(keyOptions[0]?.label).toBe('Cm')
			expect(mockGetFormattedKeyString).toHaveBeenCalledWith(0, 0, 'key')

			mockCurrentKeyFormat.value = 'camelot'

			const camelotOptions = store.keyOptions
			expect(camelotOptions[0]?.label).toBe('1A')
			expect(mockGetFormattedKeyString).toHaveBeenCalledWith(0, 0, 'camelot')
		})
	})

	describe('filteredTracks', () => {
		it('returns all tracks when no filters active', () => {
			expect(store.filteredTracks).toHaveLength(5)
		})

		describe('search query filter', () => {
			it('filters by title', () => {
				store.searchQuery = 'Deep House'
				expect(store.filteredTracks).toHaveLength(1)
				expect(store.filteredTracks[0]!.title).toBe('Deep House Groove')
			})

			it('filters by artist name', () => {
				store.searchQuery = 'Artist One'
				expect(store.filteredTracks).toHaveLength(1)
				expect(store.filteredTracks[0]!.id).toBe('track-1')
			})

			it('filters by extra artist name', () => {
				store.searchQuery = 'Remixer'
				expect(store.filteredTracks).toHaveLength(1)
				expect(store.filteredTracks[0]!.id).toBe('track-1')
			})

			it('filters by genre', () => {
				store.searchQuery = 'Ambient'
				expect(store.filteredTracks).toHaveLength(1)
				expect(store.filteredTracks[0]!.id).toBe('track-3')
			})

			it('filters by position', () => {
				store.searchQuery = 'A1'
				expect(store.filteredTracks).toHaveLength(1)
				expect(store.filteredTracks[0]!.position).toBe('A1')
			})

			it('is case insensitive', () => {
				store.searchQuery = 'TECHNO'
				expect(store.filteredTracks).toHaveLength(1)
				expect(store.filteredTracks[0]!.id).toBe('track-2')
			})

			it('ignores whitespace-only queries', () => {
				store.searchQuery = '   '
				expect(store.filteredTracks).toHaveLength(5)
			})
		})

		describe('playable filter', () => {
			it('filters to only playable tracks', () => {
				store.showOnlyPlayable = true
				expect(store.filteredTracks).toHaveLength(4)
				expect(store.filteredTracks.every((t) => t.playable)).toBe(true)
			})
		})

		describe('BPM range filter', () => {
			it('filters by minimum BPM', () => {
				store.bpmMin = 120
				expect(store.filteredTracks).toHaveLength(3)
				expect(store.filteredTracks.every((t) => t.bpm && t.bpm >= 120)).toBe(
					true
				)
			})

			it('filters by maximum BPM', () => {
				store.bpmMax = 100
				expect(store.filteredTracks).toHaveLength(1)
				expect(store.filteredTracks[0]!.id).toBe('track-3')
			})

			it('filters by BPM range', () => {
				store.bpmMin = 120
				store.bpmMax = 130
				expect(store.filteredTracks).toHaveLength(2)
				expect(
					store.filteredTracks.every(
						(t) => t.bpm && t.bpm >= 120 && t.bpm <= 130
					)
				).toBe(true)
			})

			it('excludes tracks without BPM', () => {
				store.bpmMin = 1 // Low threshold that all tracks with BPM would pass
				expect(store.filteredTracks.find((t) => t.id === 'track-5')).toBeFalsy()
			})
		})

		describe('key filter', () => {
			it('distinguishes minor and major tracks with the same pitch class', () => {
				store.selectedKeyComposite = '005'
				expect(store.filteredTracks.map((track) => track.id)).toEqual([
					'track-1'
				])

				store.selectedKeyComposite = '105'
				expect(store.filteredTracks.map((track) => track.id)).toEqual([
					'track-4'
				])
			})

			it('handles key 0 correctly', () => {
				// Add a track with key 0 to mock data temporarily
				const originalTracks = mockTracksStore.tracks
				mockTracksStore.tracks = [
					...originalTracks,
					{
						id: 'track-key-0',
						title: 'C Minor Track',
						artists: [{ name: 'Test' }],
						extraartists: [],
						genres: ['Test'],
						position: 'C1',
						bpm: 120,
						key: 0,
						mode: 1,
						playable: true
					}
				]

				store.selectedKeyComposite = '100'
				expect(store.filteredTracks).toHaveLength(1)
				expect(store.filteredTracks[0]!.key).toBe(0)
				expect(store.filteredTracks[0]!.mode).toBe(1)

				// Restore original
				mockTracksStore.tracks = originalTracks
			})
		})

		describe('genre filter', () => {
			it('filters by single genre', () => {
				store.selectedGenres = ['techno']
				expect(store.filteredTracks).toHaveLength(1)
				expect(store.filteredTracks[0]!.id).toBe('track-2')
			})

			it('filters by multiple genres (OR logic)', () => {
				store.selectedGenres = ['techno', 'ambient']
				expect(store.filteredTracks).toHaveLength(2)
			})

			it('matches genres case-insensitively when using toggleGenre', () => {
				// toggleGenre normalizes to lowercase
				store.toggleGenre('HOUSE')
				expect(store.filteredTracks).toHaveLength(2)
			})

			it('requires lowercase values when setting selectedGenres directly', () => {
				// Direct assignment bypasses normalization - must use lowercase
				store.selectedGenres = ['house']
				expect(store.filteredTracks).toHaveLength(2)
			})
		})

		describe('combined filters', () => {
			it('applies multiple filters together', () => {
				store.showOnlyPlayable = true
				store.bpmMin = 120
				store.selectedGenres = ['house']
				expect(store.filteredTracks).toHaveLength(2)
			})

			it('returns empty when no tracks match all filters', () => {
				store.searchQuery = 'Techno'
				store.selectedKeyComposite = '005'
				expect(store.filteredTracks).toHaveLength(0)
			})
		})
	})

	describe('availableGenres', () => {
		it('returns unique genres from all tracks', () => {
			const genres = store.availableGenres
			expect(genres).toContain('house')
			expect(genres).toContain('techno')
			expect(genres).toContain('ambient')
		})

		it('returns genres in lowercase', () => {
			const genres = store.availableGenres
			expect(genres.every((g) => g === g.toLowerCase())).toBe(true)
		})

		it('returns genres sorted alphabetically', () => {
			const genres = store.availableGenres
			const sorted = [...genres].sort()
			expect(genres).toEqual(sorted)
		})

		it('does not include duplicates', () => {
			const genres = store.availableGenres
			const unique = [...new Set(genres)]
			expect(genres).toHaveLength(unique.length)
		})
	})

	describe('activeFiltersCount', () => {
		it('counts search query as one filter', () => {
			store.searchQuery = 'test'
			expect(store.activeFiltersCount).toBe(1)
		})

		it('counts showOnlyPlayable as one filter', () => {
			store.showOnlyPlayable = true
			expect(store.activeFiltersCount).toBe(1)
		})

		it('counts BPM range as one filter (regardless of min/max)', () => {
			store.bpmMin = 100
			expect(store.activeFiltersCount).toBe(1)

			store.bpmMax = 140
			expect(store.activeFiltersCount).toBe(1) // Still 1, not 2
		})

		it('counts selected key as one filter', () => {
			store.selectedKeyComposite = '005'
			expect(store.activeFiltersCount).toBe(1)
		})

		it('counts selected genres as one filter', () => {
			store.selectedGenres = ['house', 'techno']
			expect(store.activeFiltersCount).toBe(1)
		})

		it('counts multiple filter types', () => {
			store.searchQuery = 'test'
			store.showOnlyPlayable = true
			store.bpmMin = 100
			store.selectedKeyComposite = '005'
			store.selectedGenres = ['house']
			expect(store.activeFiltersCount).toBe(5)
		})
	})

	describe('hasActiveFilters', () => {
		it('returns false when no filters active', () => {
			expect(store.hasActiveFilters).toBe(false)
		})

		it('returns true when any filter is active', () => {
			store.searchQuery = 'test'
			expect(store.hasActiveFilters).toBe(true)
		})
	})

	describe('clearSearchQuery', () => {
		it('clears the search query', () => {
			store.searchQuery = 'test query'
			store.clearSearchQuery()
			expect(store.searchQuery).toBe('')
		})
	})

	describe('setBpmRange', () => {
		it('sets both min and max BPM', () => {
			store.setBpmRange(100, 140)
			expect(store.bpmMin).toBe(100)
			expect(store.bpmMax).toBe(140)
		})

		it('allows null values', () => {
			store.setBpmRange(100, 140)
			store.setBpmRange(null, null)
			expect(store.bpmMin).toBeNull()
			expect(store.bpmMax).toBeNull()
		})

		it('allows setting only min', () => {
			store.setBpmRange(100, null)
			expect(store.bpmMin).toBe(100)
			expect(store.bpmMax).toBeNull()
		})

		it('allows setting only max', () => {
			store.setBpmRange(null, 140)
			expect(store.bpmMin).toBeNull()
			expect(store.bpmMax).toBe(140)
		})
	})

	describe('setSelectedKeyComposite', () => {
		it('sets the selected key and mode composite', () => {
			store.setSelectedKeyComposite('005')
			expect(store.selectedKeyComposite).toBe('005')
		})

		it('allows null to clear key', () => {
			store.setSelectedKeyComposite('005')
			store.setSelectedKeyComposite(null)
			expect(store.selectedKeyComposite).toBeNull()
		})

		it('handles key 0 in either mode', () => {
			store.setSelectedKeyComposite('000')
			expect(store.selectedKeyComposite).toBe('000')
			store.setSelectedKeyComposite('100')
			expect(store.selectedKeyComposite).toBe('100')
		})
	})

	describe('toggleGenre', () => {
		it('adds a genre when not selected', () => {
			store.toggleGenre('House')
			expect(store.selectedGenres).toContain('house')
		})

		it('removes a genre when already selected', () => {
			store.selectedGenres = ['house', 'techno']
			store.toggleGenre('House')
			expect(store.selectedGenres).not.toContain('house')
			expect(store.selectedGenres).toContain('techno')
		})

		it('normalizes genre to lowercase', () => {
			store.toggleGenre('TECHNO')
			expect(store.selectedGenres).toContain('techno')
			expect(store.selectedGenres).not.toContain('TECHNO')
		})
	})

	describe('clearGenres', () => {
		it('clears all selected genres', () => {
			store.selectedGenres = ['house', 'techno', 'ambient']
			store.clearGenres()
			expect(store.selectedGenres).toEqual([])
		})
	})

	describe('resetAllFilters', () => {
		it('resets all filters to initial state', () => {
			// Set all filters
			store.searchQuery = 'test'
			store.showOnlyPlayable = true
			store.bpmMin = 100
			store.bpmMax = 140
			store.selectedKeyComposite = '005'
			store.selectedGenres = ['house', 'techno']

			store.resetAllFilters()

			expect(store.searchQuery).toBe('')
			expect(store.showOnlyPlayable).toBe(false)
			expect(store.bpmMin).toBeNull()
			expect(store.bpmMax).toBeNull()
			expect(store.selectedKeyComposite).toBeNull()
			expect(store.selectedGenres).toEqual([])
		})

		it('results in no active filters', () => {
			store.searchQuery = 'test'
			store.showOnlyPlayable = true
			store.resetAllFilters()
			expect(store.hasActiveFilters).toBe(false)
			expect(store.activeFiltersCount).toBe(0)
		})
	})
})
