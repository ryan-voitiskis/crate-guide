import { KeepAlive, defineComponent, h, nextTick, ref } from 'vue'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { type VueWrapper, flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
	type LocalAudioAnalysisDependencies,
	useLocalAudioAnalysis
} from '~/composables/useLocalAudioAnalysis'
import type {
	LocalAudioAnalysis,
	LocalAudioTagMetadata,
	LocalAudioWorkerResponse
} from '~/types/localAudio'
import type {
	CachedLocalAudioResult,
	LocalAudioCacheSession
} from '~/utils/localAudioCache'
import {
	LOCAL_AUDIO_DECODE_SKIP_MESSAGES,
	type LocalAudioDecodeDecision
} from '~/utils/localAudioDecodePolicy'

class FakeWorker {
	onmessage: ((event: MessageEvent<LocalAudioWorkerResponse>) => void) | null =
		null
	onerror: ((event: ErrorEvent) => void) | null = null
	postMessage = vi.fn()
	terminate = vi.fn()

	respond(response: LocalAudioWorkerResponse) {
		this.onmessage?.({
			data: response
		} as MessageEvent<LocalAudioWorkerResponse>)
	}
}

const missingTags: LocalAudioTagMetadata = {
	title: 'Missing metadata',
	artist: 'Test Artist',
	album: 'Test Album',
	genres: [],
	durationSeconds: null,
	bpm: null,
	key: null
}

const completeTags: LocalAudioTagMetadata = {
	...missingTags,
	title: 'Complete metadata',
	durationSeconds: 1,
	bpm: 128,
	key: 'C minor'
}

function createAnalysis(
	overrides: Partial<LocalAudioAnalysis> = {}
): LocalAudioAnalysis {
	return {
		analyzerVersion: 'test-analyzer',
		configurationVersion: 'test-configuration',
		bpm: 128,
		bpmConfidence: 2,
		bpmEstimates: [128],
		key: 'C',
		scale: 'minor',
		keyStrength: 0.9,
		sampleRate: 44_100,
		durationSeconds: 1,
		analyzedDurationSeconds: 1,
		analysisOffsetSeconds: 0,
		warnings: [],
		...overrides
	}
}

function createSafeDecodeDecision(): LocalAudioDecodeDecision {
	return {
		kind: 'safe',
		metadata: {
			container: 'wav',
			codec: 'pcm',
			durationSeconds: 1,
			sampleRate: 44_100,
			channels: 1,
			bitsPerSample: 16,
			dataBytes: 88_200
		},
		envelope: {
			fileBytes: 20,
			headerBytes: 10,
			decodedPcmBytes: 352_800,
			analysisPcmBytes: 529_200,
			fixedSafetyMarginBytes: 33_554_432,
			totalPeakBytes: 34_436_462
		}
	}
}

function createCacheSessionFixture(): LocalAudioCacheSession {
	return {
		getMany: vi.fn().mockResolvedValue(new Map()),
		put: vi.fn().mockResolvedValue(undefined),
		flush: vi.fn().mockResolvedValue(undefined),
		prune: vi.fn().mockResolvedValue({
			obsoleteGenerationEntries: 0,
			expiredEntries: 0,
			overflowEntries: 0,
			lastPrunedAt: 123_456,
			error: null
		}),
		getMetrics: vi.fn().mockReturnValue({
			connectionsOpened: 1,
			readTransactions: 1,
			writeTransactions: 0,
			pruneTransactions: 0,
			totalTransactions: 1,
			requestedRecords: 1,
			cacheHits: 0,
			cacheMisses: 1,
			queuedWrites: 0,
			committedWrites: 0
		}),
		close: vi.fn().mockResolvedValue(undefined)
	}
}

