import { createMockTrack } from 'test/mocks/fixtures/tracks'
import { describe, expect, it } from 'vitest'
import type { RekordboxXmlTrack } from './rekordboxXml'
import { compareArtistMetadata } from './trackEnrichmentArtists'
import {
	createArtistMetadata,
	createCandidateMatchMetadata,
	createSourceMatchMetadata,
	splitEnrichmentArtistNames
} from './trackEnrichmentNormalization'
import {
	prepareCandidateMatchingContext,
	projectEnrichmentReviewRow
} from './trackEnrichmentReview'
import { scoreEnrichmentCandidate } from './trackEnrichmentScoring'
import {
	calculateLevenshteinDistance,
	compareEnrichmentStringSets
} from './trackEnrichmentSimilarity'

function createSource(
	overrides: Partial<RekordboxXmlTrack> = {}
): RekordboxXmlTrack {
	return {
		sourceType: 'rekordboxXml',
		index: 0,
		trackId: 'source-1',
		name: 'Cafe Track',
		artist: 'Test Artist',
		album: null,
		genre: null,
		kind: 'WAV File',
		totalTimeSeconds: 180,
		year: null,
		averageBpm: 128,
		dateAdded: null,
		bitRate: null,
		sampleRate: null,
		comments: null,
		playCount: null,
		rating: null,
		location: null,
		locationHint: null,
		remixer: null,
		tonality: '8A',
		parsedKey: 9,
		parsedMode: 0,
		label: null,
		warnings: [],
		...overrides
	}
}

describe('track enrichment normalization boundary', () => {
	it('retains full artist credit while tokenizing collaborators', () => {
		expect(splitEnrichmentArtistNames('Alpha feat Beta & Gamma')).toEqual([
			'alpha feat beta & gamma',
			'alpha',
			'beta',
			'gamma'
		])
	})
})

describe('track enrichment similarity boundary', () => {
	it('keeps edit distance and fuzzy acceptance independently observable', () => {
		expect(calculateLevenshteinDistance('kitten', 'sitting')).toBe(3)
		expect(compareEnrichmentStringSets(['abcdefgh'], ['abcxefgh'])).toEqual({
			accepted: true,
			exact: false,
			similarity: 0.875
		})
	})
})

describe('track enrichment artist boundary', () => {
	it('distinguishes exact, partial, and absent artist matches', () => {
		const collaboration = createArtistMetadata(['Alpha & Beta'])

		expect(compareArtistMetadata(collaboration, collaboration)).toEqual({
			kind: 'exact',
			similarity: 1
		})
		expect(
			compareArtistMetadata(collaboration, createArtistMetadata(['Alpha']))
		).toEqual({ kind: 'partial', similarity: 1 })
		expect(
			compareArtistMetadata(collaboration, createArtistMetadata(['Gamma']))
		).toEqual({ kind: 'none', similarity: 0 })
	})
})

describe('track enrichment scoring and review boundaries', () => {
	it('preserves the exact score, reasons, and final staging projection', () => {
		const source = createSource()
		const track = createMockTrack({
			id: 'track-1',
			record_id: 'record-1',
			title: 'Cafe Track',
			artists: [{ discogs_id: 1, name: 'Test Artist', role: null }],
			duration: 180000,
			bpm: null,
			key: null,
			mode: null
		})
		const sourceMetadata = createSourceMatchMetadata(source)
		const candidateMetadata = createCandidateMatchMetadata(track, null)

		expect(
			scoreEnrichmentCandidate(source, sourceMetadata, candidateMetadata)
		).toMatchObject({
			score: 90,
			reasons: ['Title match', 'Artist match', 'Duration corroborates'],
			warnings: []
		})

		const row = projectEnrichmentReviewRow(
			source,
			prepareCandidateMatchingContext([track], [])
		)
		expect(row).toMatchObject({
			id: 'rekordboxXml-0-track-1',
			confidence: 'high',
			score: 90,
			reasons: ['Title match', 'Artist match', 'Duration corroborates'],
			canFillBpm: true,
			canFillKeyMode: true,
			defaultStaged: true,
			stagingBlockedReason: null
		})
	})

	it('projects an unmatched source without inventing a candidate', () => {
		const row = projectEnrichmentReviewRow(
			createSource({ index: 4 }),
			prepareCandidateMatchingContext([], [])
		)

		expect(row).toMatchObject({
			id: 'source-rekordboxXml-4',
			track: null,
			confidence: 'manual',
			score: 0,
			warnings: ['No matching Crate Guide track found'],
			defaultStaged: false
		})
	})
})
