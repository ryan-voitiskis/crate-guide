import type { Ref } from 'vue'
import type { TrackEnrichmentRow } from '~/utils/trackEnrichment'
import { canStageTrackEnrichmentRow } from '~/utils/trackEnrichment'

export type TrackEnrichmentReviewSortKey =
	| 'library'
	| 'source'
	| 'duration'
	| 'bpm'
	| 'key'
	| 'confidence'

type UseTrackEnrichmentReviewTableOptions = {
	filteredRows: Readonly<Ref<TrackEnrichmentRow[]>>
	stagedRowIds: Ref<Set<string>>
	currentPage: Ref<number>
	selectedFileName: Readonly<Ref<string | null>>
	setRowStaged: (row: TrackEnrichmentRow, checked: boolean) => void
	setFilteredRowsStaged: (checked: boolean) => void
}

const rowsPerPage = 100

function getSearchText(row: TrackEnrichmentRow): string {
	return [
		row.track?.title,
		row.track?.position,
		row.track?.artists.map((artist) => artist.name).join(' '),
		row.record?.title,
		row.record?.labels[0]?.name,
		row.record?.labels[0]?.catno,
		row.source.name,
		row.source.artist,
		row.source.album,
		row.source.locationHint,
		row.source.sourceType === 'rekordboxXml' ? row.source.trackId : null,
		row.reasons.join(' '),
		row.warnings.join(' ')
	]
		.filter(Boolean)
		.join(' ')
		.toLocaleLowerCase()
}

function compareNullableValues(
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

function getSortValue(
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

export function useTrackEnrichmentReviewTable({
	filteredRows,
	stagedRowIds,
	currentPage,
	selectedFileName,
	setRowStaged,
	setFilteredRowsStaged
}: UseTrackEnrichmentReviewTableOptions) {
	const query = ref('')
	const sortKey = ref<TrackEnrichmentReviewSortKey | null>(null)
	const sortDirection = ref<'asc' | 'desc'>('asc')

	const normalizedQuery = computed(() => query.value.trim().toLocaleLowerCase())

	const searchedRows = computed(() => {
		if (!normalizedQuery.value) return filteredRows.value
		return filteredRows.value.filter((row) =>
			getSearchText(row).includes(normalizedQuery.value)
		)
	})

	const sortedRows = computed(() => {
		if (!sortKey.value) return searchedRows.value

		const direction = sortDirection.value === 'asc' ? 1 : -1
		const key = sortKey.value
		return [...searchedRows.value].sort(
			(left, right) =>
				compareNullableValues(
					getSortValue(left, key),
					getSortValue(right, key)
				) * direction
		)
	})

	const stageableRows = computed(() =>
		searchedRows.value.filter(canStageTrackEnrichmentRow)
	)

	const stagedCount = computed(
		() =>
			stageableRows.value.filter((row) => stagedRowIds.value.has(row.id)).length
	)

	const selectionState = computed<boolean | 'indeterminate'>(() => {
		if (stagedCount.value === 0) return false
		if (stagedCount.value === stageableRows.value.length) return true
		return 'indeterminate'
	})

	const pageCount = computed(() =>
		Math.max(1, Math.ceil(sortedRows.value.length / rowsPerPage))
	)

	const pagedRows = computed(() => {
		const start = (currentPage.value - 1) * rowsPerPage
		return sortedRows.value.slice(start, start + rowsPerPage)
	})

	const shownStart = computed(() =>
		sortedRows.value.length === 0
			? 0
			: (currentPage.value - 1) * rowsPerPage + 1
	)

	const shownEnd = computed(() =>
		Math.min(currentPage.value * rowsPerPage, sortedRows.value.length)
	)

	watch([query, sortKey, sortDirection], () => {
		currentPage.value = 1
	})

	watch(pageCount, (nextPageCount) => {
		if (currentPage.value > nextPageCount) currentPage.value = nextPageCount
	})

	watch(selectedFileName, (nextFileName, previousFileName) => {
		if (nextFileName === previousFileName) return
		query.value = ''
		sortKey.value = null
		sortDirection.value = 'asc'
	})

	function setVisibleRowsStaged(checked: boolean) {
		if (!normalizedQuery.value) {
			setFilteredRowsStaged(checked)
			return
		}

		for (const row of stageableRows.value) setRowStaged(row, checked)
	}

	function setSort(nextKey: TrackEnrichmentReviewSortKey) {
		if (sortKey.value === nextKey) {
			sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc'
			return
		}

		sortKey.value = nextKey
		sortDirection.value = nextKey === 'confidence' ? 'desc' : 'asc'
	}

	return {
		query,
		sortKey,
		sortDirection,
		searchedRows,
		sortedRows,
		stageableRows,
		selectionState,
		pageCount,
		pagedRows,
		shownStart,
		shownEnd,
		setVisibleRowsStaged,
		setSort
	}
}
