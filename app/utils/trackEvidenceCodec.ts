import { type ZodError, z } from 'zod'
import {
	type EmbeddedTagsEvidenceData,
	type EssentiaBrowserEvidenceData,
	type RekordboxXmlEvidenceData,
	TRACK_EVIDENCE_MODEL_VERSION,
	type TrackEvidenceJson,
	type TrackEvidenceLegacyObservation,
	type TrackEvidenceUnknownFields,
	type TrackEvidenceV2,
	type TrackEvidenceV2MigratedV1
} from '../../shared/types/audioFeatures'
import {
	inspectTrackEnrichmentDraftPrivacy,
	sanitizeTrackEnrichmentDraftRelativePath
} from './trackEnrichmentDraftPrivacy'

export const TRACK_EVIDENCE_MAX_SERIALIZED_BYTES = 49_152

export type TrackEvidenceDecodeIssueCode =
	| 'absolute-path'
	| 'cyclic-value'
	| 'forbidden-field'
	| 'invalid-shape'
	| 'mixed-version'
	| 'non-json-value'
	| 'scan-limit'
	| 'too-large'
	| 'unsupported-version'

export type TrackEvidenceDecodeIssue = {
	code: TrackEvidenceDecodeIssueCode
	path: string
}

export type TrackEvidenceDecodeResult =
	| {
			ok: true
			sourceVersion: 1 | 2
			evidence: TrackEvidenceV2
	  }
	| {
			ok: false
			issues: TrackEvidenceDecodeIssue[]
	  }

type UnknownRecord = Record<string, unknown>
type DecodeMode = 'any' | 'v1' | 'v2'

const MAX_DECODE_ISSUES = 100
const MAX_TEXT_LENGTH = 4096
const MAX_MATCH_DETAILS = 128
const MAX_BPM_ESTIMATES = 64
const MAX_GENRES = 128
const CONTROL_CHARACTERS = /\p{Cc}/u

const text = (minimum: number, maximum: number) =>
	z
		.string()
		.min(minimum)
		.max(maximum)
		.refine((value) => !CONTROL_CHARACTERS.test(value))
const boundedText = (maximum = MAX_TEXT_LENGTH) => text(0, maximum)
const nonEmptyText = (maximum = MAX_TEXT_LENGTH) => text(1, maximum)
const nullableText = (maximum = MAX_TEXT_LENGTH) =>
	boundedText(maximum).nullable()
const legacyText = z.string()
const legacyNullableText = legacyText.nullable()
const identifier = nonEmptyText(512)
const versionIdentifier = nonEmptyText(128)
const timestamp = z.string().max(64).datetime({ offset: true })
const legacyTimestamp = legacyText
const finiteNumber = z.number().finite()
const nullableFiniteNumber = finiteNumber.nullable()
const confidence = z.enum(['high', 'medium', 'manual'])
const sourceKey = z.enum(['rekordboxXml', 'embeddedTags', 'essentiaBrowser'])
const legacyFileName = legacyText
const currentFileName = nonEmptyText(255).refine(
	(value) => !value.includes('/') && !value.includes('\\')
)

const relativeLocationHint = nonEmptyText(4096)
	.refine((value) => sanitizeTrackEnrichmentDraftRelativePath(value) === value)
	.nullable()
const legacyRelativeLocationHint = legacyText
	.refine((value) => sanitizeTrackEnrichmentDraftRelativePath(value) === value)
	.nullable()

const jsonValueSchema: z.ZodType<TrackEvidenceJson> = z.lazy(() =>
	z.union([
		z.boolean(),
		z.number().finite(),
		z.string(),
		z.null(),
		z.array(jsonValueSchema),
		z.record(jsonValueSchema)
	])
)
const unknownFieldsSchema = z.record(jsonValueSchema)

