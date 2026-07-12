import { sortTracksByPosition } from './sortTracksByPosition'

export type LoadTrackRecordResult = {
	record: DatabaseRecord
	tracks: Track[]
	previewTracks: Track[]
	matchedTrackIds: string[]
	score: number
}

export type BuildLoadTrackResultsOptions = {
	records: DatabaseRecord[]
	tracks: Track[]
	query: string
	recordOrder?: string[]
}

const DEFAULT_PREVIEW_LIMIT = 5

function normalize(value: string | number | null | undefined): string {
	return String(value ?? '')
		.toLocaleLowerCase()
		.trim()
		.replace(/\s+/g, ' ')
}

function valuesContainAllTokens(values: string[], tokens: string[]): boolean {
	const document = values.join(' ')
	return tokens.every((token) => document.includes(token))
}

function scoreValue(
	value: string,
	query: string,
	weights: {
		exact: number
		prefix: number
		substring: number
	}
): number {
	if (!value) return 0
	if (value === query) return weights.exact
	if (value.startsWith(query)) return weights.prefix
	if (value.includes(query)) return weights.substring
	return 0
}

function getSearchScore(
	record: DatabaseRecord,
	tracks: Track[],
	query: string
): number {
	const catalogueNumbers = record.labels.map((label) => normalize(label.catno))
	const trackTitles = tracks.map((track) => normalize(track.title))
	const recordTitle = normalize(record.title)
	const artists = [
		...record.artists.map((artist) => normalize(artist.name)),
		...tracks.flatMap((track) =>
			[...track.artists, ...track.extraartists].map((artist) =>
				normalize(artist.name)
			)
		)
	]
	const labels = record.labels.map((label) => normalize(label.name))
	const fallback = tracks.flatMap((track) => [
		normalize(track.position),
		...track.genres.map(normalize)
	])
	fallback.push(normalize(record.year))

	const scoreSearchTerm = (term: string) =>
		Math.max(
			...catalogueNumbers.map((value) =>
				scoreValue(value, term, {
					exact: 10_000,
					prefix: 7_000,
					substring: 6_400
				})
			),
			...trackTitles.map((value) =>
				scoreValue(value, term, {
					exact: 9_000,
					prefix: 6_900,
					substring: 6_200
				})
			),
			scoreValue(recordTitle, term, {
				exact: 8_000,
				prefix: 6_800,
				substring: 6_100
			}),
			...artists.map((value) =>
				scoreValue(value, term, {
					exact: 5_500,
					prefix: 5_300,
					substring: 5_000
				})
			),
			...labels.map((value) =>
				scoreValue(value, term, {
					exact: 4_500,
					prefix: 4_300,
					substring: 4_000
				})
			),
			...fallback.map((value) =>
				scoreValue(value, term, {
					exact: 3_500,
					prefix: 3_300,
					substring: 3_000
				})
			)
		)

	const wholeQueryScore = scoreSearchTerm(query)
	const tokenScore = query
		.split(' ')
		.reduce((score, token) => score + scoreSearchTerm(token), 0)
	return wholeQueryScore * 100 + tokenScore
}

function getRecordSearchValues(
	record: DatabaseRecord,
	tracks: Track[]
): string[] {
	return [
		normalize(record.title),
		...record.artists.map((artist) => normalize(artist.name)),
		...record.labels.flatMap((label) => [
			normalize(label.name),
			normalize(label.catno)
		]),
		normalize(record.year),
		...tracks.flatMap((track) => [
			normalize(track.title),
			...track.artists.map((artist) => normalize(artist.name)),
			...track.extraartists.map((artist) => normalize(artist.name)),
			normalize(track.position),
			...track.genres.map(normalize)
		])
	]
}

function getMatchedTrackIds(tracks: Track[], tokens: string[]): string[] {
	if (tokens.length === 0) return []

	return tracks
		.filter((track) =>
			valuesContainAllTokens(
				[
					normalize(track.title),
					...track.artists.map((artist) => normalize(artist.name)),
					...track.extraartists.map((artist) => normalize(artist.name)),
					normalize(track.position),
					...track.genres.map(normalize)
				],
				tokens
			)
		)
		.map((track) => track.id)
}

export function getLoadTrackPreview(
	tracks: Track[],
	matchedTrackIds: string[],
	limit = DEFAULT_PREVIEW_LIMIT
): Track[] {
	if (limit <= 0) return []
	if (tracks.length <= limit) return tracks.slice()

	const matchedIds = new Set(matchedTrackIds)
	const firstMatchIndex = tracks.findIndex((track) => matchedIds.has(track.id))
	if (firstMatchIndex === -1 || firstMatchIndex < limit) {
		return tracks.slice(0, limit)
	}

	const preferredStart = firstMatchIndex - 2
	const maxStart = tracks.length - limit
	const start = Math.max(0, Math.min(preferredStart, maxStart))
	return tracks.slice(start, start + limit)
}

export function buildLoadTrackRecordResults({
	records,
	tracks,
	query,
	recordOrder
}: BuildLoadTrackResultsOptions): LoadTrackRecordResult[] {
	const groupedTracks = new Map<string, Track[]>()

	for (const track of tracks) {
		if (!track.playable) continue
		const recordTracks = groupedTracks.get(track.record_id)
		if (recordTracks) recordTracks.push(track)
		else groupedTracks.set(track.record_id, [track])
	}

	for (const [recordId, recordTracks] of groupedTracks) {
		groupedTracks.set(recordId, sortTracksByPosition(recordTracks))
	}

	const normalizedQuery = normalize(query)
	const tokens = normalizedQuery ? normalizedQuery.split(' ') : []
	const order = recordOrder ?? records.map((record) => record.id)
	const orderIndex = new Map(order.map((recordId, index) => [recordId, index]))
	const allowedRecordIds = recordOrder ? new Set(recordOrder) : null

	return records
		.filter((record) => !allowedRecordIds || allowedRecordIds.has(record.id))
		.map((record) => {
			const recordTracks = groupedTracks.get(record.id) ?? []
			if (recordTracks.length === 0) return null
			if (
				tokens.length > 0 &&
				!valuesContainAllTokens(
					getRecordSearchValues(record, recordTracks),
					tokens
				)
			) {
				return null
			}

			const matchedTrackIds = getMatchedTrackIds(recordTracks, tokens)
			return {
				record,
				tracks: recordTracks,
				previewTracks: getLoadTrackPreview(recordTracks, matchedTrackIds),
				matchedTrackIds,
				score:
					tokens.length > 0
						? getSearchScore(record, recordTracks, normalizedQuery)
						: 0
			}
		})
		.filter((result): result is LoadTrackRecordResult => result !== null)
		.sort((a, b) => {
			const scoreDifference = b.score - a.score
			if (scoreDifference !== 0) return scoreDifference
			return (
				(orderIndex.get(a.record.id) ?? Number.MAX_SAFE_INTEGER) -
				(orderIndex.get(b.record.id) ?? Number.MAX_SAFE_INTEGER)
			)
		})
}
