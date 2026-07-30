import type { AudioFeatureSourceKey } from '~~/shared/types/audioFeatures'
import type { Track } from '~~/shared/types/supabase'
import { isValidBPM } from './track-validation'
import { compareArtistMetadata } from './trackEnrichmentArtists'
import { compareEnrichmentStringSets } from './trackEnrichmentSimilarity'
import type {
	CandidateMatch,
	CandidateMatchMetadata,
	EnrichmentConfidence,
	EnrichmentSource,
	SourceMatchMetadata
} from './trackEnrichmentTypes'

export function isValidEnrichmentBpm(bpm: number | null): bpm is number {
	return bpm !== null && isValidBPM(bpm.toString())
}

export function isValidEnrichmentKeyMode(
	key: number | null,
	mode: number | null
): key is number {
	return (
		key !== null &&
		mode !== null &&
		Number.isInteger(key) &&
		Number.isInteger(mode) &&
		key >= 0 &&
		key <= 11 &&
		(mode === 0 || mode === 1)
	)
}

export function compareTrackDuration(
	sourceSeconds: number | null,
	trackMilliseconds: number | null
): {
	status: 'corroborates' | 'neutral' | 'conflicts'
	warning: string | null
} {
	if (sourceSeconds === null || trackMilliseconds === null) {
		return { status: 'neutral', warning: null }
	}

	const differenceSeconds = Math.abs(sourceSeconds - trackMilliseconds / 1000)
	if (differenceSeconds <= 8) {
		return { status: 'corroborates', warning: null }
	}
	if (differenceSeconds <= 30) {
		return {
			status: 'neutral',
			warning: `Duration differs by ${Math.round(differenceSeconds)} seconds`
		}
	}
	return {
		status: 'conflicts',
		warning: `Duration conflict: differs by ${Math.round(differenceSeconds)} seconds`
	}
}

export function scoreEnrichmentCandidate(
	source: EnrichmentSource,
	sourceMetadata: SourceMatchMetadata,
	candidateMetadata: CandidateMatchMetadata
): CandidateMatch | null {
	const reasons: string[] = []
	const warnings: string[] = []
	const { track, record } = candidateMetadata
	const artistMatch = compareArtistMetadata(
		sourceMetadata.artists,
		candidateMetadata.artists
	)
	if (
		sourceMetadata.artists.fullNames.length > 0 &&
		candidateMetadata.artists.fullNames.length > 0 &&
		artistMatch.kind === 'none'
	) {
		return null
	}

	const titleMatch = compareEnrichmentStringSets(
		sourceMetadata.titles,
		candidateMetadata.titles
	)
	if (!titleMatch.accepted) return null

	let score = titleMatch.exact
		? 50
		: Math.round(35 + titleMatch.similarity * 15)
	reasons.push(titleMatch.exact ? 'Title match' : 'Close title match')

	if (artistMatch.kind !== 'none') {
		if (artistMatch.kind === 'exact') score += 30
		else if (artistMatch.kind === 'fuzzy') {
			score += Math.round(20 + artistMatch.similarity * 10)
		} else score += 15

		reasons.push(
			artistMatch.kind === 'exact'
				? 'Artist match'
				: artistMatch.kind === 'fuzzy'
					? 'Close artist match'
					: 'Partial artist match'
		)
	}

	const albumMatch = compareEnrichmentStringSets(
		sourceMetadata.albumNames,
		candidateMetadata.albumNames
	)
	const hasAlbumMatch = albumMatch.accepted
	if (hasAlbumMatch) {
		score += albumMatch.exact ? 15 : 12
		reasons.push(albumMatch.exact ? 'Album match' : 'Close album match')
	}

	const duration = compareTrackDuration(source.totalTimeSeconds, track.duration)
	const hasDurationCorroboration = duration.status === 'corroborates'
	const hasDurationConflict = duration.status === 'conflicts'
	if (duration.status === 'corroborates') {
		score += 10
		reasons.push('Duration corroborates')
	} else if (duration.status === 'neutral') {
		score += 3
	}
	if (duration.warning) warnings.push(duration.warning)

	return {
		track,
		record,
		score,
		reasons,
		warnings,
		hasTitleMatch: titleMatch.accepted,
		hasArtistMatch: artistMatch.kind !== 'none',
		hasExactTitleMatch: titleMatch.exact,
		hasExactArtistMatch: artistMatch.kind === 'exact',
		artistMatchKind: artistMatch.kind,
		hasAlbumMatch,
		hasDurationCorroboration,
		hasDurationConflict
	}
}

export function hasEnrichmentValueConflict(row: {
	track: Track
	proposedBpm: number | null
	proposedKey: number | null
	proposedMode: number | null
}): boolean {
	const bpmConflict =
		row.track.bpm !== null &&
		row.proposedBpm !== null &&
		Math.abs(row.track.bpm - row.proposedBpm) >= 0.1
	const keyConflict =
		row.track.key !== null &&
		row.track.mode !== null &&
		row.proposedKey !== null &&
		row.proposedMode !== null &&
		(row.track.key !== row.proposedKey || row.track.mode !== row.proposedMode)
	const partialKey =
		(row.track.key === null && row.track.mode !== null) ||
		(row.track.key !== null && row.track.mode === null)

	return bpmConflict || keyConflict || partialKey
}

export function chooseEnrichmentConfidence(
	candidate: CandidateMatch | null,
	source: EnrichmentSource,
	candidates: CandidateMatch[],
	hasConflict: boolean
): EnrichmentConfidence {
	if (!candidate) return 'manual'
	if (hasConflict || candidate.hasDurationConflict) return 'manual'
	if (!source.name || !source.artist) return 'manual'
	if (candidate.artistMatchKind === 'partial') return 'manual'
	if (
		source.averageBpm === null &&
		(source.parsedKey === null || source.parsedMode === null)
	) {
		return 'manual'
	}
	if (
		candidates.length > 1 &&
		candidate.score - (candidates[1]?.score ?? 0) < 5
	) {
		return 'manual'
	}
	if (candidate.hasExactTitleMatch && candidate.hasExactArtistMatch) {
		return 'high'
	}
	if (
		candidate.hasTitleMatch &&
		candidate.hasArtistMatch &&
		(candidate.hasAlbumMatch || candidate.hasDurationCorroboration)
	) {
		return 'high'
	}
	if (candidate.hasTitleMatch && candidate.hasArtistMatch) return 'medium'
	return 'manual'
}

export function getEnrichmentBpmSource(
	source: EnrichmentSource
): AudioFeatureSourceKey | null {
	return source.sourceType === 'localAudio'
		? source.bpmSource
		: source.averageBpm === null
			? null
			: 'rekordboxXml'
}

export function getEnrichmentKeyModeSource(
	source: EnrichmentSource
): AudioFeatureSourceKey | null {
	return source.sourceType === 'localAudio'
		? source.keyModeSource
		: source.parsedKey === null || source.parsedMode === null
			? null
			: 'rekordboxXml'
}
