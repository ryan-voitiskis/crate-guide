import type {
	RekordboxXmlSource,
	TrackAudioFeatures
} from '~~/shared/types/audioFeatures'
import type { TrackBatchUpdate } from '~~/shared/types/trackUpdates'
import {
	type RekordboxXmlTrack,
	getLocationAlbumHint,
	getLocationFileName,
	normalizeFilenameTitle,
	normalizeForTrackMatch,
	toRekordboxXmlSource
} from './rekordboxXml'
import { isValidBPM } from './track-validation'

export type TrackEnrichmentConfidence = 'high' | 'medium' | 'manual'

export type TrackEnrichmentRow = {
	id: string
	source: RekordboxXmlTrack
	track: Track | null
	record: DatabaseRecord | null
	confidence: TrackEnrichmentConfidence
	score: number
	reasons: string[]
	warnings: string[]
	proposedBpm: number | null
	proposedKey: number | null
	proposedMode: number | null
	canFillBpm: boolean
	canFillKeyMode: boolean
	alreadyComplete: boolean
	hasConflict: boolean
	stagingBlockedReason: string | null
	defaultStaged: boolean
	error: string | null
	applied: boolean
}

export function canStageTrackEnrichmentRow(row: TrackEnrichmentRow): boolean {
	return (
		!!row.track &&
		!row.applied &&
		!row.stagingBlockedReason &&
		(row.canFillBpm || row.canFillKeyMode)
	)
}

