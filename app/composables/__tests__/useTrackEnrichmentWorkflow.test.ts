import { type EffectScope, effectScope, nextTick } from 'vue'
import { toast } from 'vue-sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LocalAudioReviewSelection } from '~/types/localAudio'
import type { RekordboxXmlTrack } from '~/utils/rekordboxXml'
import type { TrackEnrichmentRow } from '~/utils/trackEnrichment'
import type { DatabaseRecord, Track } from '~~/shared/types/supabase'
import type { TrackBatchUpdate } from '~~/shared/types/trackUpdates'

const workflowMocks = vi.hoisted(() => ({
	buildRows: vi.fn(),
	buildUpdate: vi.fn(),
	parseXml: vi.fn()
}))

vi.mock('vue-sonner', () => ({
	toast: {
		error: vi.fn(),
		success: vi.fn(),
		warning: vi.fn()
	}
}))

vi.mock('~/utils/rekordboxXml', async (importOriginal) => ({
	...(await importOriginal<typeof import('~/utils/rekordboxXml')>()),
	parseRekordboxXml: workflowMocks.parseXml
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

function createWorkflow() {
	const scope = effectScope()
	const workflow = scope.run(() => useTrackEnrichmentWorkflow())
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
		...overrides
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
		updated_at: null,
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
		text: vi.fn().mockResolvedValue('<DJ_PLAYLISTS />')
	} as unknown as File
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
	if (!row.track || row.stagingBlockedReason) return null

	return {
		id: row.track.id,
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

describe('useTrackEnrichmentWorkflow', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mockRecordsStore.records = [createRecord()]
		mockTracksStore.tracks = [createTrack()]
		workflowMocks.parseXml.mockReturnValue({
			tracks: [createSource()],
			warnings: [],
			errors: []
		})
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
		mockTracksStore.updateTracksBatch.mockResolvedValue([])
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

	it('preserves XML warnings, stops on parser errors, and always cleans parsing state', async () => {
		workflowMocks.parseXml.mockReturnValue({
			tracks: [],
			warnings: ['Unsupported field ignored'],
			errors: ['Invalid XML document']
		})
		const workflow = createWorkflow()

		await workflow.parseFile(createFile())

		expect(requestAnimationFrame).toHaveBeenCalledOnce()
		expect(workflow.parseWarnings.value).toEqual(['Unsupported field ignored'])
		expect(workflow.parseErrors.value).toEqual(['Invalid XML document'])
		expect(workflowMocks.buildRows).not.toHaveBeenCalled()
		expect(workflow.workflowView.value).toBe('source')
		expect(workflow.isParsing.value).toBe(false)
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
			bpm: 1,
			keyMode: 1
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
			| ((completed: number, total: number) => void)
			| undefined
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
			bpm: 0,
			keyMode: 0
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
			bpm: 0,
			keyMode: 0
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

	it('resets pagination on filter changes and clamps it when result pages shrink', async () => {
		const workflow = createWorkflow()
		workflow.rows.value = Array.from({ length: 201 }, (_, index) =>
			createRow({ id: `row-${index}` })
		)
		workflow.selectedFilter.value = 'ready'
		await nextTick()
		expect(workflow.pageCount.value).toBe(3)
		workflow.currentPage.value = 3

		workflow.selectedFilter.value = 'matched'
		await nextTick()
		expect(workflow.currentPage.value).toBe(1)
		workflow.currentPage.value = 3
		workflow.rows.value = workflow.rows.value.slice(0, 20)
		await nextTick()

		expect(workflow.pageCount.value).toBe(1)
		expect(workflow.currentPage.value).toBe(1)
		expect(workflow.pagedRows.value).toHaveLength(20)
		expect(workflow.shownStart.value).toBe(1)
		expect(workflow.shownEnd.value).toBe(20)
	})

	it('rejects blocked and ineligible row staging in both single and bulk controls', () => {
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
		expect([...workflow.stagedRowIds.value]).toEqual([])

		workflow.setFilteredRowsStaged(true)
		expect([...workflow.stagedRowIds.value]).toEqual(['eligible'])
		expect(workflow.filteredSelectionState.value).toBe(true)
		workflow.setFilteredRowsStaged(false)
		expect([...workflow.stagedRowIds.value]).toEqual([])
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
				return [
					{
						id: 'track-key',
						success: true,
						track: updatedKeyTrack,
						error: null
					},
					{
						id: 'track-bpm',
						success: false,
						track: null,
						error: 'Database rejected update'
					}
				]
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
			'2026-07-12T00:00:00.000Z'
		)
		expect(workflow.applyCompleted.value).toBe(2)
		expect(workflow.applyProgress.value).toBe(100)
		expect(
			workflow.rows.value.find((row) => row.id === 'row-key')
		).toMatchObject({ applied: true, error: null, track: updatedKeyTrack })
		expect(
			workflow.rows.value.find((row) => row.id === 'row-bpm')
		).toMatchObject({ applied: false, error: 'Database rejected update' })
		expect(
			workflow.rows.value.find((row) => row.id === 'row-unstaged')
		).toEqual(unstaged)
		expect(workflow.lastApplySummary.value).toEqual({
			total: 2,
			succeeded: 1,
			failed: 1,
			bpm: 0,
			keyMode: 1
		})
		expect(toast.error).toHaveBeenCalledOnce()
		expect(toast.error).toHaveBeenCalledWith('Applied 1 of 2. 1 failed.')
		expect(toast.success).not.toHaveBeenCalled()
		expect(workflow.isApplying.value).toBe(false)
		expect(workflow.showApplyDialog.value).toBe(false)
	})

	it('cleans apply flags and dialog in finally when the batch throws', async () => {
		const workflow = createWorkflow()
		workflow.rows.value = [createRow()]
		workflow.stagedRowIds.value = new Set(['row-1'])
		workflow.showApplyDialog.value = true
		mockTracksStore.updateTracksBatch.mockRejectedValue(
			new Error('Connection lost')
		)

		const applying = workflow.applyStagedRows()
		expect(workflow.isApplying.value).toBe(true)
		await expect(applying).rejects.toThrow('Connection lost')

		expect(workflow.isApplying.value).toBe(false)
		expect(workflow.showApplyDialog.value).toBe(false)
		expect(workflow.lastApplySummary.value).toBeNull()
	})
})
