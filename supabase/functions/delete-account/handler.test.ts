import type { User } from '@supabase/supabase-js'
import assert from 'node:assert/strict'
import {
	RECENT_AUTHENTICATION_FUTURE_TOLERANCE_SECONDS,
	RECENT_AUTHENTICATION_MAX_AGE_SECONDS,
	createDeleteAccountHandler,
	verifyBearerClaims
} from './handler.ts'

const NOW_SECONDS = 2_000_000_000
const USER_ID = '00000000-0000-4000-8000-000000000601'

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
		schedule?: (userId: string) => Promise<void>
		listClaimedObjects?: () => Promise<unknown>
	} = {}
) {
	return {
		authenticate:
			overrides.authenticate ??
			(() =>
				Promise.resolve({
					id: USER_ID,
					email: 'listener@example.com'
				} as User)),
		verifyClaims:
			overrides.verifyClaims ??
			(() =>
				Promise.resolve(
					overrides.claims ?? {
						sub: USER_ID,
						amr: [{ method: 'password', timestamp: NOW_SECONDS }]
					}
				)),
		nowSeconds: overrides.nowSeconds ?? (() => NOW_SECONDS),
		createRepository: () => ({
			deleteUser: overrides.deleteUser ?? (() => Promise.resolve()),
			schedule: overrides.schedule ?? (() => Promise.resolve()),
			listClaimedObjects:
				overrides.listClaimedObjects ?? (() => Promise.resolve([]))
		})
	}
}

async function assertRecentAuthenticationRejected(
	claims: Record<string, unknown>
): Promise<void> {
	let didCreateRepository = false
	const handler = createDeleteAccountHandler(
		{ 'Content-Type': 'application/json' },
		{
			...dependencies({ claims }),
			createRepository: () => {
				didCreateRepository = true
				throw new Error('must not create repository')
			}
		}
	)

	const response = await handler(request())
	const payload = await response.json()

	assert.equal(response.status, 403)
	assert.equal(payload.code, 'recent_authentication_required')
	assert.equal(payload.error, 'Sign in again before deleting your account.')
	assert.equal(didCreateRepository, false)
}

