import assert from 'node:assert/strict'
import {
	ACCOUNT_COVER_CLEANUP_SECRET_HEADER,
	createCleanupOrphanedRecordCoversHandler,
	timingSafeSecretEqual
} from './handler.ts'

const SCHEDULER_SECRET = 'scheduler-secret-test'
const PROJECT_SECRET = 'sb_secret_project'
const PUBLISHABLE_KEY = 'sb_publishable_project'

function request(
	token = SCHEDULER_SECRET,
	method = 'POST',
	body?: string,
	headerName = ACCOUNT_COVER_CLEANUP_SECRET_HEADER
): Request {
	return new Request('http://localhost', {
		method,
		headers: { [headerName]: token },
		body
	})
}

function dependencies(
	overrides: {
		schedulerSecret?: () => string
		projectSecret?: () => string
		compareSecrets?: (actual: string, expected: string) => Promise<boolean>
		processNext?: () => Promise<{
			processed: boolean
			complete: boolean
			failed: boolean
		}>
	} = {}
) {
	return {
		schedulerSecret: overrides.schedulerSecret ?? (() => SCHEDULER_SECRET),
		projectSecret: overrides.projectSecret ?? (() => PROJECT_SECRET),
		compareSecrets: overrides.compareSecrets ?? timingSafeSecretEqual,
		processNext:
			overrides.processNext ??
			(() =>
				Promise.resolve({ processed: false, complete: false, failed: false }))
	}
}

Deno.test(
	'orphan cleanup secret comparison matches only exact values',
	async () => {
		assert.equal(await timingSafeSecretEqual('same', 'same'), true)
		assert.equal(await timingSafeSecretEqual('same', 'different'), false)
		assert.equal(await timingSafeSecretEqual('', 'different'), false)
		assert.equal(await timingSafeSecretEqual('', ''), false)
	}
)

Deno.test('orphan cleanup rejects non-POST methods', async () => {
	let didProcess = false
	const handler = createCleanupOrphanedRecordCoversHandler(
		{ 'Content-Type': 'application/json' },
		dependencies({
			processNext: () => {
				didProcess = true
				return Promise.resolve({
					processed: false,
					complete: false,
					failed: false
				})
			}
		})
	)

	const response = await handler(request(SCHEDULER_SECRET, 'GET'))

	assert.equal(response.status, 405)
	assert.equal((await response.json()).code, 'method_not_allowed')
	assert.equal(didProcess, false)
})

Deno.test(
	'orphan cleanup rejects missing and malformed scheduler secrets',
	async () => {
		let didProcess = false
		const handler = createCleanupOrphanedRecordCoversHandler(
			{ 'Content-Type': 'application/json' },
			dependencies({
				processNext: () => {
					didProcess = true
					return Promise.resolve({
						processed: false,
						complete: false,
						failed: false
					})
				}
			})
		)
		const apiKeyValues = [
			null,
			'anon-jwt',
			'user-jwt',
			'scheduler-secret-test extra',
			'Bearer scheduler-secret-test'
		]

		for (const apiKey of apiKeyValues) {
			const headers = new Headers()
			if (apiKey !== null) {
				headers.set(ACCOUNT_COVER_CLEANUP_SECRET_HEADER, apiKey)
			}
			const response = await handler(
				new Request('http://localhost', { method: 'POST', headers })
			)
			assert.equal(response.status, 401)
			assert.equal((await response.json()).code, 'authentication_required')
		}
		assert.equal(didProcess, false)
	}
)

Deno.test(
	'orphan cleanup accepts a public gateway key with the dedicated secret',
	async () => {
		const handler = createCleanupOrphanedRecordCoversHandler(
			{ 'Content-Type': 'application/json' },
			dependencies()
		)
		const headers = new Headers({
			apikey: PUBLISHABLE_KEY,
			[ACCOUNT_COVER_CLEANUP_SECRET_HEADER]: SCHEDULER_SECRET
		})

		const response = await handler(
			new Request('http://localhost', { method: 'POST', headers })
		)

		assert.equal(response.status, 200)
		assert.deepEqual(await response.json(), {
			processed: false,
			complete: false
		})
	}
)

