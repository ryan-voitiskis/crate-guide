import type { User } from '@supabase/supabase-js'
import {
	createAuthedSupabaseClient,
	createServiceRoleSupabaseClient,
	getUser
} from '../_shared/supabaseHelpers.ts'

const RECORD_COVER_BUCKET = 'record-covers'
const LIST_PAGE_SIZE = 1000
const REMOVE_BATCH_SIZE = 100
const MAX_CLEANUP_PASSES = 3
export const RECENT_AUTHENTICATION_MAX_AGE_SECONDS = 300
export const RECENT_AUTHENTICATION_FUTURE_TOLERANCE_SECONDS = 30
const RECENT_AUTHENTICATION_METHODS: ReadonlySet<string> = new Set([
	'password',
	'oauth'
])

type VerifiedClaims = Record<string, unknown>

interface StorageEntry {
	id: string | null
	name: string
}

interface AccountDeletionAdmin {
	deleteUser(userId: string): Promise<void>
	listFolder(path: string, offset: number): Promise<StorageEntry[]>
	removeObjects(paths: string[]): Promise<void>
}

interface HandlerDependencies {
	authenticate(authHeader: string): Promise<User>
	verifyClaims(authHeader: string): Promise<VerifiedClaims>
	createAdmin(): AccountDeletionAdmin
	nowSeconds(): number
}

class StorageCleanupError extends Error {}
class AccountDeleteError extends Error {}

function createDefaultAdmin(): AccountDeletionAdmin {
	const supabase = createServiceRoleSupabaseClient()
	const bucket = supabase.storage.from(RECORD_COVER_BUCKET)

	return {
		async deleteUser(userId) {
			const { error } = await supabase.auth.admin.deleteUser(userId, false)
			if (error) throw new AccountDeleteError('Auth user deletion failed')
		},
		async listFolder(path, offset) {
			const { data, error } = await bucket.list(path, {
				limit: LIST_PAGE_SIZE,
				offset,
				sortBy: { column: 'name', order: 'asc' }
			})
			if (error) throw new StorageCleanupError('Cover listing failed')
			return (data ?? []).map((entry) => ({
				id: entry.id ?? null,
				name: entry.name
			}))
		},
		async removeObjects(paths) {
			const { error } = await bucket.remove(paths)
			if (error) throw new StorageCleanupError('Cover removal failed')
		}
	}
}

const defaultDependencies: HandlerDependencies = {
	authenticate: (authHeader) => getUser(createAuthedSupabaseClient(authHeader)),
	async verifyClaims(authHeader) {
		const token = getBearerToken(authHeader)
		if (!token) throw new Error('Invalid authorization header')

		// The Edge Function lock currently predates auth.getClaims(). Verifying the
		// exact bearer with getUser(token) before decoding that same token is the
		// installed SDK's equivalent server-verified claims path.
		const supabase = createAuthedSupabaseClient(authHeader)
		const { data, error } = await supabase.auth.getUser(token)
		if (error || !data.user) throw error ?? new Error('User not found')

		const claims = decodeVerifiedJwtPayload(token)
		if (claims.sub !== data.user.id) throw new Error('JWT subject mismatch')
		return claims
	},
	createAdmin: createDefaultAdmin,
	nowSeconds: () => Math.floor(Date.now() / 1000)
}

function getBearerToken(authHeader: string): string | null {
	return /^Bearer\s+(\S+)$/i.exec(authHeader.trim())?.[1] ?? null
}

function decodeVerifiedJwtPayload(token: string): VerifiedClaims {
	const encodedPayload = token.split('.')[1]
	if (!encodedPayload) throw new Error('Invalid JWT')

	const base64 = encodedPayload
		.replaceAll('-', '+')
		.replaceAll('_', '/')
		.padEnd(Math.ceil(encodedPayload.length / 4) * 4, '=')
	const bytes = Uint8Array.from(atob(base64), (character) =>
		character.charCodeAt(0)
	)
	const payload: unknown = JSON.parse(new TextDecoder().decode(bytes))
	if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
		throw new Error('Invalid JWT payload')
	}
	return payload as VerifiedClaims
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

async function listAllCoverObjects(
	admin: AccountDeletionAdmin,
	userId: string
): Promise<string[]> {
	const folders = [userId]
	const objectPaths: string[] = []

	while (folders.length) {
		const folder = folders.shift()!
		let offset = 0

		while (true) {
			const entries = await admin.listFolder(folder, offset)
			for (const entry of entries) {
				const path = `${folder}/${entry.name}`
				if (entry.id) objectPaths.push(path)
				else folders.push(path)
			}

			if (entries.length < LIST_PAGE_SIZE) break
			offset += LIST_PAGE_SIZE
		}
	}

	return objectPaths
}

async function removeAllCoverObjects(
	admin: AccountDeletionAdmin,
	userId: string
): Promise<void> {
	for (let pass = 0; pass < MAX_CLEANUP_PASSES; pass += 1) {
		const paths = await listAllCoverObjects(admin, userId)
		if (!paths.length) return

		for (let index = 0; index < paths.length; index += REMOVE_BATCH_SIZE) {
			await admin.removeObjects(paths.slice(index, index + REMOVE_BATCH_SIZE))
		}
	}

	if ((await listAllCoverObjects(admin, userId)).length) {
		throw new StorageCleanupError('Cover cleanup did not settle')
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
			await removeAllCoverObjects(admin, user.id)
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

		try {
			await admin.deleteUser(user.id)
		} catch {
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
			await removeAllCoverObjects(admin, user.id)
		} catch {
			console.error('Account deleted, but final cover cleanup failed')
			return jsonResponse(
				{ success: true, cover_cleanup_complete: false },
				headers,
				200
			)
		}

		return jsonResponse(
			{ success: true, cover_cleanup_complete: true },
			headers,
			200
		)
	}
}
