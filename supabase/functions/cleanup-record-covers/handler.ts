import type { User } from '@supabase/supabase-js'
import {
	createAuthedSupabaseClient,
	createServiceRoleSupabaseClient,
	getUser
} from '../_shared/supabaseHelpers.ts'

const RECORD_COVER_BUCKET = 'record-covers'
export const CLEANUP_JOB_LIMIT = 100
const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export interface CleanupJob {
	id: number
	user_id: string
	record_id: string
	object_path: string
	attempt_count: number
}

interface CleanupAdmin {
	loadJobs(userId: string, limit: number): Promise<CleanupJob[]>
	findReferencedPaths(userId: string, paths: string[]): Promise<Set<string>>
	removeObjects(paths: string[]): Promise<void>
	deleteJobs(userId: string, jobIds: number[]): Promise<void>
	markAttempts(
		userId: string,
		jobs: CleanupJob[],
		attemptedAt: string
	): Promise<void>
}

interface HandlerDependencies {
	authenticate(authHeader: string): Promise<User>
	createAdmin(): CleanupAdmin
	now(): Date
}

class CleanupDatabaseError extends Error {}
class CleanupStorageError extends Error {}

function createDefaultAdmin(): CleanupAdmin {
	const supabase = createServiceRoleSupabaseClient()
	const bucket = supabase.storage.from(RECORD_COVER_BUCKET)

	return {
		async loadJobs(userId, limit) {
			const { data, error } = await supabase
				.from('record_cover_cleanup_jobs')
				.select('id,user_id,record_id,object_path,attempt_count')
				.eq('user_id', userId)
				.order('id', { ascending: true })
				.limit(limit)
			if (error) throw new CleanupDatabaseError('Cleanup job load failed')
			return (data ?? []) as CleanupJob[]
		},
		async findReferencedPaths(userId, paths) {
			if (!paths.length) return new Set()
			const { data, error } = await supabase
				.from('records')
				.select('cover_storage_path')
				.eq('user_id', userId)
				.in('cover_storage_path', paths)
			if (error) throw new CleanupDatabaseError('Cover reference check failed')
			return new Set(
				(data ?? []).flatMap(({ cover_storage_path }) =>
					typeof cover_storage_path === 'string' ? [cover_storage_path] : []
				)
			)
		},
		async removeObjects(paths) {
			if (!paths.length) return
			// Storage.remove reports one error for the request. A null error is the
			// idempotent acknowledgement for every prefix, including missing objects;
			// its data array is not a reliable per-path success ledger.
			const { error } = await bucket.remove(paths)
			if (error) throw new CleanupStorageError('Cover removal failed')
		},
		async deleteJobs(userId, jobIds) {
			const uniqueJobIds = [...new Set(jobIds)]
			if (!uniqueJobIds.length) return
			const { data, error } = await supabase
				.from('record_cover_cleanup_jobs')
				.delete()
				.eq('user_id', userId)
				.in('id', uniqueJobIds)
				.select('id')
			if (error) throw new CleanupDatabaseError('Cleanup job deletion failed')

			const deletedIds = new Set((data ?? []).map(({ id }) => id))
			const unconfirmedIds = uniqueJobIds.filter((id) => !deletedIds.has(id))
			if (!unconfirmedIds.length) return

			const { data: remaining, error: checkError } = await supabase
				.from('record_cover_cleanup_jobs')
				.select('id')
				.eq('user_id', userId)
				.in('id', unconfirmedIds)
			if (checkError || (remaining?.length ?? 0) > 0) {
				throw new CleanupDatabaseError('Cleanup job deletion was ambiguous')
			}
		},
		async markAttempts(userId, jobs, attemptedAt) {
			await Promise.all(
				jobs.map(async (job) => {
					const { error } = await supabase
						.from('record_cover_cleanup_jobs')
						.update({
							attempt_count: job.attempt_count + 1,
							last_attempted_at: attemptedAt
						})
						.eq('user_id', userId)
						.eq('id', job.id)
						.eq('attempt_count', job.attempt_count)
					if (error) {
						throw new CleanupDatabaseError('Cleanup attempt update failed')
					}
				})
			)
		}
	}
}

const defaultDependencies: HandlerDependencies = {
	authenticate: (authHeader) => getUser(createAuthedSupabaseClient(authHeader)),
	createAdmin: createDefaultAdmin,
	now: () => new Date()
}

function jsonResponse(
	body: unknown,
	headers: HeadersInit,
	status: number
): Response {
	return new Response(JSON.stringify(body), { headers, status })
}

