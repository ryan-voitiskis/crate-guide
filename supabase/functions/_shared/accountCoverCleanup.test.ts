import assert from 'node:assert/strict'
import {
	ACCOUNT_COVER_RETRY_LIST_CALL_LIMIT,
	ACCOUNT_COVER_STORAGE_BATCH_LIMIT,
	type AccountCoverCleanupAdapter,
	type AccountCoverCleanupClaim,
	AccountCoverCleanupError,
	type AccountCoverStorageEntry,
	processOneAccountCoverCleanup,
	removeAllAccountCoverObjects
} from './accountCoverCleanup.ts'

const USER_ID = '00000000-0000-4000-8000-000000000501'
const CLAIM: AccountCoverCleanupClaim = {
	userId: USER_ID,
	claimToken: '00000000-0000-4000-8000-000000000502'
}

function adapter(
	overrides: Partial<AccountCoverCleanupAdapter> = {}
): AccountCoverCleanupAdapter {
	return {
		listFolder: () => Promise.resolve([]),
		removeObjects: () => Promise.resolve(),
		deleteOrdinaryJobs: () => Promise.resolve(),
		enqueue: () => Promise.resolve(CLAIM),
		claim: () => Promise.resolve(CLAIM),
		complete: () => Promise.resolve(true),
		release: () => Promise.resolve(true),
		authUserExists: () => Promise.resolve(false),
		...overrides
	}
}

function file(name: string): AccountCoverStorageEntry {
	return { id: `id:${name}`, name }
}

Deno.test(
	'account cover cleanup recursively lists and removes in bounded Storage calls',
	async () => {
		const rootFiles = Array.from({ length: 205 }, (_, index) =>
			file(`cover-${index.toString().padStart(3, '0')}.webp`)
		)
		const nestedFiles = [file('alternate.webp')]
		const removed: string[][] = []
		const listLimits: number[] = []
		let didRemove = false
		const cleanupAdapter = adapter({
			listFolder(path, offset, limit) {
				listLimits.push(limit)
				if (didRemove) return Promise.resolve([])
				if (path === USER_ID) {
					const entries: AccountCoverStorageEntry[] = [
						{ id: null, name: 'nested' },
						...rootFiles
					]
					return Promise.resolve(entries.slice(offset, offset + limit))
				}
				if (path === `${USER_ID}/nested`) {
					return Promise.resolve(nestedFiles.slice(offset, offset + limit))
				}
				throw new Error(`unexpected path: ${path}`)
			},
			removeObjects(paths) {
				removed.push(paths)
				if (removed.flat().length === rootFiles.length + nestedFiles.length) {
					didRemove = true
				}
				return Promise.resolve()
			}
		})

		await removeAllAccountCoverObjects(cleanupAdapter, USER_ID)

		assert.equal(removed.flat().length, 206)
		assert.equal(Math.max(...removed.map(({ length }) => length)), 100)
		assert.deepEqual(
			new Set(listLimits),
			new Set([ACCOUNT_COVER_STORAGE_BATCH_LIMIT])
		)
		assert.ok(removed.flat().includes(`${USER_ID}/nested/alternate.webp`))
	}
)

Deno.test(
	'account cover cleanup rejects unsafe recursive paths before removal',
	async () => {
		let didRemove = false
		const cleanupAdapter = adapter({
			listFolder: () => Promise.resolve([{ id: 'object', name: '../unsafe' }]),
			removeObjects: () => {
				didRemove = true
				return Promise.resolve()
			}
		})

		await assert.rejects(
			() => removeAllAccountCoverObjects(cleanupAdapter, USER_ID),
			AccountCoverCleanupError
		)
		assert.equal(didRemove, false)
	}
)

Deno.test(
	'account cover retry is a no-op when no job is claimable',
	async () => {
		let didList = false
		const result = await processOneAccountCoverCleanup(
			adapter({
				claim: () => Promise.resolve(null),
				listFolder: () => {
					didList = true
					return Promise.resolve([])
				}
			})
		)

		assert.deepEqual(result, {
			processed: false,
			complete: false,
			failed: false
		})
		assert.equal(didList, false)
	}
)

Deno.test(
	'account cover retry defers a live-account job without touching Storage',
	async () => {
		const steps: string[] = []
		const result = await processOneAccountCoverCleanup(
			adapter({
				authUserExists: () => {
					steps.push('auth-user-exists')
					return Promise.resolve(true)
				},
				listFolder: () => {
					throw new Error('must not list live-user covers')
				},
				release: () => {
					steps.push('release')
					return Promise.resolve(true)
				}
			})
		)

		assert.deepEqual(result, {
			processed: true,
			complete: false,
			failed: false
		})
		assert.deepEqual(steps, ['auth-user-exists', 'release'])
	}
)

