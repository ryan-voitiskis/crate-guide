import { describe, expect, it } from 'vitest'
import {
	CLOUD_COPY_GRAPH_COUNT_KEYS,
	type CloudCopyGraphCounts,
	decideCloudCopyDestination
} from './cloudCopyDestination'

function emptyCounts(
	overrides: Partial<CloudCopyGraphCounts> = {}
): CloudCopyGraphCounts {
	return {
		records: 0,
		tracks: 0,
		crates: 0,
		sets: 0,
		managedCoverReferences: 0,
		managedCoverObjects: 0,
		activeCopyReceipts: 0,
		finalizedCopyReceipts: 0,
		...overrides
	}
}

const safetyBoundary = {
	preserveActiveWorkspace: 'local',
	automaticUpload: 'forbidden',
	automaticSwitch: 'forbidden',
	automaticMerge: 'unavailable'
} as const

describe('decideCloudCopyDestination', () => {
	it('offers an explicit copy only after every library-owned count is zero', () => {
		const counts = emptyCounts()
		expect(decideCloudCopyDestination({ state: 'complete', counts })).toEqual({
			...safetyBoundary,
			status: 'empty',
			counts,
			choices: ['copy-local-to-cloud', 'open-empty-cloud', 'continue-local']
		})
	})

	it.each(CLOUD_COPY_GRAPH_COUNT_KEYS)(
		'treats a positive %s count as nonempty and never offers copy or merge',
		(key) => {
			const counts = emptyCounts({ [key]: 1 })
			const result = decideCloudCopyDestination({ state: 'complete', counts })
			expect(result).toEqual({
				...safetyBoundary,
				status: 'nonempty',
				counts,
				nonemptyReasons: [key],
				choices: [
					'continue-local',
					'open-cloud',
					'export-local',
					'export-cloud'
				]
			})
			expect(result.choices).not.toContain('copy-local-to-cloud')
		}
	)

	it('reports all nonempty reasons in contract order', () => {
		const result = decideCloudCopyDestination({
			state: 'complete',
			counts: emptyCounts({
				tracks: 12,
				managedCoverObjects: 2,
				finalizedCopyReceipts: 1
			})
		})
		expect(result).toMatchObject({
			status: 'nonempty',
			nonemptyReasons: [
				'tracks',
				'managedCoverObjects',
				'finalizedCopyReceipts'
			]
		})
	})

	it.each([
		{ state: 'offline' as const, reason: 'offline' },
		{ state: 'error' as const, reason: 'inspection-error' }
	])(
		'keeps Local active when destination inspection is $state',
		(inspection) => {
			expect(decideCloudCopyDestination(inspection)).toEqual({
				...safetyBoundary,
				status: 'inspection-unavailable',
				reason: inspection.reason,
				choices: ['continue-local', 'retry-inspection']
			})
		}
	)

	it.each([
		-1,
		0.5,
		Number.NaN,
		Number.POSITIVE_INFINITY,
		Number.MAX_SAFE_INTEGER + 1
	])('fails closed for invalid inspection count %s', (invalidCount) => {
		const counts = emptyCounts({ records: invalidCount })
		expect(decideCloudCopyDestination({ state: 'complete', counts })).toEqual({
			...safetyBoundary,
			status: 'inspection-unavailable',
			reason: 'invalid-inspection',
			choices: ['continue-local', 'retry-inspection']
		})
	})
})
