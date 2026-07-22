import type {
	LocalAudioAnalysis,
	LocalAudioFileEntry,
	LocalAudioTagMetadata,
	LocalAudioTrackSource,
	LocalAudioWorkerRequest,
	LocalAudioWorkerResponse
} from '~/types/localAudio'
import {
	LOCAL_AUDIO_SAMPLE_RATE,
	createLocalAudioTrackSource,
	getLocalAudioAnalysisWindow,
	getLocalAudioCacheKey,
	isSupportedAudioFile,
	readLocalAudioTags
} from '~/utils/localAudio'
import {
	type CachedLocalAudioResult,
	LOCAL_AUDIO_CACHE_WORKER_IDLE_MS,
	type LocalAudioCacheMetrics,
	type LocalAudioCachePruneResult,
	type LocalAudioCacheSession,
	openLocalAudioCacheSession
} from '~/utils/localAudioCache'
import {
	LOCAL_AUDIO_DECODE_SKIP_MESSAGES,
	type LocalAudioDecodeDecision,
	inspectLocalAudioDecodeSafety
} from '~/utils/localAudioDecodePolicy'
import { parseRekordboxTonality } from '~/utils/rekordboxXml'

type DirectoryHandle = {
	entries(): AsyncIterableIterator<[string, FileSystemHandle]>
}

type FileHandle = {
	getFile(): Promise<File>
}

type FileSystemHandle =
	| (DirectoryHandle & { kind: 'directory'; name: string })
	| (FileHandle & { kind: 'file'; name: string })

type DirectoryPickerWindow = Window & {
	showDirectoryPicker?: (options?: {
		mode?: 'read'
		startIn?: string
	}) => Promise<DirectoryHandle>
}

type DirectoryPicker = NonNullable<DirectoryPickerWindow['showDirectoryPicker']>

type PendingWorkerRequest = {
	resolve: (value: LocalAudioAnalysis) => void
	reject: (error: Error) => void
}

type ProcessingMode = 'tags-only' | 'missing-analysis' | 'force-analysis'

type BatchCacheContext = {
	session: LocalAudioCacheSession | null
	records: Map<string, CachedLocalAudioResult>
}

export type LocalAudioAnalysisDependencies = {
	createWorker: () => Worker
	createRequestId: () => string
	createAudioContext: () => AudioContext
	createOfflineAudioContext: (
		numberOfChannels: number,
		length: number,
		sampleRate: number
	) => OfflineAudioContext
	readTags: (file: File) => Promise<LocalAudioTagMetadata>
	inspectDecodeSafety: (file: File) => Promise<LocalAudioDecodeDecision>
	openCacheSession: () => Promise<LocalAudioCacheSession>
	performanceNow: () => number
	currentTime: () => number
	getDirectoryPicker: () => DirectoryPicker | undefined
}

const productionDependencies: LocalAudioAnalysisDependencies = {
	createWorker: () =>
		new Worker(
			new URL('../workers/localAudioAnalysis.worker.ts', import.meta.url),
			{
				type: 'module'
			}
		),
	createRequestId: () => crypto.randomUUID(),
	createAudioContext: () =>
		new AudioContext({ sampleRate: LOCAL_AUDIO_SAMPLE_RATE }),
	createOfflineAudioContext: (numberOfChannels, length, sampleRate) =>
		new OfflineAudioContext(numberOfChannels, length, sampleRate),
	readTags: readLocalAudioTags,
	inspectDecodeSafety: inspectLocalAudioDecodeSafety,
	openCacheSession: openLocalAudioCacheSession,
	performanceNow: () => performance.now(),
	currentTime: () => Date.now(),
	getDirectoryPicker: () => {
		const picker = (window as DirectoryPickerWindow).showDirectoryPicker
		return picker?.bind(window)
	}
}