Deno.test(
	'account cover retry cannot release a concurrently re-enqueued live account',
	async () => {
		let releases = 0
		const result = await processOneAccountCoverCleanup(
			adapter({
				authUserExists: () => Promise.resolve(true),
				release: () => {
					releases += 1
					return Promise.resolve(false)
				}
			})
		)

		assert.deepEqual(result, {
			processed: true,
			complete: false,
			failed: true
		})
		assert.equal(releases, 2)
	}
)

Deno.test(
	'account cover retry bounds wide recursive listing and releases partial work',
	async () => {
		const folders = Array.from(
			{ length: 20 },
			(_, index) => `record-${index.toString().padStart(2, '0')}`
		)
		const listPaths: string[] = []
		const removed: string[][] = []
		let releases = 0
		const cleanupAdapter = adapter({
			listFolder(path) {
				listPaths.push(path)
				if (path === USER_ID) {
					return Promise.resolve(folders.map((name) => ({ id: null, name })))
				}
				const folder = path.slice(`${USER_ID}/`.length)
				return Promise.resolve(
					folders.includes(folder) ? [file('cover.webp')] : []
				)
			},
			removeObjects(paths) {
				removed.push(paths)
				return Promise.resolve()
			},
			release: () => {
				releases += 1
				return Promise.resolve(true)
			}
		})

		const result = await processOneAccountCoverCleanup(cleanupAdapter)

		assert.deepEqual(result, {
			processed: true,
			complete: false,
			failed: false
		})
		assert.ok(listPaths.length <= ACCOUNT_COVER_RETRY_LIST_CALL_LIMIT * 2)
		assert.equal(removed.length, 1)
		assert.ok((removed[0]?.length ?? 0) > 0)
		assert.ok((removed[0]?.length ?? 0) < folders.length)
		assert.equal(releases, 1)
	}
)

Deno.test(
	'account cover retry removes at most one 100-path batch and releases remaining work',
	async () => {
		const names = new Set(
			Array.from(
				{ length: 101 },
				(_, index) => `cover-${index.toString().padStart(3, '0')}.webp`
			)
		)
		const removed: string[][] = []
		let releases = 0
		const cleanupAdapter = adapter({
			listFolder: (_path, offset, limit) =>
				Promise.resolve(
					[...names]
						.sort()
						.slice(offset, offset + limit)
						.map(file)
				),
			removeObjects(paths) {
				removed.push(paths)
				for (const path of paths) names.delete(path.slice(`${USER_ID}/`.length))
				return Promise.resolve()
			},
			release: () => {
				releases += 1
				return Promise.resolve(true)
			}
		})

		const first = await processOneAccountCoverCleanup(cleanupAdapter)

		assert.deepEqual(first, {
			processed: true,
			complete: false,
			failed: false
		})
		assert.equal(removed.length, 1)
		assert.equal(removed[0]?.length, ACCOUNT_COVER_STORAGE_BATCH_LIMIT)
		assert.equal(names.size, 1)
		assert.equal(releases, 1)

		const second = await processOneAccountCoverCleanup(cleanupAdapter)

		assert.deepEqual(second, {
			processed: true,
			complete: true,
			failed: false
		})
		assert.equal(removed[1]?.length, 1)
		assert.equal(names.size, 0)
	}
)

Deno.test(
	'account cover retry deletes the ordinary queue only after Storage is empty',
	async () => {
		const steps: string[] = []
		const result = await processOneAccountCoverCleanup(
			adapter({
				listFolder: () => {
					steps.push('list')
					return Promise.resolve([])
				},
				deleteOrdinaryJobs: () => {
					steps.push('delete-ordinary')
					return Promise.resolve()
				},
				complete: (claim) => {
					assert.deepEqual(claim, CLAIM)
					steps.push('complete')
					return Promise.resolve(true)
				}
			})
		)

		assert.deepEqual(result, {
			processed: true,
			complete: true,
			failed: false
		})
		assert.deepEqual(steps, ['list', 'list', 'delete-ordinary', 'complete'])
	}
)

Deno.test(
	'account cover retry retains and releases the durable job on ambiguous failure',
	async () => {
		const steps: string[] = []
		const result = await processOneAccountCoverCleanup(
			adapter({
				deleteOrdinaryJobs: () => {
					steps.push('delete-ordinary')
					return Promise.reject(new Error('private database detail'))
				},
				complete: () => {
					steps.push('complete')
					return Promise.resolve(true)
				},
				release: (claim) => {
					assert.deepEqual(claim, CLAIM)
					steps.push('release')
					return Promise.resolve(true)
				}
			})
		)

		assert.deepEqual(result, {
			processed: true,
			complete: false,
			failed: true
		})
		assert.deepEqual(steps, ['delete-ordinary', 'release'])
	}
)

Deno.test(
	'account cover retry reports a claim failure without exposing its detail',
	async () => {
		const result = await processOneAccountCoverCleanup(
			adapter({
				claim: () => Promise.reject(new Error('private claim detail'))
			})
		)

		assert.deepEqual(result, {
			processed: false,
			complete: false,
			failed: true
		})
	}
)
