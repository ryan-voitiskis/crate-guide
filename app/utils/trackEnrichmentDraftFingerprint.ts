import type {
	LocalAudioTrackSource,
	LocalAudioValueSource
} from '~/types/localAudio'
import {
	TRACK_ENRICHMENT_DRAFT_FINGERPRINT_VERSION,
	TRACK_ENRICHMENT_DRAFT_LOCAL_IDENTITY_VERSION,
	type TrackEnrichmentDraftLocalEvidence,
	type TrackEnrichmentDraftObservation,
	type TrackEnrichmentDraftProposal
} from '~/types/trackEnrichmentDraft'
import { LOCAL_AUDIO_METADATA_VERSION } from './localAudio'
import type { RekordboxXmlTrack } from './rekordboxXml'
import {
	containsUnsafeTrackEnrichmentDraftPath,
	sanitizeTrackEnrichmentDraftRelativePath
} from './trackEnrichmentDraftPrivacy'

const DIGEST_BATCH_SIZE = 250
const MAX_TEXT_LENGTH = 512
const MAX_WARNINGS = 128
const MAX_WARNING_LENGTH = 512
const XML_SOURCE_PREFIX = `${TRACK_ENRICHMENT_DRAFT_FINGERPRINT_VERSION}:rekordboxXml`
const LOCAL_SOURCE_PREFIX = `${TRACK_ENRICHMENT_DRAFT_FINGERPRINT_VERSION}:localAudio`
const OBSERVATION_PREFIX = `${TRACK_ENRICHMENT_DRAFT_FINGERPRINT_VERSION}:observation`
const DATASET_PREFIX = `${TRACK_ENRICHMENT_DRAFT_FINGERPRINT_VERSION}:dataset`

type ObservationWithoutFingerprints = Omit<
	TrackEnrichmentDraftObservation,
	'sourceFingerprint' | 'observationFingerprint'
>

export type TrackEnrichmentDraftObservationSet = {
	datasetFingerprint: string
	observations: TrackEnrichmentDraftObservation[]
}

export class TrackEnrichmentDraftFingerprintError extends Error {
	constructor(
		public readonly code:
			| 'crypto-unavailable'
			| 'duplicate-local-identity'
			| 'invalid-local-identity'
	) {
		super(`Unable to fingerprint enrichment draft sources: ${code}`)
		this.name = 'TrackEnrichmentDraftFingerprintError'
	}
}

function cleanText(value: string | null, maxLength = MAX_TEXT_LENGTH) {
	if (value === null) return null
	const cleaned = value
		.normalize('NFKC')
		.replace(/\p{Cc}/gu, ' ')
		.replace(/\s+/g, ' ')
		.trim()
	const bounded = cleaned.slice(0, maxLength)
	return bounded && !containsUnsafeTrackEnrichmentDraftPath(bounded)
		? bounded
		: null
}

function cleanWarnings(values: readonly string[]): string[] {
	return values
		.map((value) => cleanText(value, MAX_WARNING_LENGTH))
		.filter((value): value is string => value !== null)
		.slice(0, MAX_WARNINGS)
}

function finiteNumber(
	value: number | null,
	minimum: number,
	maximum: number
): number | null {
	return value !== null &&
		Number.isFinite(value) &&
		value >= minimum &&
		value <= maximum
		? value
		: null
}

function validKeyMode(key: number | null, mode: number | null) {
	return (
		key !== null &&
		mode !== null &&
		Number.isInteger(key) &&
		key >= 0 &&
		key <= 11 &&
		(mode === 0 || mode === 1)
	)
}

function buildProposal(input: {
	bpm: number | null
	bpmSource: LocalAudioValueSource | 'rekordboxXml'
	key: number | null
	mode: number | null
	keyModeSource: LocalAudioValueSource | 'rekordboxXml'
}): TrackEnrichmentDraftProposal {
	const bpm = finiteNumber(input.bpm, 1, 999)
	return {
		bpm:
			bpm !== null && input.bpmSource !== null
				? { value: bpm, source: input.bpmSource }
				: null,
		keyMode:
			validKeyMode(input.key, input.mode) && input.keyModeSource !== null
				? {
						key: input.key!,
						mode: input.mode!,
						source: input.keyModeSource
					}
				: null
	}
}