function createDependencyFixture(
	overrides: Partial<LocalAudioAnalysisDependencies> = {}
) {
	const workers: FakeWorker[] = []
	const decodedSamples = new Float32Array([0.1, -0.1, 0.2, -0.2])
	const decodedBuffer = {
		duration: 1,
		sampleRate: 44_100,
		length: decodedSamples.length,
		numberOfChannels: 1,
		getChannelData: () => decodedSamples
	} as unknown as AudioBuffer
	const audioContext = {
		sampleRate: 44_100,
		decodeAudioData: vi.fn().mockResolvedValue(decodedBuffer),
		close: vi.fn().mockResolvedValue(undefined)
	} as unknown as AudioContext
	const cacheSession = createCacheSessionFixture()
	let requestId = 0
	const dependencies: LocalAudioAnalysisDependencies = {
		createWorker: vi.fn(() => {
			const worker = new FakeWorker()
			workers.push(worker)
			return worker as unknown as Worker
		}),
		createRequestId: vi.fn(() => `request-${++requestId}`),
		createAudioContext: vi.fn(() => audioContext),
		createOfflineAudioContext: vi.fn(() => {
			throw new Error(
				'OfflineAudioContext should not be needed by this fixture'
			)
		}),
		readTags: vi.fn().mockResolvedValue(missingTags),
		inspectDecodeSafety: vi.fn().mockResolvedValue(createSafeDecodeDecision()),
		openCacheSession: vi.fn().mockResolvedValue(cacheSession),
		performanceNow: vi.fn().mockReturnValue(1_000),
		currentTime: vi.fn().mockReturnValue(123_456),
		getDirectoryPicker: vi.fn().mockReturnValue(undefined),
		...overrides
	}

	return { dependencies, workers, audioContext, cacheSession }
}

function createFile(name: string, relativePath?: string): File {
	const file = new File(['test audio'], name, {
		type: 'audio/mpeg',
		lastModified: 1
	})
	if (relativePath) {
		Object.defineProperty(file, 'webkitRelativePath', {
			configurable: true,
			value: relativePath
		})
	}
	return file
}

const wrappers = new Set<VueWrapper>()

async function mountAnalysis(
	dependencies: Partial<LocalAudioAnalysisDependencies>
) {
	let analysis!: ReturnType<typeof useLocalAudioAnalysis>
	const Harness = defineComponent({
		setup() {
			analysis = useLocalAudioAnalysis(dependencies)
			return () => h('div')
		}
	})
	const wrapper = await mountSuspended(Harness)
	wrappers.add(wrapper)
	await nextTick()
	return { analysis, wrapper }
}

async function mountKeepAliveAnalysis(
	dependencies: Partial<LocalAudioAnalysisDependencies>
) {
	let analysis!: ReturnType<typeof useLocalAudioAnalysis>
	const active = ref(true)
	const Child = defineComponent({
		setup() {
			analysis = useLocalAudioAnalysis(dependencies)
			return () => h('div', { 'data-testid': 'analysis-child' })
		}
	})
	const Harness = defineComponent({
		setup() {
			return () =>
				h(KeepAlive, null, {
					default: () => (active.value ? h(Child) : null)
				})
		}
	})
	const wrapper = await mountSuspended(Harness)
	wrappers.add(wrapper)
	await nextTick()
	return { active, analysis, wrapper }
}

async function flushUntilWorkerPosted(
	fixture: {
		workers: FakeWorker[]
	},
	expectedCount = 1
) {
	for (let attempt = 0; attempt < 10; attempt += 1) {
		await flushPromises()
		await nextTick()
		if (
			(fixture.workers[0]?.postMessage.mock.calls.length ?? 0) >= expectedCount
		) {
			return
		}
	}
	throw new Error('Worker request was not posted')
}

function unmountTracked(wrapper: VueWrapper) {
	if (!wrappers.has(wrapper)) return
	wrapper.unmount()
	wrappers.delete(wrapper)
}

function getPostedRequest(worker: FakeWorker) {
	const request = worker.postMessage.mock.calls[0]?.[0]
	expect(request).toBeDefined()
	return request as { id: string }
}

