import { z } from 'zod'
import {
	TRACK_ENRICHMENT_DRAFT_EVIDENCE_PRECONDITION_VERSION,
	TRACK_ENRICHMENT_DRAFT_LOCAL_IDENTITY_VERSION,
	TRACK_ENRICHMENT_DRAFT_LOCAL_SNAPSHOT_VERSION,
	TRACK_ENRICHMENT_DRAFT_MATCHER_POLICY_VERSION,
	TRACK_ENRICHMENT_DRAFT_MAX_DECISIONS,
	TRACK_ENRICHMENT_DRAFT_MAX_OBSERVATIONS,
	TRACK_ENRICHMENT_DRAFT_MAX_OUTCOMES,
	TRACK_ENRICHMENT_DRAFT_MAX_SERIALIZED_BYTES,
	TRACK_ENRICHMENT_DRAFT_MAX_WARNINGS_PER_OBSERVATION,
	TRACK_ENRICHMENT_DRAFT_PREVIOUS_SCHEMA_VERSION,
	TRACK_ENRICHMENT_DRAFT_SCHEMA_VERSION,
	type TrackEnrichmentDraft,
	type TrackEnrichmentDraftSourceKind,
	type TrackEnrichmentDraftVersions
} from '~/types/trackEnrichmentDraft'
import rekordboxXmlParserConfiguration from '../../shared/config/rekordboxXmlParser.json'
import {
	type TrackEnrichmentDraftPrivacyIssue,
	inspectTrackEnrichmentDraftPrivacy,
	sanitizeTrackEnrichmentDraftRelativePath
} from './trackEnrichmentDraftPrivacy'

export { TRACK_ENRICHMENT_DRAFT_MAX_SERIALIZED_BYTES } from '~/types/trackEnrichmentDraft'
const CONTROL_CHARACTERS = /\p{Cc}/u

const boundedText = (maximum: number) =>
	z
		.string()
		.min(1)
		.max(maximum)
		.refine((value) => !CONTROL_CHARACTERS.test(value))
const identifier = boundedText(512)
const versionIdentifier = boundedText(128)
const fingerprint = boundedText(16_384)
const digestFingerprint = z.string().regex(/^[a-f0-9]{64}$/)
const timestamp = z.string().datetime({ offset: true })
const safeInteger = z.number().int().nonnegative().refine(Number.isSafeInteger)
const nullableText = (maximum: number) => boundedText(maximum).nullable()
const audioFeatureSource = z.enum([
	'rekordboxXml',
	'embeddedTags',
	'essentiaBrowser'
])

const proposalSchema = z
	.object({
		bpm: z
			.object({
				value: z.number().finite().min(1).max(999),
				source: audioFeatureSource
			})
			.strict()
			.nullable(),
		keyMode: z
			.object({
				key: z.number().int().min(0).max(11),
				mode: z.union([z.literal(0), z.literal(1)]),
				source: audioFeatureSource
			})
			.strict()
			.nullable()
	})
	.strict()

const relativePath = boundedText(4096).refine(
	(value) => sanitizeTrackEnrichmentDraftRelativePath(value) === value,
	{ message: 'Expected a canonical relative path' }
)
const fileName = boundedText(255).refine(
	(value) => !value.includes('/') && !value.includes('\\'),
	{ message: 'Expected a file name without a path' }
)
const nullableFinite = (minimum: number, maximum: number) =>
	z.number().finite().min(minimum).max(maximum).nullable()
const localValueSource = z.enum(['embeddedTags', 'essentiaBrowser']).nullable()

const xmlSourceEvidenceSchema = z
	.object({
		name: nullableText(512),
		artist: nullableText(512),
		album: nullableText(512),
		genre: nullableText(512),
		kind: nullableText(512),
		totalTimeSeconds: nullableFinite(0, 604_800),
		year: nullableFinite(0, 9_999),
		averageBpm: nullableFinite(1, 999),
		dateAdded: nullableText(512),
		bitRate: nullableFinite(0, 10_000_000),
		sampleRate: nullableFinite(0, 10_000_000),
		comments: nullableText(512),
		playCount: nullableFinite(0, Number.MAX_SAFE_INTEGER),
		rating: nullableFinite(0, Number.MAX_SAFE_INTEGER),
		locationHint: relativePath.nullable(),
		remixer: nullableText(512),
		tonality: nullableText(512),
		parsedKey: nullableFinite(0, 11),
		parsedMode: nullableFinite(0, 1),
		label: nullableText(512)
	})
	.strict()

