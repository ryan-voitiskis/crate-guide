import type { Track } from '~~/shared/types/supabase'
import {
	getLocationAlbumHint,
	getLocationFileName,
	normalizeFilenameTitle,
	normalizeForTrackMatch
} from './rekordboxXml'
import type {
	ArtistMetadata,
	CandidateMatchMetadata,
	EnrichmentRecord,
	EnrichmentSource,
	SourceMatchMetadata
} from './trackEnrichmentTypes'

export function splitEnrichmentArtistNames(
	value: string | null | undefined
): string[] {
	const normalized = normalizeForTrackMatch(value)
	if (!normalized) return []

	const parts = normalized
		.replace(/\b(feat|featuring|ft|with)\b/g, ',')
		.split(/\s*(?:,|\/|;|\+|&|\band\b)\s*/g)
		.map((part) => part.trim())
		.map((part) => part.replace(/\s+\d+$/, '').trim())
		.filter(Boolean)

	return Array.from(new Set([normalized, ...parts]))
}

function getCandidateArtistValues(
	track: Track,
	record: EnrichmentRecord | null
): string[] {
	const trackArtistNames = track.artists
		.map((artist) => artist.name)
		.filter(Boolean)
	const names =
		trackArtistNames.length > 0
			? trackArtistNames
			: (record?.artists.map((artist) => artist.name) ?? [])

	return Array.from(new Set(names.filter(Boolean)))
}

export function createArtistMetadata(values: string[]): ArtistMetadata {
	const fullNames = Array.from(
		new Set(
			values.map((value) => normalizeForTrackMatch(value)).filter(Boolean)
		)
	)
	const allNames = Array.from(
		new Set(
			values
				.flatMap((value) => splitEnrichmentArtistNames(value))
				.filter(Boolean)
		)
	)

	return { fullNames, allNames }
}

export function createCandidateMatchMetadata(
	track: Track,
	record: EnrichmentRecord | null
): CandidateMatchMetadata {
	return {
		track,
		record,
		titles: [normalizeForTrackMatch(track.title)].filter(Boolean),
		artists: createArtistMetadata(getCandidateArtistValues(track, record)),
		albumNames: [normalizeForTrackMatch(record?.title)].filter(Boolean)
	}
}

export function createSourceMatchMetadata(
	source: EnrichmentSource
): SourceMatchMetadata {
	return {
		titles: [
			normalizeForTrackMatch(source.name),
			normalizeFilenameTitle(getLocationFileName(source.locationHint))
		].filter(Boolean),
		artists: createArtistMetadata(source.artist ? [source.artist] : []),
		albumNames: [
			normalizeForTrackMatch(source.album),
			getLocationAlbumHint(source.locationHint)
		].filter(Boolean)
	}
}
