import type { User } from '@supabase/supabase-js'
import assert from 'node:assert/strict'
import {
	CLEANUP_JOB_LIMIT,
	type CleanupJob,
	createCleanupRecordCoversHandler
} from './handler.ts'

const USER_ID = '00000000-0000-4000-8000-000000000301'
const RECORD_ID = '00000000-0000-4000-8000-000000000311'
const ATTEMPTED_AT = '2026-07-19T05:00:00.000Z'

function job(overrides: Partial<CleanupJob> = {}): CleanupJob {
	const id = overrides.id ?? 1
	const recordId = overrides.record_id ?? RECORD_ID
	return {
		id,
		user_id: USER_ID,
		record_id: recordId,
		object_path: `${USER_ID}/${recordId}/cover-${id}.webp`,
		attempt_count: 0,
		...overrides
	}
}

function request(method = 'POST', body?: string): Request {
	return new Request('http://localhost', {
		method,
		headers: { Authorization: 'Bearer valid' },
		body
	})
}

function dependencies(
	overrides: {
		authenticate?: () => Promise<User>
		loadJobs?: (userId: string, limit: number) => Promise<CleanupJob[]>
		findReferencedPaths?: (
			userId: string,
			paths: string[]
		) => Promise<Set<string>>
		removeObjects?: (paths: string[]) => Promise<void>
		deleteJobs?: (userId: string, jobIds: number[]) => Promise<void>
		markAttempts?: (
			userId: string,
			jobs: CleanupJob[],
			attemptedAt: string
		) => Promise<void>
	} = {}
) {
	return {
		authenticate:
			overrides.authenticate ??
			(() => Promise.resolve({ id: USER_ID } as User)),
		now: () => new Date(ATTEMPTED_AT),
		createAdmin: () => ({
			loadJobs: overrides.loadJobs ?? (() => Promise.resolve([])),
			findReferencedPaths:
				overrides.findReferencedPaths ?? (() => Promise.resolve(new Set())),
			removeObjects: overrides.removeObjects ?? (() => Promise.resolve()),
			deleteJobs: overrides.deleteJobs ?? (() => Promise.resolve()),
			markAttempts: overrides.markAttempts ?? (() => Promise.resolve())
		})
	}
}

Deno.test('cleanup-record-covers rejects non-POST methods', async () => {
	let didLoadJobs = false
	const handler = createCleanupRecordCoversHandler(
		{ 'Content-Type': 'application/json' },
		dependencies({
			loadJobs: () => {
				didLoadJobs = true
				return Promise.resolve([])
			}
		})
	)

	const response = await handler(request('GET'))

	assert.equal(response.status, 405)
	assert.equal((await response.json()).code, 'method_not_allowed')
	assert.equal(didLoadJobs, false)
})

Deno.test(
	'cleanup-record-covers requires verified authentication',
	async () => {
		let didCreateAdmin = false
		const handler = createCleanupRecordCoversHandler(
			{ 'Content-Type': 'application/json' },
			{
				...dependencies({
					authenticate: () => Promise.reject(new Error('private auth detail'))
				}),
				createAdmin: () => {
					didCreateAdmin = true
					throw new Error('must not create admin')
				}
			}
		)

		const response = await handler(request())

		assert.equal(response.status, 401)
		assert.equal((await response.json()).code, 'authentication_required')
		assert.equal(didCreateAdmin, false)
	}
)

Deno.test('cleanup-record-covers rejects all request bodies', async () => {
	let didCreateAdmin = false
	const handler = createCleanupRecordCoversHandler(
		{ 'Content-Type': 'application/json' },
		{
			...dependencies(),
			createAdmin: () => {
				didCreateAdmin = true
				throw new Error('must not create admin')
			}
		}
	)

	const response = await handler(request('POST', JSON.stringify({ path: 'x' })))

	assert.equal(response.status, 400)
	assert.equal((await response.json()).code, 'invalid_request')
	assert.equal(didCreateAdmin, false)
})

