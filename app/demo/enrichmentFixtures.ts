import type { ReviewFilter } from '~/composables/useTrackEnrichmentWorkflow'
import type { RekordboxXmlTrack } from '~/utils/rekordboxXml'
import type { TrackEnrichmentRow } from '~/utils/trackEnrichment'
import { demoRecords, demoTracks } from './domainFixtures'

export type DemoEnrichmentReview = {
	fileName: string
	rows: TrackEnrichmentRow[]
	selectedFilter: ReviewFilter
}

type SourceFixture = {
	name: string
	artist: string
	album: string
	duration: number
	bpm: number
	key: number
	mode: number
}

const unmatchedSources: SourceFixture[] = [
	{
		name: 'Parallel 9',
		artist: 'Sterac',
		album: 'Secret Life Of Machines',
		duration: 396,
		bpm: 132,
		key: 5,
		mode: 0
	},
	{
		name: 'Pannik',
		artist: 'Donato Dozzy',
		album: 'K',
		duration: 418,
		bpm: 126,
		key: 8,
		mode: 0
	},
	{
		name: 'Aqua',
		artist: 'Convextion',
		album: '2845',
		duration: 372,
		bpm: 128,
		key: 1,
		mode: 1
	},
	{
		name: 'The Seawolf',
		artist: 'Underground Resistance',
		album: 'Interstellar Fugitives',
		duration: 352,
		bpm: 134,
		key: 10,
		mode: 0
	}
]

function createSource(
	index: number,
	fixture: SourceFixture
): RekordboxXmlTrack {
	return {
		sourceType: 'rekordboxXml',
		index,
		trackId: String(21000000 + index),
		name: fixture.name,
		artist: fixture.artist,
		album: fixture.album,
		genre: null,
		kind: 'WAV File',
		totalTimeSeconds: fixture.duration,
		year: null,
		averageBpm: fixture.bpm,
		dateAdded: '2026-07-18',
		bitRate: 1411,
		sampleRate: 44100,
		comments: null,
		playCount: null,
		rating: null,
		location: null,
		locationHint: fixture.album,
		remixer: null,
		tonality: null,
		parsedKey: fixture.key,
		parsedMode: fixture.mode,
		label: null,
		warnings: []
	}
}

function createMatchedRows(): TrackEnrichmentRow[] {
	return demoTracks.slice(0, 14).map((track, index) => {
		const record =
			demoRecords.find((candidate) => candidate.id === track.record_id) ?? null
		const proposedBpm = [124, 126, 128, 130, 122, 125, 127, 129][index % 8]!
		const proposedKey = [0, 3, 7, 10, 2, 5, 8, 11][index % 8]!
		const proposedMode = index % 3 === 0 ? 1 : 0
		const isReady = index < 8
		const isDone = index >= 12
		const fixture: SourceFixture = {
			name: track.title,
			artist: track.artists[0]?.name || 'Unknown artist',
			album: record?.title || 'Unknown release',
			duration: track.duration
				? Math.round(track.duration / 1000)
				: 330 + index * 7,
			bpm: proposedBpm,
			key: proposedKey,
			mode: proposedMode
		}

		return {
			id: 'demo-enrichment-match-' + (index + 1),
			source: createSource(index + 1, fixture),
			track: isDone
				? {
						...track,
						bpm: proposedBpm,
						key: proposedKey,
						mode: proposedMode
					}
				: track,
			record,
			confidence: isReady || isDone ? 'high' : 'medium',
			score: isReady || isDone ? 96 - (index % 4) : 73 - (index % 3),
			reasons: ['Exact title', 'Artist match', 'Release match'],
			warnings: isReady || isDone ? [] : ['Duration needs a quick check'],
			proposedBpm,
			proposedKey,
			proposedMode,
			proposedBpmSource: 'rekordboxXml',
			proposedKeyModeSource: 'rekordboxXml',
			canFillBpm: !isDone,
			canFillKeyMode: !isDone,
			alreadyComplete: isDone,
			hasConflict: !isReady && !isDone,
			stagingBlockedReason: null,
			defaultStaged: isReady,
			error: null,
			applied: false
		}
	})
}

function createUnmatchedRows(): TrackEnrichmentRow[] {
	return unmatchedSources.map((fixture, index) => ({
		id: 'demo-enrichment-unmatched-' + (index + 1),
		source: createSource(101 + index, fixture),
		track: null,
		record: null,
		confidence: 'manual',
		score: 0,
		reasons: [],
		warnings: [],
		proposedBpm: fixture.bpm,
		proposedKey: fixture.key,
		proposedMode: fixture.mode,
		proposedBpmSource: 'rekordboxXml',
		proposedKeyModeSource: 'rekordboxXml',
		canFillBpm: false,
		canFillKeyMode: false,
		alreadyComplete: false,
		hasConflict: false,
		stagingBlockedReason: null,
		defaultStaged: false,
		error: null,
		applied: false
	}))
}

export function createDemoEnrichmentReview(
	selectedFilter: ReviewFilter = 'ready'
): DemoEnrichmentReview {
	return {
		fileName: 'crate-guide-demo.xml',
		rows: [...createMatchedRows(), ...createUnmatchedRows()],
		selectedFilter
	}
}
