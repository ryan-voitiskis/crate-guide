import type { Json } from '~~/shared/types/database'
import type {
	TrackBatchIssueCode,
	TrackBatchOperationIdentity,
	TrackBatchUpdate
} from '~~/shared/types/trackUpdates'

export const TRACK_ENRICHMENT_BATCH_SIZE = 100
export const TRACK_ENRICHMENT_RECEIPT_RETENTION_HOURS = 24

type CanonicalJson =
	| null
	| boolean
	| number
	| string
	| CanonicalJson[]
	| { [key: string]: CanonicalJson }

export type TrackEnrichmentBatchWireItem = {
	ordinal: number
	track_id: string
	expected_updated_at: string
	updates: {
		bpm?: number | null
		key?: number | null
		mode?: number | null
		audio_features?: Json | null
	}
	preconditions: {
		bpm_must_be_null: boolean
		key_mode_must_be_null: boolean
	}
	request_hash: string
}

export type TrackEnrichmentBatchRequest = {
	operationId: string
	operationHash: string
	items: TrackEnrichmentBatchWireItem[]
}

export type TrackEnrichmentBatchRequestEntry = {
	ordinal: number
	update: TrackBatchUpdate
}

export type TrackEnrichmentBatchServerResult = {
	status: 'updated' | 'stale' | 'not_found' | 'invalid'
	identity: TrackBatchOperationIdentity
	track: unknown | null
	issueCode: TrackBatchIssueCode | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toCanonicalJson(value: unknown): CanonicalJson {
	if (
		value === null ||
		typeof value === 'boolean' ||
		typeof value === 'string'
	) {
		return value
	}
	if (typeof value === 'number' && Number.isFinite(value)) return value
	if (Array.isArray(value)) return value.map(toCanonicalJson)
	if (!isRecord(value)) {
		throw new Error('Batch request contains a non-JSON value.')
	}

	const canonical: { [key: string]: CanonicalJson } = {}
	for (const key of Object.keys(value).sort()) {
		if (value[key] !== undefined) canonical[key] = toCanonicalJson(value[key])
	}
	return canonical
}

export function canonicalizeTrackEnrichmentRequest(value: unknown): string {
	return JSON.stringify(toCanonicalJson(value))
}

async function sha256Hex(value: string): Promise<string> {
	const digest = await globalThis.crypto.subtle.digest(
		'SHA-256',
		new TextEncoder().encode(value)
	)
	return Array.from(new Uint8Array(digest), (byte) =>
		byte.toString(16).padStart(2, '0')
	).join('')
}

function serializeEnrichmentUpdates(
	updates: TrackBatchUpdate['updates']
): TrackEnrichmentBatchWireItem['updates'] {
	return {
		...(updates.bpm !== undefined ? { bpm: updates.bpm } : {}),
		...(updates.key !== undefined ? { key: updates.key } : {}),
		...(updates.mode !== undefined ? { mode: updates.mode } : {}),
		...(updates.audio_features !== undefined
			? {
					audio_features: updates.audio_features as unknown as Json
				}
			: {})
	}
}

export async function createTrackEnrichmentBatchRequest(
	entries: TrackEnrichmentBatchRequestEntry[],
	createOperationId: () => string = () => globalThis.crypto.randomUUID()
): Promise<TrackEnrichmentBatchRequest> {
	if (entries.length === 0 || entries.length > TRACK_ENRICHMENT_BATCH_SIZE) {
		throw new Error(
			`Track enrichment batches must contain 1-${TRACK_ENRICHMENT_BATCH_SIZE} items.`
		)
	}

	const items: TrackEnrichmentBatchWireItem[] = []
	for (const entry of entries) {
		if (!Number.isSafeInteger(entry.ordinal) || entry.ordinal < 0) {
			throw new Error('Track enrichment batch ordinal is invalid.')
		}
		const { update } = entry
		const item = {
			ordinal: entry.ordinal,
			track_id: update.id,
			expected_updated_at: update.expectedUpdatedAt,
			updates: serializeEnrichmentUpdates(update.updates),
			preconditions: {
				bpm_must_be_null: update.preconditions?.bpmMustBeNull === true,
				key_mode_must_be_null: update.preconditions?.keyModeMustBeNull === true
			}
		}
		items.push({
			...item,
			request_hash: await sha256Hex(canonicalizeTrackEnrichmentRequest(item))
		})
	}

	return {
		operationId: createOperationId(),
		operationHash: await sha256Hex(canonicalizeTrackEnrichmentRequest(items)),
		items
	}
}

function requireString(value: unknown): string {
	if (typeof value !== 'string' || value.length === 0) {
		throw new Error('Batch response contains an invalid string.')
	}
	return value
}

function requireInteger(value: unknown): number {
	if (!Number.isSafeInteger(value) || (value as number) < 0) {
		throw new Error('Batch response contains an invalid ordinal.')
	}
	return value as number
}

const SERVER_ISSUE_CODES = new Set<TrackBatchIssueCode>([
	'duplicate_track_id',
	'invalid_audio_features',
	'invalid_item',
	'not_found',
	'stale_revision',
	'update_rejected'
])

export function decodeTrackEnrichmentBatchResponse(
	value: unknown,
	request: TrackEnrichmentBatchRequest
): TrackEnrichmentBatchServerResult[] {
	if (!isRecord(value) || value.version !== 1) {
		throw new Error('Batch response has an unsupported version.')
	}
	if (
		value.operation_id !== request.operationId ||
		value.operation_hash !== request.operationHash ||
		!Array.isArray(value.results) ||
		value.results.length !== request.items.length
	) {
		throw new Error('Batch response does not match its request.')
	}

	return value.results.map((candidate, index) => {
		if (!isRecord(candidate)) {
			throw new Error('Batch response contains an invalid result.')
		}
		const expected = request.items[index]!
		const ordinal = requireInteger(candidate.ordinal)
		const trackId = requireString(candidate.track_id)
		const requestHash = requireString(candidate.request_hash)
		if (
			ordinal !== expected.ordinal ||
			trackId !== expected.track_id ||
			requestHash !== expected.request_hash
		) {
			throw new Error('Batch response result order or identity is invalid.')
		}

		const status = candidate.status
		if (
			status !== 'updated' &&
			status !== 'stale' &&
			status !== 'not_found' &&
			status !== 'invalid'
		) {
			throw new Error('Batch response contains an invalid status.')
		}
		if (status === 'updated' && !isRecord(candidate.track)) {
			throw new Error('Updated batch response is missing its track.')
		}

		const issueCode = candidate.issue_code
		if (
			status !== 'updated' &&
			(typeof issueCode !== 'string' ||
				!SERVER_ISSUE_CODES.has(issueCode as TrackBatchIssueCode))
		) {
			throw new Error('Batch response contains an invalid issue code.')
		}

		return {
			status,
			identity: {
				operationId: request.operationId,
				ordinal,
				requestHash
			},
			track: status === 'updated' ? candidate.track : null,
			issueCode:
				status === 'updated' ? null : (issueCode as TrackBatchIssueCode)
		}
	})
}