Deno.test(
	'cleanup-record-covers returns bounded zero counts with no jobs',
	async () => {
		let receivedUserId = ''
		let receivedLimit = 0
		const handler = createCleanupRecordCoversHandler(
			{ 'Content-Type': 'application/json' },
			dependencies({
				loadJobs: (userId, limit) => {
					receivedUserId = userId
					receivedLimit = limit
					return Promise.resolve([])
				}
			})
		)

		const response = await handler(request())

		assert.equal(response.status, 200)
		assert.deepEqual(await response.json(), {
			processed: 0,
			removed: 0,
			deferred: 0
		})
		assert.equal(receivedUserId, USER_ID)
		assert.equal(receivedLimit, CLEANUP_JOB_LIMIT)
	}
)

Deno.test(
	'cleanup-record-covers rechecks references and keeps the current object',
	async () => {
		const currentJob = job()
		const steps: string[] = []
		const handler = createCleanupRecordCoversHandler(
			{ 'Content-Type': 'application/json' },
			dependencies({
				loadJobs: () => Promise.resolve([currentJob]),
				findReferencedPaths: (_userId, paths) => {
					steps.push('reference')
					return Promise.resolve(new Set(paths))
				},
				removeObjects: () => {
					throw new Error('must not remove current object')
				},
				deleteJobs: (_userId, ids) => {
					steps.push(`delete:${ids.join(',')}`)
					return Promise.resolve()
				}
			})
		)

		const response = await handler(request())

		assert.equal(response.status, 200)
		assert.deepEqual(await response.json(), {
			processed: 1,
			removed: 0,
			deferred: 0
		})
		assert.deepEqual(steps, ['reference', 'delete:1'])
	}
)

Deno.test(
	'cleanup-record-covers discards poisoned jobs and continues valid work',
	async () => {
		const poisoned = job({
			id: 1,
			object_path: `00000000-0000-4000-8000-000000000399/${RECORD_ID}/unsafe.webp`
		})
		const valid = job({ id: 2 })
		const removedPaths: string[][] = []
		const deletedIds: number[][] = []
		const handler = createCleanupRecordCoversHandler(
			{ 'Content-Type': 'application/json' },
			dependencies({
				loadJobs: () => Promise.resolve([poisoned, valid]),
				removeObjects: (paths) => {
					removedPaths.push(paths)
					return Promise.resolve()
				},
				deleteJobs: (_userId, ids) => {
					deletedIds.push(ids)
					return Promise.resolve()
				}
			})
		)

		const response = await handler(request())

		assert.equal(response.status, 200)
		assert.deepEqual(await response.json(), {
			processed: 2,
			removed: 1,
			deferred: 0
		})
		assert.deepEqual(deletedIds, [[1], [2]])
		assert.deepEqual(removedPaths, [[valid.object_path]])
		assert.equal(
			JSON.stringify(removedPaths).includes(poisoned.object_path),
			false
		)
	}
)

Deno.test(
	'cleanup-record-covers treats an already-missing object as acknowledged',
	async () => {
		const missing = job()
		let didDeleteJob = false
		const handler = createCleanupRecordCoversHandler(
			{ 'Content-Type': 'application/json' },
			dependencies({
				loadJobs: () => Promise.resolve([missing]),
				removeObjects: () => Promise.resolve(),
				deleteJobs: () => {
					didDeleteJob = true
					return Promise.resolve()
				}
			})
		)

		const response = await handler(request())

		assert.equal(response.status, 200)
		assert.deepEqual(await response.json(), {
			processed: 1,
			removed: 1,
			deferred: 0
		})
		assert.equal(didDeleteJob, true)
	}
)

