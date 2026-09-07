import { type EffectScope, effectScope, nextTick } from 'vue'
import { toast } from 'vue-sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TrackEnrichmentApplyAttempt } from '~/composables/useTrackEnrichmentWorkflow'
import type { LocalAudioReviewSelection } from '~/types/localAudio'
import type {
	RekordboxXmlSanitizedSnapshot,
	RekordboxXmlSanitizedTrack
} from '~/types/rekordboxXmlWorker'
import type { RekordboxXmlTrack } from '~/utils/rekordboxXml'
import {
	RekordboxXmlWorkerCancelledError,
	RekordboxXmlWorkerParseError
} from '~/utils/rekordboxXmlWorkerClient'
import type { TrackEnrichmentRow } from '~/utils/trackEnrichment'
import type { DatabaseRecord, Track } from '~~/shared/types/supabase'
import type {
	TrackBatchUpdate,
	TrackBatchUpdateOutcome,
	TrackBatchUpdateResult
} from '~~/shared/types/trackUpdates'

const workflowMocks = vi.hoisted(() => ({
	buildRows: vi.fn(),
	buildUpdate: vi.fn(),
	startWorkerParse: vi.fn()
}))

vi.mock('vue-sonner', () => ({
	toast: {
		error: vi.fn(),
		success: vi.fn(),
		warning: vi.fn()
	}
}))

vi.mock('~/utils/rekordboxXmlWorkerClient', async (importOriginal) => ({
	...(await importOriginal<
		typeof import('~/utils/rekordboxXmlWorkerClient')
	>()),
	startRekordboxXmlWorkerParse: workflowMocks.startWorkerParse
}))

vi.mock('~/utils/trackEnrichment', async (importOriginal) => ({
	...(await importOriginal<typeof import('~/utils/trackEnrichment')>()),
	buildTrackEnrichmentRowsAsync: workflowMocks.buildRows,
	buildTrackEnrichmentUpdate: workflowMocks.buildUpdate
}))

const mockRecordsStore = {
	records: [] as DatabaseRecord[]
}

const mockTracksStore = {
	tracks: [] as Track[],
	updateTracksBatch: vi.fn()
}

vi.stubGlobal('useRecordsStore', () => mockRecordsStore)
vi.stubGlobal('useTracksStore', () => mockTracksStore)
vi.stubGlobal(
	'requestAnimationFrame',
	vi.fn((callback: FrameRequestCallback) => {
		callback(0)
		return 1
	})
)

const { useTrackEnrichmentWorkflow } =
	await import('../useTrackEnrichmentWorkflow')

const activeScopes: EffectScope[] = []

function createWorkflow(options?: {
	captureApplyGuard?: () => () => boolean
	onApplyAttempt?: (
		attempt: TrackEnrichmentApplyAttempt
	) => Promise<void> | void
}) {
	const scope = effectScope()
	const workflow = scope.run(() =>
		useTrackEnrichmentWorkflow({
			records: mockRecordsStore as unknown as ReturnType<
				typeof useRecordsStore
			>,
			tracks: mockTracksStore as unknown as ReturnType<typeof useTracksStore>,
			onApplyAttempt: options?.onApplyAttempt,
			captureApplyGuard: options?.captureApplyGuard
		})
	)
	if (!workflow) throw new Error('Failed to create enrichment workflow scope')
	activeScopes.push(scope)
	return workflow
}

function createRecord(overrides: Partial<DatabaseRecord> = {}): DatabaseRecord {
	return {
		id: 'record-1',
		user_id: 'user-1',
		title: 'Synthetic Album',
		artists: [{ name: 'Test Artist', role: null }],
		labels: [],
		year: 2024,
		cover: null,
		discogs_id: 1,
		discogs_release_url: null,
		created_at: null,
		updated_at: null,
		...overrides,
		cover_storage_path: overrides.cover_storage_path ?? null
	}
}

function createTrack(overrides: Partial<Track> = {}): Track {
	return {
		id: 'track-1',
		record_id: 'record-1',
		title: 'Synthetic Track',
		artists: [{ name: 'Test Artist', role: null }],
		extraartists: [],
		position: 'A1',
		duration: 180000,
		bpm: null,
		rpm: null,
		key: null,
		mode: null,
		genres: [],
		time_signature_upper: null,
		time_signature_lower: null,
		playable: true,
		beatport_data: null,
		audio_features: null,
		created_at: null,
		updated_at: '2026-07-22T00:00:00.000Z',
		...overrides
	}
}

function createSource(
	overrides: Partial<RekordboxXmlTrack> = {}
): RekordboxXmlTrack {
	return {
		sourceType: 'rekordboxXml',
		index: 0,
		trackId: 'source-1',
		name: 'Synthetic Track',
		artist: 'Test Artist',
		album: 'Synthetic Album',
		genre: 'House',
		kind: 'WAV File',
		totalTimeSeconds: 180,
		year: 2024,
		averageBpm: 128,
		dateAdded: null,
		bitRate: 1411,
		sampleRate: 44100,
		comments: null,
		playCount: 0,
		rating: 0,
		location: null,
		locationHint: 'Synthetic Album/Synthetic Track.wav',
		remixer: null,
		tonality: '8A',
		parsedKey: 9,
		parsedMode: 0,
		label: null,
		warnings: [],
		...overrides
	}
}

function createRow(
	overrides: Partial<TrackEnrichmentRow> = {}
): TrackEnrichmentRow {
	return {
		id: 'row-1',
		source: createSource(),
		track: createTrack(),
		record: createRecord(),
		confidence: 'high',
		score: 100,
		reasons: ['Exact title match'],
		warnings: [],
		proposedBpm: 128,
		proposedKey: 9,
		proposedMode: 0,
		proposedBpmSource: 'rekordboxXml',
		proposedKeyModeSource: 'rekordboxXml',
		canFillBpm: true,
		canFillKeyMode: true,
		alreadyComplete: false,
		hasConflict: false,
		stagingBlockedReason: null,
		defaultStaged: true,
		error: null,
		applied: false,
		...overrides
	}
}