export function useLocalAudioAnalysis(
	dependencyOverrides: Partial<LocalAudioAnalysisDependencies> = {}
) {
	const dependencies: LocalAudioAnalysisDependencies = {
		...productionDependencies,
		...dependencyOverrides
	}
	const entries = shallowRef<LocalAudioFileEntry[]>([])
	const isPickingFolder = ref(false)
	const isAnalyzing = ref(false)
	const processingMode = ref<ProcessingMode | null>(null)
	const completedInBatch = ref(0)
	const batchTotal = ref(0)
	const statusMessage = ref('Select a folder of audio files')
	const cacheWarning = ref<string | null>(null)
	const lastCacheMetrics = ref<LocalAudioCacheMetrics | null>(null)
	const lastCachePruneResult = ref<LocalAudioCachePruneResult | null>(null)
	const workerStartCount = ref(0)
	const cancelRequested = ref(false)
	const supportsDirectoryPicker = ref(false)
	let worker: Worker | null = null
	let workerIdleTimer: ReturnType<typeof setTimeout> | null = null
	let viewIsActive = true
	const pendingWorkerRequests = new Map<string, PendingWorkerRequest>()

	const readySources = computed(() =>
		entries.value
			.map((entry) => entry.source)
			.filter(
				(source): source is LocalAudioTrackSource =>
					source !== null &&
					(source.averageBpm !== null ||
						(source.parsedKey !== null && source.parsedMode !== null))
			)
	)
	const pendingCount = computed(
		() => entries.value.filter((entry) => entry.status === 'queued').length
	)
	const processedCount = computed(
		() =>
			entries.value.filter((entry) =>
				['cached', 'complete', 'tags-only', 'error'].includes(entry.status)
			).length
	)
	const errorCount = computed(
		() => entries.value.filter((entry) => entry.status === 'error').length
	)
	const cachedCount = computed(
		() => entries.value.filter((entry) => entry.fromCache).length
	)
	const analysisSkippedCount = computed(
		() =>
			entries.value.filter(
				(entry) =>
					entry.status === 'tags-only' && entry.analysisSkipReason !== null
			).length
	)
	const analysisCandidateCount = computed(
		() =>
			entries.value.filter(
				(entry) =>
					entry.source &&
					entry.analysisSkipReason === null &&
					entry.source.analysis === null &&
					(entry.source.bpmSource === null ||
						entry.source.keyModeSource === null)
			).length
	)
	const completeDataCount = computed(
		() =>
			entries.value.filter(
				(entry) =>
					entry.source?.averageBpm !== null &&
					entry.source?.averageBpm !== undefined &&
					entry.source.parsedKey !== null &&
					entry.source.parsedMode !== null
			).length
	)
	const partialDataCount = computed(
		() =>
			entries.value.filter((entry) => {
				if (!entry.source) return false
				const hasBpm = entry.source.averageBpm !== null
				const hasKey =
					entry.source.parsedKey !== null && entry.source.parsedMode !== null
				return hasBpm !== hasKey
			}).length
	)
	const noDataCount = computed(
		() =>
			entries.value.filter(
				(entry) =>
					entry.source !== null &&
					entry.source.averageBpm === null &&
					(entry.source.parsedKey === null || entry.source.parsedMode === null)
			).length
	)
	const visibleEntries = computed(() =>
		[
			...entries.value.filter((entry) => entry.error).reverse(),
			...entries.value
				.filter((entry) => entry.status !== 'queued' && !entry.error)
				.slice(-50)
				.reverse()
		].slice(0, 50)
	)

	onMounted(() => {
		viewIsActive = true
		supportsDirectoryPicker.value =
			typeof dependencies.getDirectoryPicker() === 'function'
	})

	onActivated(() => {
		viewIsActive = true
		cancelWorkerIdleTimer()
		scheduleWorkerIdleTermination()
	})

	onDeactivated(() => {
		viewIsActive = false
		if (!isAnalyzing.value) terminateWorker('Analysis view deactivated')
	})

	onScopeDispose(() => {
		cancelRequested.value = true
		terminateWorker('Analysis view closed')
	})

	function createEntry(file: File, relativePath: string): LocalAudioFileEntry {
		return {
			id: `${relativePath}:${file.size}:${file.lastModified}`,
			file,
			relativePath,
			status: 'queued',
			fromCache: false,
			source: null,
			analysisSkipReason: null,
			error: null
		}
	}

	function setFiles(files: File[]) {
		entries.value = files
			.filter((file) => isSupportedAudioFile(file.name))
			.map((file) => {
				const relativePath =
					(file as File & { webkitRelativePath?: string }).webkitRelativePath ||
					file.name
				return createEntry(file, relativePath)
			})
			.sort((left, right) =>
				left.relativePath.localeCompare(right.relativePath)
			)
		statusMessage.value = `${entries.value.length} audio files ready`
	}

	async function collectFiles(
		handle: DirectoryHandle,
		prefix: string,
		files: LocalAudioFileEntry[]
	) {
		for await (const [name, child] of handle.entries()) {
			const relativePath = prefix ? `${prefix}/${name}` : name
			if (child.kind === 'directory') {
				await collectFiles(child, relativePath, files)
			} else if (child.kind === 'file' && isSupportedAudioFile(name)) {
				files.push(createEntry(await child.getFile(), relativePath))
			}
		}
	}

	async function pickFolder(): Promise<'selected' | 'fallback' | 'cancelled'> {
		if (!supportsDirectoryPicker.value) return 'fallback'
		isPickingFolder.value = true
		statusMessage.value = 'Waiting for folder permission'

		try {
			const handle = await dependencies.getDirectoryPicker()?.({
				mode: 'read',
				startIn: 'music'
			})
			if (!handle) return 'cancelled'
			const files: LocalAudioFileEntry[] = []
			await collectFiles(handle, '', files)
			entries.value = files.sort((left, right) =>
				left.relativePath.localeCompare(right.relativePath)
			)
			statusMessage.value = `${entries.value.length} audio files ready`
			return 'selected'
		} catch (error) {
			if (error instanceof DOMException && error.name === 'AbortError') {
				statusMessage.value = 'Folder selection cancelled'
				return 'cancelled'
			}
			throw error
		} finally {
			isPickingFolder.value = false
		}
	}

	function ensureWorker(): Worker {
		cancelWorkerIdleTimer()
		if (worker) return worker
		worker = dependencies.createWorker()
		workerStartCount.value += 1
		worker.onmessage = (event: MessageEvent<LocalAudioWorkerResponse>) => {
			const response = event.data
			const pending = pendingWorkerRequests.get(response.id)
			if (!pending) return
			pendingWorkerRequests.delete(response.id)
			if ('error' in response) pending.reject(new Error(response.error))
			else pending.resolve(response.result)
		}
		worker.onerror = (event) => {
			terminateWorker(event.message || 'Audio analysis worker failed')
		}
		return worker
	}

	function cancelWorkerIdleTimer() {
		if (workerIdleTimer === null) return
		clearTimeout(workerIdleTimer)
		workerIdleTimer = null
	}

	function scheduleWorkerIdleTermination() {
		cancelWorkerIdleTimer()
		if (!worker || isAnalyzing.value || pendingWorkerRequests.size > 0) return
		workerIdleTimer = setTimeout(() => {
			workerIdleTimer = null
			if (isAnalyzing.value || pendingWorkerRequests.size > 0) return
			terminateWorker('Audio analysis worker idle')
		}, LOCAL_AUDIO_CACHE_WORKER_IDLE_MS)
	}

	function terminateWorker(reason: string) {
		cancelWorkerIdleTimer()
		worker?.terminate()
		worker = null
		for (const pending of pendingWorkerRequests.values()) {
			pending.reject(new Error(reason))
		}
		pendingWorkerRequests.clear()
	}

	function runWorkerAnalysis(
		samples: Float32Array,
		durationSeconds: number,
		analyzedDurationSeconds: number,
		analysisOffsetSeconds: number
	): Promise<LocalAudioAnalysis> {
		const id = dependencies.createRequestId()
		const request: LocalAudioWorkerRequest = {
			id,
			samples: samples.buffer as ArrayBuffer,
			durationSeconds,
			analyzedDurationSeconds,
			analysisOffsetSeconds
		}
		return new Promise((resolve, reject) => {
			pendingWorkerRequests.set(id, { resolve, reject })
			try {
				ensureWorker().postMessage(request, [request.samples])
			} catch (error) {
				pendingWorkerRequests.delete(id)
				reject(error instanceof Error ? error : new Error(String(error)))
			}
		})
	}

	function mixToMono(
		buffer: AudioBuffer,
		startFrame: number,
		frameCount: number
	): Float32Array {
		const channels = Math.min(2, buffer.numberOfChannels)
		const output = new Float32Array(frameCount)
		for (let channel = 0; channel < channels; channel++) {
			const data = buffer
				.getChannelData(channel)
				.subarray(startFrame, startFrame + frameCount)
			for (let index = 0; index < frameCount; index++) {
				output[index] = (output[index] ?? 0) + (data[index] ?? 0) / channels
			}
		}
		return output
	}

	async function decodeAndResample(file: File): Promise<{
		samples: Float32Array
		durationSeconds: number
		analyzedDurationSeconds: number
		analysisOffsetSeconds: number
	}> {
		const context = dependencies.createAudioContext()
		try {
			if (context.sampleRate !== LOCAL_AUDIO_SAMPLE_RATE) {
				throw new Error(
					`Browser AudioContext did not honor ${LOCAL_AUDIO_SAMPLE_RATE} Hz`
				)
			}
			const decoded = await context.decodeAudioData(await file.arrayBuffer())
			const { analyzedDurationSeconds, analysisOffsetSeconds } =
				getLocalAudioAnalysisWindow(decoded.duration)
			if (decoded.sampleRate === LOCAL_AUDIO_SAMPLE_RATE) {
				const frameCount = Math.min(
					decoded.length,
					Math.floor(analyzedDurationSeconds * decoded.sampleRate)
				)
				const startFrame = Math.min(
					decoded.length - frameCount,
					Math.floor(analysisOffsetSeconds * decoded.sampleRate)
				)
				return {
					samples: mixToMono(decoded, startFrame, frameCount),
					durationSeconds: decoded.duration,
					analyzedDurationSeconds: frameCount / decoded.sampleRate,
					analysisOffsetSeconds: startFrame / decoded.sampleRate
				}
			}

			const frameCount = Math.ceil(
				analyzedDurationSeconds * LOCAL_AUDIO_SAMPLE_RATE
			)
			const offline = dependencies.createOfflineAudioContext(
				1,
				frameCount,
				LOCAL_AUDIO_SAMPLE_RATE
			)
			const source = offline.createBufferSource()
			source.buffer = decoded
			source.connect(offline.destination)
			source.start(0, analysisOffsetSeconds, analyzedDurationSeconds)
			const rendered = await offline.startRendering()
			return {
				samples: rendered.getChannelData(0).slice(),
				durationSeconds: decoded.duration,
				analyzedDurationSeconds: rendered.duration,
				analysisOffsetSeconds
			}
		} finally {
			await context.close().catch(() => undefined)
		}
	}

	function hasUsableBpm(tags: LocalAudioTagMetadata) {
		return tags.bpm !== null && tags.bpm >= 30 && tags.bpm <= 300
	}

	function hasUsableKey(tags: LocalAudioTagMetadata) {
		const parsed = parseRekordboxTonality(tags.key)
		return parsed.key !== null && parsed.mode !== null
	}

	function getEntryCacheKey(entry: LocalAudioFileEntry): string {
		return getLocalAudioCacheKey({
			relativePath: entry.relativePath,
			size: entry.file.size,
			lastModified: entry.file.lastModified
		})
	}

	function recordCacheWarning(message: string) {
		cacheWarning.value = message
	}

	async function processEntry(
		entry: LocalAudioFileEntry,
		index: number,
		mode: ProcessingMode,
		cacheContext: BatchCacheContext
	) {
		entry.error = null
		entry.analysisSkipReason = null
		const cacheKey = getEntryCacheKey(entry)
		const cached = cacheContext.records.get(cacheKey) ?? null
		const cachedHasRequiredAnalysis =
			mode === 'tags-only' ||
			(mode === 'missing-analysis' && cached?.analysis !== null)
		if (cached && cachedHasRequiredAnalysis) {
			entry.source = createLocalAudioTrackSource({
				index,
				fileName: entry.file.name,
				relativePath: entry.relativePath,
				fileSize: entry.file.size,
				lastModified: entry.file.lastModified,
				tags: cached.tags,
				analysis: cached.analysis
			})
			entry.status = 'cached'
			entry.fromCache = true
			return
		}

		entry.status = 'reading-tags'
		if (mode !== 'tags-only') triggerRef(entries)
		const tags = {
			...(cached?.tags ?? (await dependencies.readTags(entry.file)))
		}
		let analysis = cached?.analysis ?? null
		const shouldAnalyze =
			mode === 'force-analysis' ||
			(mode === 'missing-analysis' &&
				(!hasUsableBpm(tags) || !hasUsableKey(tags)))
		if (shouldAnalyze) {
			entry.status = 'checking-budget'
			triggerRef(entries)
			if (cancelRequested.value) throw new Error('Analysis cancelled')
			const decodeDecision = await dependencies.inspectDecodeSafety(entry.file)
			if (cancelRequested.value) throw new Error('Analysis cancelled')
			if (decodeDecision.metadata) {
				tags.durationSeconds ??= decodeDecision.metadata.durationSeconds
			}

			if (decodeDecision.kind === 'tags-only') {
				entry.analysisSkipReason = decodeDecision.message
			} else {
				entry.status = 'decoding'
				triggerRef(entries)
				let decoded: Awaited<ReturnType<typeof decodeAndResample>> | null = null
				try {
					decoded = await decodeAndResample(entry.file)
				} catch (error) {
					if (cancelRequested.value) throw error
					entry.analysisSkipReason =
						LOCAL_AUDIO_DECODE_SKIP_MESSAGES.decodeFailed
				}

				if (decoded) {
					tags.durationSeconds ??= decoded.durationSeconds
					if (cancelRequested.value) throw new Error('Analysis cancelled')
					entry.status = 'analyzing'
					triggerRef(entries)
					analysis = await runWorkerAnalysis(
						decoded.samples,
						decoded.durationSeconds,
						decoded.analyzedDurationSeconds,
						decoded.analysisOffsetSeconds
					)
				}
			}
		}

		entry.source = createLocalAudioTrackSource({
			index,
			fileName: entry.file.name,
			relativePath: entry.relativePath,
			fileSize: entry.file.size,
			lastModified: entry.file.lastModified,
			tags,
			analysis
		})
		entry.status = entry.analysisSkipReason ? 'tags-only' : 'complete'
		if (!cacheContext.session) return
		await cacheContext.session
			.put({
				cacheKey,
				tags,
				analysis,
				updatedAt: dependencies.currentTime()
			})
			.catch((error) => {
				const message = `Cache write failed: ${
					error instanceof Error ? error.message : String(error)
				}`
				recordCacheWarning(message)
				cacheContext.session = null
			})
	}

	async function openBatchCache(
		batch: LocalAudioFileEntry[]
	): Promise<BatchCacheContext> {
		const cacheContext: BatchCacheContext = {
			session: null,
			records: new Map()
		}
		let session: LocalAudioCacheSession
		try {
			session = await dependencies.openCacheSession()
			cacheContext.session = session
		} catch (error) {
			recordCacheWarning(
				`Local analysis cache unavailable: ${
					error instanceof Error ? error.message : String(error)
				}`
			)
			return cacheContext
		}

		try {
			const startPrune = await session.prune()
			lastCachePruneResult.value = startPrune
			if (startPrune.error) {
				recordCacheWarning(`Cache maintenance failed: ${startPrune.error}`)
			}
			cacheContext.records = await session.getMany(batch.map(getEntryCacheKey))
		} catch (error) {
			recordCacheWarning(
				`Local analysis cache read failed: ${
					error instanceof Error ? error.message : String(error)
				}`
			)
			cacheContext.session = null
			await session.close().catch(() => undefined)
		}

		return cacheContext
	}

	async function closeBatchCache(
		cacheContext: BatchCacheContext,
		openedSession: LocalAudioCacheSession | null
	) {
		if (!openedSession) return
		if (cacheContext.session) {
			try {
				await openedSession.flush()
				const endPrune = await openedSession.prune()
				lastCachePruneResult.value = endPrune
				if (endPrune.error) {
					recordCacheWarning(`Cache maintenance failed: ${endPrune.error}`)
				}
			} catch (error) {
				recordCacheWarning(
					`Local analysis cache write failed: ${
						error instanceof Error ? error.message : String(error)
					}`
				)
			}
		}

		lastCacheMetrics.value = openedSession.getMetrics()
		await openedSession.close().catch((error) => {
			recordCacheWarning(
				`Local analysis cache close failed: ${
					error instanceof Error ? error.message : String(error)
				}`
			)
		})
	}

	async function runBatch(batch: LocalAudioFileEntry[], mode: ProcessingMode) {
		if (isAnalyzing.value) return
		if (batch.length === 0) return

		isAnalyzing.value = true
		processingMode.value = mode
		cancelRequested.value = false
		completedInBatch.value = 0
		batchTotal.value = batch.length
		cacheWarning.value = null
		lastCacheMetrics.value = null
		statusMessage.value =
			mode === 'tags-only'
				? 'Scanning embedded metadata'
				: `Analyzing ${batch.length} files locally`

		const cacheContext = await openBatchCache(batch)
		const openedCacheSession = cacheContext.session
		try {
			const entryIndexes = new Map(
				entries.value.map((entry, index) => [entry, index])
			)
			let lastUiRefresh = 0
			for (const entry of batch) {
				if (cancelRequested.value) break
				try {
					await processEntry(
						entry,
						entryIndexes.get(entry) ?? 0,
						mode,
						cacheContext
					)
				} catch (error) {
					entry.status = 'error'
					entry.error = error instanceof Error ? error.message : String(error)
				}
				completedInBatch.value += 1
				const now = dependencies.performanceNow()
				if (now - lastUiRefresh >= 200) {
					triggerRef(entries)
					lastUiRefresh = now
				}
			}
			triggerRef(entries)
			statusMessage.value = cancelRequested.value
				? mode === 'tags-only'
					? 'Metadata scan stopped'
					: 'Audio analysis stopped'
				: mode === 'tags-only'
					? errorCount.value > 0
						? 'Metadata scan finished'
						: 'Metadata scan complete'
					: 'Analysis batch complete'
		} finally {
			await closeBatchCache(cacheContext, openedCacheSession)
			isAnalyzing.value = false
			processingMode.value = null
			if (viewIsActive) scheduleWorkerIdleTermination()
			else terminateWorker('Analysis view deactivated')
		}
	}

	async function scanMetadata() {
		await runBatch(
			entries.value.filter(
				(entry) => entry.status === 'queued' || entry.status === 'error'
			),
			'tags-only'
		)
	}

	async function analyzeNextBatch(limit: number, forceEssentia = false) {
		const candidates = entries.value.filter((entry) => {
			if (entry.analysisSkipReason !== null) return false
			if (entry.status === 'queued' || entry.status === 'error') return true
			if (!entry.source) return false
			return (
				forceEssentia ||
				(entry.source.analysis === null &&
					(entry.source.bpmSource === null ||
						entry.source.keyModeSource === null))
			)
		})
		await runBatch(
			candidates.slice(0, Math.max(1, limit)),
			forceEssentia ? 'force-analysis' : 'missing-analysis'
		)
	}

	function cancelProcessing() {
		cancelRequested.value = true
		terminateWorker('Processing stopped')
	}

	return {
		entries,
		readySources,
		pendingCount,
		processedCount,
		errorCount,
		cachedCount,
		analysisSkippedCount,
		analysisCandidateCount,
		completeDataCount,
		partialDataCount,
		noDataCount,
		visibleEntries,
		isPickingFolder,
		isAnalyzing,
		processingMode,
		completedInBatch,
		batchTotal,
		statusMessage,
		cacheWarning,
		lastCacheMetrics,
		lastCachePruneResult,
		workerStartCount,
		workerIdleTimeoutMs: LOCAL_AUDIO_CACHE_WORKER_IDLE_MS,
		supportsDirectoryPicker,
		setFiles,
		pickFolder,
		scanMetadata,
		analyzeNextBatch,
		cancelProcessing
	}
}