const localAnalysisEvidenceSchema = z
	.object({
		analyzerVersion: versionIdentifier,
		configurationVersion: versionIdentifier,
		bpm: nullableFinite(1, 999),
		bpmConfidence: nullableFinite(0, 1),
		bpmEstimates: z.array(z.number().finite().min(1).max(999)).max(64),
		key: nullableText(512),
		scale: nullableText(512),
		keyStrength: nullableFinite(0, 1),
		sampleRate: z.number().finite().min(0).max(10_000_000),
		durationSeconds: z.number().finite().min(0).max(604_800),
		analyzedDurationSeconds: z.number().finite().min(0).max(604_800),
		analysisOffsetSeconds: z.number().finite().min(0).max(604_800),
		warnings: z
			.array(boundedText(512))
			.max(TRACK_ENRICHMENT_DRAFT_MAX_WARNINGS_PER_OBSERVATION)
	})
	.strict()

const localSourceEvidenceSchema = z
	.object({
		name: nullableText(512),
		artist: nullableText(512),
		album: nullableText(512),
		genre: nullableText(512),
		locationHint: relativePath,
		totalTimeSeconds: nullableFinite(0, 604_800),
		averageBpm: nullableFinite(1, 999),
		tonality: nullableText(512),
		parsedKey: nullableFinite(0, 11),
		parsedMode: nullableFinite(0, 1),
		fileName,
		fileSize: safeInteger,
		lastModified: safeInteger,
		tags: z
			.object({
				title: nullableText(512),
				artist: nullableText(512),
				album: nullableText(512),
				genres: z.array(boundedText(512)).max(128),
				durationSeconds: nullableFinite(0, 604_800),
				bpm: nullableFinite(1, 999),
				key: nullableText(512)
			})
			.strict(),
		analysis: localAnalysisEvidenceSchema.nullable(),
		bpmSource: localValueSource,
		keyModeSource: localValueSource,
		requiresManualReview: z.boolean()
	})
	.strict()

const xmlEvidenceSchema = z
	.object({
		kind: z.literal('rekordboxXml'),
		trackId: nullableText(512),
		source: xmlSourceEvidenceSchema
	})
	.strict()

const localEvidenceSchema = z
	.object({
		kind: z.literal('localAudio'),
		fileIdentity: z
			.object({
				version: z.literal(TRACK_ENRICHMENT_DRAFT_LOCAL_IDENTITY_VERSION),
				relativePath,
				size: safeInteger,
				lastModified: safeInteger
			})
			.strict(),
		metadataVersion: versionIdentifier,
		analyzerVersion: versionIdentifier.nullable(),
		configurationVersion: versionIdentifier.nullable(),
		bpmConfidence: z.number().finite().min(0).max(1).nullable(),
		keyStrength: z.number().finite().min(0).max(1).nullable(),
		requiresManualReview: z.boolean(),
		source: localSourceEvidenceSchema
	})
	.strict()

const observationSchema = z
	.object({
		sourceSnapshotId: identifier,
		sourceFingerprint: fingerprint,
		observationFingerprint: digestFingerprint,
		ordinal: safeInteger,
		name: nullableText(512),
		artist: nullableText(512),
		album: nullableText(512),
		genre: nullableText(512),
		locationHint: relativePath.nullable(),
		totalTimeSeconds: z.number().finite().min(0).max(604_800).nullable(),
		proposal: proposalSchema,
		warnings: z
			.array(boundedText(512))
			.max(TRACK_ENRICHMENT_DRAFT_MAX_WARNINGS_PER_OBSERVATION),
		evidence: z.discriminatedUnion('kind', [
			xmlEvidenceSchema,
			localEvidenceSchema
		])
	})
	.strict()

const sourceBindingSchema = z
	.object({
		sourceFingerprint: fingerprint,
		observationFingerprint: digestFingerprint
	})
	.strict()

