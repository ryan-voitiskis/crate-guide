import type { User } from '@supabase/supabase-js'
import assert from 'node:assert/strict'
import {
	RECENT_AUTHENTICATION_FUTURE_TOLERANCE_SECONDS,
	RECENT_AUTHENTICATION_MAX_AGE_SECONDS,
	createDeleteAccountHandler,
	verifyBearerClaims
} from './handler.ts'

const NOW_SECONDS = 2_000_000_000

interface StorageEntry {
	id: string | null
	name: string
}

function request(
	confirmation: unknown = 'listener@example.com',
	method = 'POST'
): Request {
	return new Request('http://localhost', {
		method,
		headers: { Authorization: 'Bearer valid' },
		body: method === 'POST' ? JSON.stringify({ confirmation }) : undefined
	})
}

function dependencies(
	overrides: {
		authenticate?: () => Promise<User>
		claims?: Record<string, unknown>
		verifyClaims?: () => Promise<Record<string, unknown>>
		nowSeconds?: () => number
		deleteUser?: (userId: string) => Promise<void>
		deleteCoverCleanupJobs?: (userId: string) => Promise<void>
		listFolder?: (path: string, offset: number) => Promise<StorageEntry[]>
		removeObjects?: (paths: string[]) => Promise<void>
	} = {}
) {
	return {
		authenticate:
			overrides.authenticate ??
			(() =>
				Promise.resolve({
					id: 'user-id',
					email: 'listener@example.com'
				} as User)),
		verifyClaims:
			overrides.verifyClaims ??
			(() =>
				Promise.resolve(
					overrides.claims ?? {
						sub: 'user-id',
						amr: [{ method: 'password', timestamp: NOW_SECONDS }]
					}
				)),
		nowSeconds: overrides.nowSeconds ?? (() => NOW_SECONDS),
		createAdmin: () => ({
			deleteUser: overrides.deleteUser ?? (() => Promise.resolve()),
			deleteCoverCleanupJobs:
				overrides.deleteCoverCleanupJobs ?? (() => Promise.resolve()),
			listFolder: overrides.listFolder ?? (() => Promise.resolve([])),
			removeObjects: overrides.removeObjects ?? (() => Promise.resolve())
		})
	}
}

async function assertRecentAuthenticationRejected(
	claims: Record<string, unknown>
): Promise<void> {
	let didCreateAdmin = false
	const handler = createDeleteAccountHandler(
		{ 'Content-Type': 'application/json' },
		{
			...dependencies({ claims }),
			createAdmin: () => {
				didCreateAdmin = true
				throw new Error('must not create admin')
			}
		}
	)

	const response = await handler(request())
	const payload = await response.json()

	assert.equal(response.status, 403)
	assert.equal(payload.code, 'recent_authentication_required')
	assert.equal(payload.error, 'Sign in again before deleting your account.')
	assert.equal(didCreateAdmin, false)
}

Deno.test('delete-account verifies the exact parsed bearer token', async () => {
	const authHeader = ' \tbeAreR   signed-token \t'
	const claims = {
		sub: 'user-id',
		amr: [{ method: 'password', timestamp: NOW_SECONDS }]
	}
	let receivedAuthHeader: string | null = null
	let receivedToken: string | null = null

	const result = await verifyBearerClaims(authHeader, (value) => {
		receivedAuthHeader = value
		return {
			auth: {
				getClaims(token) {
					receivedToken = token
					return Promise.resolve({ data: { claims }, error: null })
				}
			}
		}
	})

	assert.equal(receivedAuthHeader, authHeader)
	assert.equal(receivedToken, 'signed-token')
	assert.equal(result, claims)
})

Deno.test(
	'delete-account rejects malformed authorization headers before verification',
	async () => {
		for (const authHeader of ['', 'Basic valid', 'Bearer', 'Bearer one two']) {
			let didCreateClient = false
			await assert.rejects(
				() =>
					verifyBearerClaims(authHeader, () => {
						didCreateClient = true
						throw new Error('must not create client')
					}),
				/Invalid authorization header/
			)
			assert.equal(didCreateClient, false)
		}
	}
)

Deno.test('delete-account rejects SDK claim verification errors', async () => {
	const verificationError = new Error('invalid JWT signature')

	await assert.rejects(
		() =>
			verifyBearerClaims('Bearer invalid', () => ({
				auth: {
					getClaims: () =>
						Promise.resolve({ data: null, error: verificationError })
				}
			})),
		(error) => error === verificationError
	)
})

