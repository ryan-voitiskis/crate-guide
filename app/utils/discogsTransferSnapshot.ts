import type {
	DiscogsErrorCode,
	DiscogsImportFailure,
	DiscogsImportResults,
	DiscogsRetrySummary
} from '../../shared/types/discogs'
import { isDiscogsRequestId } from './discogs-errors'

export const DISCOGS_TRANSFER_SNAPSHOT_VERSION = 1
const DISCOGS_TRANSFER_STORAGE_PREFIX = 'crate-guide:discogs-transfer'
const MAX_SNAPSHOT_FAILURES = 500
const SNAPSHOT_ERROR_CODES = new Set<DiscogsErrorCode>([
	'database_write_failed',
	'discogs_connection_required',
	'discogs_not_found',
	'discogs_rate_limited',
	'discogs_request_rejected',
	'discogs_timeout',
	'discogs_transport',
	'discogs_unavailable',
	'internal_error',
	'invalid_request',
	'invalid_upstream_response',
	'unknown_error'
])

export type DiscogsTransferTerminalStatus = 'completed' | 'cancelled' | 'failed'
export type DiscogsTransferMode = 'import' | 'retry'

export interface DiscogsTransferSnapshotPayload {
	status: DiscogsTransferTerminalStatus
	mode: DiscogsTransferMode
	results: DiscogsImportResults
	retrySummary: DiscogsRetrySummary | null
	libraryRefreshFailed?: boolean
}

export interface DiscogsTransferSnapshot extends DiscogsTransferSnapshotPayload {
	version: 1
	userId: string
}

export interface DiscogsTransferSnapshotStorage {
	getItem(key: string): string | null
	removeItem(key: string): void
	setItem(key: string, value: string): void
}

export type DiscogsTransferSnapshotReadResult =
	| { kind: 'missing' }
	| { kind: 'invalid' }
	| { kind: 'found'; snapshot: DiscogsTransferSnapshot }

function isSnapshotFailure(value: unknown): value is DiscogsImportFailure {
	if (!value || typeof value !== 'object') return false
	const failure = value as Record<string, unknown>
	return (
		(failure.releaseId === null ||
			(typeof failure.releaseId === 'number' &&
				Number.isInteger(failure.releaseId) &&
				failure.releaseId > 0)) &&
		typeof failure.label === 'string' &&
		failure.label.length > 0 &&
		failure.label.length <= 300 &&
		typeof failure.error === 'string' &&
		failure.error.length > 0 &&
		failure.error.length <= 300 &&
		typeof failure.code === 'string' &&
		SNAPSHOT_ERROR_CODES.has(failure.code as DiscogsErrorCode) &&
		(failure.stage === 'fetch' ||
			failure.stage === 'save' ||
			failure.stage === 'pipeline') &&
		typeof failure.retryable === 'boolean' &&
		typeof failure.attempts === 'number' &&
		Number.isInteger(failure.attempts) &&
		failure.attempts >= 1 &&
		failure.attempts <= 3 &&
		(failure.requestId === undefined || isDiscogsRequestId(failure.requestId))
	)
}

function isSnapshotResults(value: unknown): value is DiscogsImportResults {
	if (!value || typeof value !== 'object') return false
	const results = value as Record<string, unknown>
	return (
		typeof results.successful === 'number' &&
		Number.isInteger(results.successful) &&
		results.successful >= 0 &&
		Array.isArray(results.skipped) &&
		results.skipped.length <= 10_000 &&
		results.skipped.every(
			(item) =>
				Boolean(item) &&
				typeof item === 'object' &&
				typeof (item as { label?: unknown }).label === 'string' &&
				(item as { label: string }).label.length <= 300
		) &&
		Array.isArray(results.failed) &&
		results.failed.length <= MAX_SNAPSHOT_FAILURES &&
		results.failed.every(isSnapshotFailure)
	)
}

function isRetrySummary(value: unknown): value is DiscogsRetrySummary {
	if (!value || typeof value !== 'object') return false
	const summary = value as Record<string, unknown>
	return ['attempted', 'recovered', 'remaining'].every(
		(key) =>
			typeof summary[key] === 'number' &&
			Number.isInteger(summary[key]) &&
			(summary[key] as number) >= 0
	)
}

export function parseDiscogsTransferSnapshot(
	value: unknown,
	ownerId: string
): DiscogsTransferSnapshot | null {
	if (!value || typeof value !== 'object') return null
	const snapshot = value as Record<string, unknown>
	if (
		snapshot.version !== DISCOGS_TRANSFER_SNAPSHOT_VERSION ||
		snapshot.userId !== ownerId ||
		(snapshot.status !== 'completed' &&
			snapshot.status !== 'cancelled' &&
			snapshot.status !== 'failed') ||
		(snapshot.mode !== 'import' && snapshot.mode !== 'retry') ||
		(snapshot.libraryRefreshFailed !== undefined &&
			typeof snapshot.libraryRefreshFailed !== 'boolean') ||
		!isSnapshotResults(snapshot.results) ||
		(snapshot.retrySummary !== null && !isRetrySummary(snapshot.retrySummary))
	) {
		return null
	}
	return snapshot as unknown as DiscogsTransferSnapshot
}

export function decodeDiscogsTransferSnapshot(
	serialized: string,
	ownerId: string
): DiscogsTransferSnapshot | null {
	try {
		return parseDiscogsTransferSnapshot(JSON.parse(serialized), ownerId)
	} catch {
		return null
	}
}

export function encodeDiscogsTransferSnapshot(
	ownerId: string,
	payload: DiscogsTransferSnapshotPayload
): string {
	return JSON.stringify({
		version: DISCOGS_TRANSFER_SNAPSHOT_VERSION,
		userId: ownerId,
		...payload
	} satisfies DiscogsTransferSnapshot)
}

export function discogsTransferStorageKey(ownerId: string): string {
	return `${DISCOGS_TRANSFER_STORAGE_PREFIX}:${encodeURIComponent(ownerId)}`
}

export function createDiscogsTransferSnapshotPersistence(
	storage: DiscogsTransferSnapshotStorage
) {
	return {
		read(ownerId: string): DiscogsTransferSnapshotReadResult {
			const serialized = storage.getItem(discogsTransferStorageKey(ownerId))
			if (serialized === null) return { kind: 'missing' }
			const snapshot = decodeDiscogsTransferSnapshot(serialized, ownerId)
			return snapshot ? { kind: 'found', snapshot } : { kind: 'invalid' }
		},
		remove(ownerId: string): void {
			storage.removeItem(discogsTransferStorageKey(ownerId))
		},
		write(ownerId: string, payload: DiscogsTransferSnapshotPayload): void {
			storage.setItem(
				discogsTransferStorageKey(ownerId),
				encodeDiscogsTransferSnapshot(ownerId, payload)
			)
		}
	}
}