function isValidManagedJob(job: CleanupJob, userId: string): boolean {
	if (
		!Number.isSafeInteger(job.id) ||
		job.id <= 0 ||
		!Number.isSafeInteger(job.attempt_count) ||
		job.attempt_count < 0 ||
		job.user_id !== userId ||
		!UUID_PATTERN.test(job.record_id) ||
		typeof job.object_path !== 'string'
	)
		return false

	const expectedPrefix = `${userId}/${job.record_id}/`
	if (!job.object_path.startsWith(expectedPrefix)) return false
	const fileName = job.object_path.slice(expectedPrefix.length)
	return (
		fileName.length > '.webp'.length &&
		!fileName.includes('/') &&
		fileName.endsWith('.webp')
	)
}

async function markAttemptsBestEffort(
	admin: CleanupAdmin,
	userId: string,
	jobs: CleanupJob[],
	attemptedAt: string
): Promise<void> {
	if (!jobs.length) return
	try {
		await admin.markAttempts(userId, jobs, attemptedAt)
	} catch {
		// The durable rows remain. A later authenticated drain can retry both the
		// cleanup and its bounded diagnostic metadata update.
	}
}

function cleanupResponse(
	headers: HeadersInit,
	counts: { processed: number; removed: number; deferred: number },
	didFail: boolean
): Response {
	return jsonResponse(
		didFail
			? {
					error: 'Record-cover cleanup was deferred.',
					code: 'cleanup_deferred',
					...counts
				}
			: counts,
		headers,
		didFail ? 503 : 200
	)
}

export function createCleanupRecordCoversHandler(
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

		if ((await request.text()).trim()) {
			return jsonResponse(
				{ error: 'Request body is not allowed.', code: 'invalid_request' },
				headers,
				400
			)
		}

		const admin = dependencies.createAdmin()
		let jobs: CleanupJob[]
		try {
			jobs = (await admin.loadJobs(user.id, CLEANUP_JOB_LIMIT)).slice(
				0,
				CLEANUP_JOB_LIMIT
			)
		} catch {
			return cleanupResponse(
				headers,
				{ processed: 0, removed: 0, deferred: 0 },
				true
			)
		}

		if (!jobs.length) {
			return cleanupResponse(
				headers,
				{ processed: 0, removed: 0, deferred: 0 },
				false
			)
		}

		let processed = 0
		let removed = 0
		const failedJobs: CleanupJob[] = []
		const invalidJobs = jobs.filter((job) => !isValidManagedJob(job, user.id))
		const validJobs = jobs.filter((job) => isValidManagedJob(job, user.id))

		if (invalidJobs.length) {
			try {
				// Discard poisoned queue rows only. Their paths are never sent to Storage,
				// and valid work later in the same bounded page can continue.
				await admin.deleteJobs(
					user.id,
					invalidJobs.map(({ id }) => id)
				)
				processed += invalidJobs.length
			} catch {
				failedJobs.push(...invalidJobs)
			}
		}

		let referencedPaths: Set<string>
		try {
			referencedPaths = await admin.findReferencedPaths(
				user.id,
				validJobs.map(({ object_path }) => object_path)
			)
		} catch {
			failedJobs.push(...validJobs)
			await markAttemptsBestEffort(
				admin,
				user.id,
				failedJobs,
				dependencies.now().toISOString()
			)
			return cleanupResponse(
				headers,
				{
					processed,
					removed,
					deferred: failedJobs.length
				},
				true
			)
		}

		const referencedJobs = validJobs.filter(({ object_path }) =>
			referencedPaths.has(object_path)
		)
		const removableJobs = validJobs.filter(
			({ object_path }) => !referencedPaths.has(object_path)
		)

		if (referencedJobs.length) {
			try {
				await admin.deleteJobs(
					user.id,
					referencedJobs.map(({ id }) => id)
				)
				processed += referencedJobs.length
			} catch {
				failedJobs.push(...referencedJobs)
			}
		}

		if (removableJobs.length) {
			try {
				await admin.removeObjects(
					removableJobs.map(({ object_path }) => object_path)
				)
				removed += removableJobs.length
				try {
					await admin.deleteJobs(
						user.id,
						removableJobs.map(({ id }) => id)
					)
					processed += removableJobs.length
				} catch {
					failedJobs.push(...removableJobs)
				}
			} catch {
				failedJobs.push(...removableJobs)
			}
		}

		await markAttemptsBestEffort(
			admin,
			user.id,
			failedJobs,
			dependencies.now().toISOString()
		)
		return cleanupResponse(
			headers,
			{ processed, removed, deferred: failedJobs.length },
			failedJobs.length > 0
		)
	}
}
