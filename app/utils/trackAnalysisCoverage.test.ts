import { describe, expect, it } from 'vitest'
import { summarizeTrackAnalysisCoverage } from './trackAnalysisCoverage'

function track(bpm: number | null, key: number | null, mode: number | null) {
	return { bpm, key, mode }
}

describe('summarizeTrackAnalysisCoverage', () => {
	it('reports an empty library as 0% without dividing by zero', () => {
		expect(summarizeTrackAnalysisCoverage([])).toEqual({
			total: 0,
			withBpm: 0,
			withKey: 0,
			withBpmAndKey: 0,
			missingBpm: 0,
			missingKey: 0,
			missingAnalysis: 0,
			percentWithBpmAndKey: 0
		})
	})

	it('counts a key only when both pitch class and mode are set', () => {
		const coverage = summarizeTrackAnalysisCoverage([
			track(124, 0, 1),
			track(124, 5, null),
			track(null, null, 0),
			track(null, 7, 0)
		])
		expect(coverage).toMatchObject({
			total: 4,
			withBpm: 2,
			withKey: 2,
			withBpmAndKey: 1,
			missingBpm: 2,
			missingKey: 2,
			missingAnalysis: 3,
			percentWithBpmAndKey: 25
		})
	})

	it('treats zero as a present value, not a missing one', () => {
		expect(summarizeTrackAnalysisCoverage([track(0, 0, 0)]).withBpmAndKey).toBe(
			1
		)
	})

	it('floors the percentage so an incomplete library never reads 100%', () => {
		const tracks = [
			...Array.from({ length: 199 }, () => track(120, 1, 1)),
			track(null, 1, 1)
		]
		expect(summarizeTrackAnalysisCoverage(tracks).percentWithBpmAndKey).toBe(99)
		expect(
			summarizeTrackAnalysisCoverage([track(120, 1, 1), track(121, 2, 0)])
				.percentWithBpmAndKey
		).toBe(100)
	})

	it('agrees with the count beside it where floating point would round down', () => {
		const tracks = Array.from({ length: 100 }, (_, index) =>
			index < 29 ? track(120, 1, 1) : track(null, null, null)
		)
		expect(summarizeTrackAnalysisCoverage(tracks).percentWithBpmAndKey).toBe(29)
	})
})