const legacyMatchShape = {
	confidence,
	score: finiteNumber,
	reasons: z.array(legacyText),
	warnings: z.array(legacyText)
}
const currentMatchShape = {
	confidence,
	score: finiteNumber.min(0).max(100),
	reasons: z.array(boundedText(512)).max(MAX_MATCH_DETAILS),
	warnings: z.array(boundedText(512)).max(MAX_MATCH_DETAILS)
}

const legacyMatchSchema = z.object(legacyMatchShape).passthrough()
const sourceMatchSchema = z
	.object({ ...currentMatchShape, matcherPolicyVersion: versionIdentifier })
	.strict()

const legacyRekordboxDataShape = {
	fileName: legacyFileName,
	name: legacyNullableText,
	artist: legacyNullableText,
	album: legacyNullableText,
	genre: legacyNullableText,
	locationHint: legacyRelativeLocationHint,
	averageBpm: nullableFiniteNumber,
	tonality: legacyNullableText,
	parsedKey: nullableFiniteNumber,
	parsedMode: nullableFiniteNumber,
	totalTimeSeconds: nullableFiniteNumber,
	year: nullableFiniteNumber,
	kind: legacyNullableText,
	sampleRate: nullableFiniteNumber,
	bitRate: nullableFiniteNumber,
	rating: nullableFiniteNumber,
	playCount: nullableFiniteNumber,
	comments: legacyNullableText,
	remixer: legacyNullableText,
	label: legacyNullableText,
	dateAdded: legacyNullableText
}
const currentRekordboxDataShape = {
	...legacyRekordboxDataShape,
	fileName: currentFileName,
	name: nullableText(),
	artist: nullableText(),
	album: nullableText(),
	genre: nullableText(),
	locationHint: relativeLocationHint,
	tonality: nullableText(),
	kind: nullableText(),
	comments: nullableText(),
	remixer: nullableText(),
	label: nullableText(),
	dateAdded: nullableText()
}

const legacyEmbeddedTagsDataShape = {
	fileName: legacyFileName,
	locationHint: legacyRelativeLocationHint,
	fileSize: finiteNumber,
	lastModified: finiteNumber,
	title: legacyNullableText,
	artist: legacyNullableText,
	album: legacyNullableText,
	genres: z.array(legacyText),
	durationSeconds: nullableFiniteNumber,
	bpm: nullableFiniteNumber,
	key: legacyNullableText
}
const currentEmbeddedTagsDataShape = {
	...legacyEmbeddedTagsDataShape,
	fileName: currentFileName,
	locationHint: relativeLocationHint,
	title: nullableText(),
	artist: nullableText(),
	album: nullableText(),
	genres: z.array(boundedText(512)).max(MAX_GENRES),
	key: nullableText()
}

const legacyEssentiaBrowserDataShape = {
	analyzerVersion: legacyText,
	configurationVersion: legacyText,
	bpm: nullableFiniteNumber,
	bpmConfidence: nullableFiniteNumber,
	bpmEstimates: z.array(finiteNumber),
	key: legacyNullableText,
	scale: legacyNullableText,
	keyStrength: nullableFiniteNumber,
	sampleRate: finiteNumber,
	durationSeconds: finiteNumber,
	analyzedDurationSeconds: finiteNumber,
	analysisOffsetSeconds: finiteNumber,
	warnings: z.array(legacyText)
}
const currentEssentiaBrowserDataShape = {
	...legacyEssentiaBrowserDataShape,
	analyzerVersion: versionIdentifier,
	configurationVersion: versionIdentifier,
	bpmEstimates: z.array(finiteNumber).max(MAX_BPM_ESTIMATES),
	key: nullableText(),
	scale: nullableText(),
	warnings: z.array(boundedText(512)).max(MAX_MATCH_DETAILS)
}

const v1RekordboxSourceSchema = z
	.object({ importedAt: legacyTimestamp, ...legacyRekordboxDataShape })
	.passthrough()
const v1EmbeddedTagsSourceSchema = z
	.object({ importedAt: legacyTimestamp, ...legacyEmbeddedTagsDataShape })
	.passthrough()
