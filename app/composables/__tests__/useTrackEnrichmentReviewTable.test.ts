import { effectScope, nextTick, ref } from 'vue'
import { createMockRecord } from 'test/mocks/fixtures/records'
import { createMockTrack } from 'test/mocks/fixtures/tracks'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useTrackEnrichmentReviewTable } from '~/composables/useTrackEnrichmentReviewTable'
import type { TrackEnrichmentRow } from '~/utils/trackEnrichment'

const scopes = new Set<ReturnType<typeof effectScope>>()

function createRow(
	id: string,
	title = id,
	proposedBpm = 128
): TrackEnrichmentRow {
	return {
		id,
		source: {
			sourceType: 'rekordboxXml',
			index: 0,
			trackId: id,
			name: title,
			artist: 'Source Artist',
			album: 'Source Album',
			genre: 'House',
			kind: 'WAV File',
			totalTimeSeconds: 180,
			year: 2024,
			averageBpm: proposedBpm,
			dateAdded: null,
			bitRate: 1411,
			sampleRate: 44100,
			comments: null,
			playCount: 0,
			rating: 0,
			location: null,
			locationHint: title + '.wav',
			remixer: null,
			tonality: '8A',
			parsedKey: 9,
			parsedMode: 0,
			label: null,
			warnings: []
		},
		track: createMockTrack({ id: 'track-' + id, title }),
		record: createMockRecord({ id: 'record-' + id }),
		confidence: 'high',
		score: 90,
		reasons: ['Exact title match'],
		warnings: [],
		proposedBpm,
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
		applied: false
	}
}

function createTable(rows: TrackEnrichmentRow[]) {
	const scope = effectScope()
	scopes.add(scope)
	const filteredRows = ref(rows)
	const stagedRowIds = ref(new Set<string>())
	const currentPage = ref(1)
	const selectedFileName = ref<string | null>('library.xml')
	const setRowStaged = vi.fn()
	const setFilteredRowsStaged = vi.fn()
	const table = scope.run(() =>
		useTrackEnrichmentReviewTable({
			filteredRows,
			stagedRowIds,
			currentPage,
			selectedFileName,
			setRowStaged,
			setFilteredRowsStaged
		})
	)!

	return {
		...table,
		filteredRows,
		stagedRowIds,
		currentPage,
		selectedFileName,
		setRowStaged,
		setFilteredRowsStaged
	}
}

describe('useTrackEnrichmentReviewTable', () => {
	afterEach(() => {
		for (const scope of scopes) scope.stop()
		scopes.clear()
	})

	it('owns review pagination and clamps pages when rows shrink', async () => {
		const rows = Array.from({ length: 201 }, (_, index) =>
			createRow('row-' + index)
		)
		const table = createTable(rows)

		expect(table.pageCount.value).toBe(3)
		table.currentPage.value = 3
		expect(table.pagedRows.value).toHaveLength(1)
		expect(table.shownStart.value).toBe(201)
		expect(table.shownEnd.value).toBe(201)

		table.filteredRows.value = rows.slice(0, 20)
		await nextTick()

		expect(table.pageCount.value).toBe(1)
		expect(table.currentPage.value).toBe(1)
		expect(table.pagedRows.value).toHaveLength(20)
	})

	it('filters, sorts, and resets table controls for a new import', async () => {
		const table = createTable([
			createRow('alpha', 'Alpha', 130),
			createRow('beta', 'Beta', 120)
		])

		table.query.value = 'beta'
		expect(table.searchedRows.value.map((row) => row.id)).toEqual(['beta'])

		table.query.value = ''
		table.setSort('bpm')
		expect(table.sortedRows.value.map((row) => row.id)).toEqual([
			'beta',
			'alpha'
		])
		table.setSort('bpm')
		expect(table.sortedRows.value.map((row) => row.id)).toEqual([
			'alpha',
			'beta'
		])

		table.query.value = 'alpha'
		table.selectedFileName.value = 'another.xml'
		await nextTick()

		expect(table.query.value).toBe('')
		expect(table.sortKey.value).toBeNull()
		expect(table.sortDirection.value).toBe('asc')
	})

	it('stages the whole filter or only the searched subset', () => {
		const alpha = createRow('alpha', 'Alpha')
		const beta = createRow('beta', 'Beta')
		const table = createTable([alpha, beta])

		table.setVisibleRowsStaged(true)
		expect(table.setFilteredRowsStaged).toHaveBeenCalledWith(true)
		expect(table.setRowStaged).not.toHaveBeenCalled()

		table.query.value = 'beta'
		table.setVisibleRowsStaged(true)
		expect(table.setRowStaged).toHaveBeenCalledWith(beta, true)

		table.stagedRowIds.value = new Set(['beta'])
		expect(table.selectionState.value).toBe(true)
	})
})
