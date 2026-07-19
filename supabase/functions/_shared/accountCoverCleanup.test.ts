import assert from 'node:assert/strict'
import {
	ACCOUNT_COVER_ENUMERATION_LIMIT,
	type AccountCoverCleanupAdapter,
	type AccountCoverCleanupClaim,
	AccountCoverCleanupError,
	type AccountCoverStorageEntry,
	processOneAccountCoverCleanup,
	removeAllAccountCoverObjects
} from './accountCoverCleanup.ts'

const USER_ID = '00000000-0000-4000-8000-000000000501'
const OTHER_USER_ID = '00000000-0000-4000-8000-000000000599'
const CLAIM: AccountCoverCleanupClaim = {
	userId: USER_ID,
	claimToken: '00000000-0000-4000-8000-000000000502'
}

function objectRows(paths: string[]): Array<{ object_name: string }> {
	return paths.map((object_name) => ({ object_name }))
}

function adapter(
	overrides: Partial<AccountCoverCleanupAdapter> = {}
): AccountCoverCleanupAdapter {
	return {
		listFolder: () => Promise.resolve([]),
		listClaimedObjects: () => Promise.resolve([]),
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

function storedObjects(count: number): Set<string> {
	return new Set(
		Array.from(
			{ length: count },
			(_, index) =>
				`${USER_ID}/record/cover-${index.toString().padStart(3, '0')}.webp`
		)
	)
}

function enumeratingAdapter(
	objects: Set<string>,
	overrides: Partial<AccountCoverCleanupAdapter> = {}
): AccountCoverCleanupAdapter {
	return adapter({
		listClaimedObjects: () =>
			Promise.resolve(
				objectRows(
					[...objects].sort().slice(0, ACCOUNT_COVER_ENUMERATION_LIMIT)
				)
			),
		removeObjects: (paths) => {
			for (const path of paths) objects.delete(path)
			return Promise.resolve()
		},
		...overrides
	})
}

Deno.test(
	'full account deletion keeps its separate recursive Storage traversal',
	async () => {
		const deepPath = Array.from({ length: 10 }, (_, index) => `level-${index}`)
		const removed: string[][] = []
		let didRemove = false
		const cleanupAdapter = adapter({
			listFolder(path) {
				if (didRemove) return Promise.resolve([])
				const relativeSegments = path.split('/').slice(1)
				if (relativeSegments.length < deepPath.length) {
					return Promise.resolve([
						{ id: null, name: deepPath[relativeSegments.length]! }
					])
				}
				return Promise.resolve([file('cover.webp')])
			},
			removeObjects(paths) {
				removed.push(paths)
				didRemove = true
				return Promise.resolve()
			}
		})

		await removeAllAccountCoverObjects(cleanupAdapter, USER_ID)

		assert.deepEqual(removed, [[`${USER_ID}/${deepPath.join('/')}/cover.webp`]])
	}
)

Deno.test(
	'full account deletion rejects unsafe recursive paths before removal',
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

Deno.test('account cover retry is a no-op without a claim', async () => {
	let didEnumerate = false
	const result = await processOneAccountCoverCleanup(
		adapter({
			claim: () => Promise.resolve(null),
			listClaimedObjects: () => {
				didEnumerate = true
				return Promise.resolve([])
			}
		})
	)

	assert.deepEqual(result, {
		processed: false,
		complete: false,
		failed: false
	})
	assert.equal(didEnumerate, false)
})

Deno.test(
	'account cover retry releases a live account without enumerating objects',
	async () => {
		const steps: string[] = []
		const result = await processOneAccountCoverCleanup(
			adapter({
				authUserExists: () => {
					steps.push('auth-user-exists')
					return Promise.resolve(true)
				},
				listClaimedObjects: () => {
					throw new Error('must not enumerate live-user covers')
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
	'account cover retry cannot release a concurrently rotated claim',
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
	'one retry reaches and removes an object below eight legacy folders',
	async () => {
		const deepObject = `${USER_ID}/${Array.from(
			{ length: 10 },
			(_, index) => `level-${index}`
		).join('/')}/cover.webp`
		const objects = new Set([deepObject])
		const removed: string[][] = []
		const result = await processOneAccountCoverCleanup(
			enumeratingAdapter(objects, {
				removeObjects: (paths) => {
					removed.push(paths)
					for (const path of paths) objects.delete(path)
					return Promise.resolve()
				}
			})
		)

		assert.deepEqual(result, {
			processed: true,
			complete: true,
			failed: false
		})
		assert.deepEqual(removed, [[deepObject]])
		assert.equal(objects.size, 0)
	}
)

Deno.test('exactly 100 objects remove and confirm in one retry', async () => {
	const objects = storedObjects(100)
	const removed: string[][] = []
	let enumerations = 0
	const result = await processOneAccountCoverCleanup(
		enumeratingAdapter(objects, {
			listClaimedObjects: () => {
				enumerations += 1
				return Promise.resolve(
					objectRows(
						[...objects].sort().slice(0, ACCOUNT_COVER_ENUMERATION_LIMIT)
					)
				)
			},
			removeObjects: (paths) => {
				removed.push(paths)
				for (const path of paths) objects.delete(path)
				return Promise.resolve()
			}
		})
	)

	assert.equal(result.complete, true)
	assert.deepEqual(
		removed.map(({ length }) => length),
		[100]
	)
	assert.equal(enumerations, 2)
	assert.equal(objects.size, 0)
})

Deno.test(
	'a 101st object proves more work without a confirmation read',
	async () => {
		const objects = storedObjects(101)
		let enumerations = 0
		let releases = 0
		const cleanupAdapter = enumeratingAdapter(objects, {
			listClaimedObjects: () => {
				enumerations += 1
				return Promise.resolve(
					objectRows(
						[...objects].sort().slice(0, ACCOUNT_COVER_ENUMERATION_LIMIT)
					)
				)
			},
			removeObjects: (paths) => {
				for (const path of paths) objects.delete(path)
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
		assert.equal(objects.size, 1)
		assert.equal(enumerations, 1)
		assert.equal(releases, 1)

		const second = await processOneAccountCoverCleanup(cleanupAdapter)
		assert.equal(second.complete, true)
		assert.equal(objects.size, 0)
		assert.equal(enumerations, 3)
	}
)

Deno.test('201 objects make monotonic 100, 100, 1 progress', async () => {
	const objects = storedObjects(201)
	const removalSizes: number[] = []
	const cleanupAdapter = enumeratingAdapter(objects, {
		removeObjects: (paths) => {
			removalSizes.push(paths.length)
			for (const path of paths) objects.delete(path)
			return Promise.resolve()
		}
	})

	const first = await processOneAccountCoverCleanup(cleanupAdapter)
	assert.equal(first.complete, false)
	assert.equal(objects.size, 101)
	const second = await processOneAccountCoverCleanup(cleanupAdapter)
	assert.equal(second.complete, false)
	assert.equal(objects.size, 1)
	const third = await processOneAccountCoverCleanup(cleanupAdapter)
	assert.equal(third.complete, true)
	assert.equal(objects.size, 0)
	assert.deepEqual(removalSizes, [100, 100, 1])
})

Deno.test('malformed or ambiguous object rows fail closed', async () => {
	const validPath = `${USER_ID}/record/cover.webp`
	const malformedValues: unknown[] = [
		null,
		Array.from({ length: ACCOUNT_COVER_ENUMERATION_LIMIT + 1 }, () => ({
			object_name: validPath
		})),
		[{ object_name: validPath, extra: true }],
		[{ object_name: 7 }],
		[{ object_name: `${OTHER_USER_ID}/record/cover.webp` }],
		[{ object_name: `${USER_ID}//cover.webp` }],
		[{ object_name: `${USER_ID}/../cover.webp` }],
		[{ object_name: `${USER_ID}/record\\cover.webp` }],
		[{ object_name: validPath }, { object_name: validPath }]
	]

	for (const malformed of malformedValues) {
		let didRemove = false
		let didComplete = false
		let releases = 0
		const result = await processOneAccountCoverCleanup(
			adapter({
				listClaimedObjects: () => Promise.resolve(malformed),
				removeObjects: () => {
					didRemove = true
					return Promise.resolve()
				},
				complete: () => {
					didComplete = true
					return Promise.resolve(true)
				},
				release: () => {
					releases += 1
					return Promise.resolve(true)
				}
			})
		)

		assert.deepEqual(result, {
			processed: true,
			complete: false,
			failed: true
		})
		assert.equal(didRemove, false)
		assert.equal(didComplete, false)
		assert.equal(releases, 1)
	}
})

Deno.test('a confirmation race retains the outbox job', async () => {
	const firstPath = `${USER_ID}/record/first.webp`
	const racedPath = `${USER_ID}/record/raced.webp`
	let enumeration = 0
	let didDeleteOrdinary = false
	let didComplete = false
	let releases = 0
	const result = await processOneAccountCoverCleanup(
		adapter({
			listClaimedObjects: () => {
				enumeration += 1
				return Promise.resolve(
					objectRows(enumeration === 1 ? [firstPath] : [racedPath])
				)
			},
			removeObjects: () => Promise.resolve(),
			deleteOrdinaryJobs: () => {
				didDeleteOrdinary = true
				return Promise.resolve()
			},
			complete: () => {
				didComplete = true
				return Promise.resolve(true)
			},
			release: () => {
				releases += 1
				return Promise.resolve(true)
			}
		})
	)

	assert.deepEqual(result, {
		processed: true,
		complete: false,
		failed: false
	})
	assert.equal(didDeleteOrdinary, false)
	assert.equal(didComplete, false)
	assert.equal(releases, 1)
})

Deno.test(
	'completion follows confirmed emptiness and ordinary-job deletion',
	async () => {
		const steps: string[] = []
		const result = await processOneAccountCoverCleanup(
			adapter({
				listClaimedObjects: () => {
					steps.push('enumerate')
					return Promise.resolve([])
				},
				deleteOrdinaryJobs: () => {
					steps.push('delete-ordinary')
					return Promise.resolve()
				},
				complete: () => {
					steps.push('complete')
					return Promise.resolve(true)
				}
			})
		)

		assert.equal(result.complete, true)
		assert.deepEqual(steps, [
			'enumerate',
			'enumerate',
			'delete-ordinary',
			'complete'
		])
	}
)

Deno.test(
	'account retry rotates from a released live row to deleted work next minute',
	async () => {
		const deletedClaim: AccountCoverCleanupClaim = {
			userId: OTHER_USER_ID,
			claimToken: '00000000-0000-4000-8000-000000000598'
		}
		const claims = [CLAIM, deletedClaim]
		const steps: string[] = []
		const cleanupAdapter = adapter({
			claim: () => Promise.resolve(claims.shift() ?? null),
			authUserExists: (userId) => Promise.resolve(userId === USER_ID),
			release: (claim) => {
				steps.push(`release:${claim.userId}`)
				return Promise.resolve(true)
			},
			listClaimedObjects: (userId) => {
				steps.push(`enumerate:${userId}`)
				return Promise.resolve([])
			},
			complete: (claim) => {
				steps.push(`complete:${claim.userId}`)
				return Promise.resolve(true)
			}
		})

		const firstMinute = await processOneAccountCoverCleanup(cleanupAdapter)
		const secondMinute = await processOneAccountCoverCleanup(cleanupAdapter)

		assert.equal(firstMinute.complete, false)
		assert.equal(secondMinute.complete, true)
		assert.deepEqual(steps, [
			`release:${USER_ID}`,
			`enumerate:${OTHER_USER_ID}`,
			`enumerate:${OTHER_USER_ID}`,
			`complete:${OTHER_USER_ID}`
		])
	}
)

Deno.test(
	'account retry retains and releases durable work on ambiguous deletion',
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
				release: () => {
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

Deno.test('account retry redacts claim failures', async () => {
	const result = await processOneAccountCoverCleanup(
		adapter({ claim: () => Promise.reject(new Error('private claim detail')) })
	)

	assert.deepEqual(result, {
		processed: false,
		complete: false,
		failed: true
	})
})
