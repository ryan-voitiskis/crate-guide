import type { LocalAudioTrackSource } from '~/types/localAudio'
import type { AudioFeatureSourceKey } from '~~/shared/types/audioFeatures'
import type { LibraryRecord } from '~~/shared/types/library'
import type { Track } from '~~/shared/types/supabase'
import type { RekordboxXmlTrack } from './rekordboxXml'
import type { TrackEnrichmentTitleIndex } from './trackEnrichmentIndex'

export type EnrichmentConfidence = 'high' | 'medium' | 'manual'
export type EnrichmentSource = RekordboxXmlTrack | LocalAudioTrackSource
export type EnrichmentRecord = Pick<
	LibraryRecord,
	'id' | 'title' | 'artists' | 'labels'
>

export type EnrichmentRow = {
	id: string
	source: EnrichmentSource
	track: Track | null
	record: EnrichmentRecord | null
	confidence: EnrichmentConfidence
	score: number
	reasons: string[]
	warnings: string[]
	proposedBpm: number | null
	proposedKey: number | null
	proposedMode: number | null
	proposedBpmSource: AudioFeatureSourceKey | null
	proposedKeyModeSource: AudioFeatureSourceKey | null
	canFillBpm: boolean
	canFillKeyMode: boolean
	alreadyComplete: boolean
	hasConflict: boolean
	stagingBlockedReason: string | null
	defaultStaged: boolean
	error: string | null
	applied: boolean
}

export type ArtistMatchKind = 'exact' | 'fuzzy' | 'partial' | 'none'

export type ArtistMetadata = {
	fullNames: string[]
	allNames: string[]
}

export type ArtistComparison = {
	kind: ArtistMatchKind
	similarity: number
}

export type SourceMatchMetadata = {
	titles: string[]
	artists: ArtistMetadata
	albumNames: string[]
}

export type CandidateMatchMetadata = {
	track: Track
	record: EnrichmentRecord | null
	titles: string[]
	artists: ArtistMetadata
	albumNames: string[]
}

export type CandidateMatch = {
	track: Track
	record: EnrichmentRecord | null
	score: number
	reasons: string[]
	warnings: string[]
	hasTitleMatch: boolean
	hasArtistMatch: boolean
	hasExactTitleMatch: boolean
	hasExactArtistMatch: boolean
	artistMatchKind: ArtistMatchKind
	hasAlbumMatch: boolean
	hasDurationCorroboration: boolean
	hasDurationConflict: boolean
}

export type CandidateMatchingContext = {
	titleIndex: TrackEnrichmentTitleIndex<CandidateMatchMetadata>
}

export type BuildEnrichmentRowsOptions = {
	sources: EnrichmentSource[]
	tracks: Track[]
	records: EnrichmentRecord[]
}
