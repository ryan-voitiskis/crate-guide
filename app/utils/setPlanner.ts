import type {
	LibraryPlayedTrackEntry,
	LibraryTrack
} from '~~/shared/types/library'

/** What started a history move; decides where focus lands afterwards. */
export type HistoryMoveSource = 'move-up' | 'move-down' | 'keyboard' | 'drag'

export interface SetEntryEdit {
	entries: LibraryPlayedTrackEntry[]
	/** Number of transition ratings that no longer describe an adjacent pair. */
	clearedRatings: number
}

/**
 * Rebuild a set from a new order of original indices.
 *
 * A transition rating on an entry describes the move from the entry directly
 * before it. The rating survives only if that predecessor is still the same
 * entry (by position in the original list, so a track played twice stays
 * distinct). Any other rating is cleared rather than reattached to a
 * transition the user never rated.
 */
function rebuildFromOrder(
	entries: readonly LibraryPlayedTrackEntry[],
	order: readonly number[]
): SetEntryEdit {
	let clearedRatings = 0
	const rebuilt = order.map((originalIndex, position) => {
		const entry = entries[originalIndex]!
		const predecessorKept =
			position > 0
				? order[position - 1] === originalIndex - 1
				: originalIndex === 0
		if (predecessorKept || entry.transition_rating === null) {
			return { ...entry }
		}
		clearedRatings += 1
		return { ...entry, transition_rating: null }
	})
	return { entries: rebuilt, clearedRatings }
}

function isIndex(entries: readonly unknown[], index: number): boolean {
	return Number.isInteger(index) && index >= 0 && index < entries.length
}

/** Move one entry. Returns null when the move is out of range or a no-op. */
export function moveSetEntry(
	entries: readonly LibraryPlayedTrackEntry[],
	from: number,
	to: number
): SetEntryEdit | null {
	if (!isIndex(entries, from) || !isIndex(entries, to) || from === to) {
		return null
	}
	const order = entries.map((_, index) => index)
	const [moved] = order.splice(from, 1)
	order.splice(to, 0, moved!)
	return rebuildFromOrder(entries, order)
}

/**
 * Remove one entry. The removed entry's own rating is not counted as cleared;
 * the following entry's rating is, because its predecessor changes.
 */
export function removeSetEntry(
	entries: readonly LibraryPlayedTrackEntry[],
	index: number
): SetEntryEdit | null {
	if (!isIndex(entries, index)) return null
	const order = entries
		.map((_, originalIndex) => originalIndex)
		.filter((originalIndex) => originalIndex !== index)
	return rebuildFromOrder(entries, order)
}

/** The BPM shown for an entry: as played, then the track's own BPM. */
export function getSetEntryBpm(
	entry: LibraryPlayedTrackEntry,
	track: LibraryTrack | undefined
): number | null {
	if (entry.adjusted_bpm !== null && Number.isFinite(entry.adjusted_bpm)) {
		return entry.adjusted_bpm
	}
	if (track?.bpm && Number.isFinite(track.bpm)) return track.bpm
	return null
}

export interface SetArcPoint {
	index: number
	bpm: number
	x: number
	y: number
}

export interface SetArc {
	points: SetArcPoint[]
	min: number
	max: number
}

/**
 * Lay out BPM values in a width x height box. Entries without a BPM are
 * skipped but keep their horizontal slot, so the arc stays aligned with the
 * set positions. Returns null when fewer than two values exist.
 */
export function getSetArc(
	values: readonly (number | null)[],
	width: number,
	height: number,
	padding = 2
): SetArc | null {
	const known = values.flatMap((bpm, index) =>
		bpm === null ? [] : [{ index, bpm }]
	)
	if (known.length < 2) return null

	const min = Math.min(...known.map((point) => point.bpm))
	const max = Math.max(...known.map((point) => point.bpm))
	const span = max - min
	const innerWidth = width - padding * 2
	const innerHeight = height - padding * 2
	const step = values.length > 1 ? innerWidth / (values.length - 1) : 0

	return {
		min,
		max,
		points: known.map(({ index, bpm }) => ({
			index,
			bpm,
			x: padding + index * step,
			y:
				span === 0
					? height / 2
					: padding + innerHeight - ((bpm - min) / span) * innerHeight
		}))
	}
}

/** Distinct record ids of the set's tracks, in first-played order. */
export function collectSetRecordIds(
	entries: readonly LibraryPlayedTrackEntry[],
	getTrack: (trackId: string) => LibraryTrack | undefined
): { recordIds: string[]; missingTracks: number } {
	const recordIds: string[] = []
	const seen = new Set<string>()
	let missingTracks = 0
	for (const entry of entries) {
		const track = getTrack(entry.track_id)
		if (!track) {
			missingTracks += 1
			continue
		}
		if (seen.has(track.record_id)) continue
		seen.add(track.record_id)
		recordIds.push(track.record_id)
	}
	return { recordIds, missingTracks }
}
