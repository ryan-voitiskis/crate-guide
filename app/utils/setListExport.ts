import { getFormattedKeyString } from '~/utils/keyFunctions'
import { getSetEntryBpm } from '~/utils/setPlanner'
import type {
	LibraryPlayedTrackEntry,
	LibraryTrack
} from '~~/shared/types/library'
import type { KeyFormat } from '~~/shared/types/supabase'

export type SetListFormat = 'text' | 'markdown' | 'csv'

export interface SetListRow {
	position: number
	artist: string
	title: string
	bpm: number | null
	key: string | null
}

export const SET_LIST_FORMATS: Record<
	SetListFormat,
	{ label: string; extension: string; mimeType: string }
> = {
	text: { label: 'Plain text', extension: 'txt', mimeType: 'text/plain' },
	markdown: {
		label: 'Markdown',
		extension: 'md',
		mimeType: 'text/markdown'
	},
	csv: { label: 'CSV', extension: 'csv', mimeType: 'text/csv' }
}

const UNKNOWN_ARTIST = 'Unknown artist'
const UNKNOWN_TITLE = 'Unknown track'

export function buildSetListRows(
	entries: readonly LibraryPlayedTrackEntry[],
	getTrack: (trackId: string) => LibraryTrack | undefined,
	keyFormat: KeyFormat
): SetListRow[] {
	return entries.map((entry, index) => {
		const track = getTrack(entry.track_id)
		const artist =
			entry.artist_display?.trim() ||
			track?.artists
				.map((artist) => artist.name)
				.join(', ')
				.trim() ||
			UNKNOWN_ARTIST
		const title =
			entry.track_title?.trim() || track?.title.trim() || UNKNOWN_TITLE
		const key =
			track && track.key !== null && track.mode !== null
				? getFormattedKeyString(track.key, track.mode, keyFormat, 'short')
				: null
		return {
			position: index + 1,
			artist,
			title,
			bpm: getSetEntryBpm(entry, track),
			key
		}
	})
}

export function formatSetListBpm(bpm: number | null): string {
	return bpm === null ? '' : bpm.toFixed(1)
}

function describeRow(row: SetListRow): string {
	return [row.bpm === null ? null : `${formatSetListBpm(row.bpm)} BPM`, row.key]
		.filter((part): part is string => part !== null)
		.join(', ')
}

function positionWidth(rows: readonly SetListRow[]): number {
	return Math.max(2, String(rows.length).length)
}

/** One line per track: `01. Artist - Title [124.0 BPM, 8A]`. */
export function formatSetListText(rows: readonly SetListRow[]): string {
	const width = positionWidth(rows)
	return rows
		.map((row) => {
			const details = describeRow(row)
			const position = String(row.position).padStart(width, '0')
			const line = `${position}. ${singleLine(row.artist)} - ${singleLine(row.title)}`
			return details ? `${line} [${details}]` : line
		})
		.join('\n')
}

function singleLine(value: string): string {
	return value.replace(/\s+/g, ' ').trim()
}

/**
 * Escape characters that Markdown treats as inline formatting, so artist and
 * title text renders literally. Every line starts with the list marker, so
 * block-level markers such as `#` or `-` cannot trigger mid-line.
 */
export function escapeMarkdownText(value: string): string {
	return singleLine(value).replace(/[\\`*_[\]<>|~]/g, '\\$&')
}

/** A numbered Markdown list, which renders well in posts and READMEs. */
export function formatSetListMarkdown(rows: readonly SetListRow[]): string {
	return rows
		.map((row) => {
			const details = describeRow(row)
			const line = `${row.position}. ${escapeMarkdownText(row.artist)} – ${escapeMarkdownText(row.title)}`
			return details ? `${line} (${escapeMarkdownText(details)})` : line
		})
		.join('\n')
}

const FORMULA_PREFIX = /^[=+\-@\t\r]/
const NEEDS_QUOTES = /[",\r\n]/

/**
 * RFC 4180 field escaping, plus a leading apostrophe on text that a
 * spreadsheet would otherwise run as a formula (OWASP CSV injection).
 */
export function escapeCsvField(value: string | number | null): string {
	if (value === null) return ''
	if (typeof value === 'number') return String(value)
	const safe = FORMULA_PREFIX.test(value) ? `'${value}` : value
	return NEEDS_QUOTES.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export function formatSetListCsv(rows: readonly SetListRow[]): string {
	const header = ['Position', 'Artist', 'Title', 'BPM', 'Key']
	const lines = [
		header.join(','),
		...rows.map((row) =>
			[
				escapeCsvField(row.position),
				escapeCsvField(row.artist),
				escapeCsvField(row.title),
				escapeCsvField(formatSetListBpm(row.bpm) || null),
				escapeCsvField(row.key)
			].join(',')
		)
	]
	return `${lines.join('\r\n')}\r\n`
}

export function formatSetList(
	rows: readonly SetListRow[],
	format: SetListFormat
): string {
	if (format === 'markdown') return formatSetListMarkdown(rows)
	if (format === 'csv') return formatSetListCsv(rows)
	return formatSetListText(rows)
}

/** A filesystem-safe name such as `friday-warmup-2026-11-25.csv`. */
export function createSetListFilename(
	setName: string | null | undefined,
	format: SetListFormat,
	date: Date
): string {
	const slug =
		(setName ?? '')
			.normalize('NFKD')
			.replace(/[̀-ͯ]/g, '')
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '')
			.slice(0, 60)
			.replace(/-+$/g, '') || 'set'
	const day = [
		date.getFullYear(),
		String(date.getMonth() + 1).padStart(2, '0'),
		String(date.getDate()).padStart(2, '0')
	].join('-')
	return `${slug}-${day}.${SET_LIST_FORMATS[format].extension}`
}
