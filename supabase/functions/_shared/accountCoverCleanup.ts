import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceRoleSupabaseClient } from './supabaseHelpers.ts'

const RECORD_COVER_BUCKET = 'record-covers'
export const ACCOUNT_COVER_STORAGE_BATCH_LIMIT = 100
export const ACCOUNT_COVER_ENUMERATION_LIMIT =
	ACCOUNT_COVER_STORAGE_BATCH_LIMIT + 1
const MAX_FULL_CLEANUP_PASSES = 3
const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export interface AccountCoverStorageEntry {
	id: string | null
	name: string
}

export interface AccountCoverCleanupClaim {
	userId: string
	claimToken: string
}

export interface AccountCoverCleanupAdapter {
	listFolder(
		path: string,
		offset: number,
		limit: number
	): Promise<AccountCoverStorageEntry[]>
	listClaimedObjects(userId: string): Promise<unknown>
	removeObjects(paths: string[]): Promise<void>
	deleteOrdinaryJobs(userId: string): Promise<void>
	enqueue(userId: string): Promise<AccountCoverCleanupClaim>
	claim(): Promise<AccountCoverCleanupClaim | null>
	complete(claim: AccountCoverCleanupClaim): Promise<boolean>
	release(claim: AccountCoverCleanupClaim): Promise<boolean>
	authUserExists(userId: string): Promise<boolean>
}

export interface AccountCoverCleanupResult {
	processed: boolean
	complete: boolean
	failed: boolean
}

export class AccountCoverCleanupError extends Error {}

interface RpcClaimRow {
	claimed_user_id: unknown
	claim_token: unknown
}

interface RpcObjectRow {
	object_name: unknown
}

interface StorageBatch {
	paths: string[]
	hasMore: boolean
}

function isUuid(value: unknown): value is string {
	return typeof value === 'string' && UUID_PATTERN.test(value)
}

function parseClaimRow(
	value: unknown,
	expectedUserId?: string
): AccountCoverCleanupClaim {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new AccountCoverCleanupError('Cleanup claim response was invalid')
	}
	const { claimed_user_id: userId, claim_token: claimToken } =
		value as RpcClaimRow
	if (
		!isUuid(userId) ||
		!isUuid(claimToken) ||
		(expectedUserId !== undefined && userId !== expectedUserId)
	) {
		throw new AccountCoverCleanupError('Cleanup claim response was invalid')
	}
	return { userId, claimToken }
}

function parseClaimRows(
	value: unknown,
	expectedUserId?: string
): AccountCoverCleanupClaim | null {
	if (!Array.isArray(value) || value.length > 1) {
		throw new AccountCoverCleanupError('Cleanup claim response was invalid')
	}
	return value.length ? parseClaimRow(value[0], expectedUserId) : null
}

function assertSafeStorageSegment(name: unknown): asserts name is string {
	if (
		typeof name !== 'string' ||
		!name.length ||
		name === '.' ||
		name === '..' ||
		name.includes('/') ||
		name.includes('\\') ||
		name.includes('\0')
	) {
		throw new AccountCoverCleanupError('Unsafe Storage path returned')
	}
}

function parseClaimedObjectRows(value: unknown, userId: string): string[] {
	assertSafeUserId(userId)
	if (!Array.isArray(value) || value.length > ACCOUNT_COVER_ENUMERATION_LIMIT) {
		throw new AccountCoverCleanupError('Cleanup object response was invalid')
	}

	const seen = new Set<string>()
	return value.map((row) => {
		if (
			!row ||
			typeof row !== 'object' ||
			Array.isArray(row) ||
			Object.keys(row).length !== 1 ||
			!Object.hasOwn(row, 'object_name')
		) {
			throw new AccountCoverCleanupError('Cleanup object response was invalid')
		}

		const { object_name: objectName } = row as RpcObjectRow
		if (typeof objectName !== 'string' || objectName.includes('\\')) {
			throw new AccountCoverCleanupError('Cleanup object response was invalid')
		}
		const segments = objectName.split('/')
		if (segments.length < 2 || segments[0] !== userId) {
			throw new AccountCoverCleanupError('Cleanup object response was invalid')
		}
		for (const segment of segments) assertSafeStorageSegment(segment)
		if (seen.has(objectName)) {
			throw new AccountCoverCleanupError('Cleanup object response was invalid')
		}
		seen.add(objectName)
		return objectName
	})
}

function assertSafeUserId(userId: string): void {
	if (!isUuid(userId)) {
		throw new AccountCoverCleanupError('Unsafe account identifier')
	}
}

