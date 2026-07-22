import { describe, expect, it } from 'vitest'
import type {
	LocalStorageEstimateOutcome,
	LocalStorageHealthInput,
	LocalStoragePersistenceOutcome
} from './localStorageHealthLabels'
import { buildLocalStorageHealthLabels } from './localStorageHealthLabels'

const persistenceCases = [
	{
		outcome: 'granted',
		expected: {
			state: 'protected',
			label: 'Protected from automatic cleanup'
		}
	},
	{
		outcome: 'not-granted',
		expected: { state: 'browser-managed', label: 'Browser-managed' }
	},
	{
		outcome: 'unsupported',
		expected: { state: 'unknown', label: 'Unknown' }
	},
	{
		outcome: 'error',
		expected: { state: 'unknown', label: 'Unknown' }
	},
	{
		outcome: 'not-requested',
		expected: { state: 'unknown', label: 'Unknown' }
	}
] as const satisfies readonly {
	outcome: LocalStoragePersistenceOutcome
	expected: { state: string; label: string }
}[]

const estimateCases = [
	{
		outcome: { status: 'available', usageBytes: 250, quotaBytes: 1000 },
		expected: {
			state: 'available',
			label: 'Approximate usage and quota',
			usageBytes: 250,
			quotaBytes: 1000,
			usageRatio: 0.25
		}
	},
	{
		outcome: { status: 'unsupported' },
		expected: {
			state: 'unknown',
			label: 'Storage estimate unavailable',
			reason: 'unsupported'
		}
	},
	{
		outcome: { status: 'error' },
		expected: {
			state: 'unknown',
			label: 'Storage estimate unavailable',
			reason: 'error'
		}
	},
	{
		outcome: { status: 'not-requested' },
		expected: {
			state: 'unknown',
			label: 'Storage estimate unavailable',
			reason: 'not-requested'
		}
	}
] as const satisfies readonly {
	outcome: LocalStorageEstimateOutcome
	expected: Record<string, unknown>
}[]

function labels(overrides: Partial<LocalStorageHealthInput> = {}) {
	return buildLocalStorageHealthLabels({
		persistence: 'not-requested',
		estimate: { status: 'not-requested' },
		...overrides
	})
}

describe('Local storage health labels', () => {
	it.each(persistenceCases)(
		'labels persistence outcome $outcome truthfully',
		({ expected, outcome }) => {
			expect(labels({ persistence: outcome }).cleanupProtection).toEqual(
				expected
			)
		}
	)

	it.each(estimateCases)(
		'labels estimate outcome $outcome.status truthfully',
		({ expected, outcome }) => {
			expect(labels({ estimate: outcome }).estimate).toEqual(expected)
		}
	)

	it('does not invent a percentage for a zero-byte quota', () => {
		expect(
			labels({
				estimate: { status: 'available', usageBytes: 0, quotaBytes: 0 }
			}).estimate
		).toEqual({
			state: 'available',
			label: 'Approximate usage and quota',
			usageBytes: 0,
			quotaBytes: 0,
			usageRatio: null
		})
	})

	it.each([
		{ status: 'available', usageBytes: -1, quotaBytes: 100 },
		{ status: 'available', usageBytes: 101, quotaBytes: 100 },
		{ status: 'available', usageBytes: Number.NaN, quotaBytes: 100 },
		{
			status: 'available',
			usageBytes: 1,
			quotaBytes: Number.POSITIVE_INFINITY
		},
		{ status: 'unexpected' }
	] as unknown as LocalStorageEstimateOutcome[])(
		'fails closed for invalid estimate %#',
		(estimate) => {
			expect(labels({ estimate }).estimate).toEqual({
				state: 'unknown',
				label: 'Storage estimate unavailable',
				reason: 'invalid-estimate'
			})
		}
	)

	it('fails closed for an invalid persistence outcome', () => {
		expect(
			labels({
				persistence: 'persisted-forever' as LocalStoragePersistenceOutcome
			}).cleanupProtection
		).toEqual({ state: 'unknown', label: 'Unknown' })
	})

	it('keeps persistence and estimate outcomes independent across every pair', () => {
		let permutations = 0
		for (const persistenceCase of persistenceCases) {
			for (const estimateCase of estimateCases) {
				permutations += 1
				const result = labels({
					persistence: persistenceCase.outcome,
					estimate: estimateCase.outcome
				})
				expect(result.cleanupProtection).toEqual(persistenceCase.expected)
				expect(result.estimate).toEqual(estimateCase.expected)
			}
		}
		expect(permutations).toBe(20)
	})

	it('always states the durability and next-write boundaries', () => {
		expect(labels()).toMatchObject({
			durabilityBoundary:
				'Does not protect against manual site-data clearing or device/profile loss.',
			nextWritePrediction: 'not-supported'
		})
	})
})