const fillEmptyFieldsDecisionSchema = z
	.object({
		kind: z.literal('fill-empty-fields'),
		intentVersion: z.literal(1),
		sourceBinding: sourceBindingSchema,
		targetBinding: z.object({ trackId: identifier }).strict(),
		proposalBinding: proposalSchema,
		preconditionBinding: z
			.object({
				expectedTargetUpdatedAt: timestamp.nullable(),
				bpmMustBeNull: z.boolean(),
				keyModeMustBeNull: z.boolean()
			})
			.strict(),
		staged: z.boolean(),
		reviewedAt: timestamp
	})
	.strict()

const evidenceOnlyDecisionSchema = z
	.object({
		kind: z.literal('evidence-only'),
		intentVersion: z.literal(1),
		sourceBinding: sourceBindingSchema
			.extend({ sourceSnapshotId: identifier })
			.strict(),
		targetBinding: z.object({ trackId: identifier }).strict(),
		preconditionBinding: z
			.object({
				expectedTargetUpdatedAt: timestamp.nullable(),
				currentEvidenceFingerprint: z
					.object({
						version: z.literal(
							TRACK_ENRICHMENT_DRAFT_EVIDENCE_PRECONDITION_VERSION
						),
						digest: digestFingerprint
					})
					.strict()
			})
			.strict(),
		staged: z.boolean(),
		reviewedAt: timestamp
	})
	.strict()

const unknownDecisionSchema = z
	.object({
		kind: z.literal('unknown'),
		intentVersion: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
		originalKind: boundedText(128),
		sourceBinding: sourceBindingSchema.nullable(),
		staged: z.literal(false),
		reviewedAt: timestamp.nullable()
	})
	.strict()

const legacyPartialOutcomeSchema = z
	.object({
		intentKind: z.literal('fill-empty-fields'),
		sourceFingerprint: fingerprint,
		targetTrackId: identifier,
		status: z.enum(['succeeded', 'failed']),
		applied: z.object({ bpm: z.boolean(), keyMode: z.boolean() }).strict(),
		attemptedAt: timestamp,
		failureCode: z
			.enum([
				'conflict',
				'not-found',
				'offline',
				'permission',
				'transport',
				'unknown'
			])
			.nullable()
	})
	.strict()
	.superRefine((outcome, context) => {
		// This is the exact committed v1 invariant. Applied booleans were not
		// constrained in v1, so migration must handle all four combinations.
		if ((outcome.status === 'failed') !== (outcome.failureCode !== null)) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['failureCode'],
				message: 'Failure code does not match legacy outcome status'
			})
		}
	})

const partialOutcomeSchema = z
	.object({
		intentKind: z.enum(['fill-empty-fields', 'evidence-only']),
		sourceFingerprint: fingerprint,
		targetTrackId: identifier,
		status: z.enum(['succeeded', 'failed', 'unknown']),
		applied: z.object({ bpm: z.boolean(), keyMode: z.boolean() }).strict(),
		attemptedAt: timestamp,
		failureCode: z
			.enum([
				'conflict',
				'not-found',
				'offline',
				'permission',
				'transport',
				'capacity',
				'invalid',
				'workspace-changed',
				'request-unknown',
				'unknown'
			])
			.nullable()
	})
	.strict()

const legacyDraftMigrationSchema = z
	.object({
		schemaVersion: z.literal(TRACK_ENRICHMENT_DRAFT_PREVIOUS_SCHEMA_VERSION),
		partialOutcomes: z
			.array(legacyPartialOutcomeSchema)
			.max(TRACK_ENRICHMENT_DRAFT_MAX_OUTCOMES)
	})
	.passthrough()