export function createAccountCoverCleanupAdapter(
	supabase: SupabaseClient = createServiceRoleSupabaseClient()
): AccountCoverCleanupAdapter {
	const bucket = supabase.storage.from(RECORD_COVER_BUCKET)

	return {
		async listFolder(path, offset, limit) {
			const { data, error } = await bucket.list(path, {
				limit,
				offset,
				sortBy: { column: 'name', order: 'asc' }
			})
			if (error) {
				throw new AccountCoverCleanupError('Cover listing failed')
			}
			return (data ?? []).map((entry) => ({
				id: entry.id ?? null,
				name: entry.name
			}))
		},
		async listClaimedObjects(userId) {
			const { data, error } = await supabase.rpc(
				'list_record_cover_account_cleanup_objects',
				{ target_user_id: userId }
			)
			if (error) {
				throw new AccountCoverCleanupError('Cleanup object listing failed')
			}
			return data
		},
		async removeObjects(paths) {
			if (!paths.length) return
			const { error } = await bucket.remove(paths)
			if (error) {
				throw new AccountCoverCleanupError('Cover removal failed')
			}
		},
		async deleteOrdinaryJobs(userId) {
			const { error } = await supabase
				.from('record_cover_cleanup_jobs')
				.delete()
				.eq('user_id', userId)
			if (error) {
				throw new AccountCoverCleanupError('Cleanup queue deletion failed')
			}

			const { data, error: checkError } = await supabase
				.from('record_cover_cleanup_jobs')
				.select('id')
				.eq('user_id', userId)
				.limit(1)
			if (checkError || (data?.length ?? 0) > 0) {
				throw new AccountCoverCleanupError(
					'Cleanup queue deletion was ambiguous'
				)
			}
		},
		async enqueue(userId) {
			const { data, error } = await supabase.rpc(
				'enqueue_record_cover_account_cleanup',
				{ target_user_id: userId }
			)
			if (error) {
				throw new AccountCoverCleanupError('Cleanup enqueue failed')
			}
			const claim = parseClaimRows(data, userId)
			if (!claim) {
				throw new AccountCoverCleanupError('Cleanup enqueue was not confirmed')
			}
			return claim
		},
		async claim() {
			const { data, error } = await supabase.rpc(
				'claim_record_cover_account_cleanup'
			)
			if (error) {
				throw new AccountCoverCleanupError('Cleanup claim failed')
			}
			return parseClaimRows(data)
		},
		async complete(claim) {
			const { data, error } = await supabase.rpc(
				'complete_record_cover_account_cleanup',
				{
					target_user_id: claim.userId,
					expected_claim_token: claim.claimToken
				}
			)
			if (error || typeof data !== 'boolean') {
				throw new AccountCoverCleanupError('Cleanup completion failed')
			}
			return data
		},
		async release(claim) {
			const { data, error } = await supabase.rpc(
				'release_record_cover_account_cleanup',
				{
					target_user_id: claim.userId,
					expected_claim_token: claim.claimToken
				}
			)
			if (error || typeof data !== 'boolean') {
				throw new AccountCoverCleanupError('Cleanup release failed')
			}
			return data
		},
		async authUserExists(userId) {
			const { data, error } = await supabase.auth.admin.getUserById(userId)
			if (!error) return Boolean(data.user)

			const authError = error as { code?: string; status?: number }
			if (authError.status === 404 || authError.code === 'user_not_found') {
				return false
			}
			throw new AccountCoverCleanupError('Auth user check failed')
		}
	}
}