Deno.test(
	'cleanup-record-covers retains and increments jobs on storage ambiguity',
	async () => {
		const pending = job({ attempt_count: 4 })
		let didDeleteJob = false
		let markedAttempts: CleanupJob[] = []
		let markedAt = ''
		const logs: unknown[][] = []
		const originalConsoleError = console.error
		console.error = (...values: unknown[]) => logs.push(values)
		try {
			const handler = createCleanupRecordCoversHandler(
				{ 'Content-Type': 'application/json' },
				dependencies({
					loadJobs: () => Promise.resolve([pending]),
					removeObjects: () =>
						Promise.reject(
							new Error(`private failure for ${pending.object_path}`)
						),
					deleteJobs: () => {
						didDeleteJob = true
						return Promise.resolve()
					},
					markAttempts: (_userId, jobs, attemptedAt) => {
						markedAttempts = jobs.map((item) => ({
							...item,
							attempt_count: item.attempt_count + 1
						}))
						markedAt = attemptedAt
						return Promise.resolve()
					}
				})
			)

			const response = await handler(request())
			const payload = await response.json()

			assert.equal(response.status, 503)
			assert.equal(payload.code, 'cleanup_deferred')
			assert.equal(payload.processed, 0)
			assert.equal(payload.removed, 0)
			assert.equal(payload.deferred, 1)
			assert.equal(JSON.stringify(payload).includes(pending.object_path), false)
			assert.equal(didDeleteJob, false)
			assert.equal(markedAttempts[0]?.attempt_count, 5)
			assert.equal(markedAt, ATTEMPTED_AT)
			assert.deepEqual(logs, [])
		} finally {
			console.error = originalConsoleError
		}
	}
)

Deno.test(
	'cleanup-record-covers retains jobs after an acknowledged removal but failed DB delete',
	async () => {
		const pending = job({ attempt_count: 2 })
		let didRemove = false
		let markedJobs: CleanupJob[] = []
		const handler = createCleanupRecordCoversHandler(
			{ 'Content-Type': 'application/json' },
			dependencies({
				loadJobs: () => Promise.resolve([pending]),
				removeObjects: () => {
					didRemove = true
					return Promise.resolve()
				},
				deleteJobs: () => Promise.reject(new Error('database unavailable')),
				markAttempts: (_userId, jobs) => {
					markedJobs = jobs
					return Promise.resolve()
				}
			})
		)

		const response = await handler(request())

		assert.equal(response.status, 503)
		assert.deepEqual(await response.json(), {
			error: 'Record-cover cleanup was deferred.',
			code: 'cleanup_deferred',
			processed: 0,
			removed: 1,
			deferred: 1
		})
		assert.equal(didRemove, true)
		assert.deepEqual(markedJobs, [pending])
	}
)

Deno.test(
	'cleanup-record-covers retains jobs when the reference check fails',
	async () => {
		const pending = job()
		let didRemove = false
		let markedJobs: CleanupJob[] = []
		const handler = createCleanupRecordCoversHandler(
			{ 'Content-Type': 'application/json' },
			dependencies({
				loadJobs: () => Promise.resolve([pending]),
				findReferencedPaths: () =>
					Promise.reject(new Error('private database detail')),
				removeObjects: () => {
					didRemove = true
					return Promise.resolve()
				},
				markAttempts: (_userId, jobs) => {
					markedJobs = jobs
					return Promise.resolve()
				}
			})
		)

		const response = await handler(request())

		assert.equal(response.status, 503)
		assert.equal(didRemove, false)
		assert.deepEqual(markedJobs, [pending])
	}
)

Deno.test(
	'cleanup-record-covers never handles more than 100 jobs',
	async () => {
		const jobs = Array.from({ length: CLEANUP_JOB_LIMIT + 1 }, (_, index) =>
			job({ id: index + 1 })
		)
		let removedCount = 0
		let deletedCount = 0
		const handler = createCleanupRecordCoversHandler(
			{ 'Content-Type': 'application/json' },
			dependencies({
				loadJobs: () => Promise.resolve(jobs),
				removeObjects: (paths) => {
					removedCount = paths.length
					return Promise.resolve()
				},
				deleteJobs: (_userId, ids) => {
					deletedCount = ids.length
					return Promise.resolve()
				}
			})
		)

		const response = await handler(request())
		const payload = await response.json()

		assert.equal(response.status, 200)
		assert.equal(payload.processed, CLEANUP_JOB_LIMIT)
		assert.equal(payload.removed, CLEANUP_JOB_LIMIT)
		assert.equal(payload.deferred, 0)
		assert.equal(removedCount, CLEANUP_JOB_LIMIT)
		assert.equal(deletedCount, CLEANUP_JOB_LIMIT)
	}
)
