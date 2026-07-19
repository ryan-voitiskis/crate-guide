import type { User } from '@supabase/supabase-js'
import {
	type AccountCoverCleanupAdapter,
	type AccountCoverCleanupClaim,
	createAccountCoverCleanupAdapter,
	removeAllAccountCoverObjects
} from '../_shared/accountCoverCleanup.ts'
import {
	createAuthedSupabaseClient,
	createServiceRoleSupabaseClient,
	getUser
} from '../_shared/supabaseHelpers.ts'

export const RECENT_AUTHENTICATION_MAX_AGE_SECONDS = 300
export const RECENT_AUTHENTICATION_FUTURE_TOLERANCE_SECONDS = 30
const RECENT_AUTHENTICATION_METHODS: ReadonlySet<string> = new Set([
	'password',
	'oauth'
])

type VerifiedClaims = Record<string, unknown>

interface ClaimsClient {
	auth: {
		getClaims(token: string): Promise<{
			data: { claims: unknown } | null
			error: unknown
		}>
	}
}

interface AccountDeletionAdmin extends AccountCoverCleanupAdapter {
	deleteUser(userId: string): Promise<void>
}

interface HandlerDependencies {
	authenticate(authHeader: string): Promise<User>
	verifyClaims(authHeader: string): Promise<VerifiedClaims>
	createAdmin(): AccountDeletionAdmin
	nowSeconds(): number
}

class AccountDeleteError extends Error {}

function createDefaultAdmin(): AccountDeletionAdmin {
	const supabase = createServiceRoleSupabaseClient()
	const cleanup = createAccountCoverCleanupAdapter(supabase)

	return {
		...cleanup,
		async deleteUser(userId) {
			const { error } = await supabase.auth.admin.deleteUser(userId, false)
			if (error) throw new AccountDeleteError('Auth user deletion failed')
		}
	}
}

const defaultDependencies: HandlerDependencies = {
	authenticate: (authHeader) => getUser(createAuthedSupabaseClient(authHeader)),
	verifyClaims: verifyBearerClaims,
	createAdmin: createDefaultAdmin,
	nowSeconds: () => Math.floor(Date.now() / 1000)
}

function getBearerToken(authHeader: string): string | null {
	return /^Bearer\s+(\S+)$/i.exec(authHeader.trim())?.[1] ?? null
}

export async function verifyBearerClaims(
	authHeader: string,
	createClient: (
		authHeader: string
	) => ClaimsClient = createAuthedSupabaseClient
): Promise<VerifiedClaims> {
	const token = getBearerToken(authHeader)
	if (!token) throw new Error('Invalid authorization header')

	const { data, error } = await createClient(authHeader).auth.getClaims(token)
	if (error || !data) throw error ?? new Error('Verified claims unavailable')

	const { claims } = data
	if (!claims || typeof claims !== 'object' || Array.isArray(claims)) {
		throw new Error('Invalid verified claims')
	}
	return claims as VerifiedClaims
}

export function hasRecentAuthentication(
	claims: unknown,
	userId: string,
	nowSeconds: number
): boolean {
	if (!claims || typeof claims !== 'object' || Array.isArray(claims))
		return false
	const verifiedClaims = claims as VerifiedClaims
	if (verifiedClaims.sub !== userId || !Array.isArray(verifiedClaims.amr)) {
		return false
	}

	let newestTimestamp: number | null = null
	for (const entry of verifiedClaims.amr) {
		if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue
		const { method, timestamp } = entry as Record<string, unknown>
		if (
			typeof method !== 'string' ||
			!RECENT_AUTHENTICATION_METHODS.has(method) ||
			typeof timestamp !== 'number' ||
			!Number.isFinite(timestamp) ||
			!Number.isInteger(timestamp)
		)
			continue
		if (newestTimestamp === null || timestamp > newestTimestamp) {
			newestTimestamp = timestamp
		}
	}

	if (newestTimestamp === null) return false
	if (
		newestTimestamp >
		nowSeconds + RECENT_AUTHENTICATION_FUTURE_TOLERANCE_SECONDS
	)
		return false
	return nowSeconds - newestTimestamp <= RECENT_AUTHENTICATION_MAX_AGE_SECONDS
}

function jsonResponse(
	body: unknown,
	headers: HeadersInit,
	status: number
): Response {
	return new Response(JSON.stringify(body), { headers, status })
}

function normaliseEmail(value: string): string {
	return value.trim().toLocaleLowerCase('en-US')
}

async function releaseClaimBestEffort(
	admin: AccountDeletionAdmin,
	claim: AccountCoverCleanupClaim
): Promise<void> {
	try {
		await admin.release(claim)
	} catch {
		// A missing acknowledgement leaves the durable row for lease-expiry retry.
	}
}

