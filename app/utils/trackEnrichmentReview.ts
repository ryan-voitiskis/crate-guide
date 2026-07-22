import {
	createTrackEnrichmentTitleIndex,
	getCandidateShortlist
} from './trackEnrichmentIndex'
import {
	createCandidateMatchMetadata,
	createSourceMatchMetadata
} from './trackEnrichmentNormalization'
import {
	chooseEnrichmentConfidence,
	getEnrichmentBpmSource,
	getEnrichmentKeyModeSource,
	hasEnrichmentValueConflict,
	isValidEnrichmentBpm,
	isValidEnrichmentKeyMode,
	scoreEnrichmentCandidate
} from './trackEnrichmentScoring'
import type {
	BuildEnrichmentRowsOptions,
	CandidateMatchingContext,
	EnrichmentRow,
	EnrichmentSource
} from './trackEnrichmentTypes'

export function canStageEnrichmentRow(row: EnrichmentRow): boolean {
	return (
		!!row.track &&
		!row.applied &&
		!row.stagingBlockedReason &&
		(row.canFillBpm || row.canFillKeyMode)
	)
}

function buildUnmatchedRow(source: EnrichmentSource): EnrichmentRow {
	return {
		id: `source-${source.sourceType}-${source.index}`,
		source,
		track: null,
		record: null,
		confidence: 'manual',
		score: 0,
		reasons: [],
		warnings: [...source.warnings, 'No matching Crate Guide track found'],
		proposedBpm: source.averageBpm,
		proposedKey: source.parsedKey,
		proposedMode: source.parsedMode,
		proposedBpmSource: getEnrichmentBpmSource(source),
		proposedKeyModeSource: getEnrichmentKeyModeSource(source),
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

export function blockCompetingEnrichmentMatches(
	rows: EnrichmentRow[]
): EnrichmentRow[] {
	const rowsByTrackId = new Map<string, EnrichmentRow[]>()

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
					? 'Multiple source rows match this track equally'
					: 'A stronger source row already matches this track'
			row.confidence = 'manual'
			row.hasConflict = true
			row.stagingBlockedReason = reason
			row.defaultStaged = false
			row.warnings = [...row.warnings, reason]
		}
	}

	return rows
}

export function prepareCandidateMatchingContext(
	tracks: BuildEnrichmentRowsOptions['tracks'],
	records: BuildEnrichmentRowsOptions['records']
): CandidateMatchingContext {
	const recordsById = new Map(records.map((record) => [record.id, record]))
	const candidates = tracks.map((track) =>
		createCandidateMatchMetadata(
			track,
			recordsById.get(track.record_id) ?? null
		)
	)
	const titleIndex = createTrackEnrichmentTitleIndex(
		candidates.map((candidate) => ({
			identity: candidate.track.id,
			titles: candidate.titles,
			value: candidate
		}))
	)

	return { titleIndex }
}

export function projectEnrichmentReviewRow(
	source: EnrichmentSource,
	candidateMatchingContext: CandidateMatchingContext
): EnrichmentRow {
	const sourceMetadata = createSourceMatchMetadata(source)
	// The index is a completeness-preserving prefilter; scoring remains the
	// authority for title, artist, album, and duration behavior.
	const candidateMetadata = getCandidateShortlist(
		candidateMatchingContext.titleIndex,
		sourceMetadata.titles
	)
	const candidates = candidateMetadata
		.map((candidate) =>
			scoreEnrichmentCandidate(source, sourceMetadata, candidate)
		)
		.filter((candidate) => candidate !== null)
		.sort((left, right) => right.score - left.score)

	const candidate = candidates[0]
	if (!candidate) return buildUnmatchedRow(source)

	const proposedBpm = source.averageBpm
	const proposedKey = source.parsedKey
	const proposedMode = source.parsedMode
	const canFillBpm =
		candidate.track.bpm === null && isValidEnrichmentBpm(proposedBpm)
	const canFillKeyMode =
		candidate.track.key === null &&
		candidate.track.mode === null &&
		isValidEnrichmentKeyMode(proposedKey, proposedMode)
	const alreadyComplete =
		candidate.track.bpm !== null &&
		candidate.track.key !== null &&
		candidate.track.mode !== null
	const hasConflict = hasEnrichmentValueConflict({
		track: candidate.track,
		proposedBpm,
		proposedKey,
		proposedMode
	})
	const confidence = chooseEnrichmentConfidence(
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
		confidence === 'high' &&
		!hasConflict &&
		!('requiresManualReview' in source && source.requiresManualReview) &&
		(canFillBpm || canFillKeyMode)

	return {
		id: `${source.sourceType}-${source.index}-${candidate.track.id}`,
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
		proposedBpmSource: getEnrichmentBpmSource(source),
		proposedKeyModeSource: getEnrichmentKeyModeSource(source),
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

export function buildEnrichmentRows({
	sources,
	tracks,
	records
}: BuildEnrichmentRowsOptions): EnrichmentRow[] {
	const context = prepareCandidateMatchingContext(tracks, records)
	return blockCompetingEnrichmentMatches(
		sources.map((source) => projectEnrichmentReviewRow(source, context))
	)
}

export async function buildEnrichmentRowsAsync({
	sources,
	tracks,
	records,
	onProgress,
	yieldEvery = 20
}: BuildEnrichmentRowsOptions & {
	onProgress?: (completed: number, total: number) => void
	yieldEvery?: number
}): Promise<EnrichmentRow[]> {
	const context = prepareCandidateMatchingContext(tracks, records)
	const builtRows: EnrichmentRow[] = []
	const batchSize = Math.max(1, yieldEvery)

	for (let index = 0; index < sources.length; index++) {
		const source = sources[index]
		if (!source) continue
		builtRows.push(projectEnrichmentReviewRow(source, context))

		const completed = index + 1
		if (completed % batchSize === 0) {
			onProgress?.(completed, sources.length)
			await new Promise<void>((resolve) => setTimeout(resolve, 0))
		}
	}

	if (sources.length % batchSize !== 0) {
		onProgress?.(sources.length, sources.length)
	}
	return blockCompetingEnrichmentMatches(builtRows)
}
