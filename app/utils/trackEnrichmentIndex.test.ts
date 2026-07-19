import { describe, expect, it } from 'vitest'
import {
	type TrackEnrichmentIndexCandidate,
	canBeFuzzyTitleMatch,
	createTrackEnrichmentTitleIndex,
	getCandidateShortlist
} from './trackEnrichmentIndex'

type TestCandidate = {
	id: string
	titles: string[]
}

function createIndex(candidates: TestCandidate[]) {
	return createTrackEnrichmentTitleIndex(
		candidates.map((candidate) => ({
			identity: candidate.id,
			titles: candidate.titles,
			value: candidate
		}))
	)
}

function createSeededRandom(seed: number) {
	let state = seed >>> 0
	return () => {
		state = (Math.imul(state, 1664525) + 1013904223) >>> 0
		return state / 0x100000000
	}
}

function createTitle(random: () => number, length: number): string {
	const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
	return Array.from(
		{ length },
		() => alphabet[Math.floor(random() * alphabet.length)] ?? 'a'
	).join('')
}

function isExhaustivelyTitleAdmissible(
	sourceTitles: string[],
	candidateTitles: string[]
): boolean {
	return sourceTitles.some((sourceTitle) =>
		candidateTitles.some(
			(candidateTitle) =>
				sourceTitle === candidateTitle ||
				canBeFuzzyTitleMatch(sourceTitle, candidateTitle)
		)
	)
}

describe('track enrichment title admissibility', () => {
	it('preserves the existing length and first-character gates', () => {
		expect(canBeFuzzyTitleMatch('nova', 'nove')).toBe(true)
		expect(canBeFuzzyTitleMatch('abcdefgh', 'abcxefgh')).toBe(true)
		expect(canBeFuzzyTitleMatch('abcdefgh', 'xbcdefgh')).toBe(false)
		expect(canBeFuzzyTitleMatch('abcdefghij', 'abcdefghijklmn')).toBe(false)
	})
})

describe('track enrichment title index', () => {
	it('unions exact, long, and short buckets without duplicates in original order', () => {
		const candidates = [
			{ id: 'first', titles: ['shared signal', 'alpha signal'] },
			{ id: 'short', titles: ['nova'] },
			{ id: 'second', titles: ['shared signal'] },
			{ id: 'wrong-prefix', titles: ['xshared signal'] },
			{ id: 'wrong-length', titles: ['shared signal extended beyond gate'] }
		]

		expect(
			getCandidateShortlist(createIndex(candidates), [
				'shared signal',
				'nove'
			]).map((candidate) => candidate.id)
		).toEqual(['first', 'short', 'second'])
	})

	it('falls back to the exhaustive candidate order without a usable title', () => {
		const candidates = [
			{ id: 'first', titles: ['alpha'] },
			{ id: 'second', titles: [] }
		]

		expect(
			getCandidateShortlist(createIndex(candidates), ['', '']).map(
				(candidate) => candidate.id
			)
		).toEqual(['first', 'second'])
	})

	it('falls back when candidate identity is not safely unique', () => {
		const candidates: TrackEnrichmentIndexCandidate<TestCandidate>[] = [
			{
				identity: 'duplicate',
				titles: ['alpha signal'],
				value: { id: 'first', titles: ['alpha signal'] }
			},
			{
				identity: 'duplicate',
				titles: ['zulu signal'],
				value: { id: 'second', titles: ['zulu signal'] }
			}
		]
		const index = createTrackEnrichmentTitleIndex(candidates)

		expect(
			getCandidateShortlist(index, ['alpha signal']).map(
				(candidate) => candidate.id
			)
		).toEqual(['first', 'second'])
	})

	it('is a seeded strict superset of every title-admissible candidate', () => {
		const random = createSeededRandom(0x20cafe)
		const candidates = Array.from({ length: 500 }, (_, index) => {
			const primaryTitle = createTitle(random, 1 + Math.floor(random() * 24))
			return {
				id: `candidate-${index}`,
				titles:
					index % 7 === 0
						? [primaryTitle, createTitle(random, 1 + Math.floor(random() * 24))]
						: [primaryTitle]
			}
		})
		const index = createIndex(candidates)

		for (let sourceIndex = 0; sourceIndex < 200; sourceIndex++) {
			const sourceTitles = [
				createTitle(random, 1 + Math.floor(random() * 24)),
				createTitle(random, 1 + Math.floor(random() * 24))
			]
			const shortlist = getCandidateShortlist(index, sourceTitles)
			const shortlistIds = new Set(shortlist.map((candidate) => candidate.id))
			const admissibleCandidates = candidates.filter((candidate) =>
				isExhaustivelyTitleAdmissible(sourceTitles, candidate.titles)
			)

			for (const candidate of admissibleCandidates) {
				expect(shortlistIds.has(candidate.id)).toBe(true)
			}
			expect(shortlist.map((candidate) => candidate.id)).toEqual(
				[...shortlist]
					.sort(
						(left, right) =>
							Number(left.id.split('-')[1]) - Number(right.id.split('-')[1])
					)
					.map((candidate) => candidate.id)
			)
			expect(shortlistIds.size).toBe(shortlist.length)
		}
	})

	it('reduces representative candidate evaluations to at most 15 percent', () => {
		const alphabet = 'abcdefghijklmnopqrstuvwxyz'
		const candidates = Array.from({ length: 10_000 }, (_, index) => {
			const length = 8 + (index % 24)
			const firstCharacter = alphabet[index % alphabet.length] ?? 'a'
			const suffix = index.toString(36).padEnd(length - 1, 'x')
			return {
				id: `candidate-${index}`,
				titles: [`${firstCharacter}${suffix.slice(0, length - 1)}`]
			}
		})
		const index = createIndex(candidates)
		const sourceTitles = Array.from(
			{ length: 100 },
			(_, sourceIndex) => candidates[(sourceIndex * 97) % candidates.length]!
		).map((candidate) => candidate.titles[0]!)
		const exhaustiveCandidateEvaluations =
			sourceTitles.length * candidates.length
		const indexedCandidateEvaluations = sourceTitles.reduce(
			(total, sourceTitle) =>
				total + getCandidateShortlist(index, [sourceTitle]).length,
			0
		)

		expect(indexedCandidateEvaluations).toBeLessThanOrEqual(
			exhaustiveCandidateEvaluations * 0.15
		)
	})

	it('documents the complete same-prefix worst case without a reduction claim', () => {
		const candidates = Array.from({ length: 10_000 }, (_, index) => ({
			id: `candidate-${index}`,
			titles: [`a${index.toString().padStart(11, '0')}`]
		}))

		// Every candidate shares the source's required prefix and admissible length,
		// so completeness intentionally wins over a reduction in this adversarial case.
		expect(
			getCandidateShortlist(createIndex(candidates), ['a00000000000'])
		).toHaveLength(10_000)
	})
})
