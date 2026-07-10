import type { DiscogsArtistDb } from '~/../../shared/types/discogs'
import type { Track } from '~/../../shared/types/supabase'

let trackIdCounter = 0

export function createMockTrack(overrides?: Partial<Track>): Track {
	trackIdCounter++
	const id = overrides?.id ?? `track-${trackIdCounter}`

	return {
		id,
		record_id: `record-${trackIdCounter}`,
		title: `Test Track ${trackIdCounter}`,
		artists: [{ discogs_id: 1, name: 'Test Artist', role: null }],
		extraartists: [],
		position: 'A1',
		duration: 180000,
		bpm: 128,
		rpm: 33,
		key: 0,
		mode: 0,
		genres: ['House'],
		time_signature_upper: null,
		time_signature_lower: null,
		playable: true,
		beatport_data: null,
		audio_features: null,
		created_at: new Date().toISOString(),
		updated_at: new Date().toISOString(),
		...overrides
	}
}

export function createMockTrackWithBpm(
	bpm: number,
	overrides?: Partial<Track>
): Track {
	return createMockTrack({ bpm, ...overrides })
}

export function createMockTrackWithKey(
	key: number,
	mode: number,
	overrides?: Partial<Track>
): Track {
	return createMockTrack({ key, mode, ...overrides })
}

export function createMockTrackWithArtists(
	artists: DiscogsArtistDb[],
	overrides?: Partial<Track>
): Track {
	return createMockTrack({ artists, ...overrides })
}

// Predefined tracks for common test scenarios
export const mockTracks = {
	// Standard house track at 128 BPM, A minor
	houseTrack: () =>
		createMockTrack({
			id: 'house-track',
			title: 'House Track',
			bpm: 128,
			key: 9, // A
			mode: 0, // minor
			genres: ['House']
		}),

	// Techno track at 130 BPM, C minor
	technoTrack: () =>
		createMockTrack({
			id: 'techno-track',
			title: 'Techno Track',
			bpm: 130,
			key: 0, // C
			mode: 0, // minor
			genres: ['Techno']
		}),

	// Disco track at 115 BPM, G major
	discoTrack: () =>
		createMockTrack({
			id: 'disco-track',
			title: 'Disco Track',
			bpm: 115,
			key: 7, // G
			mode: 1, // major
			genres: ['Disco']
		}),

	// Track without BPM (unplayable)
	noBpmTrack: () =>
		createMockTrack({
			id: 'no-bpm-track',
			title: 'No BPM Track',
			bpm: null,
			playable: false
		}),

	// Track without key
	noKeyTrack: () =>
		createMockTrack({
			id: 'no-key-track',
			title: 'No Key Track',
			key: null,
			mode: null
		}),

	// Non-playable track
	nonPlayableTrack: () =>
		createMockTrack({
			id: 'non-playable-track',
			title: 'Non-Playable Track',
			playable: false
		})
}

// Reset counter between test files
export function resetTrackIdCounter() {
	trackIdCounter = 0
}