function createFile(name = 'collection.xml') {
	return {
		name,
		size: 1_024
	} as unknown as File
}

function createSnapshot(
	overrides: Partial<RekordboxXmlSanitizedSnapshot> = {}
): RekordboxXmlSanitizedSnapshot {
	return {
		parserPolicyVersion: 'rekordbox-xml-stream-v1',
		sanitizedSnapshotVersion: 'rekordbox-xml-sanitized-v1',
		tracks: [createSanitizedSource()],
		entriesDeclared: 1,
		warnings: [],
		errors: [],
		...overrides
	}
}

function createSanitizedSource(
	overrides: Partial<RekordboxXmlSanitizedTrack> = {}
): RekordboxXmlSanitizedTrack {
	return { ...createSource(overrides), ...overrides, location: null }
}

let workerOperationSequence = 0

function createWorkerHandle(
	promise: Promise<RekordboxXmlSanitizedSnapshot> = Promise.resolve(
		createSnapshot()
	)
) {
	return {
		operationId: `worker-operation-${++workerOperationSequence}`,
		promise,
		cancel: vi.fn()
	}
}

function createDeferred<T>() {
	let resolve!: (value: T | PromiseLike<T>) => void
	let reject!: (reason?: unknown) => void
	const promise = new Promise<T>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise
		reject = rejectPromise
	})

	return { promise, reject, resolve }
}

function createLocalSelection(): LocalAudioReviewSelection {
	return {
		sources: [
			{
				sourceType: 'localAudio',
				index: 0,
				name: 'Synthetic Track',
				artist: 'Test Artist',
				album: 'Synthetic Album',
				genre: 'House',
				locationHint: 'Synthetic Album/Synthetic Track.wav',
				totalTimeSeconds: 180,
				averageBpm: 128,
				tonality: 'A minor',
				parsedKey: 9,
				parsedMode: 0,
				warnings: [],
				fileName: 'Synthetic Track.wav',
				fileSize: 1024,
				lastModified: 1,
				tags: {
					title: 'Synthetic Track',
					artist: 'Test Artist',
					album: 'Synthetic Album',
					genres: ['House'],
					durationSeconds: 180,
					bpm: 128,
					key: 'A minor'
				},
				analysis: null,
				bpmSource: 'embeddedTags',
				keyModeSource: 'embeddedTags',
				requiresManualReview: false
			}
		],
		totalFiles: 3,
		processedFiles: 2
	}
}

function toBatchUpdate(row: TrackEnrichmentRow): TrackBatchUpdate | null {
	if (!row.track?.updated_at || row.stagingBlockedReason) return null

	return {
		id: row.track.id,
		expectedUpdatedAt: row.track.updated_at,
		updates: {
			...(row.canFillBpm ? { bpm: row.proposedBpm } : {}),
			...(row.canFillKeyMode
				? { key: row.proposedKey, mode: row.proposedMode }
				: {})
		},
		preconditions: {
			bpmMustBeNull: row.canFillBpm,
			keyModeMustBeNull: row.canFillKeyMode
		}
	}
}

function updatedBatchResult(track: Track): TrackBatchUpdateResult {
	return {
		id: track.id,
		status: 'updated',
		success: true,
		track,
		issue: null,
		error: null,
		operation: null
	}
}

function failedBatchResult(
	id: string,
	error = 'Database rejected update'
): TrackBatchUpdateResult {
	return {
		id,
		status: 'invalid',
		success: false,
		track: null,
		issue: { code: 'update_rejected', message: error },
		error,
		operation: null
	}
}

const CANCELLED_BATCH_OUTCOME: TrackBatchUpdateOutcome = {
	results: [],
	cancelled: true,
	requiresReview: false
}