Deno.test(
	'delete-account rejects absent or malformed verified claims',
	async () => {
		const invalidResults = [
			{
				result: { data: null, error: null },
				expectedMessage: 'Verified claims unavailable'
			},
			{
				result: { data: { claims: null }, error: null },
				expectedMessage: 'Invalid verified claims'
			},
			{
				result: { data: { claims: [] }, error: null },
				expectedMessage: 'Invalid verified claims'
			},
			{
				result: { data: { claims: 'not-an-object' }, error: null },
				expectedMessage: 'Invalid verified claims'
			}
		]

		for (const { result, expectedMessage } of invalidResults) {
			await assert.rejects(
				() =>
					verifyBearerClaims('Bearer invalid', () => ({
						auth: { getClaims: () => Promise.resolve(result) }
					})),
				(error) => error instanceof Error && error.message === expectedMessage
			)
		}
	}
)

Deno.test('delete-account controls claim verification failures', async () => {
	const privateMessage = 'private JWT verification detail'
	let didCreateAdmin = false
	const handler = createDeleteAccountHandler(
		{ 'Content-Type': 'application/json' },
		{
			...dependencies({
				verifyClaims: () => Promise.reject(new Error(privateMessage))
			}),
			createAdmin: () => {
				didCreateAdmin = true
				throw new Error('must not create admin')
			}
		}
	)

	const response = await handler(request())
	const payload = await response.json()

	assert.equal(response.status, 401)
	assert.equal(payload.code, 'authentication_required')
	assert.equal(JSON.stringify(payload).includes(privateMessage), false)
	assert.equal(didCreateAdmin, false)
})

Deno.test('delete-account accepts a fresh password AMR timestamp', async () => {
	const handler = createDeleteAccountHandler(
		{ 'Content-Type': 'application/json' },
		dependencies()
	)

	const response = await handler(request())

	assert.equal(response.status, 200)
})

Deno.test(
	'delete-account accepts the characterized generic OAuth AMR method',
	async () => {
		const handler = createDeleteAccountHandler(
			{ 'Content-Type': 'application/json' },
			dependencies({
				claims: {
					sub: 'user-id',
					amr: [{ method: 'oauth', timestamp: NOW_SECONDS }]
				}
			})
		)

		const response = await handler(request())

		assert.equal(response.status, 200)
	}
)

Deno.test(
	'delete-account accepts an AMR timestamp exactly 300 seconds old',
	async () => {
		const handler = createDeleteAccountHandler(
			{ 'Content-Type': 'application/json' },
			dependencies({
				claims: {
					sub: 'user-id',
					amr: [
						{
							method: 'password',
							timestamp: NOW_SECONDS - RECENT_AUTHENTICATION_MAX_AGE_SECONDS
						}
					]
				}
			})
		)

		const response = await handler(request())

		assert.equal(response.status, 200)
	}
)

Deno.test(
	'delete-account accepts an AMR timestamp at the future-skew boundary',
	async () => {
		const handler = createDeleteAccountHandler(
			{ 'Content-Type': 'application/json' },
			dependencies({
				claims: {
					sub: 'user-id',
					amr: [
						{
							method: 'password',
							timestamp:
								NOW_SECONDS + RECENT_AUTHENTICATION_FUTURE_TOLERANCE_SECONDS
						}
					]
				}
			})
		)

		const response = await handler(request())

		assert.equal(response.status, 200)
	}
)

Deno.test('delete-account rejects a stale AMR timestamp', () =>
	assertRecentAuthenticationRejected({
		sub: 'user-id',
		amr: [
			{
				method: 'password',
				timestamp: NOW_SECONDS - RECENT_AUTHENTICATION_MAX_AGE_SECONDS - 1
			}
		]
	})
)

Deno.test('delete-account rejects an AMR timestamp too far in the future', () =>
	assertRecentAuthenticationRejected({
		sub: 'user-id',
		amr: [
			{
				method: 'password',
				timestamp:
					NOW_SECONDS + RECENT_AUTHENTICATION_FUTURE_TOLERANCE_SECONDS + 1
			}
		]
	})
)

Deno.test('delete-account rejects missing AMR claims', () =>
	assertRecentAuthenticationRejected({ sub: 'user-id' })
)

Deno.test('delete-account rejects a fresh JWT issued-at claim', () =>
	assertRecentAuthenticationRejected({
		sub: 'user-id',
		iat: NOW_SECONDS
	})
)

Deno.test('delete-account rejects a user metadata timestamp', () =>
	assertRecentAuthenticationRejected({
		sub: 'user-id',
		user_metadata: { last_authenticated_at: NOW_SECONDS }
	})
)

