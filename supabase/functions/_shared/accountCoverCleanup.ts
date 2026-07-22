import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceRoleSupabaseClient } from './supabaseHelpers.ts'

const RECORD_COVER_BUCKET = 'record-covers'
export const ACCOUNT_COVER_STORAGE_BATCH_LIMIT = 100
export const ACCOUNT_COVER_ENUMERATION_LIMIT =
	ACCOUNT_COVER_STORAGE_BATCH_LIMIT + 1
export const DISCOGS_RATE_LIMIT_PRUNE_LIMIT = 100
const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export interface AccountCoverCleanupClaim {
	userId: string
	claimToken: string
}

export interface AccountCoverCleanupRepository {
	listClaimedObjects(userId: string): Promise<unknown>
	removeObjects(paths: string[]): Promise<void>
	deleteOrdinaryJobs(userId: string): Promise<void>
	schedule(userId: string): Promise<void>
	claim(): Promise<AccountCoverCleanupClaim | null>
	complete(claim: AccountCoverCleanupClaim): Promise<boolean>
	release(claim: AccountCoverCleanupClaim): Promise<boolean>
	authUserExists(userId: string): Promise<boolean>
	deleteUserRateLimit(userId: string): Promise<void>
	pruneExpiredUserRateLimits(limit: number): Promise<void>
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

export function createAccountCoverCleanupRepository(
	supabase: SupabaseClient = createServiceRoleSupabaseClient()
): AccountCoverCleanupRepository {
	const bucket = supabase.storage.from(RECORD_COVER_BUCKET)

	return {
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
		async schedule(userId) {
			const { data, error } = await supabase.rpc(
				'schedule_record_cover_account_cleanup',
				{ target_user_id: userId }
			)
			if (error || data !== true) {
				throw new AccountCoverCleanupError('Cleanup enqueue failed')
			}
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
		},
		async deleteUserRateLimit(userId) {
			const { data, error } = await supabase.rpc(
				'delete_discogs_user_rate_limit',
				{ target_user_id: userId }
			)
			if (error || typeof data !== 'boolean') {
				throw new AccountCoverCleanupError('Rate-limit deletion failed')
			}
		},
		async pruneExpiredUserRateLimits(limit) {
			const { data, error } = await supabase.rpc(
				'prune_expired_discogs_user_rate_limits',
				{ maximum_rows: limit }
			)
			if (
				error ||
				typeof data !== 'number' ||
				!Number.isInteger(data) ||
				data < 0 ||
				data > limit
			) {
				throw new AccountCoverCleanupError('Rate-limit pruning failed')
			}
		}
	}
}

async function releaseClaimBestEffort(
	repository: Pick<AccountCoverCleanupRepository, 'release'>,
	claim: AccountCoverCleanupClaim
): Promise<boolean> {
	try {
		return await repository.release(claim)
	} catch {
		return false
	}
}

async function pruneExpiredRateLimitsBestEffort(
	repository: Pick<AccountCoverCleanupRepository, 'pruneExpiredUserRateLimits'>
): Promise<void> {
	try {
		await repository.pruneExpiredUserRateLimits(DISCOGS_RATE_LIMIT_PRUNE_LIMIT)
	} catch {
		// Expired quota state is independent maintenance. A later bounded worker
		// invocation can retry it without delaying durable cover cleanup.
	}
}

export async function processNextAccountCoverCleanup(
	repository: AccountCoverCleanupRepository = createAccountCoverCleanupRepository()
): Promise<AccountCoverCleanupResult> {
	await pruneExpiredRateLimitsBestEffort(repository)

	let claim: AccountCoverCleanupClaim | null
	try {
		claim = await repository.claim()
	} catch {
		return { processed: false, complete: false, failed: true }
	}
	if (!claim) return { processed: false, complete: false, failed: false }

	try {
		if (await repository.authUserExists(claim.userId)) {
			if (!(await repository.release(claim))) {
				throw new AccountCoverCleanupError('Cleanup release was not confirmed')
			}
			return { processed: true, complete: false, failed: false }
		}

		const listedPaths = parseClaimedObjectRows(
			await repository.listClaimedObjects(claim.userId),
			claim.userId
		)
		const removalPaths = listedPaths.slice(0, ACCOUNT_COVER_STORAGE_BATCH_LIMIT)
		if (removalPaths.length) await repository.removeObjects(removalPaths)

		if (listedPaths.length === ACCOUNT_COVER_ENUMERATION_LIMIT) {
			if (!(await repository.release(claim))) {
				throw new AccountCoverCleanupError('Cleanup release was not confirmed')
			}
			return { processed: true, complete: false, failed: false }
		}

		const remainingPaths = parseClaimedObjectRows(
			await repository.listClaimedObjects(claim.userId),
			claim.userId
		)
		if (remainingPaths.length) {
			if (!(await repository.release(claim))) {
				throw new AccountCoverCleanupError('Cleanup release was not confirmed')
			}
			return { processed: true, complete: false, failed: false }
		}

		await repository.deleteOrdinaryJobs(claim.userId)
		await repository.deleteUserRateLimit(claim.userId)
		if (!(await repository.complete(claim))) {
			throw new AccountCoverCleanupError('Cleanup completion was not confirmed')
		}
		return { processed: true, complete: true, failed: false }
	} catch {
		await releaseClaimBestEffort(repository, claim)
		return { processed: true, complete: false, failed: true }
	}
}