function canonicalize(value: unknown): string {
	if (value === null || typeof value !== 'object') return JSON.stringify(value)
	if (Array.isArray(value)) {
		return `[${value.map((item) => canonicalize(item)).join(',')}]`
	}
	return `{${Object.entries(value as Record<string, unknown>)
		.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
		.map(([key, nested]) => `${JSON.stringify(key)}:${canonicalize(nested)}`)
		.join(',')}}`
}

export async function sha256TrackEnrichmentDraftValue(
	value: string
): Promise<string> {
	const subtle = globalThis.crypto?.subtle
	if (!subtle)
		throw new TrackEnrichmentDraftFingerprintError('crypto-unavailable')
	const digest = await subtle.digest('SHA-256', new TextEncoder().encode(value))
	return Array.from(new Uint8Array(digest), (byte) =>
		byte.toString(16).padStart(2, '0')
	).join('')
}

async function fingerprintObservations(
	observations: ObservationWithoutFingerprints[]
): Promise<string[]> {
	const fingerprints: string[] = []
	for (let start = 0; start < observations.length; start += DIGEST_BATCH_SIZE) {
		const batch = observations.slice(start, start + DIGEST_BATCH_SIZE)
		fingerprints.push(
			...(await Promise.all(
				batch.map(async (observation) => {
					const { ordinal: _ordinal, ...fingerprintedObservation } = observation
					void _ordinal
					return sha256TrackEnrichmentDraftValue(
						`${OBSERVATION_PREFIX}\n${canonicalize(fingerprintedObservation)}`
					)
				})
			))
		)
	}
	return fingerprints
}

function safeXmlSnapshotId(
	track: RekordboxXmlTrack,
	ordinal: number,
	trackIdCounts: ReadonlyMap<string, number>
): string {
	const trackId = cleanText(track.trackId)
	if (trackId && trackIdCounts.get(trackId) === 1) return `track-id:${trackId}`
	return `snapshot-index:${ordinal.toString().padStart(6, '0')}`
}

function toXmlObservation(
	track: RekordboxXmlTrack,
	ordinal: number,
	trackIdCounts: ReadonlyMap<string, number>
): ObservationWithoutFingerprints {
	return {
		sourceSnapshotId: safeXmlSnapshotId(track, ordinal, trackIdCounts),
		ordinal,
		name: cleanText(track.name),
		artist: cleanText(track.artist),
		album: cleanText(track.album),
		genre: cleanText(track.genre),
		locationHint: track.locationHint
			? sanitizeTrackEnrichmentDraftRelativePath(track.locationHint)
			: null,
		totalTimeSeconds: finiteNumber(track.totalTimeSeconds, 0, 604_800),
		proposal: buildProposal({
			bpm: track.averageBpm,
			bpmSource: 'rekordboxXml',
			key: track.parsedKey,
			mode: track.parsedMode,
			keyModeSource: 'rekordboxXml'
		}),
		warnings: cleanWarnings(track.warnings),
		evidence: {
			kind: 'rekordboxXml',
			trackId: cleanText(track.trackId)
		}
	}
}

export async function createRekordboxDraftObservationSet(
	tracks: readonly RekordboxXmlTrack[]
): Promise<TrackEnrichmentDraftObservationSet> {
	const trackIdCounts = new Map<string, number>()
	for (const track of tracks) {
		const trackId = cleanText(track.trackId)
		if (trackId)
			trackIdCounts.set(trackId, (trackIdCounts.get(trackId) ?? 0) + 1)
	}

	const prepared = tracks.map((track, ordinal) =>
		toXmlObservation(track, ordinal, trackIdCounts)
	)
	const observationFingerprints = await fingerprintObservations(prepared)
	const datasetFingerprint = await sha256TrackEnrichmentDraftValue(
		`${DATASET_PREFIX}:rekordboxXml\n${observationFingerprints.join('\n')}`
	)
	return {
		datasetFingerprint,
		observations: prepared.map((observation, index) => ({
			...observation,
			sourceFingerprint: `${XML_SOURCE_PREFIX}:${datasetFingerprint}:${encodeURIComponent(observation.sourceSnapshotId)}`,
			observationFingerprint: observationFingerprints[index]!
		}))
	}
}

