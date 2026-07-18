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
	createAdmin(): AccountDeletionAdmin
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
	createAdmin: createDefaultAdmin
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