Deno.test('delete-account rejects string-only AMR claims', () =>
	assertRecentAuthenticationRejected({
		sub: 'user-id',
		amr: ['password']
	})
)

Deno.test('delete-account rejects a fresh token-refresh AMR entry', () =>
	assertRecentAuthenticationRejected({
		sub: 'user-id',
		amr: [{ method: 'token_refresh', timestamp: NOW_SECONDS }]
	})
)

Deno.test(
	'delete-account ignores a fresh token refresh beside stale OAuth',
	() =>
		assertRecentAuthenticationRejected({
			sub: 'user-id',
			amr: [
				{
					method: 'oauth',
					timestamp: NOW_SECONDS - RECENT_AUTHENTICATION_MAX_AGE_SECONDS - 1
				},
				{ method: 'token_refresh', timestamp: NOW_SECONDS }
			]
		})
)

Deno.test('delete-account rejects malformed AMR entries', () =>
	assertRecentAuthenticationRejected({
		sub: 'user-id',
		amr: [
			null,
			{ method: 'password' },
			{ method: 'password', timestamp: NOW_SECONDS - 0.5 },
			{ method: 'github', timestamp: NOW_SECONDS }
		]
	})
)

Deno.test('delete-account rejects claims for a different user', () =>
	assertRecentAuthenticationRejected({
		sub: 'different-user-id',
		amr: [{ method: 'password', timestamp: NOW_SECONDS }]
	})
)

Deno.test(
	'delete-account rejects an incorrect email confirmation',
	async () => {
		let didCreateAdmin = false
		const handler = createDeleteAccountHandler(
			{ 'Content-Type': 'application/json' },
			{
				...dependencies(),
				createAdmin: () => {
					didCreateAdmin = true
					throw new Error('must not create admin')
				}
			}
		)

		const response = await handler(request('someone@example.com'))

		assert.equal(response.status, 400)
		assert.equal(didCreateAdmin, false)
		assert.equal((await response.json()).code, 'confirmation_mismatch')
	}
)

Deno.test(
	'delete-account removes nested covers before the auth user',
	async () => {
		const steps: string[] = []
		let didRemoveObjects = false
		const handler = createDeleteAccountHandler(
			{ 'Content-Type': 'application/json' },
			dependencies({
				listFolder: (path) => {
					steps.push(`list:${path}`)
					if (path === 'user-id') {
						return Promise.resolve([
							{ id: null, name: 'record-one' },
							{ id: null, name: 'record-two' }
						])
					}
					if (path === 'user-id/record-one') {
						return Promise.resolve(
							didRemoveObjects ? [] : [{ id: 'one', name: 'cover.webp' }]
						)
					}
					if (path === 'user-id/record-two') {
						return Promise.resolve(
							didRemoveObjects ? [] : [{ id: 'two', name: 'cover.webp' }]
						)
					}
					return Promise.resolve([])
				},
				removeObjects: (paths) => {
					steps.push(`remove:${paths.join(',')}`)
					didRemoveObjects = true
					return Promise.resolve()
				},
				deleteUser: (userId) => {
					steps.push(`delete:${userId}`)
					return Promise.resolve()
				},
				deleteCoverCleanupJobs: (userId) => {
					steps.push(`delete-jobs:${userId}`)
					return Promise.resolve()
				}
			})
		)

		const response = await handler(request(' LISTENER@example.com '))

		assert.equal(response.status, 200)
		assert.deepEqual(steps, [
			'list:user-id',
			'list:user-id/record-one',
			'list:user-id/record-two',
			'remove:user-id/record-one/cover.webp,user-id/record-two/cover.webp',
			'list:user-id',
			'list:user-id/record-one',
			'list:user-id/record-two',
			'delete:user-id',
			'list:user-id',
			'list:user-id/record-one',
			'list:user-id/record-two',
			'delete-jobs:user-id'
		])
		assert.deepEqual(await response.json(), {
			success: true,
			cover_cleanup_complete: true,
			cleanup_queue_complete: true
		})
	}
)

Deno.test(
	'delete-account preserves the user when cover cleanup fails',
	async () => {
		let didDeleteUser = false
		let didDeleteJobs = false
		const handler = createDeleteAccountHandler(
			{ 'Content-Type': 'application/json' },
			dependencies({
				listFolder: () =>
					Promise.resolve([{ id: 'cover-id', name: 'cover.webp' }]),
				removeObjects: () => Promise.reject(new Error('storage unavailable')),
				deleteUser: () => {
					didDeleteUser = true
					return Promise.resolve()
				},
				deleteCoverCleanupJobs: () => {
					didDeleteJobs = true
					return Promise.resolve()
				}
			})
		)

		const response = await handler(request())

		assert.equal(response.status, 503)
		assert.equal(didDeleteUser, false)
		assert.equal(didDeleteJobs, false)
		assert.equal((await response.json()).code, 'storage_cleanup_failed')
	}
)