describe('useTrackEnrichmentWorkflow', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		workerOperationSequence = 0
		mockRecordsStore.records = [createRecord()]
		mockTracksStore.tracks = [createTrack()]
		workflowMocks.startWorkerParse.mockImplementation(() =>
			createWorkerHandle()
		)
		workflowMocks.buildRows.mockImplementation(
			async (options: {
				sources: unknown[]
				onProgress?: (completed: number, total: number) => void
			}) => {
				options.onProgress?.(options.sources.length, options.sources.length)
				return [createRow()]
			}
		)
		workflowMocks.buildUpdate.mockImplementation(toBatchUpdate)
		mockTracksStore.updateTracksBatch.mockResolvedValue({
			results: [],
			cancelled: false,
			requiresReview: false
		})
	})

	afterEach(() => {
		for (const scope of activeScopes.splice(0)) scope.stop()
		vi.useRealTimers()
	})

	it('returns a fresh no-argument workflow for each invocation', () => {
		const first = createWorkflow()
		const second = createWorkflow()

		first.selectedFileName.value = 'first.xml'
		first.rows.value = [createRow()]

		expect(second.selectedFileName.value).toBeNull()
		expect(second.rows.value).toEqual([])
		expect(first).not.toHaveProperty('records')
		expect(first).not.toHaveProperty('tracks')
	})

	it('stops on Worker parser errors and always cleans parsing state', async () => {
		workflowMocks.startWorkerParse.mockReturnValueOnce(
			createWorkerHandle(
				Promise.reject(
					new RekordboxXmlWorkerParseError(
						'malformed_xml',
						'Invalid XML document'
					)
				)
			)
		)
		const workflow = createWorkflow()

		await workflow.parseFile(createFile())

		expect(requestAnimationFrame).toHaveBeenCalledOnce()
		expect(workflow.parseWarnings.value).toEqual([])
		expect(workflow.parseErrors.value).toEqual(['Invalid XML document'])
		expect(workflowMocks.buildRows).not.toHaveBeenCalled()
		expect(workflow.workflowView.value).toBe('source')
		expect(workflow.isParsing.value).toBe(false)
		expect(workflow.canRetryParsing.value).toBe(false)
	})

	it('reports byte progress before matching progress and preserves Worker warnings', async () => {
		const workerResult = createDeferred<RekordboxXmlSanitizedSnapshot>()
		const matchingResult = createDeferred<TrackEnrichmentRow[]>()
		let reportWorkerProgress:
			| ((progress: {
					bytesRead: number
					totalBytes: number
					parsedTracks: number
					entriesDeclared: number | null
			  }) => void)
			| undefined
		let reportMatchingProgress:
			((completed: number, total: number) => void) | undefined
		workflowMocks.startWorkerParse.mockImplementationOnce(
			(_file: File, options: { onProgress?: typeof reportWorkerProgress }) => {
				reportWorkerProgress = options.onProgress
				return createWorkerHandle(workerResult.promise)
			}
		)
		workflowMocks.buildRows.mockImplementationOnce(
			(options: {
				onProgress?: (completed: number, total: number) => void
			}) => {
				reportMatchingProgress = options.onProgress
				return matchingResult.promise
			}
		)
		const workflow = createWorkflow()
		const parsing = workflow.parseFile(createFile())
		await vi.waitFor(() =>
			expect(workflowMocks.startWorkerParse).toHaveBeenCalledOnce()
		)

		reportWorkerProgress?.({
			bytesRead: 512,
			totalBytes: 1_024,
			parsedTracks: 3,
			entriesDeclared: 6
		})
		expect(workflow.parsePhase.value).toBe('parsing')
		expect(workflow.parseProgress.value).toBe(50)
		expect(workflow.parseCompleted.value).toBe(3)
		expect(workflow.parseTotal.value).toBe(6)

		workerResult.resolve(
			createSnapshot({
				tracks: [createSanitizedSource(), createSanitizedSource({ index: 1 })],
				entriesDeclared: 2,
				warnings: ['Unsupported field ignored']
			})
		)
		await vi.waitFor(() =>
			expect(workflowMocks.buildRows).toHaveBeenCalledOnce()
		)
		expect(workflow.parsePhase.value).toBe('matching')
		expect(workflow.parseWarnings.value).toEqual(['Unsupported field ignored'])

		reportMatchingProgress?.(1, 2)
		expect(workflow.parseProgress.value).toBe(50)
		matchingResult.resolve([createRow()])
		await parsing
		expect(workflow.workflowView.value).toBe('review')
		expect(workflow.isParsing.value).toBe(false)
	})

	it('cancels an active Worker operation without reporting completion', async () => {
		const workerResult = createDeferred<RekordboxXmlSanitizedSnapshot>()
		const handle = createWorkerHandle(workerResult.promise)
		handle.cancel.mockImplementation(() => {
			workerResult.reject(new RekordboxXmlWorkerCancelledError())
		})
		workflowMocks.startWorkerParse.mockReturnValueOnce(handle)
		const workflow = createWorkflow()
		const parsing = workflow.parseFile(createFile('cancelled.xml'))
		await vi.waitFor(() => expect(workflow.isParsing.value).toBe(true))
		await vi.waitFor(() =>
			expect(workflowMocks.startWorkerParse).toHaveBeenCalledOnce()
		)

		workflow.cancelParsing()
		await parsing

		expect(handle.cancel).toHaveBeenCalledOnce()
		expect(workflow.rows.value).toEqual([])
		expect(workflow.parseErrors.value).toEqual([])
		expect(workflow.parseWarnings.value).toEqual([
			'Rekordbox XML parsing was cancelled. Retry when you are ready.'
		])
		expect(workflow.canRetryParsing.value).toBe(true)
	})

	it('retries the retained file with a new Worker operation', async () => {
		const file = createFile('retry.xml')
		workflowMocks.startWorkerParse
			.mockReturnValueOnce(
				createWorkerHandle(
					Promise.reject(
						new RekordboxXmlWorkerParseError(
							'worker_failed',
							'The parser stopped unexpectedly.',
							true
						)
					)
				)
			)
			.mockReturnValueOnce(createWorkerHandle())
		const workflow = createWorkflow()

		await workflow.parseFile(file)
		expect(workflow.canRetryParsing.value).toBe(true)
		await workflow.retryParsing()

		expect(workflowMocks.startWorkerParse).toHaveBeenCalledTimes(2)
		expect(workflowMocks.startWorkerParse.mock.calls[0]?.[0]).toBe(file)
		expect(workflowMocks.startWorkerParse.mock.calls[1]?.[0]).toBe(file)
		expect(workflow.workflowView.value).toBe('review')
		expect(workflow.canRetryParsing.value).toBe(false)
	})

	it('lets a replacement parse own state when the older Worker completes late', async () => {
		const staleResult = createDeferred<RekordboxXmlSanitizedSnapshot>()
		const staleHandle = createWorkerHandle(staleResult.promise)
		workflowMocks.startWorkerParse
			.mockReturnValueOnce(staleHandle)
			.mockReturnValueOnce(createWorkerHandle())
		const workflow = createWorkflow()
		const staleParsing = workflow.parseFile(createFile('stale.xml'))
		await vi.waitFor(() =>
			expect(workflowMocks.startWorkerParse).toHaveBeenCalledOnce()
		)

		const currentParsing = workflow.parseFile(createFile('current.xml'))
		await currentParsing
		expect(staleHandle.cancel).toHaveBeenCalledOnce()
		expect(workflow.selectedFileName.value).toBe('current.xml')
		expect(workflow.workflowView.value).toBe('review')

		staleResult.resolve(createSnapshot())
		await staleParsing
		expect(workflow.selectedFileName.value).toBe('current.xml')
		expect(workflowMocks.buildRows).toHaveBeenCalledOnce()
	})

	it('cancels matching after Worker completion and ignores late rows', async () => {
		const matchingResult = createDeferred<TrackEnrichmentRow[]>()
		workflowMocks.buildRows.mockReturnValueOnce(matchingResult.promise)
		const workflow = createWorkflow()
		const parsing = workflow.parseFile(createFile())
		await vi.waitFor(() => expect(workflow.parsePhase.value).toBe('matching'))

		workflow.cancelParsing()
		matchingResult.resolve([createRow({ id: 'late-row' })])
		await parsing

		expect(workflow.rows.value).toEqual([])
		expect(workflow.workflowView.value).toBe('source')
		expect(workflow.canRetryParsing.value).toBe(true)
	})

	it('normalizes XML and local review results through the same eligible staging state', async () => {
		const eligible = createRow({ id: 'eligible' })
		const blocked = createRow({
			id: 'blocked',
			stagingBlockedReason: 'Competing source match'
		})
		workflowMocks.buildRows.mockResolvedValue([eligible, blocked])
		const workflow = createWorkflow()

		await workflow.parseFile(createFile('library.xml'))

		expect(workflow.workflowView.value).toBe('review')
		expect(workflow.selectedFileName.value).toBe('library.xml')
		expect([...workflow.stagedRowIds.value]).toEqual(['eligible'])
		expect(workflow.selectedFilter.value).toBe('ready')
		expect(workflow.currentPage.value).toBe(1)

		workflow.selectedFilter.value = 'done'
		workflow.currentPage.value = 4
		workflow.lastApplySummary.value = {
			total: 1,
			succeeded: 1,
			failed: 0,
			remaining: 0,
			bpm: 1,
			keyMode: 1,
			evidence: 1,
			evidenceOnly: 0
		}
		await workflow.reviewLocalSources(createLocalSelection())

		expect(workflow.workflowView.value).toBe('review')
		expect(workflow.activeSource.value).toBe('localAudio')
		expect(workflow.selectedFileName.value).toBe(
			'1 files with data · 2 of 3 scanned'
		)
		expect([...workflow.stagedRowIds.value]).toEqual(['eligible'])
		expect(workflow.selectedFilter.value).toBe('ready')
		expect(workflow.currentPage.value).toBe(1)
		expect(workflow.lastApplySummary.value).toBeNull()
	})

	it('invalidates in-flight XML progress and results when the source changes', async () => {
		const pendingRows = createDeferred<TrackEnrichmentRow[]>()
		let reportProgress: ((completed: number, total: number) => void) | undefined
		workflowMocks.buildRows.mockImplementationOnce(
			(options: {
				onProgress?: (completed: number, total: number) => void
			}) => {
				reportProgress = options.onProgress
				return pendingRows.promise
			}
		)
		const workflow = createWorkflow()
		const parsing = workflow.parseFile(createFile('stale.xml'))
		await vi.waitFor(() =>
			expect(workflowMocks.buildRows).toHaveBeenCalledOnce()
		)
		expect(workflow.isParsing.value).toBe(true)

		workflow.selectSource('localAudio')
		expect(workflow.isParsing.value).toBe(false)
		expect(workflow.activeSource.value).toBe('localAudio')
		expect(workflow.selectedFileName.value).toBeNull()

		reportProgress?.(9, 10)
		pendingRows.resolve([createRow({ id: 'stale-result' })])
		await parsing

		expect(workflow.parseCompleted.value).toBe(0)
		expect(workflow.parseTotal.value).toBe(0)
		expect(workflow.rows.value).toEqual([])
		expect(workflow.stagedRowIds.value.size).toBe(0)
		expect(workflow.selectedFileName.value).toBeNull()
		expect(workflow.workflowView.value).toBe('source')
		expect(workflow.parseErrors.value).toEqual([])
	})

	it('keeps the newer local review authoritative while stale errors and cleanup settle', async () => {
		const staleRows = createDeferred<TrackEnrichmentRow[]>()
		const currentRows = createDeferred<TrackEnrichmentRow[]>()
		let staleProgress: ((completed: number, total: number) => void) | undefined
		let currentProgress:
			((completed: number, total: number) => void) | undefined
		workflowMocks.buildRows
			.mockImplementationOnce(
				(options: {
					onProgress?: (completed: number, total: number) => void
				}) => {
					staleProgress = options.onProgress
					return staleRows.promise
				}
			)
			.mockImplementationOnce(
				(options: {
					onProgress?: (completed: number, total: number) => void
				}) => {
					currentProgress = options.onProgress
					return currentRows.promise
				}
			)
		const workflow = createWorkflow()
		const staleParsing = workflow.parseFile(createFile('stale.xml'))
		await vi.waitFor(() =>
			expect(workflowMocks.buildRows).toHaveBeenCalledOnce()
		)

		const currentSelection = createLocalSelection()
		const currentReview = workflow.reviewLocalSources(currentSelection)
		await vi.waitFor(() =>
			expect(workflowMocks.buildRows).toHaveBeenCalledTimes(2)
		)
		expect(workflow.activeSource.value).toBe('localAudio')
		expect(workflow.selectedFileName.value).toBe(
			'1 files with data · 2 of 3 scanned'
		)
		expect(workflow.isParsing.value).toBe(true)

		staleProgress?.(99, 99)
		staleRows.reject(new Error('Stale XML matching failure'))
		await staleParsing

		expect(workflow.parseCompleted.value).toBe(0)
		expect(workflow.parseTotal.value).toBe(1)
		expect(workflow.parseErrors.value).toEqual([])
		expect(workflow.isParsing.value).toBe(true)

		currentProgress?.(1, 1)
		const currentRow = createRow({ id: 'current-local-result' })
		currentRows.resolve([currentRow])
		await currentReview

		expect(workflow.rows.value).toEqual([currentRow])
		expect(workflow.stagedRowIds.value).toEqual(
			new Set(['current-local-result'])
		)
		expect(workflow.workflowView.value).toBe('review')
		expect(workflow.isParsing.value).toBe(false)
	})

	it.each([
		[
			'source switch',
			(workflow: ReturnType<typeof createWorkflow>) =>
				workflow.selectSource('localAudio')
		],
		[
			'start another',
			(workflow: ReturnType<typeof createWorkflow>) =>
				workflow.startAnotherSource()
		]
	])('clears every start-over field on %s', async (_label, reset) => {
		const workflow = createWorkflow()
		workflow.rows.value = [createRow()]
		workflow.stagedRowIds.value = new Set(['row-1'])
		workflow.selectedFileName.value = 'old.xml'
		workflow.lastApplySummary.value = {
			total: 1,
			succeeded: 0,
			failed: 1,
			remaining: 0,
			bpm: 0,
			keyMode: 0,
			evidence: 0,
			evidenceOnly: 0
		}
		workflow.parseWarnings.value = ['old warning']
		workflow.parseErrors.value = ['old error']
		workflow.selectedFilter.value = 'done'
		await nextTick()
		workflow.currentPage.value = 3
		workflow.parseCompleted.value = 4
		workflow.parseTotal.value = 5
		workflow.applyCompleted.value = 1
		workflow.applyTotal.value = 2
		workflow.showApplyDialog.value = true

		reset(workflow)

		expect(workflow.rows.value).toEqual([])
		expect([...workflow.stagedRowIds.value]).toEqual([])
		expect(workflow.selectedFileName.value).toBeNull()
		expect(workflow.lastApplySummary.value).toBeNull()
		expect(workflow.parseWarnings.value).toEqual([])
		expect(workflow.parseErrors.value).toEqual([])
		expect(workflow.selectedFilter.value).toBe('ready')
		expect(workflow.currentPage.value).toBe(1)
		expect(workflow.parseCompleted.value).toBe(0)
		expect(workflow.parseTotal.value).toBe(0)
		expect(workflow.applyCompleted.value).toBe(0)
		expect(workflow.applyTotal.value).toBe(0)
		expect(workflow.showApplyDialog.value).toBe(false)
		expect(workflow.workflowView.value).toBe('source')
	})

	it('preserves review data when returning to source and selects the result filter when returning', () => {
		const workflow = createWorkflow()
		const row = createRow({ error: 'Update failed' })
		workflow.rows.value = [row]
		workflow.stagedRowIds.value = new Set([row.id])
		workflow.selectedFileName.value = 'library.xml'
		workflow.workflowView.value = 'review'
		workflow.lastApplySummary.value = {
			total: 1,
			succeeded: 0,
			failed: 1,
			remaining: 0,
			bpm: 0,
			keyMode: 0,
			evidence: 0,
			evidenceOnly: 0
		}

		workflow.returnToSource()

		expect(workflow.workflowView.value).toBe('source')
		expect(workflow.lastApplySummary.value).toBeNull()
		expect(workflow.rows.value).toEqual([row])
		expect([...workflow.stagedRowIds.value]).toEqual([row.id])
		expect(workflow.selectedFileName.value).toBe('library.xml')

		workflow.returnToReview()
		expect(workflow.workflowView.value).toBe('review')
		expect(workflow.selectedFilter.value).toBe('review')
		workflow.rows.value = [createRow({ error: null })]
		workflow.returnToReview()
		expect(workflow.selectedFilter.value).toBe('done')
	})

	it('loads a prepared review and stages only eligible defaults', () => {
		const workflow = createWorkflow()
		const ready = createRow({ id: 'ready' })
		const blocked = createRow({
			id: 'blocked',
			stagingBlockedReason: 'Ambiguous match'
		})

		workflow.loadPreparedReview('demo.xml', [ready, blocked])

		expect(workflow.selectedFileName.value).toBe('demo.xml')
		expect(workflow.rows.value).toEqual([ready, blocked])
		expect([...workflow.stagedRowIds.value]).toEqual(['ready'])
		expect(workflow.selectedFilter.value).toBe('ready')
		expect(workflow.currentPage.value).toBe(1)
		expect(workflow.workflowView.value).toBe('review')
	})

	it('rejects blocked rows and permits explicit Evidence-only staging', () => {
		const workflow = createWorkflow()
		const eligible = createRow({ id: 'eligible' })
		const blocked = createRow({
			id: 'blocked',
			stagingBlockedReason: 'Ambiguous match'
		})
		const complete = createRow({
			id: 'complete',
			canFillBpm: false,
			canFillKeyMode: false,
			alreadyComplete: true,
			defaultStaged: false
		})
		workflow.rows.value = [eligible, blocked, complete]
		workflow.stagedRowIds.value = new Set()

		workflow.setRowStaged(blocked, true)
		workflow.setRowStaged(complete, true)
		expect([...workflow.stagedRowIds.value]).toEqual(['complete'])

		workflow.setFilteredRowsStaged(true)
		expect([...workflow.stagedRowIds.value]).toEqual(['complete', 'eligible'])
		workflow.setFilteredRowsStaged(false)
		expect([...workflow.stagedRowIds.value]).toEqual(['complete'])
	})

	it('never default-stages Evidence-only rows and applies them with no value-fill intent', async () => {
		const onApplyAttempt = vi.fn()
		const workflow = createWorkflow({ onApplyAttempt })
		const populatedTrack = createTrack({ bpm: 126, key: 8, mode: 1 })
		const evidenceOnly = createRow({
			id: 'evidence-only',
			track: populatedTrack,
			canFillBpm: false,
			canFillKeyMode: false,
			alreadyComplete: true,
			defaultStaged: false
		})
		workflow.loadPreparedReview('library.xml', [evidenceOnly])

		expect(workflow.stagedRowIds.value).toEqual(new Set())
		expect(
			workflow.filterOptions.value.find((option) => option.value === 'evidence')
		).toMatchObject({ label: 'Evidence only', count: 1 })

		workflow.setRowStaged(evidenceOnly, true)
		expect(workflow.stagedEvidenceOnlyCount.value).toBe(1)
		mockTracksStore.updateTracksBatch.mockResolvedValueOnce({
			results: [updatedBatchResult(populatedTrack)],
			cancelled: false,
			requiresReview: false
		})

		await workflow.applyStagedRows()

		expect(onApplyAttempt).toHaveBeenCalledWith(
			expect.objectContaining({
				rows: [
					expect.objectContaining({
						intentKind: 'evidence-only',
						requested: { bpm: false, keyMode: false }
					})
				]
			})
		)
		expect(workflow.lastApplySummary.value).toMatchObject({
			evidence: 1,
			evidenceOnly: 1,
			bpm: 0,
			keyMode: 0
		})
		expect(populatedTrack).toMatchObject({ bpm: 126, key: 8, mode: 1 })
	})

	it('keeps a resumed review read-only until its device lease is taken over', async () => {
		const workflow = createWorkflow()
		const row = createRow()
		workflow.loadPreparedReview('saved.xml', [row])
		workflow.setReviewReadOnly(true)

		workflow.setRowStaged(row, false)
		workflow.clearStagedRows()
		workflow.openApplyReview()
		await workflow.applyStagedRows()

		expect(workflow.stagedRowIds.value).toEqual(new Set(['row-1']))
		expect(mockTracksStore.updateTracksBatch).not.toHaveBeenCalled()
		expect(toast.warning).toHaveBeenCalledWith(
			'Take over this draft before changing or applying it.'
		)

		workflow.setReviewReadOnly(false)
		workflow.setRowStaged(row, false)
		expect(workflow.stagedRowIds.value).toEqual(new Set())
	})

	it('warns without writing for empty staged and empty prepared sets', async () => {
		const workflow = createWorkflow()
		workflow.rows.value = [createRow()]
		workflow.stagedRowIds.value = new Set()

		workflow.openApplyReview()
		expect(toast.warning).toHaveBeenCalledWith(
			'Stage at least one match to apply.'
		)

		workflow.stagedRowIds.value = new Set(['row-1'])
		workflow.showApplyDialog.value = true
		workflowMocks.buildUpdate.mockReturnValueOnce(null)
		await workflow.applyStagedRows()

		expect(toast.warning).toHaveBeenCalledWith(
			'No staged matches can be applied.'
		)
		expect(workflow.showApplyDialog.value).toBe(false)
		expect(mockTracksStore.updateTracksBatch).not.toHaveBeenCalled()
	})

	it('applies one ordered batch, maps mixed results by prepared row, and emits one summary toast', async () => {
		vi.useFakeTimers()
		vi.setSystemTime(new Date('2026-07-12T00:00:00.000Z'))
		const workflow = createWorkflow()
		const keyRow = createRow({
			id: 'row-key',
			track: createTrack({ id: 'track-key' }),
			canFillBpm: false,
			canFillKeyMode: true
		})
		const unstaged = createRow({
			id: 'row-unstaged',
			track: createTrack({ id: 'track-unstaged' })
		})
		const bpmRow = createRow({
			id: 'row-bpm',
			track: createTrack({ id: 'track-bpm' }),
			canFillBpm: true,
			canFillKeyMode: false,
			error: 'stale error'
		})
		const updatedKeyTrack = createTrack({
			id: 'track-key',
			key: 9,
			mode: 0
		})
		workflow.rows.value = [keyRow, unstaged, bpmRow]
		workflow.stagedRowIds.value = new Set(['row-key', 'row-bpm'])
		workflow.selectedFileName.value = 'library.xml'
		workflow.showApplyDialog.value = true
		mockTracksStore.updateTracksBatch.mockImplementation(
			async (
				_updates: TrackBatchUpdate[],
				options?: { onProgress?: (completed: number) => void }
			) => {
				options?.onProgress?.(1)
				options?.onProgress?.(2)
				return {
					cancelled: false,
					requiresReview: true,
					results: [
						updatedBatchResult(updatedKeyTrack),
						failedBatchResult('track-bpm')
					]
				}
			}
		)

		await workflow.applyStagedRows()

		expect(mockTracksStore.updateTracksBatch).toHaveBeenCalledOnce()
		const [updates] = mockTracksStore.updateTracksBatch.mock.calls[0]!
		expect(updates.map((update: TrackBatchUpdate) => update.id)).toEqual([
			'track-key',
			'track-bpm'
		])
		expect(workflowMocks.buildUpdate).toHaveBeenNthCalledWith(
			1,
			keyRow,
			'library.xml',
			'2026-07-12T00:00:00.000Z',
			'fill-empty-fields'
		)
		expect(workflow.applyCompleted.value).toBe(2)
		expect(workflow.applyProgress.value).toBe(100)
		expect(
			workflow.rows.value.find((row) => row.id === 'row-key')
		).toMatchObject({ applied: true, error: null, track: updatedKeyTrack })
		const failedRow = workflow.rows.value.find((row) => row.id === 'row-bpm')
		expect(failedRow).toMatchObject({
			applied: false,
			error: 'Database rejected update',
			stagingBlockedReason: null
		})
		expect([...workflow.stagedRowIds.value]).toEqual([])
		workflow.setRowStaged(failedRow!, true)
		expect([...workflow.stagedRowIds.value]).toEqual(['row-bpm'])
		expect(
			workflow.rows.value.find((row) => row.id === 'row-unstaged')
		).toEqual(unstaged)
		expect(workflow.lastApplySummary.value).toEqual({
			total: 2,
			succeeded: 1,
			failed: 1,
			remaining: 0,
			bpm: 0,
			keyMode: 1,
			evidence: 1,
			evidenceOnly: 0
		})
		expect(toast.error).toHaveBeenCalledOnce()
		expect(toast.error).toHaveBeenCalledWith('Applied 1 of 2. 1 failed.')
		expect(toast.success).not.toHaveBeenCalled()
		expect(workflow.isApplying.value).toBe(false)
		expect(workflow.showApplyDialog.value).toBe(false)
	})

	it('cleans its own apply state when the current batch is cancelled', async () => {
		let resolveBatch!: (value: TrackBatchUpdateOutcome) => void
		mockTracksStore.updateTracksBatch.mockReturnValueOnce(
			new Promise((resolve) => {
				resolveBatch = resolve
			})
		)
		const workflow = createWorkflow()
		workflow.rows.value = [createRow()]
		workflow.stagedRowIds.value = new Set(['row-1'])
		workflow.showApplyDialog.value = true

		const applying = workflow.applyStagedRows()
		await vi.waitFor(() =>
			expect(mockTracksStore.updateTracksBatch).toHaveBeenCalledOnce()
		)
		expect(workflow.isApplying.value).toBe(true)
		expect(workflow.showApplyDialog.value).toBe(true)

		resolveBatch(CANCELLED_BATCH_OUTCOME)
		await applying

		expect(workflow.lastApplySummary.value).toEqual({
			total: 1,
			succeeded: 0,
			failed: 0,
			remaining: 1,
			bpm: 0,
			keyMode: 0,
			evidence: 0,
			evidenceOnly: 0
		})
		expect(workflow.stagedRowIds.value).toEqual(new Set(['row-1']))
		expect(workflow.isApplying.value).toBe(false)
		expect(workflow.showApplyDialog.value).toBe(false)
		expect(toast.error).not.toHaveBeenCalled()
		expect(toast.success).not.toHaveBeenCalled()
		expect(toast.warning).toHaveBeenCalledWith(
			'Applied 0 of 1. 1 remains to retry.'
		)
	})

	it('records confirmed cancelled-batch results before updating only returned rows', async () => {
		vi.useFakeTimers()
		vi.setSystemTime(new Date('2026-07-23T04:05:00.000Z'))
		const onApplyAttempt = vi.fn().mockResolvedValue(undefined)
		const workflow = createWorkflow({ onApplyAttempt })
		const first = createRow({
			id: 'row-first',
			track: createTrack({ id: 'track-first' })
		})
		const second = createRow({
			id: 'row-second',
			track: createTrack({ id: 'track-second' })
		})
		const updatedFirst = createTrack({
			id: 'track-first',
			bpm: 128,
			key: 9,
			mode: 0
		})
		workflow.rows.value = [first, second]
		workflow.stagedRowIds.value = new Set([first.id, second.id])
		mockTracksStore.updateTracksBatch.mockResolvedValueOnce({
			cancelled: true,
			requiresReview: false,
			results: [
				updatedBatchResult(updatedFirst),
				{
					id: 'track-second',
					status: 'unattempted',
					success: false,
					track: null,
					issue: {
						code: 'account_replaced',
						message: 'Workspace changed'
					},
					error: 'Workspace changed',
					operation: null
				}
			]
		})

		await workflow.applyStagedRows()

		expect(onApplyAttempt).toHaveBeenCalledOnce()
		expect(onApplyAttempt).toHaveBeenCalledWith(
			expect.objectContaining({
				attemptedAt: '2026-07-23T04:05:00.000Z',
				outcome: expect.objectContaining({
					cancelled: true,
					results: [expect.objectContaining({ id: 'track-first' })]
				})
			})
		)
		expect(workflow.rows.value.find(({ id }) => id === first.id)).toMatchObject(
			{
				applied: true,
				track: updatedFirst
			}
		)
		expect(workflow.rows.value.find(({ id }) => id === second.id)).toEqual(
			second
		)
		expect(workflow.stagedRowIds.value).toEqual(new Set([second.id]))
		expect(workflow.lastApplySummary.value).toMatchObject({
			total: 2,
			succeeded: 1,
			failed: 0,
			remaining: 1
		})
		expect(toast.success).not.toHaveBeenCalled()
		expect(toast.warning).toHaveBeenCalledWith(
			'Applied 1 of 2. 1 remains to retry.'
		)
	})

	it('ignores stale progress and results after the workflow is reset', async () => {
		let resolveBatch!: (value: TrackBatchUpdateOutcome) => void
		let reportOldProgress!: (completed: number) => void
		mockTracksStore.updateTracksBatch.mockImplementationOnce(
			(_updates, options) => {
				reportOldProgress = options.onProgress
				return new Promise((resolve) => {
					resolveBatch = resolve
				})
			}
		)
		const workflow = createWorkflow()
		workflow.rows.value = [createRow()]
		workflow.stagedRowIds.value = new Set(['row-1'])
		workflow.showApplyDialog.value = true

		const applying = workflow.applyStagedRows()
		await vi.waitFor(() =>
			expect(mockTracksStore.updateTracksBatch).toHaveBeenCalledOnce()
		)
		workflow.startAnotherSource()
		const replacementRow = createRow({ id: 'replacement-row' })
		workflow.loadPreparedReview('replacement.xml', [replacementRow])
		vi.mocked(toast.error).mockClear()
		vi.mocked(toast.success).mockClear()

		reportOldProgress(1)
		resolveBatch({
			cancelled: false,
			requiresReview: false,
			results: [
				updatedBatchResult(createTrack({ id: 'track-1', title: 'Old result' }))
			]
		})
		await applying

		expect(workflow.rows.value).toEqual([replacementRow])
		expect(workflow.applyCompleted.value).toBe(0)
		expect(workflow.applyTotal.value).toBe(0)
		expect(workflow.lastApplySummary.value).toBeNull()
		expect(workflow.isApplying.value).toBe(false)
		expect(workflow.showApplyDialog.value).toBe(false)
		expect(toast.error).not.toHaveBeenCalled()
		expect(toast.success).not.toHaveBeenCalled()
	})

	it('does not let an older rejected apply clear a newer apply', async () => {
		let rejectOldBatch!: (reason: Error) => void
		let resolveNewBatch!: (value: TrackBatchUpdateOutcome) => void
		let reportOldProgress!: (completed: number) => void
		mockTracksStore.updateTracksBatch
			.mockImplementationOnce((_updates, options) => {
				reportOldProgress = options.onProgress
				return new Promise((_resolve, reject) => {
					rejectOldBatch = reject
				})
			})
			.mockImplementationOnce(
				() =>
					new Promise((resolve) => {
						resolveNewBatch = resolve
					})
			)
		const workflow = createWorkflow()
		workflow.rows.value = [createRow()]
		workflow.stagedRowIds.value = new Set(['row-1'])
		workflow.showApplyDialog.value = true

		const oldApply = workflow.applyStagedRows()
		await vi.waitFor(() =>
			expect(mockTracksStore.updateTracksBatch).toHaveBeenCalledOnce()
		)
		workflow.startAnotherSource()
		workflow.loadPreparedReview('replacement.xml', [createRow()])
		workflow.stagedRowIds.value = new Set(['row-1'])
		workflow.showApplyDialog.value = true
		const newApply = workflow.applyStagedRows()
		await vi.waitFor(() =>
			expect(mockTracksStore.updateTracksBatch).toHaveBeenCalledTimes(2)
		)
		reportOldProgress(1)
		rejectOldBatch(new Error('Old connection failed'))
		await expect(oldApply).rejects.toThrow('Old connection failed')

		expect(workflow.applyCompleted.value).toBe(0)
		expect(workflow.isApplying.value).toBe(true)
		expect(workflow.showApplyDialog.value).toBe(true)
		expect(workflow.lastApplySummary.value).toBeNull()

		resolveNewBatch(CANCELLED_BATCH_OUTCOME)
		await newApply
		expect(workflow.isApplying.value).toBe(false)
		expect(workflow.showApplyDialog.value).toBe(false)
	})

	it('cleans apply flags and dialog in finally when the batch throws', async () => {
		const workflow = createWorkflow()
		const batch = createDeferred<TrackBatchUpdateOutcome>()
		workflow.rows.value = [createRow()]
		workflow.stagedRowIds.value = new Set(['row-1'])
		workflow.showApplyDialog.value = true
		mockTracksStore.updateTracksBatch.mockReturnValue(batch.promise)

		const applying = workflow.applyStagedRows()
		await vi.waitFor(() =>
			expect(mockTracksStore.updateTracksBatch).toHaveBeenCalledOnce()
		)
		const rejected = expect(applying).rejects.toThrow('Connection lost')
		batch.reject(new Error('Connection lost'))
		await rejected

		expect(workflow.isApplying.value).toBe(false)
		expect(workflow.showApplyDialog.value).toBe(false)
		expect(workflow.lastApplySummary.value).toBeNull()
	})
	it('does not dispatch an abandoned apply after asynchronous preparation', async () => {
		const deferred = createDeferred<TrackBatchUpdate | null>()
		workflowMocks.buildUpdate.mockReturnValueOnce(deferred.promise)
		const workflow = createWorkflow()
		const row = createRow()
		workflow.loadPreparedReview('original.xml', [row])
		workflow.stagedRowIds.value = new Set([row.id])
		const applying = workflow.applyStagedRows()
		workflow.startAnotherSource()
		deferred.resolve(toBatchUpdate(row))
		await applying
		expect(mockTracksStore.updateTracksBatch).not.toHaveBeenCalled()
		expect(workflow.isApplying.value).toBe(false)
	})
	it.each([
		'lease loss',
		'reacquired lease',
		'page departure',
		'scope disposal',
		'workspace replacement'
	] as const)('does not dispatch preparation after %s', async (reason) => {
		let isCurrent = true
		const workflow = createWorkflow({
			captureApplyGuard: () => () => isCurrent
		})
		const row = createRow()
		workflow.loadPreparedReview('original.xml', [row])
		workflow.stagedRowIds.value = new Set([row.id])
		const preparation = createDeferred<TrackBatchUpdate | null>()
		workflowMocks.buildUpdate.mockReturnValueOnce(preparation.promise)
		const applying = workflow.applyStagedRows()
		expect(workflow.isApplying.value).toBe(true)
		if (reason === 'lease loss' || reason === 'reacquired lease')
			workflow.setReviewReadOnly(true)
		if (reason === 'reacquired lease') workflow.setReviewReadOnly(false)
		if (reason === 'page departure') workflow.cancelPendingApply()
		if (reason === 'scope disposal') activeScopes.at(-1)!.stop()
		if (reason === 'workspace replacement') isCurrent = false
		preparation.resolve(toBatchUpdate(row))
		await applying
		expect(mockTracksStore.updateTracksBatch).not.toHaveBeenCalled()
		expect(workflow.isApplying.value).toBe(false)
	})

	it('rejects duplicate apply starts during preparation', async () => {
		const workflow = createWorkflow()
		const row = createRow()
		workflow.loadPreparedReview('original.xml', [row])
		workflow.stagedRowIds.value = new Set([row.id])
		const preparation = createDeferred<TrackBatchUpdate | null>()
		workflowMocks.buildUpdate.mockReturnValueOnce(preparation.promise)
		const applying = workflow.applyStagedRows()
		await workflow.applyStagedRows()
		expect(workflowMocks.buildUpdate).toHaveBeenCalledOnce()
		preparation.resolve(toBatchUpdate(row))
		await applying
		expect(mockTracksStore.updateTracksBatch).toHaveBeenCalledOnce()
	})

	it('clears busy state when preparation itself fails', async () => {
		const workflow = createWorkflow()
		workflow.loadPreparedReview('original.xml', [createRow()])
		workflow.stagedRowIds.value = new Set(['row-1'])
		workflow.showApplyDialog.value = true
		workflowMocks.buildUpdate.mockRejectedValueOnce(
			new Error('Preparation failed')
		)
		await expect(workflow.applyStagedRows()).rejects.toThrow(
			'Preparation failed'
		)
		expect(workflow.isApplying.value).toBe(false)
		expect(workflow.showApplyDialog.value).toBe(false)
		expect(mockTracksStore.updateTracksBatch).not.toHaveBeenCalled()
	})

	it('still records an already-dispatched outcome after leaving the page', async () => {
		const recordAttempt = vi.fn()
		const workflow = createWorkflow({ onApplyAttempt: recordAttempt })
		workflow.loadPreparedReview('original.xml', [createRow()])
		workflow.stagedRowIds.value = new Set(['row-1'])
		const batch = createDeferred<TrackBatchUpdateOutcome>()
		mockTracksStore.updateTracksBatch.mockReturnValueOnce(batch.promise)
		const applying = workflow.applyStagedRows()
		await vi.waitFor(() =>
			expect(mockTracksStore.updateTracksBatch).toHaveBeenCalledOnce()
		)
		workflow.cancelPendingApply()
		batch.resolve({
			cancelled: false,
			requiresReview: false,
			results: [updatedBatchResult(createTrack({ bpm: 128 }))]
		})
		await applying
		expect(recordAttempt).toHaveBeenCalledOnce()
		expect(workflow.isApplying.value).toBe(false)
	})
})