type CandidateMatch = {
	track: Track
	record: DatabaseRecord | null
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

type BuildTrackEnrichmentRowsOptions = {
	xmlTracks: RekordboxXmlTrack[]
	tracks: Track[]
	records: DatabaseRecord[]
}

type SourceMatchMetadata = {
	titles: string[]
	artists: ArtistMatchMetadata
	albumNames: string[]
}

type CandidateMatchMetadata = {
	track: Track
	record: DatabaseRecord | null
	titles: string[]
	artists: ArtistMatchMetadata
	albumNames: string[]
}

type StringSetMatch = {
	accepted: boolean
	exact: boolean
	similarity: number
}

type ArtistMatchKind = 'exact' | 'fuzzy' | 'partial' | 'none'

type ArtistMatchMetadata = {
	fullNames: string[]
	allNames: string[]
}

type ArtistMatch = {
	kind: ArtistMatchKind
	similarity: number
}

function isValidProposedBpm(bpm: number | null): bpm is number {
	return bpm !== null && isValidBPM(bpm.toString())
}

function isValidKeyMode(
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

function splitArtistNames(value: string | null | undefined): string[] {
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
	record: DatabaseRecord | null
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

function createArtistMatchMetadata(values: string[]): ArtistMatchMetadata {
	const fullNames = Array.from(
		new Set(
			values.map((value) => normalizeForTrackMatch(value)).filter(Boolean)
		)
	)
	const allNames = Array.from(
		new Set(values.flatMap((value) => splitArtistNames(value)).filter(Boolean))
	)

	return { fullNames, allNames }
}

function createCandidateMatchMetadata(
	track: Track,
	record: DatabaseRecord | null
): CandidateMatchMetadata {
	return {
		track,
		record,
		titles: [normalizeForTrackMatch(track.title)].filter(Boolean),
		artists: createArtistMatchMetadata(getCandidateArtistValues(track, record)),
		albumNames: [normalizeForTrackMatch(record?.title)].filter(Boolean)
	}
}

function createSourceMatchMetadata(
	source: RekordboxXmlTrack
): SourceMatchMetadata {
	return {
		titles: [
			normalizeForTrackMatch(source.name),
			normalizeFilenameTitle(getLocationFileName(source.locationHint))
		].filter(Boolean),
		artists: createArtistMatchMetadata(source.artist ? [source.artist] : []),
		albumNames: [
			normalizeForTrackMatch(source.album),
			getLocationAlbumHint(source.locationHint)
		].filter(Boolean)
	}
}

function levenshteinDistance(left: string, right: string): number {
	if (left === right) return 0
	if (left.length === 0) return right.length
	if (right.length === 0) return left.length

	let previous = Array.from({ length: right.length + 1 }, (_, index) => index)

	for (let leftIndex = 1; leftIndex <= left.length; leftIndex++) {
		const current = [leftIndex]

		for (let rightIndex = 1; rightIndex <= right.length; rightIndex++) {
			const substitutionCost =
				left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1
			current[rightIndex] = Math.min(
				(current[rightIndex - 1] ?? 0) + 1,
				(previous[rightIndex] ?? 0) + 1,
				(previous[rightIndex - 1] ?? 0) + substitutionCost
			)
		}

		previous = current
	}

	return previous[right.length] ?? Math.max(left.length, right.length)
}

function canBeFuzzyMatch(left: string, right: string): boolean {
	const longestLength = Math.max(left.length, right.length)
	const allowedLengthDifference = Math.max(2, Math.ceil(longestLength * 0.2))

	if (Math.abs(left.length - right.length) > allowedLengthDifference)
		return false
	if (longestLength >= 6 && left[0] !== right[0]) return false
	return true
}

function minimumSimilarity(left: string, right: string): number {
	const shortestLength = Math.min(left.length, right.length)
	if (shortestLength <= 4) return 1
	if (shortestLength <= 7) return 0.88
	return 0.84
}

function compareStringSets(left: string[], right: string[]): StringSetMatch {
	let bestSimilarity = 0
	let accepted = false

	for (const leftValue of left) {
		for (const rightValue of right) {
			if (leftValue === rightValue) {
				return { accepted: true, exact: true, similarity: 1 }
			}

			if (!canBeFuzzyMatch(leftValue, rightValue)) continue

			const longestLength = Math.max(leftValue.length, rightValue.length)
			const similarity =
				1 - levenshteinDistance(leftValue, rightValue) / longestLength
			bestSimilarity = Math.max(bestSimilarity, similarity)

			if (similarity >= minimumSimilarity(leftValue, rightValue)) {
				bestSimilarity = similarity
				accepted = true
			}
		}
	}

	return {
		accepted,
		exact: false,
		similarity: bestSimilarity
	}
}

function hasContainedArtistName(left: string[], right: string[]): boolean {
	return left.some((leftValue) =>
		right.some((rightValue) => {
			const [shorter, longer] =
				leftValue.length <= rightValue.length
					? [leftValue, rightValue]
					: [rightValue, leftValue]
			return shorter.length >= 4 && longer.includes(shorter)
		})
	)
}

function compareArtists(
	source: ArtistMatchMetadata,
	candidate: ArtistMatchMetadata
): ArtistMatch {
	if (source.fullNames.length === 0 || candidate.fullNames.length === 0) {
		return { kind: 'none', similarity: 0 }
	}

	const fullMatch = compareStringSets(source.fullNames, candidate.fullNames)
	if (fullMatch.exact) return { kind: 'exact', similarity: 1 }
	if (fullMatch.accepted) {
		return { kind: 'fuzzy', similarity: fullMatch.similarity }
	}

	const componentMatch = compareStringSets(source.allNames, candidate.allNames)
	if (
		componentMatch.accepted ||
		hasContainedArtistName(source.fullNames, candidate.fullNames)
	) {
		return { kind: 'partial', similarity: componentMatch.similarity }
	}

	return { kind: 'none', similarity: 0 }
}

function compareDuration(
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

function scoreCandidate(
	source: RekordboxXmlTrack,
	sourceMetadata: SourceMatchMetadata,
	candidateMetadata: CandidateMatchMetadata
): CandidateMatch | null {
	const reasons: string[] = []
	const warnings: string[] = []
	const { track, record } = candidateMetadata
	const artistMatch = compareArtists(
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

	const titleMatch = compareStringSets(
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

	const albumMatch = compareStringSets(
		sourceMetadata.albumNames,
		candidateMetadata.albumNames
	)
	const hasAlbumMatch = albumMatch.accepted

	if (hasAlbumMatch) {
		score += albumMatch.exact ? 15 : 12
		reasons.push(albumMatch.exact ? 'Album match' : 'Close album match')
	}

	const duration = compareDuration(source.totalTimeSeconds, track.duration)
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

function hasValueConflict(row: {
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

function chooseConfidence(
	candidate: CandidateMatch | null,
	source: RekordboxXmlTrack,
	candidates: CandidateMatch[],
	hasConflict: boolean
): TrackEnrichmentConfidence {
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

	if (candidate.hasTitleMatch && candidate.hasArtistMatch) {
		return 'medium'
	}

	return 'manual'
}

function buildUnmatchedRow(source: RekordboxXmlTrack): TrackEnrichmentRow {
	const warnings = [...source.warnings, 'No matching Crate Guide track found']

	return {
		id: `source-${source.index}`,
		source,
		track: null,
		record: null,
		confidence: 'manual',
		score: 0,
		reasons: [],
		warnings,
		proposedBpm: source.averageBpm,
		proposedKey: source.parsedKey,
		proposedMode: source.parsedMode,
		canFillBpm: false,
		canFillKeyMode: false,
		alreadyComplete: false,
		hasConflict: false,
		stagingBlockedReason: null,
		defaultStaged: false,
		error: null,
		applied: false
	}
}

function blockCompetingTrackMatches(
	rows: TrackEnrichmentRow[]
): TrackEnrichmentRow[] {
	const rowsByTrackId = new Map<string, TrackEnrichmentRow[]>()

	for (const row of rows) {
		if (!row.track) continue
		const competingRows = rowsByTrackId.get(row.track.id) ?? []
		competingRows.push(row)
		rowsByTrackId.set(row.track.id, competingRows)
	}

	for (const competingRows of rowsByTrackId.values()) {
		if (competingRows.length < 2) continue

		const bestScore = Math.max(...competingRows.map((row) => row.score))
		const bestRows = competingRows.filter((row) => row.score === bestScore)

		for (const row of competingRows) {
			const isUniqueBest = bestRows.length === 1 && bestRows[0] === row
			if (isUniqueBest) continue

			const reason =
				bestRows.length > 1 && row.score === bestScore
					? 'Multiple XML rows match this track equally'
					: 'A stronger XML row already matches this track'

			row.confidence = 'manual'
			row.hasConflict = true
			row.stagingBlockedReason = reason
			row.defaultStaged = false
			row.warnings = [...row.warnings, reason]
		}
	}

	return rows
}

function prepareCandidateMetadata(
	tracks: Track[],
	records: DatabaseRecord[]
): CandidateMatchMetadata[] {
	const recordsById = new Map(records.map((record) => [record.id, record]))
	return tracks.map((track) =>
		createCandidateMatchMetadata(
			track,
			recordsById.get(track.record_id) ?? null
		)
	)
}

function buildTrackEnrichmentRow(
	source: RekordboxXmlTrack,
	candidateMetadata: CandidateMatchMetadata[]
): TrackEnrichmentRow {
	const sourceMetadata = createSourceMatchMetadata(source)
	const candidates = candidateMetadata
		.map((candidate) => scoreCandidate(source, sourceMetadata, candidate))
		.filter((candidate) => candidate !== null)
		.sort((a, b) => b.score - a.score)

	const candidate = candidates[0]
	if (!candidate) return buildUnmatchedRow(source)

	const proposedBpm = source.averageBpm
	const proposedKey = source.parsedKey
	const proposedMode = source.parsedMode
	const canFillBpm =
		candidate.track.bpm === null && isValidProposedBpm(proposedBpm)
	const canFillKeyMode =
		candidate.track.key === null &&
		candidate.track.mode === null &&
		isValidKeyMode(proposedKey, proposedMode)
	const alreadyComplete =
		candidate.track.bpm !== null &&
		candidate.track.key !== null &&
		candidate.track.mode !== null
	const hasConflict = hasValueConflict({
		track: candidate.track,
		proposedBpm,
		proposedKey,
		proposedMode
	})
	const confidence = chooseConfidence(
		candidate,
		source,
		candidates,
		hasConflict
	)
	const warnings = [...source.warnings, ...candidate.warnings]
	if (
		candidates.length > 1 &&
		candidate.score - (candidates[1]?.score ?? 0) < 5
	) {
		warnings.push('Multiple Crate Guide tracks have similar match scores')
	}

	if (hasConflict) warnings.push('Proposed value conflicts with existing data')
	if (
		(candidate.track.key === null && candidate.track.mode !== null) ||
		(candidate.track.key !== null && candidate.track.mode === null)
	) {
		warnings.push('Existing key and mode are incomplete')
	}

	const defaultStaged =
		confidence === 'high' && !hasConflict && (canFillBpm || canFillKeyMode)

	return {
		id: `${source.index}-${candidate.track.id}`,
		source,
		track: candidate.track,
		record: candidate.record,
		confidence,
		score: candidate.score,
		reasons: candidate.reasons,
		warnings,
		proposedBpm,
		proposedKey,
		proposedMode,
		canFillBpm,
		canFillKeyMode,
		alreadyComplete,
		hasConflict,
		stagingBlockedReason: null,
		defaultStaged,
		error: null,
		applied: false
	}
}

export function buildTrackEnrichmentRows({
	xmlTracks,
	tracks,
	records
}: BuildTrackEnrichmentRowsOptions): TrackEnrichmentRow[] {
	const candidateMetadata = prepareCandidateMetadata(tracks, records)
	const builtRows = xmlTracks.map((source) =>
		buildTrackEnrichmentRow(source, candidateMetadata)
	)

	return blockCompetingTrackMatches(builtRows)
}

export async function buildTrackEnrichmentRowsAsync({
	xmlTracks,
	tracks,
	records,
	onProgress,
	yieldEvery = 20
}: BuildTrackEnrichmentRowsOptions & {
	onProgress?: (completed: number, total: number) => void
	yieldEvery?: number
}): Promise<TrackEnrichmentRow[]> {
	const candidateMetadata = prepareCandidateMetadata(tracks, records)
	const builtRows: TrackEnrichmentRow[] = []
	const batchSize = Math.max(1, yieldEvery)

	for (let index = 0; index < xmlTracks.length; index++) {
		const source = xmlTracks[index]
		if (!source) continue
		builtRows.push(buildTrackEnrichmentRow(source, candidateMetadata))

		const completed = index + 1
		if (completed % batchSize === 0) {
			onProgress?.(completed, xmlTracks.length)
			await new Promise<void>((resolve) => setTimeout(resolve, 0))
		}
	}

	if (xmlTracks.length % batchSize !== 0) {
		onProgress?.(xmlTracks.length, xmlTracks.length)
	}
	return blockCompetingTrackMatches(builtRows)
}

function createEmptyAudioFeatures(importedAt: string): TrackAudioFeatures {
	return {
		version: 1,
		updatedAt: importedAt,
		applied: {
			bpm: null,
			keyMode: null
		},
		match: {
			confidence: 'manual',
			score: 0,
			reasons: [],
			warnings: []
		},
		sources: {}
	}
}

export function mergeRekordboxAudioFeatures(
	existing: TrackAudioFeatures | null,
	source: RekordboxXmlSource,
	match: {
		confidence: TrackEnrichmentConfidence
		score: number
		reasons: string[]
		warnings: string[]
	},
	applied: {
		bpm: boolean
		keyMode: boolean
	},
	importedAt: string
): TrackAudioFeatures {
	const base =
		existing?.version === 1 ? existing : createEmptyAudioFeatures(importedAt)

	return {
		version: 1,
		updatedAt: importedAt,
		applied: {
			bpm: applied.bpm
				? { source: 'rekordboxXml', appliedAt: importedAt }
				: base.applied.bpm,
			keyMode: applied.keyMode
				? { source: 'rekordboxXml', appliedAt: importedAt }
				: base.applied.keyMode
		},
		match,
		sources: {
			...base.sources,
			rekordboxXml: source
		}
	}
}

export function buildTrackEnrichmentUpdate(
	row: TrackEnrichmentRow,
	fileName: string,
	importedAt: string
): TrackBatchUpdate | null {
	if (!row.track || row.stagingBlockedReason) return null

	const updates: TrackBatchUpdate['updates'] = {}
	const shouldApplyBpm =
		row.track.bpm === null && isValidProposedBpm(row.proposedBpm)
	const shouldApplyKeyMode =
		row.track.key === null &&
		row.track.mode === null &&
		isValidKeyMode(row.proposedKey, row.proposedMode)

	if (shouldApplyBpm) updates.bpm = row.proposedBpm
	if (shouldApplyKeyMode) {
		updates.key = row.proposedKey
		updates.mode = row.proposedMode
	}

	updates.audio_features = mergeRekordboxAudioFeatures(
		row.track.audio_features,
		toRekordboxXmlSource(row.source, fileName, importedAt),
		{
			confidence: row.confidence,
			score: row.score,
			reasons: row.reasons,
			warnings: row.warnings
		},
		{
			bpm: shouldApplyBpm,
			keyMode: shouldApplyKeyMode
		},
		importedAt
	)

	return {
		id: row.track.id,
		updates,
		preconditions: {
			bpmMustBeNull: shouldApplyBpm,
			keyModeMustBeNull: shouldApplyKeyMode
		}
	}
}