const draftSchema = z
	.object({
		schemaVersion: z.literal(TRACK_ENRICHMENT_DRAFT_SCHEMA_VERSION),
		id: identifier,
		workspace: z
			.object({
				workspaceId: identifier,
				repositoryId: identifier,
				repositoryRevision: safeInteger
			})
			.strict(),
		draftRevision: safeInteger,
		createdAt: timestamp,
		updatedAt: timestamp,
		versions: z
			.object({
				matcherPolicyVersion: versionIdentifier,
				parserPolicyVersion: versionIdentifier.nullable(),
				sanitizedSourceSnapshotVersion: versionIdentifier
			})
			.strict(),
		source: z
			.object({
				kind: z.enum(['rekordboxXml', 'localAudio']),
				label: boundedText(255),
				datasetFingerprint: digestFingerprint,
				requiresReconnect: z.boolean()
			})
			.strict(),
		observations: z
			.array(observationSchema)
			.max(TRACK_ENRICHMENT_DRAFT_MAX_OBSERVATIONS),
		decisions: z
			.array(
				z.union([
					fillEmptyFieldsDecisionSchema,
					evidenceOnlyDecisionSchema,
					unknownDecisionSchema
				])
			)
			.max(TRACK_ENRICHMENT_DRAFT_MAX_DECISIONS),
		partialOutcomes: z
			.array(partialOutcomeSchema)
			.max(TRACK_ENRICHMENT_DRAFT_MAX_OUTCOMES),
		ui: z
			.object({
				filter: z.enum([
					'ready',
					'review',
					'evidence',
					'staged',
					'matched',
					'unmatched',
					'done'
				]),
				sortKey: z
					.enum(['library', 'source', 'duration', 'bpm', 'key', 'confidence'])
					.nullable(),
				sortDirection: z.enum(['asc', 'desc']),
				density: z.enum(['compact', 'comfortable']),
				anchorSourceFingerprint: fingerprint.nullable()
			})
			.strict()
	})
	.strict()
	.superRefine((draft, context) => {
		const observationBindings = new Set<string>()
		const observationsByBinding = new Map<
			string,
			TrackEnrichmentDraft['observations'][number]
		>()
		const sourceFingerprints = new Set<string>()
		const snapshotIds = new Set<string>()
		const ordinals = new Set<number>()
		const expectedEvidenceKind = draft.source.kind
		const allowedProposalSources =
			draft.source.kind === 'rekordboxXml'
				? new Set(['rekordboxXml'])
				: new Set(['embeddedTags', 'essentiaBrowser'])

		if (Date.parse(draft.createdAt) > Date.parse(draft.updatedAt)) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['updatedAt'],
				message: 'updatedAt precedes createdAt'
			})
		}
		if (
			draft.source.requiresReconnect !==
			(draft.source.kind === 'localAudio')
		) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['source', 'requiresReconnect'],
				message: 'Reconnect state does not match source kind'
			})
		}
		if (
			(draft.source.kind === 'localAudio') !==
			(draft.versions.parserPolicyVersion === null)
		) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['versions', 'parserPolicyVersion'],
				message: 'Parser policy does not match source kind'
			})
		}

		for (const [index, observation] of draft.observations.entries()) {
			if (observation.evidence.kind !== expectedEvidenceKind) {
				context.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['observations', index, 'evidence', 'kind'],
					message: 'Observation evidence does not match source kind'
				})
			}
			if (ordinals.has(observation.ordinal)) {
				context.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['observations', index, 'ordinal'],
					message: 'Duplicate observation ordinal'
				})
			}
			ordinals.add(observation.ordinal)
			if (
				observation.evidence.kind === 'localAudio' &&
				observation.locationHint !==
					observation.evidence.fileIdentity.relativePath
			) {
				context.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['observations', index, 'locationHint'],
					message: 'Local location hint does not match file identity'
				})
			}
			for (const [value, field] of [
				[observation.sourceFingerprint, 'sourceFingerprint'],
				[observation.sourceSnapshotId, 'sourceSnapshotId']
			] as const) {
				const values =
					field === 'sourceFingerprint' ? sourceFingerprints : snapshotIds
				if (values.has(value)) {
					context.addIssue({
						code: z.ZodIssueCode.custom,
						path: ['observations', index, field],
						message: 'Duplicate observation identity'
					})
				}
				values.add(value)
			}
			const observationBinding = `${observation.sourceFingerprint}\n${observation.observationFingerprint}`
			observationBindings.add(observationBinding)
			observationsByBinding.set(observationBinding, observation)

			for (const proposal of [
				observation.proposal.bpm,
				observation.proposal.keyMode
			]) {
				if (proposal && !allowedProposalSources.has(proposal.source)) {
					context.addIssue({
						code: z.ZodIssueCode.custom,
						path: ['observations', index, 'proposal'],
						message: 'Proposal source does not match draft source kind'
					})
				}
			}
		}

		const knownDecisionSources = new Set<string>()
		const decisionIntentByOutcomeBinding = new Map<string, string>()
		for (const [index, decision] of draft.decisions.entries()) {
			if (decision.kind === 'unknown') continue
			const binding = `${decision.sourceBinding.sourceFingerprint}\n${decision.sourceBinding.observationFingerprint}`
			if (!observationBindings.has(binding)) {
				context.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['decisions', index, 'sourceBinding'],
					message: 'Decision source is not in this draft'
				})
			}
			if (knownDecisionSources.has(decision.sourceBinding.sourceFingerprint)) {
				context.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['decisions', index, 'sourceBinding'],
					message: 'Duplicate decision for source'
				})
			}
			knownDecisionSources.add(decision.sourceBinding.sourceFingerprint)
			decisionIntentByOutcomeBinding.set(
				`${decision.sourceBinding.sourceFingerprint}\n${decision.targetBinding.trackId}`,
				decision.kind
			)
			if (
				decision.kind === 'evidence-only' &&
				decision.sourceBinding.sourceSnapshotId !==
					observationsByBinding.get(binding)?.sourceSnapshotId
			) {
				context.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['decisions', index, 'sourceBinding', 'sourceSnapshotId'],
					message: 'Decision observation identity is not in this draft'
				})
			}
			if (decision.kind === 'fill-empty-fields') {
				for (const proposal of [
					decision.proposalBinding.bpm,
					decision.proposalBinding.keyMode
				]) {
					if (!proposal || allowedProposalSources.has(proposal.source)) continue
					context.addIssue({
						code: z.ZodIssueCode.custom,
						path: ['decisions', index, 'proposalBinding'],
						message: 'Decision proposal source does not match draft source kind'
					})
				}
				if (
					decision.staged &&
					!decision.preconditionBinding.bpmMustBeNull &&
					!decision.preconditionBinding.keyModeMustBeNull
				) {
					context.addIssue({
						code: z.ZodIssueCode.custom,
						path: ['decisions', index, 'staged'],
						message: 'A staged decision must have a blank-field precondition'
					})
				}
			}
		}

		const outcomeBindings = new Set<string>()
		for (const [index, outcome] of draft.partialOutcomes.entries()) {
			if (!sourceFingerprints.has(outcome.sourceFingerprint)) {
				context.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['partialOutcomes', index, 'sourceFingerprint'],
					message: 'Outcome source is not in this draft'
				})
			}
			const binding = `${outcome.sourceFingerprint}\n${outcome.targetTrackId}\n${outcome.intentKind}`
			if (outcomeBindings.has(binding)) {
				context.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['partialOutcomes', index],
					message: 'Duplicate partial outcome'
				})
			}
			outcomeBindings.add(binding)
			const reviewedIntent = decisionIntentByOutcomeBinding.get(
				`${outcome.sourceFingerprint}\n${outcome.targetTrackId}`
			)
			if (
				(reviewedIntent !== undefined &&
					reviewedIntent !== outcome.intentKind) ||
				(outcome.intentKind === 'evidence-only' &&
					reviewedIntent !== 'evidence-only')
			) {
				context.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['partialOutcomes', index, 'intentKind'],
					message: 'Outcome intent does not match its reviewed decision'
				})
			}
			const validFailureCode =
				outcome.status === 'succeeded'
					? outcome.failureCode === null
					: outcome.status === 'unknown'
						? outcome.failureCode === 'request-unknown' ||
							outcome.failureCode === 'unknown'
						: outcome.failureCode !== null &&
							outcome.failureCode !== 'request-unknown' &&
							outcome.failureCode !== 'unknown'
			if (!validFailureCode) {
				context.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['partialOutcomes', index, 'failureCode'],
					message: 'Failure code does not match outcome status'
				})
			}
			const hasConfirmedApplication =
				outcome.applied.bpm || outcome.applied.keyMode
			const validAppliedFields =
				outcome.intentKind === 'evidence-only'
					? !hasConfirmedApplication
					: (outcome.status === 'succeeded') === hasConfirmedApplication
			if (!validAppliedFields) {
				context.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['partialOutcomes', index, 'applied'],
					message: 'Applied fields do not match outcome status'
				})
			}
		}

		if (
			draft.ui.anchorSourceFingerprint !== null &&
			!sourceFingerprints.has(draft.ui.anchorSourceFingerprint)
		) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['ui', 'anchorSourceFingerprint'],
				message: 'UI anchor is not in this draft'
			})
		}
	})