const v1EssentiaSourceSchema = z
	.object({ importedAt: legacyTimestamp, ...legacyEssentiaBrowserDataShape })
	.passthrough()

const v1AppliedMarkerSchema = z
	.object({ source: sourceKey, appliedAt: legacyTimestamp })
	.passthrough()
const v1AppliedSchema = z
	.object({
		bpm: v1AppliedMarkerSchema.nullable(),
		keyMode: v1AppliedMarkerSchema.nullable()
	})
	.passthrough()
const v1SourcesSchema = z
	.object({
		rekordboxXml: v1RekordboxSourceSchema.optional(),
		embeddedTags: v1EmbeddedTagsSourceSchema.optional(),
		essentiaBrowser: v1EssentiaSourceSchema.optional()
	})
	.passthrough()
const v1Schema = z
	.object({
		version: z.literal(1),
		updatedAt: legacyTimestamp,
		applied: v1AppliedSchema,
		match: legacyMatchSchema,
		sources: v1SourcesSchema
	})
	.passthrough()

const currentRekordboxEvidenceDataSchema = z
	.object({
		...currentRekordboxDataShape,
		rekordboxTrackId: identifier.nullable()
	})
	.strict()
const currentEmbeddedTagsEvidenceDataSchema = z
	.object(currentEmbeddedTagsDataShape)
	.strict()
const currentEssentiaEvidenceDataSchema = z
	.object(currentEssentiaBrowserDataShape)
	.strict()
const legacyRekordboxEvidenceDataSchema = z
	.object({
		...legacyRekordboxDataShape,
		rekordboxTrackId: z.null()
	})
	.strict()
const legacyEmbeddedTagsEvidenceDataSchema = z
	.object(legacyEmbeddedTagsDataShape)
	.strict()
const legacyEssentiaEvidenceDataSchema = z
	.object(legacyEssentiaBrowserDataShape)
	.strict()

const observationSchema = <T extends z.ZodTypeAny>(data: T) =>
	z
		.object({
			kind: z.literal('observation'),
			observationId: identifier,
			observedAt: timestamp,
			match: sourceMatchSchema,
			data
		})
		.strict()

const legacyObservationSchema = <T extends z.ZodTypeAny>(
	data: T,
	limitations: z.ZodTypeAny
) =>
	z
		.object({
			kind: z.literal('legacy-v1'),
			observationId: z.null(),
			observedAt: legacyTimestamp,
			match: z.null(),
			data,
			limitations,
			unknownFields: unknownFieldsSchema
		})
		.strict()

const commonLegacyLimitations = z.tuple([
	z.literal('missing-observation-id'),
	z.literal('missing-source-match')
])
const rekordboxLegacyLimitations = z.tuple([
	z.literal('missing-observation-id'),
	z.literal('missing-source-match'),
	z.literal('missing-rekordbox-track-id')
])

const currentRekordboxObservationSchema = observationSchema(
	currentRekordboxEvidenceDataSchema
)
const currentEmbeddedTagsObservationSchema = observationSchema(
	currentEmbeddedTagsEvidenceDataSchema
)
const currentEssentiaObservationSchema = observationSchema(
	currentEssentiaEvidenceDataSchema
)
const legacyRekordboxObservationSchema = legacyObservationSchema(
	legacyRekordboxEvidenceDataSchema,
	rekordboxLegacyLimitations
)
const legacyEmbeddedTagsObservationSchema = legacyObservationSchema(
	legacyEmbeddedTagsEvidenceDataSchema,
	commonLegacyLimitations
)
const legacyEssentiaObservationSchema = legacyObservationSchema(
	legacyEssentiaEvidenceDataSchema,
	commonLegacyLimitations
)