Deno.test(
	'delete-account describes auth deletion partial failure safely',
	async () => {
		const privateMessage = 'private auth service detail'
		const logs: unknown[][] = []
		let didDeleteJobs = false
		const originalConsoleError = console.error
		console.error = (...values: unknown[]) => logs.push(values)
		try {
			const handler = createDeleteAccountHandler(
				{ 'Content-Type': 'application/json' },
				dependencies({
					deleteUser: () => Promise.reject(new Error(privateMessage)),
					deleteCoverCleanupJobs: () => {
						didDeleteJobs = true
						return Promise.resolve()
					}
				})
			)

			const response = await handler(request())
			const payload = await response.json()

			assert.equal(response.status, 503)
			assert.equal(payload.code, 'account_delete_failed')
			assert.match(payload.error, /cover images may already have been removed/i)
			assert.equal(JSON.stringify(payload).includes(privateMessage), false)
			assert.equal(JSON.stringify(logs).includes(privateMessage), false)
			assert.equal(didDeleteJobs, false)
		} finally {
			console.error = originalConsoleError
		}
	}
)

Deno.test(
	'delete-account reports a final cover cleanup race after deletion',
	async () => {
		let didDeleteUser = false
		let didDeleteJobs = false
		const handler = createDeleteAccountHandler(
			{ 'Content-Type': 'application/json' },
			dependencies({
				deleteUser: () => {
					didDeleteUser = true
					return Promise.resolve()
				},
				listFolder: () =>
					Promise.resolve(
						didDeleteUser ? [{ id: 'late-cover', name: 'late.webp' }] : []
					),
				removeObjects: () => Promise.reject(new Error('storage unavailable')),
				deleteCoverCleanupJobs: () => {
					didDeleteJobs = true
					return Promise.resolve()
				}
			})
		)

		const response = await handler(request())
		const payload = await response.json()

		assert.equal(response.status, 200)
		assert.equal(didDeleteUser, true)
		assert.equal(payload.success, true)
		assert.equal(payload.cover_cleanup_complete, false)
		assert.equal(payload.cleanup_queue_complete, false)
		assert.equal(didDeleteJobs, false)
	}
)

Deno.test(
	'delete-account removes pre-existing and cascade-created jobs only after final storage cleanup',
	async () => {
		const steps: string[] = []
		const jobs = ['pre-existing']
		const handler = createDeleteAccountHandler(
			{ 'Content-Type': 'application/json' },
			dependencies({
				listFolder: (path) => {
					steps.push(`list:${path}`)
					return Promise.resolve([])
				},
				deleteUser: (userId) => {
					steps.push(`delete:${userId}`)
					jobs.push('cascade-created')
					return Promise.resolve()
				},
				deleteCoverCleanupJobs: (userId) => {
					steps.push(`delete-jobs:${userId}`)
					jobs.length = 0
					return Promise.resolve()
				}
			})
		)

		const response = await handler(request())

		assert.equal(response.status, 200)
		assert.deepEqual(steps, [
			'list:user-id',
			'delete:user-id',
			'list:user-id',
			'delete-jobs:user-id'
		])
		assert.deepEqual(jobs, [])
	}
)

Deno.test(
	'delete-account reports cleanup queue partial failure without private details',
	async () => {
		const privateMessage = 'private database detail'
		const logs: unknown[][] = []
		const originalConsoleError = console.error
		console.error = (...values: unknown[]) => logs.push(values)
		try {
			const handler = createDeleteAccountHandler(
				{ 'Content-Type': 'application/json' },
				dependencies({
					deleteCoverCleanupJobs: () =>
						Promise.reject(new Error(privateMessage))
				})
			)

			const response = await handler(request())
			const payload = await response.json()

			assert.equal(response.status, 200)
			assert.deepEqual(payload, {
				success: true,
				cover_cleanup_complete: true,
				cleanup_queue_complete: false
			})
			assert.equal(JSON.stringify(payload).includes(privateMessage), false)
			assert.equal(JSON.stringify(logs).includes(privateMessage), false)
		} finally {
			console.error = originalConsoleError
		}
	}
)
