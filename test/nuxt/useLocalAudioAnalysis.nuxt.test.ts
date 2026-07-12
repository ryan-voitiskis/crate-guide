import { defineComponent, h, nextTick } from 'vue'
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
		decodeAudioData: vi.fn().mockResolvedValue(decodedBuffer),
		close: vi.fn().mockResolvedValue(undefined)
	} as unknown as AudioContext
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
		getCachedResult: vi.fn().mockResolvedValue(null),
		putCachedResult: vi.fn().mockResolvedValue(undefined),
		performanceNow: vi.fn().mockReturnValue(1_000),
		currentTime: vi.fn().mockReturnValue(123_456),
		getDirectoryPicker: vi.fn().mockReturnValue(undefined),
		...overrides
	}

	return { dependencies, workers, audioContext }
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
		const fixture = createDependencyFixture({
			getCachedResult: vi.fn().mockResolvedValue({
				cacheKey: 'cached-key',
				tags: completeTags,
				analysis: cachedAnalysis,
				updatedAt: 1
			})
		})
		const { analysis } = await mountAnalysis(fixture.dependencies)
		analysis.setFiles([createFile('cached.mp3')])

		await analysis.analyzeNextBatch(1)

		expect(analysis.entries.value[0]?.status).toBe('cached')
		expect(analysis.entries.value[0]?.source?.analysis).toEqual(cachedAnalysis)
		expect(fixture.dependencies.readTags).not.toHaveBeenCalled()
		expect(fixture.dependencies.createAudioContext).not.toHaveBeenCalled()
		expect(fixture.dependencies.createWorker).not.toHaveBeenCalled()
		expect(fixture.dependencies.putCachedResult).not.toHaveBeenCalled()
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
		expect(fixture.dependencies.createAudioContext).toHaveBeenCalledTimes(1)
		expect(worker?.postMessage).toHaveBeenCalledTimes(1)
		expect(analysis.entries.value[0]?.status).toBe('complete')
		expect(analysis.entries.value[0]?.source?.analysis).toEqual(result)
	})

	it('settles a matching Worker error response as an entry error', async () => {
		const fixture = createDependencyFixture()
		const { analysis } = await mountAnalysis(fixture.dependencies)
		analysis.setFiles([createFile('worker-error.mp3')])

		const batch = analysis.analyzeNextBatch(1)
		await vi.waitFor(() => {
			expect(fixture.workers[0]?.postMessage).toHaveBeenCalledTimes(1)
		})
		const worker = fixture.workers[0] as FakeWorker
		const request = getPostedRequest(worker)
		worker.respond({ id: 'unrelated-request', error: 'Wrong request' })
		await flushPromises()
		expect(analysis.entries.value[0]?.status).toBe('analyzing')

		worker.respond({ id: request.id, error: 'Analyzer failed' })
		await batch

		expect(analysis.entries.value[0]?.status).toBe('error')
		expect(analysis.entries.value[0]?.error).toBe('Analyzer failed')
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
			readTags: vi.fn().mockResolvedValue(completeTags),
			putCachedResult: vi
				.fn()
				.mockRejectedValue(new Error('IndexedDB unavailable'))
		})
		const { analysis } = await mountAnalysis(fixture.dependencies)
		analysis.setFiles([createFile('cache-failure.mp3')])

		await analysis.scanMetadata()

		const entry = analysis.entries.value[0]
		expect(entry?.status).toBe('complete')
		expect(entry?.source?.averageBpm).toBe(128)
		expect(entry?.source?.parsedKey).toBe(0)
		expect(entry?.error).toBe('Cache write failed: IndexedDB unavailable')
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
