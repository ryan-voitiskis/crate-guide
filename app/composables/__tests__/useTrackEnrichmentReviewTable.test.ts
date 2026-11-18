import { effectScope, nextTick, ref } from 'vue'
import { createMockRecord } from 'test/mocks/fixtures/records'
import { createMockTrack } from 'test/mocks/fixtures/tracks'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
	type TrackEnrichmentReviewSortKey,
	useTrackEnrichmentReviewTable
} from '~/composables/useTrackEnrichmentReviewTable'
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

// The pre-collator comparator, kept verbatim as an ordering oracle.
function legacyCompare(
	left: string | number | null | undefined,
	right: string | number | null | undefined
): number {
	if (left === null || left === undefined || left === '')
		return right === null || right === undefined || right === '' ? 0 : 1
	if (right === null || right === undefined || right === '') return -1
	if (typeof left === 'number' && typeof right === 'number') return left - right
	return String(left).localeCompare(String(right), undefined, {
		numeric: true,
		sensitivity: 'base'
	})
}

function legacySortValue(
	row: TrackEnrichmentRow,
	key: TrackEnrichmentReviewSortKey
): string | number | null | undefined {
	switch (key) {
		case 'library':
			return `${row.track?.artists[0]?.name || ''} ${row.track?.title || ''}`
		case 'source':
			return `${row.source.artist || ''} ${row.source.name || ''}`
		case 'duration':
			return row.source.totalTimeSeconds
		case 'bpm':
			return row.proposedBpm
		case 'key':
			return row.proposedKey === null || row.proposedKey === undefined
				? null
				: row.proposedKey * 2 + (row.proposedMode ?? 0)
		case 'confidence':
			return (
				({ high: 300, medium: 200, manual: 100 } as const)[row.confidence] +
				row.score
			)
	}
}

function createSortFixture(): TrackEnrichmentRow[] {
	const titles = [
		'Track 10',
		'track 2',
		'Éclair',
		'eclair',
		'Zebra',
		'',
		'Track 1',
		'ångström',
		'Alpha'
	]
	return titles.map((title, index) => {
		const row = createRow(`row-${index}`, title, [128, 120, 0][index % 3]!)
		return {
			...row,
			source: {
				...row.source,
				artist: ['B Artist', 'a artist', ''][index % 3]!,
				totalTimeSeconds: index % 4 === 0 ? null : 300 - index * 7
			},
			track:
				index === 5
					? null
					: { ...row.track!, artists: [{ name: `Artist ${9 - index}` }] },
			proposedBpm: index % 5 === 0 ? null : row.proposedBpm,
			proposedKey: index % 3 === 0 ? null : index % 12,
			proposedMode: index % 2,
			confidence: (['high', 'medium', 'manual'] as const)[index % 3]!,
			score: 50 + ((index * 13) % 40)
		} as TrackEnrichmentRow
	})
}

describe('useTrackEnrichmentReviewTable', () => {
	it('orders every sort key exactly like the legacy localeCompare sort', () => {
		const rows = createSortFixture()
		const keys: TrackEnrichmentReviewSortKey[] = [
			'library',
			'source',
			'duration',
			'bpm',
			'key',
			'confidence'
		]
		const table = createTable(rows)
		for (const key of keys) {
			for (const direction of ['asc', 'desc'] as const) {
				table.sortKey.value = key
				table.sortDirection.value = direction
				const factor = direction === 'asc' ? 1 : -1
				const expected = [...rows]
					.sort(
						(left, right) =>
							legacyCompare(
								legacySortValue(left, key),
								legacySortValue(right, key)
							) * factor
					)
					.map((row) => row.id)
				expect(table.sortedRows.value.map((row) => row.id)).toEqual(expected)
			}
		}
	})

	it('derives search text from the current row object', () => {
		const original = createRow('alpha', 'Alpha')
		const table = createTable([original])
		table.query.value = 'alpha'
		expect(table.searchedRows.value).toHaveLength(1)

		table.filteredRows.value = [{ ...original, reasons: ['Gamma evidence'] }]
		table.query.value = 'gamma'
		expect(table.searchedRows.value).toHaveLength(1)
		table.query.value = 'exact title'
		expect(table.searchedRows.value).toHaveLength(0)
	})

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