export type TrackEnrichmentDraftCodecIssue = {
	code:
		| TrackEnrichmentDraftPrivacyIssue['code']
		| 'invalid-json'
		| 'invalid-schema'
		| 'too-large'
	path: string
}

export type TrackEnrichmentDraftDecodeResult =
	| { status: 'ok'; draft: TrackEnrichmentDraft }
	| {
			status: 'incompatible'
			schemaVersion: number
			reason: 'future-schema' | 'unsupported-schema'
	  }
	| { status: 'invalid'; issues: TrackEnrichmentDraftCodecIssue[] }

export class TrackEnrichmentDraftCodecError extends Error {
	constructor(public readonly issues: TrackEnrichmentDraftCodecIssue[]) {
		super('Track enrichment draft failed strict validation')
		this.name = 'TrackEnrichmentDraftCodecError'
	}
}

function schemaPath(path: (string | number)[]): string {
	return path
		.map((segment) => String(segment).replace(/~/g, '~0').replace(/\//g, '~1'))
		.map((segment) => `/${segment}`)
		.join('')
}

function normalizeFutureDecision(
	value: unknown,
	recognizeEvidenceOnly: boolean
): unknown {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return value
	const decision = value as Record<string, unknown>
	if (decision.kind === 'unknown') {
		return value
	}
	if (typeof decision.kind !== 'string') return value
	if (
		decision.intentVersion === 1 &&
		(decision.kind === 'fill-empty-fields' ||
			(recognizeEvidenceOnly && decision.kind === 'evidence-only'))
	) {
		return value
	}

	const binding = decision.sourceBinding
	const bindingRecord =
		binding && typeof binding === 'object' && !Array.isArray(binding)
			? (binding as Record<string, unknown>)
			: null
	const sourceFingerprint = bindingRecord?.sourceFingerprint
	const observationFingerprint = bindingRecord?.observationFingerprint
	const sourceBinding =
		typeof sourceFingerprint === 'string' &&
		typeof observationFingerprint === 'string'
			? {
					sourceFingerprint,
					observationFingerprint
				}
			: null

	return {
		kind: 'unknown',
		intentVersion: decision.intentVersion,
		originalKind: decision.kind,
		sourceBinding,
		staged: false,
		reviewedAt:
			typeof decision.reviewedAt === 'string' ? decision.reviewedAt : null
	}
}

function normalizeFutureDecisions(value: unknown): unknown {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return value
	const draft = value as Record<string, unknown>
	if (!Array.isArray(draft.decisions)) return value
	const recognizeEvidenceOnly =
		draft.schemaVersion === TRACK_ENRICHMENT_DRAFT_SCHEMA_VERSION
	return {
		...draft,
		decisions: draft.decisions.map((decision) =>
			normalizeFutureDecision(decision, recognizeEvidenceOnly)
		)
	}
}

function invalidSchemaResult(
	issues: readonly z.ZodIssue[]
): TrackEnrichmentDraftDecodeResult {
	return {
		status: 'invalid',
		issues: issues.slice(0, 100).map((issue) => ({
			code: 'invalid-schema',
			path: schemaPath(issue.path)
		}))
	}
}

/**
 * Migrates only data that the strict v1 outcome schema accepted. The migration
 * never creates observations, decisions, or outcomes. A legacy catch-all
 * failure is conservatively made unknown because v1 could not prove whether a
 * write had committed.
 */
function migrateTrackEnrichmentDraftV1(
	draft: z.infer<typeof legacyDraftMigrationSchema>
): unknown {
	return {
		...draft,
		schemaVersion: TRACK_ENRICHMENT_DRAFT_SCHEMA_VERSION,
		partialOutcomes: draft.partialOutcomes.map((outcome) => {
			const hasApplied = outcome.applied.bpm || outcome.applied.keyMode
			const contradictoryApplication =
				(outcome.status === 'succeeded') !== hasApplied
			if (
				contradictoryApplication ||
				(outcome.status === 'failed' && outcome.failureCode === 'unknown')
			) {
				return {
					...outcome,
					status: 'unknown' as const,
					applied: { bpm: false, keyMode: false },
					failureCode: 'unknown' as const
				}
			}
			return outcome
		})
	}
}

function validateCurrentDraft(
	value: unknown
): TrackEnrichmentDraftDecodeResult {
	const parsed = draftSchema.safeParse(value)
	if (!parsed.success) return invalidSchemaResult(parsed.error.issues)
	return { status: 'ok', draft: parsed.data as TrackEnrichmentDraft }
}

function validateDraft(value: unknown): TrackEnrichmentDraftDecodeResult {
	const originalPrivacyIssues = inspectTrackEnrichmentDraftPrivacy(value)
	if (originalPrivacyIssues.length > 0)
		return { status: 'invalid', issues: originalPrivacyIssues }

	const normalized = normalizeFutureDecisions(value)

	if (value && typeof value === 'object' && !Array.isArray(value)) {
		const schemaVersion = (value as Record<string, unknown>).schemaVersion
		if (schemaVersion === TRACK_ENRICHMENT_DRAFT_PREVIOUS_SCHEMA_VERSION) {
			const legacy = legacyDraftMigrationSchema.safeParse(normalized)
			if (!legacy.success) return invalidSchemaResult(legacy.error.issues)
			const migrated = migrateTrackEnrichmentDraftV1(legacy.data)
			const migratedPrivacyIssues = inspectTrackEnrichmentDraftPrivacy(migrated)
			if (migratedPrivacyIssues.length > 0) {
				return { status: 'invalid', issues: migratedPrivacyIssues }
			}
			return validateCurrentDraft(migrated)
		}
		if (
			typeof schemaVersion === 'number' &&
			Number.isSafeInteger(schemaVersion) &&
			schemaVersion !== TRACK_ENRICHMENT_DRAFT_SCHEMA_VERSION
		) {
			return {
				status: 'incompatible',
				schemaVersion,
				reason:
					schemaVersion > TRACK_ENRICHMENT_DRAFT_SCHEMA_VERSION
						? 'future-schema'
						: 'unsupported-schema'
			}
		}
	}

	return validateCurrentDraft(normalized)
}

export function decodeTrackEnrichmentDraft(
	serialized: string
): TrackEnrichmentDraftDecodeResult {
	if (
		serialized.length > TRACK_ENRICHMENT_DRAFT_MAX_SERIALIZED_BYTES ||
		new TextEncoder().encode(serialized).byteLength >
			TRACK_ENRICHMENT_DRAFT_MAX_SERIALIZED_BYTES
	) {
		return { status: 'invalid', issues: [{ code: 'too-large', path: '' }] }
	}

	let value: unknown
	try {
		value = JSON.parse(serialized)
	} catch {
		return { status: 'invalid', issues: [{ code: 'invalid-json', path: '' }] }
	}
	return validateDraft(value)
}

export function encodeTrackEnrichmentDraft(
	draft: TrackEnrichmentDraft
): string {
	const result = validateDraft(draft)
	if (result.status !== 'ok') {
		const issues =
			result.status === 'invalid'
				? result.issues
				: [{ code: 'invalid-schema' as const, path: '/schemaVersion' }]
		throw new TrackEnrichmentDraftCodecError(issues)
	}
	const serialized = JSON.stringify(result.draft)
	if (
		serialized.length > TRACK_ENRICHMENT_DRAFT_MAX_SERIALIZED_BYTES ||
		new TextEncoder().encode(serialized).byteLength >
			TRACK_ENRICHMENT_DRAFT_MAX_SERIALIZED_BYTES
	) {
		throw new TrackEnrichmentDraftCodecError([{ code: 'too-large', path: '' }])
	}
	return serialized
}

export function getCurrentTrackEnrichmentDraftVersions(
	sourceKind: TrackEnrichmentDraftSourceKind
): TrackEnrichmentDraftVersions {
	return {
		matcherPolicyVersion: TRACK_ENRICHMENT_DRAFT_MATCHER_POLICY_VERSION,
		parserPolicyVersion:
			sourceKind === 'rekordboxXml'
				? rekordboxXmlParserConfiguration.parserPolicyVersion
				: null,
		sanitizedSourceSnapshotVersion:
			sourceKind === 'rekordboxXml'
				? rekordboxXmlParserConfiguration.sanitizedSnapshotVersion
				: TRACK_ENRICHMENT_DRAFT_LOCAL_SNAPSHOT_VERSION
	}
}

export function trackEnrichmentDraftBelongsToWorkspace(
	draft: Pick<TrackEnrichmentDraft, 'workspace'>,
	workspace: { workspaceId: string; repositoryId: string }
): boolean {
	return (
		draft.workspace.workspaceId === workspace.workspaceId &&
		draft.workspace.repositoryId === workspace.repositoryId
	)
}