async function listStorageBatch(
	adapter: Pick<AccountCoverCleanupAdapter, 'listFolder'>,
	userId: string,
	maximumPaths: number,
	maximumListCalls: number
): Promise<StorageBatch> {
	assertSafeUserId(userId)
	const pending = [{ path: userId, offset: 0 }]
	const seenFolders = new Set([userId])
	const seenObjects = new Set<string>()
	const paths: string[] = []
	let listCalls = 0

	while (pending.length && paths.length < maximumPaths) {
		if (listCalls >= maximumListCalls) {
			return { paths, hasMore: true }
		}
		const current = pending.shift()!
		const entries = await adapter.listFolder(
			current.path,
			current.offset,
			ACCOUNT_COVER_STORAGE_BATCH_LIMIT
		)
		listCalls += 1
		if (
			!Array.isArray(entries) ||
			entries.length > ACCOUNT_COVER_STORAGE_BATCH_LIMIT
		) {
			throw new AccountCoverCleanupError('Storage listing exceeded its bound')
		}

		for (const entry of entries) {
			if (!entry || typeof entry !== 'object') {
				throw new AccountCoverCleanupError('Invalid Storage entry returned')
			}
			assertSafeStorageSegment(entry.name)
			const path = `${current.path}/${entry.name}`
			if (entry.id === null) {
				if (!seenFolders.has(path)) {
					seenFolders.add(path)
					pending.push({ path, offset: 0 })
				}
			} else if (typeof entry.id === 'string' && entry.id.length) {
				if (!seenObjects.has(path)) {
					seenObjects.add(path)
					paths.push(path)
				}
			} else {
				throw new AccountCoverCleanupError('Invalid Storage entry returned')
			}
			if (paths.length >= maximumPaths) break
		}

		if (entries.length === ACCOUNT_COVER_STORAGE_BATCH_LIMIT) {
			pending.push({
				path: current.path,
				offset: current.offset + ACCOUNT_COVER_STORAGE_BATCH_LIMIT
			})
		}
	}

	return {
		paths,
		hasMore: pending.length > 0
	}
}

export async function removeAllAccountCoverObjects(
	adapter: Pick<AccountCoverCleanupAdapter, 'listFolder' | 'removeObjects'>,
	userId: string
): Promise<void> {
	for (let pass = 0; pass < MAX_FULL_CLEANUP_PASSES; pass += 1) {
		const { paths } = await listStorageBatch(
			adapter,
			userId,
			Number.MAX_SAFE_INTEGER,
			Number.MAX_SAFE_INTEGER
		)
		if (!paths.length) return

		for (
			let index = 0;
			index < paths.length;
			index += ACCOUNT_COVER_STORAGE_BATCH_LIMIT
		) {
			await adapter.removeObjects(
				paths.slice(index, index + ACCOUNT_COVER_STORAGE_BATCH_LIMIT)
			)
		}
	}

	const remaining = await listStorageBatch(
		adapter,
		userId,
		1,
		Number.MAX_SAFE_INTEGER
	)
	if (remaining.paths.length || remaining.hasMore) {
		throw new AccountCoverCleanupError('Cover cleanup did not settle')
	}
}

async function releaseClaimBestEffort(
	adapter: Pick<AccountCoverCleanupAdapter, 'release'>,
	claim: AccountCoverCleanupClaim
): Promise<boolean> {
	try {
		return await adapter.release(claim)
	} catch {
		return false
	}
}

export async function processOneAccountCoverCleanup(
	adapter: AccountCoverCleanupAdapter = createAccountCoverCleanupAdapter()
): Promise<AccountCoverCleanupResult> {
	let claim: AccountCoverCleanupClaim | null
	try {
		claim = await adapter.claim()
	} catch {
		return { processed: false, complete: false, failed: true }
	}
	if (!claim) return { processed: false, complete: false, failed: false }

	try {
		if (await adapter.authUserExists(claim.userId)) {
			if (!(await adapter.release(claim))) {
				throw new AccountCoverCleanupError('Cleanup release was not confirmed')
			}
			return { processed: true, complete: false, failed: false }
		}

		const listedPaths = parseClaimedObjectRows(
			await adapter.listClaimedObjects(claim.userId),
			claim.userId
		)
		const removalPaths = listedPaths.slice(0, ACCOUNT_COVER_STORAGE_BATCH_LIMIT)
		if (removalPaths.length) await adapter.removeObjects(removalPaths)

		if (listedPaths.length === ACCOUNT_COVER_ENUMERATION_LIMIT) {
			if (!(await adapter.release(claim))) {
				throw new AccountCoverCleanupError('Cleanup release was not confirmed')
			}
			return { processed: true, complete: false, failed: false }
		}

		const remainingPaths = parseClaimedObjectRows(
			await adapter.listClaimedObjects(claim.userId),
			claim.userId
		)
		if (remainingPaths.length) {
			if (!(await adapter.release(claim))) {
				throw new AccountCoverCleanupError('Cleanup release was not confirmed')
			}
			return { processed: true, complete: false, failed: false }
		}

		await adapter.deleteOrdinaryJobs(claim.userId)
		if (!(await adapter.complete(claim))) {
			throw new AccountCoverCleanupError('Cleanup completion was not confirmed')
		}
		return { processed: true, complete: true, failed: false }
	} catch {
		await releaseClaimBestEffort(adapter, claim)
		return { processed: true, complete: false, failed: true }
	}
}
