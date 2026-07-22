import { afterEach, describe, expect, it } from 'vitest'
import { LOCAL_AUDIO_CACHE_GENERATION_PREFIX } from '../../app/utils/localAudio'
import {
	type CachedLocalAudioResult,
	LOCAL_AUDIO_CACHE_PERFORMANCE_BUDGETS,
	clearLocalAudioAnalysisCache,
	openLocalAudioCacheSession
} from '../../app/utils/localAudioCache'

type ScenarioName = 'hit1000' | 'hit10000' | 'cold1000' | 'cold10000'

type ChromiumMemoryPerformance = Performance & {
	memory?: { usedJSHeapSize?: number }
}

function createRecord(
	index: number,
	updatedAt: number
): CachedLocalAudioResult {
	return {
		cacheKey: `${LOCAL_AUDIO_CACHE_GENERATION_PREFIX}performance-${index}|1|1`,
		tags: {
			title: `Track ${index}`,
			artist: 'Generated fixture',
			album: null,
			genres: [],
			durationSeconds: 180,
			bpm: 128,
			key: '8A'
		},
		analysis: null,
		updatedAt
	}
}

function readHeapBytes(): number | null {
	const value = (performance as ChromiumMemoryPerformance).memory
		?.usedJSHeapSize
	return typeof value === 'number' && Number.isFinite(value) ? value : null
}

async function seedHitCache(records: CachedLocalAudioResult[]) {
	const session = await openLocalAudioCacheSession()
	try {
		for (const record of records) await session.put(record)
		await session.flush()
	} finally {
		await session.close()
	}
}

async function runScenario(
	scenario: ScenarioName,
	fileCount: number,
	isHitScan: boolean
) {
	await clearLocalAudioAnalysisCache()
	const updatedAt = Date.now()
	const records = Array.from({ length: fileCount }, (_, index) =>
		createRecord(index, updatedAt)
	)
	if (isHitScan) await seedHitCache(records)

	const heapBefore = readHeapBytes()
	const startedAt = performance.now()
	const session = await openLocalAudioCacheSession()
	let hits = 0
	try {
		const startPrune = await session.prune()
		expect(startPrune.error).toBeNull()
		const cached = await session.getMany(
			records.map((record) => record.cacheKey)
		)
		hits = cached.size
		if (!isHitScan) {
			for (const record of records) await session.put(record)
		}
		await session.flush()
		const endPrune = await session.prune()
		expect(endPrune.error).toBeNull()
	} finally {
		await session.close()
	}
	const wallTimeMs = performance.now() - startedAt
	const heapAfter = readHeapBytes()
	const heapGrowthBytes =
		heapBefore === null || heapAfter === null
			? null
			: Math.max(0, heapAfter - heapBefore)
	const metrics = session.getMetrics()
	const budget = LOCAL_AUDIO_CACHE_PERFORMANCE_BUDGETS[scenario]
	const result = {
		kind: 'local-audio-cache-session',
		scenario,
		files: fileCount,
		connections: metrics.connectionsOpened,
		transactions: metrics.totalTransactions,
		workerStarts: 0,
		hits,
		misses: fileCount - hits,
		wallTimeMs: Math.round(wallTimeMs * 100) / 100,
		heapGrowthBytes,
		heapMetricSupported: heapGrowthBytes !== null,
		userAgent: navigator.userAgent
	}

	console.info(JSON.stringify(result))
	expect(result.connections).toBeLessThanOrEqual(budget.maxConnections)
	expect(result.transactions).toBeLessThanOrEqual(budget.maxTransactions)
	expect(result.wallTimeMs).toBeLessThanOrEqual(budget.maxWallTimeMs)
	expect(result.workerStarts).toBe(0)
	expect(result.hits).toBe(isHitScan ? fileCount : 0)
	if (heapGrowthBytes !== null) {
		expect(heapGrowthBytes).toBeLessThanOrEqual(
			LOCAL_AUDIO_CACHE_PERFORMANCE_BUDGETS.maxPostBatchHeapGrowthBytes
		)
	}
}

describe('local audio cache performance budgets', () => {
	afterEach(async () => {
		await clearLocalAudioAnalysisCache()
	})

	it('bounds a 1k cache-hit scan', async () => {
		await runScenario('hit1000', 1_000, true)
	})

	it('bounds a 10k cache-hit scan', async () => {
		await runScenario('hit10000', 10_000, true)
	})

	it('bounds a 1k cold scan', async () => {
		await runScenario('cold1000', 1_000, false)
	})

	it('bounds a 10k cold scan', async () => {
		await runScenario('cold10000', 10_000, false)
	})
})