Deno.test('delete-account verifies the exact parsed bearer token', async () => {
	const authHeader = ' \tbeAreR   signed-token \t'
	const claims = {
		sub: USER_ID,
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
	let didCreateRepository = false
	const handler = createDeleteAccountHandler(
		{ 'Content-Type': 'application/json' },
		{
			...dependencies({
				verifyClaims: () => Promise.reject(new Error(privateMessage))
			}),
			createRepository: () => {
				didCreateRepository = true
				throw new Error('must not create repository')
			}
		}
	)

	const response = await handler(request())
	const payload = await response.json()

	assert.equal(response.status, 401)
	assert.equal(payload.code, 'authentication_required')
	assert.equal(JSON.stringify(payload).includes(privateMessage), false)
	assert.equal(didCreateRepository, false)
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
					sub: USER_ID,
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
					sub: USER_ID,
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
					sub: USER_ID,
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
		sub: USER_ID,
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
		sub: USER_ID,
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
	assertRecentAuthenticationRejected({ sub: USER_ID })
)

Deno.test('delete-account rejects a fresh JWT issued-at claim', () =>
	assertRecentAuthenticationRejected({
		sub: USER_ID,
		iat: NOW_SECONDS
	})
)

Deno.test('delete-account rejects a user metadata timestamp', () =>
	assertRecentAuthenticationRejected({
		sub: USER_ID,
		user_metadata: { last_authenticated_at: NOW_SECONDS }
	})
)

Deno.test('delete-account rejects string-only AMR claims', () =>
	assertRecentAuthenticationRejected({
		sub: USER_ID,
		amr: ['password']
	})
)

Deno.test('delete-account rejects a fresh token-refresh AMR entry', () =>
	assertRecentAuthenticationRejected({
		sub: USER_ID,
		amr: [{ method: 'token_refresh', timestamp: NOW_SECONDS }]
	})
)

Deno.test(
	'delete-account ignores a fresh token refresh beside stale OAuth',
	() =>
		assertRecentAuthenticationRejected({
			sub: USER_ID,
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
		sub: USER_ID,
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
		let didCreateRepository = false
		const handler = createDeleteAccountHandler(
			{ 'Content-Type': 'application/json' },
			{
				...dependencies(),
				createRepository: () => {
					didCreateRepository = true
					throw new Error('must not create repository')
				}
			}
		)

		const response = await handler(request('someone@example.com'))

		assert.equal(response.status, 400)
		assert.equal(didCreateRepository, false)
		assert.equal((await response.json()).code, 'confirmation_mismatch')
	}
)

Deno.test(
	'delete-account persists cleanup ownership before bounded auth deletion',
	async () => {
		const steps: string[] = []
		let didTraverse = false
		const handler = createDeleteAccountHandler(
			{ 'Content-Type': 'application/json' },
			dependencies({
				schedule: (userId) => {
					steps.push(`schedule:${userId}`)
					return Promise.resolve()
				},
				deleteUser: (userId) => {
					steps.push(`delete:${userId}`)
					return Promise.resolve()
				},
				listClaimedObjects: () => {
					didTraverse = true
					return Promise.resolve(
						Array.from({ length: 101 }, (_, index) => ({
							object_name: `${USER_ID}/record/cover-${index}.webp`
						}))
					)
				}
			})
		)

		const response = await handler(request(' LISTENER@example.com '))

		assert.equal(response.status, 200)
		assert.deepEqual(steps, [`schedule:${USER_ID}`, `delete:${USER_ID}`])
		assert.equal(didTraverse, false)
		assert.deepEqual(await response.json(), {
			success: true,
			cover_cleanup_complete: false,
			cleanup_queue_complete: false,
			cleanup_queued: true
		})
	}
)

Deno.test(
	'delete-account returns while an unbounded listing dependency never settles',
	async () => {
		let listingCalls = 0
		const handler = createDeleteAccountHandler(
			{ 'Content-Type': 'application/json' },
			dependencies({
				listClaimedObjects: () => {
					listingCalls += 1
					return new Promise<never>(() => undefined)
				}
			})
		)

		const response = await Promise.race([
			handler(request()),
			new Promise<Response>((_resolve, reject) =>
				setTimeout(() => reject(new Error('deletion response stalled')), 50)
			)
		])

		assert.equal(response.status, 200)
		assert.equal(listingCalls, 0)
	}
)

Deno.test(
	'delete-account aborts before auth deletion when cleanup scheduling fails',
	async () => {
		const privateMessage = 'private enqueue database detail'
		const logs: unknown[][] = []
		let didDeleteUser = false
		const originalConsoleError = console.error
		console.error = (...values: unknown[]) => logs.push(values)
		try {
			const handler = createDeleteAccountHandler(
				{ 'Content-Type': 'application/json' },
				dependencies({
					schedule: () => Promise.reject(new Error(privateMessage)),
					deleteUser: () => {
						didDeleteUser = true
						return Promise.resolve()
					}
				})
			)

			const response = await handler(request())
			const payload = await response.json()

			assert.equal(response.status, 503)
			assert.equal(payload.code, 'cleanup_enqueue_failed')
			assert.equal(didDeleteUser, false)
			assert.equal(JSON.stringify(payload).includes(privateMessage), false)
			assert.equal(JSON.stringify(logs).includes(privateMessage), false)
		} finally {
			console.error = originalConsoleError
		}
	}
)

Deno.test(
	'delete-account leaves durable cleanup scheduled when auth deletion fails',
	async () => {
		const privateMessage = 'private auth service detail'
		const logs: unknown[][] = []
		const steps: string[] = []
		const originalConsoleError = console.error
		console.error = (...values: unknown[]) => logs.push(values)
		try {
			const handler = createDeleteAccountHandler(
				{ 'Content-Type': 'application/json' },
				dependencies({
					schedule: (userId) => {
						steps.push(`schedule:${userId}`)
						return Promise.resolve()
					},
					deleteUser: (userId) => {
						steps.push(`delete:${userId}`)
						return Promise.reject(new Error(privateMessage))
					}
				})
			)

			const response = await handler(request())
			const payload = await response.json()

			assert.equal(response.status, 503)
			assert.equal(payload.code, 'account_delete_failed')
			assert.deepEqual(steps, [`schedule:${USER_ID}`, `delete:${USER_ID}`])
			assert.equal(JSON.stringify(payload).includes(privateMessage), false)
			assert.equal(JSON.stringify(logs).includes(privateMessage), false)
		} finally {
			console.error = originalConsoleError
		}
	}
)

Deno.test(
	'delete-account durable intent survives a settling auth deletion call',
	async () => {
		let rejectDelete!: (error: Error) => void
		let resolveDeleteStarted!: () => void
		const pendingDelete = new Promise<void>((_resolve, reject) => {
			rejectDelete = reject
		})
		const deleteStarted = new Promise<void>((resolve) => {
			resolveDeleteStarted = resolve
		})
		const steps: string[] = []
		const handler = createDeleteAccountHandler(
			{ 'Content-Type': 'application/json' },
			dependencies({
				schedule: () => {
					steps.push('schedule')
					return Promise.resolve()
				},
				deleteUser: () => {
					steps.push('delete')
					resolveDeleteStarted()
					return pendingDelete
				}
			})
		)

		const responsePromise = handler(request())
		await deleteStarted
		assert.deepEqual(steps, ['schedule', 'delete'])

		rejectDelete(new Error('simulated auth timeout'))
		assert.equal((await responsePromise).status, 503)
	}
)