describe('useLocalAudioAnalysis', () => {
	afterEach(() => {
		for (const wrapper of wrappers) wrapper.unmount()
		wrappers.clear()
		vi.restoreAllMocks()
		vi.useRealTimers()
		document.body.innerHTML = ''
	})

	it('filters unsupported files and sorts selected paths', async () => {
		const { dependencies } = createDependencyFixture()
		const { analysis } = await mountAnalysis(dependencies)

		analysis.setFiles([
			createFile('z-last.mp3'),
			createFile('notes.txt'),
			createFile('a-first.wav', 'Album/a-first.wav')
		])

		expect(analysis.entries.value.map((entry) => entry.relativePath)).toEqual([
			'Album/a-first.wav',
			'z-last.mp3'
		])
		expect(analysis.statusMessage.value).toBe('2 audio files ready')
	})

	it('uses a complete cached result without tags, decoding, or a Worker', async () => {
		const cachedAnalysis = createAnalysis()
		const fixture = createDependencyFixture()
		const cachedResult: CachedLocalAudioResult = {
			cacheKey: 'cached-key',
			tags: completeTags,
			analysis: cachedAnalysis,
			updatedAt: 1
		}
		vi.mocked(fixture.cacheSession.getMany).mockImplementation(
			async (keys) => new Map([[keys[0]!, cachedResult]])
		)
		const { analysis } = await mountAnalysis(fixture.dependencies)
		analysis.setFiles([createFile('cached.mp3')])

		await analysis.analyzeNextBatch(1)

		expect(analysis.entries.value[0]?.status).toBe('cached')
		expect(analysis.entries.value[0]?.source?.analysis).toEqual(cachedAnalysis)
		expect(fixture.dependencies.readTags).not.toHaveBeenCalled()
		expect(fixture.dependencies.createAudioContext).not.toHaveBeenCalled()
		expect(fixture.dependencies.createWorker).not.toHaveBeenCalled()
		expect(fixture.cacheSession.put).not.toHaveBeenCalled()
	})

	it('opens one cache session and batches lookup/write lifecycle for a scan', async () => {
		const fixture = createDependencyFixture({
			readTags: vi.fn().mockResolvedValue(completeTags)
		})
		const { analysis } = await mountAnalysis(fixture.dependencies)
		analysis.setFiles([
			createFile('one.mp3'),
			createFile('two.mp3'),
			createFile('three.mp3')
		])

		await analysis.scanMetadata()

		expect(fixture.dependencies.openCacheSession).toHaveBeenCalledTimes(1)
		expect(fixture.cacheSession.getMany).toHaveBeenCalledTimes(1)
		expect(
			vi.mocked(fixture.cacheSession.getMany).mock.calls[0]?.[0]
		).toHaveLength(3)
		expect(fixture.cacheSession.put).toHaveBeenCalledTimes(3)
		expect(fixture.cacheSession.flush).toHaveBeenCalledTimes(1)
		expect(fixture.cacheSession.prune).toHaveBeenCalledTimes(2)
		expect(fixture.cacheSession.close).toHaveBeenCalledTimes(1)
		expect(analysis.lastCacheMetrics.value?.connectionsOpened).toBe(1)
	})

	it('keeps scanning when the disposable analysis cache cannot open', async () => {
		const fixture = createDependencyFixture({
			readTags: vi.fn().mockResolvedValue(completeTags),
			openCacheSession: vi
				.fn()
				.mockRejectedValue(new Error('IndexedDB blocked'))
		})
		const { analysis } = await mountAnalysis(fixture.dependencies)
		analysis.setFiles([createFile('uncached.mp3')])

		await analysis.scanMetadata()

		expect(analysis.entries.value[0]?.status).toBe('complete')
		expect(analysis.entries.value[0]?.error).toBeNull()
		expect(analysis.cacheWarning.value).toContain('IndexedDB blocked')
	})

	it('decodes missing metadata and settles only the matching Worker success', async () => {
		const fixture = createDependencyFixture()
		const { analysis } = await mountAnalysis(fixture.dependencies)
		analysis.setFiles([createFile('missing.mp3')])

		const batch = analysis.analyzeNextBatch(1)
		await vi.waitFor(() => {
			expect(fixture.workers[0]?.postMessage).toHaveBeenCalledTimes(1)
		})
		const worker = fixture.workers[0]
		expect(worker).toBeDefined()
		const request = getPostedRequest(worker as FakeWorker)
		worker?.respond({ id: 'unrelated-request', result: createAnalysis() })
		await flushPromises()
		expect(analysis.entries.value[0]?.status).toBe('analyzing')

		const result = createAnalysis({ bpm: 129 })
		worker?.respond({ id: request.id, result })
		await batch

		expect(fixture.dependencies.readTags).toHaveBeenCalledTimes(1)
		expect(fixture.dependencies.inspectDecodeSafety).toHaveBeenCalledTimes(1)
		expect(fixture.dependencies.createAudioContext).toHaveBeenCalledTimes(1)
		expect(worker?.postMessage).toHaveBeenCalledTimes(1)
		expect(analysis.entries.value[0]?.status).toBe('complete')
		expect(analysis.entries.value[0]?.source?.analysis).toEqual(result)
	})

	it('keeps an oversized two-hour file as tags-only without decode allocations', async () => {
		const file = createFile('two-hours.wav')
		const wholeFileRead = vi.fn(() => Promise.resolve(new ArrayBuffer(0)))
		Object.defineProperty(file, 'arrayBuffer', { value: wholeFileRead })
		const fixture = createDependencyFixture({
			inspectDecodeSafety: vi.fn().mockResolvedValue({
				kind: 'tags-only',
				code: 'budget',
				message: LOCAL_AUDIO_DECODE_SKIP_MESSAGES.budget,
				metadata: {
					container: 'wav',
					codec: 'pcm',
					durationSeconds: 7_200,
					sampleRate: 44_100,
					channels: 2,
					bitsPerSample: 16,
					dataBytes: 1_270_080_000
				},
				envelope: {
					fileBytes: 2_540_160_088,
					headerBytes: 44,
					decodedPcmBytes: 5_080_320_000,
					analysisPcmBytes: 95_256_000,
					fixedSafetyMarginBytes: 33_554_432,
					totalPeakBytes: 7_749_290_564
				}
			})
		})
		const { analysis } = await mountAnalysis(fixture.dependencies)
		analysis.setFiles([file])

		await analysis.analyzeNextBatch(1)

		const entry = analysis.entries.value[0]
		expect(entry?.status).toBe('tags-only')
		expect(entry?.analysisSkipReason).toBe(
			LOCAL_AUDIO_DECODE_SKIP_MESSAGES.budget
		)
		expect(entry?.source?.totalTimeSeconds).toBe(7_200)
		expect(entry?.source?.analysis).toBeNull()
		expect(analysis.analysisSkippedCount.value).toBe(1)
		expect(analysis.analysisCandidateCount.value).toBe(0)
		expect(wholeFileRead).not.toHaveBeenCalled()
		expect(fixture.dependencies.createAudioContext).not.toHaveBeenCalled()
		expect(
			fixture.dependencies.createOfflineAudioContext
		).not.toHaveBeenCalled()
		expect(fixture.dependencies.createWorker).not.toHaveBeenCalled()
		expect(fixture.cacheSession.put).toHaveBeenCalledWith(
			expect.objectContaining({ analysis: null })
		)

		await analysis.analyzeNextBatch(1, true)
		expect(fixture.dependencies.inspectDecodeSafety).toHaveBeenCalledTimes(1)
	})

	it('exposes metadata checking as a distinct progress state', async () => {
		let resolveDecision!: (decision: LocalAudioDecodeDecision) => void
		const fixture = createDependencyFixture({
			inspectDecodeSafety: vi.fn(
				() =>
					new Promise<LocalAudioDecodeDecision>((resolve) => {
						resolveDecision = resolve
					})
			)
		})
		const { analysis } = await mountAnalysis(fixture.dependencies)
		analysis.setFiles([createFile('checking.wav')])

		const batch = analysis.analyzeNextBatch(1)
		await vi.waitFor(() => {
			expect(analysis.entries.value[0]?.status).toBe('checking-budget')
		})
		resolveDecision({
			kind: 'tags-only',
			code: 'metadata',
			message: LOCAL_AUDIO_DECODE_SKIP_MESSAGES.metadata,
			metadata: null,
			envelope: null
		})
		await batch

		expect(analysis.entries.value[0]?.status).toBe('tags-only')
		expect(fixture.dependencies.createAudioContext).not.toHaveBeenCalled()
	})

	it('turns a verified-path decoder failure into an honest tags-only result', async () => {
		const decodeAudioData = vi
			.fn()
			.mockRejectedValue(new Error('Synthetic decoder failure'))
		const close = vi.fn().mockResolvedValue(undefined)
		const fixture = createDependencyFixture({
			createAudioContext: vi.fn(
				() =>
					({
						sampleRate: 44_100,
						decodeAudioData,
						close
					}) as unknown as AudioContext
			)
		})
		const { analysis } = await mountAnalysis(fixture.dependencies)
		analysis.setFiles([createFile('decoder-error.wav')])

		await analysis.analyzeNextBatch(1)

		const entry = analysis.entries.value[0]
		expect(entry?.status).toBe('tags-only')
		expect(entry?.analysisSkipReason).toBe(
			LOCAL_AUDIO_DECODE_SKIP_MESSAGES.decodeFailed
		)
		expect(entry?.error).toBeNull()
		expect(decodeAudioData).toHaveBeenCalledTimes(1)
		expect(close).toHaveBeenCalledTimes(1)
		expect(
			fixture.dependencies.createOfflineAudioContext
		).not.toHaveBeenCalled()
		expect(fixture.dependencies.createWorker).not.toHaveBeenCalled()
	})

	it('refuses a browser decode rate mismatch before reading the full file', async () => {
		const file = createFile('rate-mismatch.wav')
		const wholeFileRead = vi.fn(() => Promise.resolve(new ArrayBuffer(0)))
		Object.defineProperty(file, 'arrayBuffer', { value: wholeFileRead })
		const decodeAudioData = vi.fn()
		const close = vi.fn().mockResolvedValue(undefined)
		const fixture = createDependencyFixture({
			createAudioContext: vi.fn(
				() =>
					({
						sampleRate: 96_000,
						decodeAudioData,
						close
					}) as unknown as AudioContext
			)
		})
		const { analysis } = await mountAnalysis(fixture.dependencies)
		analysis.setFiles([file])

		await analysis.analyzeNextBatch(1)

		expect(analysis.entries.value[0]).toMatchObject({
			status: 'tags-only',
			analysisSkipReason: LOCAL_AUDIO_DECODE_SKIP_MESSAGES.decodeFailed,
			error: null
		})
		expect(wholeFileRead).not.toHaveBeenCalled()
		expect(decodeAudioData).not.toHaveBeenCalled()
		expect(close).toHaveBeenCalledTimes(1)
		expect(fixture.dependencies.createWorker).not.toHaveBeenCalled()
	})

	it('settles a matching Worker error response as an entry error', async () => {
		vi.useFakeTimers()
		const fixture = createDependencyFixture()
		const { analysis } = await mountAnalysis(fixture.dependencies)
		analysis.setFiles([createFile('worker-error.mp3')])

		const batch = analysis.analyzeNextBatch(1)
		await flushUntilWorkerPosted(fixture)
		const worker = fixture.workers[0] as FakeWorker
		const request = getPostedRequest(worker)
		worker.respond({ id: 'unrelated-request', error: 'Wrong request' })
		await flushPromises()
		expect(analysis.entries.value[0]?.status).toBe('analyzing')

		worker.respond({ id: request.id, error: 'Analyzer failed' })
		await batch

		expect(analysis.entries.value[0]?.status).toBe('error')
		expect(analysis.entries.value[0]?.error).toBe('Analyzer failed')
		expect(worker.terminate).not.toHaveBeenCalled()
		await vi.advanceTimersByTimeAsync(30_000)
		expect(worker.terminate).toHaveBeenCalledTimes(1)
	})

	it('cleans up a request when posting to the Worker fails synchronously', async () => {
		vi.useFakeTimers()
		const worker = new FakeWorker()
		worker.postMessage.mockImplementation(() => {
			throw new DOMException('Transfer failed', 'DataCloneError')
		})
		const fixture = createDependencyFixture({
			createWorker: vi.fn(() => worker as unknown as Worker)
		})
		const { analysis } = await mountAnalysis(fixture.dependencies)
		analysis.setFiles([createFile('worker-transfer-error.mp3')])

		await analysis.analyzeNextBatch(1)

		expect(analysis.entries.value[0]?.status).toBe('error')
		expect(analysis.entries.value[0]?.error).toBe('Transfer failed')
		expect(analysis.workerStartCount.value).toBe(1)
		await vi.advanceTimersByTimeAsync(30_000)
		expect(worker.terminate).toHaveBeenCalledTimes(1)
	})

	it('reuses an immediate Worker and terminates it after 30 seconds idle', async () => {
		vi.useFakeTimers()
		const fixture = createDependencyFixture()
		const { analysis } = await mountAnalysis(fixture.dependencies)
		analysis.setFiles([createFile('first.mp3')])

		const firstBatch = analysis.analyzeNextBatch(1)
		await flushUntilWorkerPosted(fixture)
		const worker = fixture.workers[0] as FakeWorker
		worker.respond({
			id: getPostedRequest(worker).id,
			result: createAnalysis()
		})
		await firstBatch

		analysis.setFiles([createFile('second.mp3')])
		const secondBatch = analysis.analyzeNextBatch(1)
		await flushUntilWorkerPosted(fixture, 2)
		expect(worker.postMessage).toHaveBeenCalledTimes(2)
		const secondRequest = worker.postMessage.mock.calls[1]?.[0] as {
			id: string
		}
		worker.respond({ id: secondRequest.id, result: createAnalysis() })
		await secondBatch

		expect(fixture.dependencies.createWorker).toHaveBeenCalledTimes(1)
		expect(analysis.workerStartCount.value).toBe(1)
		await vi.advanceTimersByTimeAsync(29_999)
		expect(worker.terminate).not.toHaveBeenCalled()
		await vi.advanceTimersByTimeAsync(1)
		expect(worker.terminate).toHaveBeenCalledTimes(1)
	})

	it('keeps an active deactivated batch alive and restarts idle time on activation', async () => {
		vi.useFakeTimers()
		const fixture = createDependencyFixture()
		const { active, analysis } = await mountKeepAliveAnalysis(
			fixture.dependencies
		)
		analysis.setFiles([createFile('background.mp3')])

		const batch = analysis.analyzeNextBatch(1)
		await flushUntilWorkerPosted(fixture)
		const worker = fixture.workers[0] as FakeWorker
		active.value = false
		await nextTick()
		expect(worker.terminate).not.toHaveBeenCalled()

		active.value = true
		await nextTick()
		worker.respond({
			id: getPostedRequest(worker).id,
			result: createAnalysis()
		})
		await batch
		await vi.advanceTimersByTimeAsync(29_999)
		expect(worker.terminate).not.toHaveBeenCalled()
		await vi.advanceTimersByTimeAsync(1)
		expect(worker.terminate).toHaveBeenCalledTimes(1)
	})

	it('terminates an idle Worker immediately when KeepAlive deactivates', async () => {
		vi.useFakeTimers()
		const fixture = createDependencyFixture()
		const { active, analysis } = await mountKeepAliveAnalysis(
			fixture.dependencies
		)
		analysis.setFiles([createFile('idle.mp3')])

		const batch = analysis.analyzeNextBatch(1)
		await flushUntilWorkerPosted(fixture)
		const worker = fixture.workers[0] as FakeWorker
		worker.respond({
			id: getPostedRequest(worker).id,
			result: createAnalysis()
		})
		await batch
		active.value = false
		await nextTick()

		expect(worker.terminate).toHaveBeenCalledTimes(1)
		await vi.advanceTimersByTimeAsync(30_000)
		expect(worker.terminate).toHaveBeenCalledTimes(1)
	})

	it('cancels pending Worker work and leaves the remaining batch queued', async () => {
		const fixture = createDependencyFixture()
		const { analysis } = await mountAnalysis(fixture.dependencies)
		analysis.setFiles([createFile('first.mp3'), createFile('second.mp3')])

		const batch = analysis.analyzeNextBatch(2)
		await vi.waitFor(() => {
			expect(fixture.workers[0]?.postMessage).toHaveBeenCalledTimes(1)
		})
		analysis.cancelProcessing()
		await batch

		expect(fixture.workers[0]?.terminate).toHaveBeenCalledTimes(1)
		expect(fixture.dependencies.createWorker).toHaveBeenCalledTimes(1)
		expect(analysis.entries.value[0]?.status).toBe('error')
		expect(analysis.entries.value[0]?.error).toBe('Processing stopped')
		expect(analysis.entries.value[1]?.status).toBe('queued')
		expect(analysis.statusMessage.value).toBe('Audio analysis stopped')
	})

	it('disposal rejects pending work without starting another file or Worker', async () => {
		const fixture = createDependencyFixture()
		const { analysis, wrapper } = await mountAnalysis(fixture.dependencies)
		analysis.setFiles([createFile('first.mp3'), createFile('second.mp3')])

		const batch = analysis.analyzeNextBatch(2)
		await vi.waitFor(() => {
			expect(fixture.workers[0]?.postMessage).toHaveBeenCalledTimes(1)
		})
		unmountTracked(wrapper)
		await batch

		expect(fixture.workers[0]?.terminate).toHaveBeenCalledTimes(1)
		expect(fixture.dependencies.createWorker).toHaveBeenCalledTimes(1)
		expect(analysis.entries.value[0]?.status).toBe('error')
		expect(analysis.entries.value[0]?.error).toBe('Analysis view closed')
		expect(analysis.entries.value[1]?.status).toBe('queued')
	})

	it('records cache-write failure without discarding completed source data', async () => {
		const fixture = createDependencyFixture({
			readTags: vi.fn().mockResolvedValue(completeTags)
		})
		vi.mocked(fixture.cacheSession.put).mockRejectedValue(
			new Error('IndexedDB unavailable')
		)
		const { analysis } = await mountAnalysis(fixture.dependencies)
		analysis.setFiles([createFile('cache-failure.mp3')])

		await analysis.scanMetadata()

		const entry = analysis.entries.value[0]
		expect(entry?.status).toBe('complete')
		expect(entry?.source?.averageBpm).toBe(128)
		expect(entry?.source?.parsedKey).toBe(0)
		expect(entry?.error).toBeNull()
		expect(analysis.cacheWarning.value).toBe(
			'Cache write failed: IndexedDB unavailable'
		)
	})

	it('distinguishes folder cancellation from an unexpected picker failure', async () => {
		const cancelPicker = vi
			.fn()
			.mockRejectedValue(new DOMException('Cancelled', 'AbortError'))
		const cancelFixture = createDependencyFixture({
			getDirectoryPicker: vi.fn(() => cancelPicker)
		})
		const { analysis: cancelled } = await mountAnalysis(
			cancelFixture.dependencies
		)
		expect(cancelled.supportsDirectoryPicker.value).toBe(true)

		await expect(cancelled.pickFolder()).resolves.toBe('cancelled')
		expect(cancelled.statusMessage.value).toBe('Folder selection cancelled')
		expect(cancelled.isPickingFolder.value).toBe(false)

		const failedPicker = vi
			.fn()
			.mockRejectedValue(new Error('Permission service failed'))
		const failureFixture = createDependencyFixture({
			getDirectoryPicker: vi.fn(() => failedPicker)
		})
		const { analysis: failed } = await mountAnalysis(
			failureFixture.dependencies
		)

		await expect(failed.pickFolder()).rejects.toThrow(
			'Permission service failed'
		)
		expect(failed.statusMessage.value).toBe('Waiting for folder permission')
		expect(failed.isPickingFolder.value).toBe(false)
	})
})