export function createDeleteAccountHandler(
	headers: HeadersInit,
	dependencies: HandlerDependencies = defaultDependencies
): (request: Request) => Promise<Response> {
	return async (request) => {
		if (request.method === 'OPTIONS') return new Response('ok', { headers })
		if (request.method !== 'POST') {
			return jsonResponse(
				{ error: 'Method not allowed.', code: 'method_not_allowed' },
				headers,
				405
			)
		}

		const authHeader = request.headers.get('Authorization')
		if (!authHeader) {
			return jsonResponse(
				{ error: 'Authentication required.', code: 'authentication_required' },
				headers,
				401
			)
		}

		let user: User
		try {
			user = await dependencies.authenticate(authHeader)
		} catch {
			return jsonResponse(
				{ error: 'Authentication required.', code: 'authentication_required' },
				headers,
				401
			)
		}

		let confirmation: unknown
		try {
			const body = (await request.json()) as { confirmation?: unknown }
			confirmation = body?.confirmation
		} catch {
			confirmation = null
		}

		if (
			!user.email ||
			typeof confirmation !== 'string' ||
			normaliseEmail(confirmation) !== normaliseEmail(user.email)
		) {
			return jsonResponse(
				{
					error:
						'Enter the email address for this account to confirm deletion.',
					code: 'confirmation_mismatch'
				},
				headers,
				400
			)
		}

		let claims: VerifiedClaims
		try {
			claims = await dependencies.verifyClaims(authHeader)
		} catch {
			return jsonResponse(
				{ error: 'Authentication required.', code: 'authentication_required' },
				headers,
				401
			)
		}
		if (!hasRecentAuthentication(claims, user.id, dependencies.nowSeconds())) {
			return jsonResponse(
				{
					error: 'Sign in again before deleting your account.',
					code: 'recent_authentication_required'
				},
				headers,
				403
			)
		}

		const admin = dependencies.createAdmin()
		try {
			await removeAllAccountCoverObjects(admin, user.id)
		} catch {
			console.error('Account deletion stopped during cover cleanup')
			return jsonResponse(
				{
					error:
						'Your account was not deleted because its cover files could not be removed. Please try again.',
					code: 'storage_cleanup_failed'
				},
				headers,
				503
			)
		}

		let cleanupClaim: AccountCoverCleanupClaim
		try {
			cleanupClaim = await admin.enqueue(user.id)
		} catch {
			console.error('Account deletion stopped while persisting cleanup intent')
			return jsonResponse(
				{
					error:
						'Your account was not deleted because cleanup could not be scheduled. Please try again.',
					code: 'cleanup_enqueue_failed'
				},
				headers,
				503
			)
		}

		try {
			await admin.deleteUser(user.id)
		} catch {
			await releaseClaimBestEffort(admin, cleanupClaim)
			console.error('Account deletion stopped while deleting the auth user')
			return jsonResponse(
				{
					error:
						'Your account was not deleted. Some cover images may already have been removed. Please try again.',
					code: 'account_delete_failed'
				},
				headers,
				503
			)
		}

		// Once the auth user is gone, no valid session can create another cover.
		// A final pass closes the small race with uploads from another active tab.
		try {
			await removeAllAccountCoverObjects(admin, user.id)
		} catch {
			await releaseClaimBestEffort(admin, cleanupClaim)
			console.error('Account deleted, but final cover cleanup failed')
			return jsonResponse(
				{
					success: true,
					cover_cleanup_complete: false,
					cleanup_queue_complete: false
				},
				headers,
				200
			)
		}

		// Cascading record deletes enqueue their former paths. Only discard those
		// durable jobs after the final full-tree pass proves there is no cover left.
		try {
			await admin.deleteOrdinaryJobs(user.id)
		} catch {
			await releaseClaimBestEffort(admin, cleanupClaim)
			console.error('Account deleted, but cleanup queue removal failed')
			return jsonResponse(
				{
					success: true,
					cover_cleanup_complete: true,
					cleanup_queue_complete: false
				},
				headers,
				200
			)
		}

		try {
			if (!(await admin.complete(cleanupClaim))) {
				throw new Error('Cleanup completion was not confirmed')
			}
		} catch {
			await releaseClaimBestEffort(admin, cleanupClaim)
			console.error('Account deleted, but cleanup completion failed')
			return jsonResponse(
				{
					success: true,
					cover_cleanup_complete: true,
					cleanup_queue_complete: false
				},
				headers,
				200
			)
		}

		return jsonResponse(
			{
				success: true,
				cover_cleanup_complete: true,
				cleanup_queue_complete: true
			},
			headers,
			200
		)
	}
}
