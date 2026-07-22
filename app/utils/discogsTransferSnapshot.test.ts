import { describe, expect, it } from 'vitest'
import type { DiscogsTransferSnapshotPayload } from './discogsTransferSnapshot'
import {
	createDiscogsTransferSnapshotPersistence,
	decodeDiscogsTransferSnapshot,
	discogsTransferStorageKey,
	encodeDiscogsTransferSnapshot,
	parseDiscogsTransferSnapshot
} from './discogsTransferSnapshot'

const OWNER_ID = 'account-a'
const OTHER_OWNER_ID = 'account-b'
const SAFE_REQUEST_ID = '00000000-0000-4000-8000-000000000067'

function payload(): DiscogsTransferSnapshotPayload {
	return {
		status: 'completed',
		mode: 'retry',
		results: {
			successful: 2,
			skipped: [{ label: 'Already present' }],
			failed: [
				{
					releaseId: 42,
					label: 'Retry me',
					error: 'Discogs was unavailable.',
					code: 'discogs_unavailable',
					stage: 'fetch',
					retryable: true,
					attempts: 3,
					requestId: SAFE_REQUEST_ID
				}
			]
		},
		retrySummary: { attempted: 1, recovered: 0, remaining: 1 },
		libraryRefreshFailed: true
	}
}

function createStorage() {
	const values = new Map<string, string>()
	return {
		values,
		storage: {
			getItem: (key: string) => values.get(key) ?? null,
			removeItem: (key: string) => {
				values.delete(key)
			},
			setItem: (key: string, value: string) => {
				values.set(key, value)
			}
		}
	}
}

describe('Discogs transfer snapshot codec', () => {
	it('round-trips a terminal snapshot for its explicit owner', () => {
		const serialized = encodeDiscogsTransferSnapshot(OWNER_ID, payload())

		expect(decodeDiscogsTransferSnapshot(serialized, OWNER_ID)).toEqual({
			version: 1,
			userId: OWNER_ID,
			...payload()
		})
	})

	it('rejects a valid snapshot when the explicit owner differs', () => {
		const serialized = encodeDiscogsTransferSnapshot(OWNER_ID, payload())

		expect(decodeDiscogsTransferSnapshot(serialized, OTHER_OWNER_ID)).toBeNull()
	})

	it.each([
		'{',
		'null',
		JSON.stringify({ version: 2 }),
		JSON.stringify({
			version: 1,
			userId: OWNER_ID,
			status: 'running',
			mode: 'import',
			results: { successful: 0, skipped: [], failed: [] },
			retrySummary: null
		})
	])('rejects malformed or non-terminal serialized state', (serialized) => {
		expect(decodeDiscogsTransferSnapshot(serialized, OWNER_ID)).toBeNull()
	})

	it('rejects unsafe failure correlation identifiers', () => {
		const value = JSON.parse(
			encodeDiscogsTransferSnapshot(OWNER_ID, payload())
		) as Record<string, unknown>
		const results = value.results as {
			failed: Array<Record<string, unknown>>
		}
		results.failed[0]!.requestId = 'unsafe-request-id'

		expect(parseDiscogsTransferSnapshot(value, OWNER_ID)).toBeNull()
	})

	it.each([
		{ field: 'successful', value: -1 },
		{ field: 'successful', value: 1.5 },
		{
			field: 'skipped',
			value: Array.from({ length: 10_001 }, () => ({ label: '' }))
		},
		{
			field: 'failed',
			value: Array.from({ length: 501 }, () => payload().results.failed[0])
		}
	])('rejects unsafe $field result values', ({ field, value }) => {
		const snapshot = JSON.parse(
			encodeDiscogsTransferSnapshot(OWNER_ID, payload())
		) as { results: Record<string, unknown> }
		snapshot.results[field] = value

		expect(parseDiscogsTransferSnapshot(snapshot, OWNER_ID)).toBeNull()
	})
})

describe('Discogs transfer snapshot persistence', () => {
	it('keys reads and writes by the explicit owner', () => {
		const { storage, values } = createStorage()
		const persistence = createDiscogsTransferSnapshotPersistence(storage)

		persistence.write(OWNER_ID, payload())

		expect(values.has(discogsTransferStorageKey(OWNER_ID))).toBe(true)
		expect(persistence.read(OWNER_ID)).toEqual({
			kind: 'found',
			snapshot: {
				version: 1,
				userId: OWNER_ID,
				...payload()
			}
		})
		expect(persistence.read(OTHER_OWNER_ID)).toEqual({ kind: 'missing' })
	})

	it('reports invalid state without deleting another owner key', () => {
		const { storage, values } = createStorage()
		const persistence = createDiscogsTransferSnapshotPersistence(storage)
		values.set(discogsTransferStorageKey(OWNER_ID), '{')
		persistence.write(OTHER_OWNER_ID, payload())

		expect(persistence.read(OWNER_ID)).toEqual({ kind: 'invalid' })
		persistence.remove(OWNER_ID)
		expect(values.has(discogsTransferStorageKey(OWNER_ID))).toBe(false)
		expect(values.has(discogsTransferStorageKey(OTHER_OWNER_ID))).toBe(true)
	})
})