const v2SourcesSchema = z
	.object({
		rekordboxXml: z
			.discriminatedUnion('kind', [
				currentRekordboxObservationSchema,
				legacyRekordboxObservationSchema
			])
			.optional(),
		embeddedTags: z
			.discriminatedUnion('kind', [
				currentEmbeddedTagsObservationSchema,
				legacyEmbeddedTagsObservationSchema
			])
			.optional(),
		essentiaBrowser: z
			.discriminatedUnion('kind', [
				currentEssentiaObservationSchema,
				legacyEssentiaObservationSchema
			])
			.optional()
	})
	.strict()
const legacySourcesSchema = z
	.object({
		rekordboxXml: legacyRekordboxObservationSchema.optional(),
		embeddedTags: legacyEmbeddedTagsObservationSchema.optional(),
		essentiaBrowser: legacyEssentiaObservationSchema.optional()
	})
	.strict()

const bpmApplicationSchema = z
	.object({
		source: sourceKey,
		observationId: identifier,
		value: finiteNumber,
		appliedAt: timestamp
	})
	.strict()
const keyModeApplicationSchema = z
	.object({
		source: sourceKey,
		observationId: identifier,
		value: z
			.object({
				key: z.number().int().min(0).max(11),
				mode: z.union([z.literal(0), z.literal(1)])
			})
			.strict(),
		appliedAt: timestamp
	})
	.strict()
const applicationsSchema = z
	.object({
		bpm: bpmApplicationSchema.nullable(),
		keyMode: keyModeApplicationSchema.nullable()
	})
	.strict()

const legacyAppliedMarkerSchema = z
	.object({
		source: sourceKey,
		appliedAt: legacyTimestamp,
		unknownFields: unknownFieldsSchema
	})
	.strict()
const legacySchema = z
	.object({
		sourceVersion: z.literal(1),
		limitations: z.tuple([
			z.literal('unattributed-global-match'),
			z.literal('missing-application-values-and-observation-ids')
		]),
		applied: z
			.object({
				bpm: legacyAppliedMarkerSchema.nullable(),
				keyMode: legacyAppliedMarkerSchema.nullable()
			})
			.strict(),
		globalMatch: z
			.object({ ...legacyMatchShape, unknownFields: unknownFieldsSchema })
			.strict(),
		unknownFields: z
			.object({
				root: unknownFieldsSchema,
				applied: unknownFieldsSchema,
				sources: unknownFieldsSchema
			})
			.strict()
	})
	.strict()

const v2IdentityShape = {
	version: z.literal(2),
	modelVersion: z.literal(TRACK_EVIDENCE_MODEL_VERSION)
}
const v2Schema = z
	.discriminatedUnion('origin', [
		z
			.object({
				...v2IdentityShape,
				updatedAt: timestamp,
				origin: z.literal('v2'),
				applied: applicationsSchema,
				sources: v2SourcesSchema,
				legacy: legacySchema.nullable()
			})
			.strict(),
		z
			.object({
				...v2IdentityShape,
				updatedAt: legacyTimestamp,
				origin: z.literal('v1-migrated'),
				applied: z.object({ bpm: z.null(), keyMode: z.null() }).strict(),
				sources: legacySourcesSchema,
				legacy: legacySchema
			})
			.strict()
	])
	.superRefine((evidence, context) => {
		if (evidence.origin !== 'v2') return

		// Application snapshots may outlive their bounded source slot. Their
		// observation IDs are interpreted as not retained rather than rebound to
		// a newer observation or rejected as malformed.
		const retainsLegacySource = Object.values(evidence.sources).some(
			(source) => source?.kind === 'legacy-v1'
		)
		if (retainsLegacySource && evidence.legacy === null) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['legacy'],
				message:
					'Current v2 Evidence with legacy source slots must retain its v1 envelope'
			})
		}
	})