Deno.test(
	'orphan cleanup rejects a public gateway key without the dedicated secret',
	async () => {
		const handler = createCleanupOrphanedRecordCoversHandler(
			{ 'Content-Type': 'application/json' },
			dependencies()
		)

		const response = await handler(
			request(PUBLISHABLE_KEY, 'POST', undefined, 'apikey')
		)

		assert.equal(response.status, 401)
		assert.equal((await response.json()).code, 'authentication_required')
	}
)

Deno.test(
	'orphan cleanup retains the project-secret apikey transport fallback',
	async () => {
		const handler = createCleanupOrphanedRecordCoversHandler(
			{ 'Content-Type': 'application/json' },
			dependencies()
		)

		const response = await handler(
			request(PROJECT_SECRET, 'POST', undefined, 'apikey')
		)

		assert.equal(response.status, 200)
		assert.deepEqual(await response.json(), {
			processed: false,
			complete: false
		})
	}
)

Deno.test(
	'orphan cleanup prioritises the dedicated secret over apikey',
	async () => {
		const handler = createCleanupOrphanedRecordCoversHandler(
			{ 'Content-Type': 'application/json' },
			dependencies()
		)
		const headers = new Headers({
			apikey: PROJECT_SECRET,
			[ACCOUNT_COVER_CLEANUP_SECRET_HEADER]: 'wrong-secret'
		})

		const response = await handler(
			new Request('http://localhost', { method: 'POST', headers })
		)

		assert.equal(response.status, 401)
		assert.equal((await response.json()).code, 'authentication_required')
	}
)

Deno.test(
	'orphan cleanup fails closed when the dedicated secret is unavailable',
	async () => {
		let didProcess = false
		const handler = createCleanupOrphanedRecordCoversHandler(
			{ 'Content-Type': 'application/json' },
			dependencies({
				schedulerSecret: () => {
					throw new Error('missing scheduler secret')
				},
				processNext: () => {
					didProcess = true
					return Promise.resolve({
						processed: false,
						complete: false,
						failed: false
					})
				}
			})
		)

		const response = await handler(request())

		assert.equal(response.status, 503)
		assert.equal((await response.json()).code, 'service_unavailable')
		assert.equal(didProcess, false)
	}
)

Deno.test('orphan cleanup rejects every request body', async () => {
	let didProcess = false
	const handler = createCleanupOrphanedRecordCoversHandler(
		{ 'Content-Type': 'application/json' },
		dependencies({
			processNext: () => {
				didProcess = true
				return Promise.resolve({
					processed: false,
					complete: false,
					failed: false
				})
			}
		})
	)

	const response = await handler(
		request(SCHEDULER_SECRET, 'POST', JSON.stringify({ user_id: 'forbidden' }))
	)

	assert.equal(response.status, 400)
	assert.equal((await response.json()).code, 'invalid_request')
	assert.equal(didProcess, false)
})

Deno.test('orphan cleanup returns only generic processing state', async () => {
	const handler = createCleanupOrphanedRecordCoversHandler(
		{ 'Content-Type': 'application/json' },
		dependencies({
			processNext: () =>
				Promise.resolve({ processed: true, complete: true, failed: false })
		})
	)

	const response = await handler(request())

	assert.equal(response.status, 200)
	assert.deepEqual(await response.json(), {
		processed: true,
		complete: true
	})
})

Deno.test(
	'orphan cleanup redacts private processing failure detail',
	async () => {
		const privateDetail = 'private user and object path'
		const handler = createCleanupOrphanedRecordCoversHandler(
			{ 'Content-Type': 'application/json' },
			dependencies({
				processNext: () => Promise.reject(new Error(privateDetail))
			})
		)

		const response = await handler(request())
		const payload = await response.json()

		assert.equal(response.status, 503)
		assert.deepEqual(payload, { processed: false, complete: false })
		assert.equal(JSON.stringify(payload).includes(privateDetail), false)
	}
)