function toLocalEvidence(
	source: LocalAudioTrackSource,
	relativePath: string
): TrackEnrichmentDraftLocalEvidence {
	return {
		kind: 'localAudio',
		fileIdentity: {
			version: TRACK_ENRICHMENT_DRAFT_LOCAL_IDENTITY_VERSION,
			relativePath,
			size: source.fileSize,
			lastModified: source.lastModified
		},
		metadataVersion: LOCAL_AUDIO_METADATA_VERSION,
		analyzerVersion: cleanText(source.analysis?.analyzerVersion ?? null),
		configurationVersion: cleanText(
			source.analysis?.configurationVersion ?? null
		),
		bpmConfidence: finiteNumber(source.analysis?.bpmConfidence ?? null, 0, 1),
		keyStrength: finiteNumber(source.analysis?.keyStrength ?? null, 0, 1),
		requiresManualReview: source.requiresManualReview
	}
}

function toLocalObservation(
	source: LocalAudioTrackSource,
	ordinal: number
): ObservationWithoutFingerprints {
	const relativePath = sanitizeTrackEnrichmentDraftRelativePath(
		source.locationHint ?? source.fileName
	)
	if (
		!relativePath ||
		!Number.isSafeInteger(source.fileSize) ||
		source.fileSize < 0 ||
		!Number.isSafeInteger(source.lastModified) ||
		source.lastModified < 0
	) {
		throw new TrackEnrichmentDraftFingerprintError('invalid-local-identity')
	}

	return {
		sourceSnapshotId: `local-file:${relativePath}`,
		ordinal,
		name: cleanText(source.name),
		artist: cleanText(source.artist),
		album: cleanText(source.album),
		genre: cleanText(source.genre),
		locationHint: relativePath,
		totalTimeSeconds: finiteNumber(source.totalTimeSeconds, 0, 604_800),
		proposal: buildProposal({
			bpm: source.averageBpm,
			bpmSource: source.bpmSource,
			key: source.parsedKey,
			mode: source.parsedMode,
			keyModeSource: source.keyModeSource
		}),
		warnings: cleanWarnings(source.warnings),
		evidence: toLocalEvidence(source, relativePath)
	}
}

export async function createLocalAudioDraftObservationSet(
	sources: readonly LocalAudioTrackSource[]
): Promise<TrackEnrichmentDraftObservationSet> {
	const prepared = sources.map(toLocalObservation)
	const identities = prepared.map((observation) =>
		canonicalize(
			(observation.evidence as TrackEnrichmentDraftLocalEvidence).fileIdentity
		)
	)
	if (new Set(identities).size !== identities.length) {
		throw new TrackEnrichmentDraftFingerprintError('duplicate-local-identity')
	}

	const observationFingerprints = await fingerprintObservations(prepared)
	const sourceFingerprints = prepared.map((observation) => {
		const identity = (observation.evidence as TrackEnrichmentDraftLocalEvidence)
			.fileIdentity
		return `${LOCAL_SOURCE_PREFIX}:${identity.size}:${identity.lastModified}:${encodeURIComponent(identity.relativePath)}`
	})
	const datasetFingerprint = await sha256TrackEnrichmentDraftValue(
		`${DATASET_PREFIX}:localAudio\n${[...observationFingerprints]
			.sort()
			.join('\n')}`
	)

	return {
		datasetFingerprint,
		observations: prepared.map((observation, index) => ({
			...observation,
			sourceFingerprint: sourceFingerprints[index]!,
			observationFingerprint: observationFingerprints[index]!
		}))
	}
}