const ROOT_V1_KEYS = ['version', 'updatedAt', 'applied', 'match', 'sources']
const APPLIED_KEYS = ['bpm', 'keyMode']
const APPLIED_MARKER_KEYS = ['source', 'appliedAt']
const MATCH_KEYS = ['confidence', 'score', 'reasons', 'warnings']
const SOURCE_KEYS = ['rekordboxXml', 'embeddedTags', 'essentiaBrowser']
const REKORDBOX_SOURCE_KEYS = [
	'importedAt',
	...Object.keys(legacyRekordboxDataShape)
]
const EMBEDDED_SOURCE_KEYS = [
	'importedAt',
	...Object.keys(legacyEmbeddedTagsDataShape)
]
const ESSENTIA_SOURCE_KEYS = [
	'importedAt',
	...Object.keys(legacyEssentiaBrowserDataShape)
]

function isRecord(value: unknown): value is UnknownRecord {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOwn(value: UnknownRecord, key: string): boolean {
	return Object.prototype.hasOwnProperty.call(value, key)
}

function pointerPath(path: PropertyKey[]): string {
	return path.length === 0
		? ''
		: `/${path
				.map((segment) =>
					String(segment).replace(/~/g, '~0').replace(/\//g, '~1')
				)
				.join('/')}`
}

function issue(
	code: TrackEvidenceDecodeIssueCode,
	path = ''
): TrackEvidenceDecodeIssue {
	return { code, path }
}

function uniqueIssues(
	issues: TrackEvidenceDecodeIssue[]
): TrackEvidenceDecodeIssue[] {
	const seen = new Set<string>()
	return issues.filter((candidate) => {
		const key = `${candidate.code}\n${candidate.path}`
		if (seen.has(key)) return false
		seen.add(key)
		return true
	})
}

function zodIssues(error: ZodError): TrackEvidenceDecodeIssue[] {
	return uniqueIssues(
		error.issues
			.slice(0, MAX_DECODE_ISSUES)
			.map((candidate) => issue('invalid-shape', pointerPath(candidate.path)))
	)
}

function preflightJson(
	value: unknown
):
	| { ok: true; value: unknown }
	| { ok: false; issues: TrackEvidenceDecodeIssue[] } {
	const privacyIssues = inspectTrackEnrichmentDraftPrivacy(value)
	if (privacyIssues.length > 0) {
		return {
			ok: false,
			issues: privacyIssues.map((candidate) => ({
				code: candidate.code,
				path: candidate.path
			}))
		}
	}

	const serialized = JSON.stringify(value)
	if (serialized === undefined) {
		return { ok: false, issues: [issue('non-json-value')] }
	}
	if (
		new TextEncoder().encode(serialized).byteLength >
		TRACK_EVIDENCE_MAX_SERIALIZED_BYTES
	) {
		return { ok: false, issues: [issue('too-large')] }
	}

	return { ok: true, value: JSON.parse(serialized) as unknown }
}

function containsV2FieldsInV1(value: UnknownRecord): boolean {
	if (['modelVersion', 'origin', 'legacy'].some((key) => hasOwn(value, key))) {
		return true
	}

	const applied = value.applied
	if (isRecord(applied)) {
		for (const field of APPLIED_KEYS) {
			const marker = applied[field]
			if (
				isRecord(marker) &&
				(hasOwn(marker, 'observationId') || hasOwn(marker, 'value'))
			) {
				return true
			}
		}
	}

	const sources = value.sources
	return (
		isRecord(sources) &&
		SOURCE_KEYS.some((source) => {
			const slot = sources[source]
			return (
				isRecord(slot) &&
				['observationId', 'observedAt', 'data'].some((key) => hasOwn(slot, key))
			)
		})
	)
}

function containsV1FieldsInV2(value: UnknownRecord): boolean {
	if (hasOwn(value, 'match')) return true

	const sources = value.sources
	if (
		isRecord(sources) &&
		SOURCE_KEYS.some((source) => {
			const slot = sources[source]
			return isRecord(slot) && hasOwn(slot, 'importedAt')
		})
	) {
		return true
	}

	if (value.origin !== 'v2' || !isRecord(value.applied)) return false
	return APPLIED_KEYS.some((field) => {
		const marker = (value.applied as UnknownRecord)[field]
		return (
			isRecord(marker) &&
			(!hasOwn(marker, 'observationId') || !hasOwn(marker, 'value'))
		)
	})
}

function unknownFields(
	value: UnknownRecord,
	knownKeys: readonly string[]
): TrackEvidenceUnknownFields {
	const known = new Set(knownKeys)
	return Object.fromEntries(
		Object.entries(value).filter(([key]) => !known.has(key))
	) as TrackEvidenceUnknownFields
}

function legacyAppliedMarker(
	value: z.infer<typeof v1AppliedMarkerSchema> | null
) {
	if (value === null) return null
	return {
		source: value.source,
		appliedAt: value.appliedAt,
		unknownFields: unknownFields(value, APPLIED_MARKER_KEYS)
	}
}

function migrateRekordboxObservation(
	value: z.infer<typeof v1RekordboxSourceSchema>
): TrackEvidenceLegacyObservation<RekordboxXmlEvidenceData> {
	return {
		kind: 'legacy-v1',
		observationId: null,
		observedAt: value.importedAt,
		match: null,
		data: {
			fileName: value.fileName,
			name: value.name,
			artist: value.artist,
			album: value.album,
			genre: value.genre,
			locationHint: value.locationHint,
			averageBpm: value.averageBpm,
			tonality: value.tonality,
			parsedKey: value.parsedKey,
			parsedMode: value.parsedMode,
			totalTimeSeconds: value.totalTimeSeconds,
			year: value.year,
			kind: value.kind,
			sampleRate: value.sampleRate,
			bitRate: value.bitRate,
			rating: value.rating,
			playCount: value.playCount,
			comments: value.comments,
			remixer: value.remixer,
			label: value.label,
			dateAdded: value.dateAdded,
			rekordboxTrackId: null
		},
		limitations: [
			'missing-observation-id',
			'missing-source-match',
			'missing-rekordbox-track-id'
		],
		unknownFields: unknownFields(value, REKORDBOX_SOURCE_KEYS)
	}
}

function migrateEmbeddedTagsObservation(
	value: z.infer<typeof v1EmbeddedTagsSourceSchema>
): TrackEvidenceLegacyObservation<EmbeddedTagsEvidenceData> {
	return {
		kind: 'legacy-v1',
		observationId: null,
		observedAt: value.importedAt,
		match: null,
		data: {
			fileName: value.fileName,
			locationHint: value.locationHint,
			fileSize: value.fileSize,
			lastModified: value.lastModified,
			title: value.title,
			artist: value.artist,
			album: value.album,
			genres: value.genres,
			durationSeconds: value.durationSeconds,
			bpm: value.bpm,
			key: value.key
		},
		limitations: ['missing-observation-id', 'missing-source-match'],
		unknownFields: unknownFields(value, EMBEDDED_SOURCE_KEYS)
	}
}

function migrateEssentiaObservation(
	value: z.infer<typeof v1EssentiaSourceSchema>
): TrackEvidenceLegacyObservation<EssentiaBrowserEvidenceData> {
	return {
		kind: 'legacy-v1',
		observationId: null,
		observedAt: value.importedAt,
		match: null,
		data: {
			analyzerVersion: value.analyzerVersion,
			configurationVersion: value.configurationVersion,
			bpm: value.bpm,
			bpmConfidence: value.bpmConfidence,
			bpmEstimates: value.bpmEstimates,
			key: value.key,
			scale: value.scale,
			keyStrength: value.keyStrength,
			sampleRate: value.sampleRate,
			durationSeconds: value.durationSeconds,
			analyzedDurationSeconds: value.analyzedDurationSeconds,
			analysisOffsetSeconds: value.analysisOffsetSeconds,
			warnings: value.warnings
		},
		limitations: ['missing-observation-id', 'missing-source-match'],
		unknownFields: unknownFields(value, ESSENTIA_SOURCE_KEYS)
	}
}

function migrateV1(value: z.infer<typeof v1Schema>): TrackEvidenceV2MigratedV1 {
	return {
		version: 2,
		modelVersion: TRACK_EVIDENCE_MODEL_VERSION,
		origin: 'v1-migrated',
		updatedAt: value.updatedAt,
		applied: { bpm: null, keyMode: null },
		sources: {
			...(value.sources.rekordboxXml
				? {
						rekordboxXml: migrateRekordboxObservation(
							value.sources.rekordboxXml
						)
					}
				: {}),
			...(value.sources.embeddedTags
				? {
						embeddedTags: migrateEmbeddedTagsObservation(
							value.sources.embeddedTags
						)
					}
				: {}),
			...(value.sources.essentiaBrowser
				? {
						essentiaBrowser: migrateEssentiaObservation(
							value.sources.essentiaBrowser
						)
					}
				: {})
		},
		legacy: {
			sourceVersion: 1,
			limitations: [
				'unattributed-global-match',
				'missing-application-values-and-observation-ids'
			],
			applied: {
				bpm: legacyAppliedMarker(value.applied.bpm),
				keyMode: legacyAppliedMarker(value.applied.keyMode)
			},
			globalMatch: {
				confidence: value.match.confidence,
				score: value.match.score,
				reasons: value.match.reasons,
				warnings: value.match.warnings,
				unknownFields: unknownFields(value.match, MATCH_KEYS)
			},
			unknownFields: {
				root: unknownFields(value, ROOT_V1_KEYS),
				applied: unknownFields(value.applied, APPLIED_KEYS),
				sources: unknownFields(value.sources, SOURCE_KEYS)
			}
		}
	}
}

function decode(value: unknown, mode: DecodeMode): TrackEvidenceDecodeResult {
	const preflight = preflightJson(value)
	if (!preflight.ok) return preflight
	if (!isRecord(preflight.value)) {
		return { ok: false, issues: [issue('invalid-shape')] }
	}

	const version = preflight.value.version
	if (version !== 1 && version !== 2) {
		return {
			ok: false,
			issues: [
				issue(
					hasOwn(preflight.value, 'version')
						? 'unsupported-version'
						: 'invalid-shape',
					'/version'
				)
			]
		}
	}
	if ((mode === 'v1' && version !== 1) || (mode === 'v2' && version !== 2)) {
		return {
			ok: false,
			issues: [issue('unsupported-version', '/version')]
		}
	}

	if (
		(version === 1 && containsV2FieldsInV1(preflight.value)) ||
		(version === 2 && containsV1FieldsInV2(preflight.value))
	) {
		return { ok: false, issues: [issue('mixed-version')] }
	}

	if (version === 1) {
		const parsed = v1Schema.safeParse(preflight.value)
		if (!parsed.success) {
			return { ok: false, issues: zodIssues(parsed.error) }
		}
		return { ok: true, sourceVersion: 1, evidence: migrateV1(parsed.data) }
	}

	const parsed = v2Schema.safeParse(preflight.value)
	if (!parsed.success) {
		return { ok: false, issues: zodIssues(parsed.error) }
	}
	return {
		ok: true,
		sourceVersion: 2,
		evidence: parsed.data as TrackEvidenceV2
	}
}

/**
 * Reads either persisted Evidence generation into the bounded v2 read model.
 * This function does not write, upgrade, or activate v2 in live track rows.
 */
export function decodeTrackEvidence(value: unknown): TrackEvidenceDecodeResult {
	return decode(value, 'any')
}

/** Strictly validates an already-v2 value without accepting v1 input. */
export function decodeTrackEvidenceV2(
	value: unknown
): TrackEvidenceDecodeResult {
	return decode(value, 'v2')
}

/** Deterministically maps a valid v1 value into honest legacy-v1 slots. */
export function migrateTrackAudioFeaturesV1(
	value: unknown
): TrackEvidenceDecodeResult {
	return decode(value, 'v1')
}
