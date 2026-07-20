import assert from 'node:assert/strict'
import {
	createCleanupOrphanedRecordCoversHandler,
	timingSafeSecretEqual
} from './handler.ts'

const SECRET_KEY = 'sb_secret_test'

function request(token = SECRET_KEY, method = 'POST', body?: string): Request {
	return new Request('http://localhost', {
		method,
		headers: { apikey: token },
		body
	})
}

function dependencies(
	overrides: {
		secretKey?: () => string
		compareSecrets?: (actual: string, expected: string) => Promise<boolean>
		processOne?: () => Promise<{
			processed: boolean
			complete: boolean
			failed: boolean
		}>
	} = {}
) {
	return {
		secretKey: overrides.secretKey ?? (() => SECRET_KEY),
		compareSecrets: overrides.compareSecrets ?? timingSafeSecretEqual,
		processOne:
			overrides.processOne ??
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
	}
)

Deno.test('orphan cleanup rejects non-POST methods', async () => {
	let didProcess = false
	const handler = createCleanupOrphanedRecordCoversHandler(
		{ 'Content-Type': 'application/json' },
		dependencies({
			processOne: () => {
				didProcess = true
				return Promise.resolve({
					processed: false,
					complete: false,
					failed: false
				})
			}
		})
	)

	const response = await handler(request(SECRET_KEY, 'GET'))

	assert.equal(response.status, 405)
	assert.equal((await response.json()).code, 'method_not_allowed')
	assert.equal(didProcess, false)
})

Deno.test(
	'orphan cleanup rejects anon, user, missing, and malformed API keys',
	async () => {
		let didProcess = false
		const handler = createCleanupOrphanedRecordCoversHandler(
			{ 'Content-Type': 'application/json' },
			dependencies({
				processOne: () => {
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
			'sb_secret_test extra',
			'Bearer sb_secret_test'
		]

		for (const apiKey of apiKeyValues) {
			const headers = new Headers()
			if (apiKey !== null) headers.set('apikey', apiKey)
			const response = await handler(
				new Request('http://localhost', { method: 'POST', headers })
			)
			assert.equal(response.status, 401)
			assert.equal((await response.json()).code, 'authentication_required')
		}
		assert.equal(didProcess, false)
	}
)

Deno.test('orphan cleanup rejects every request body', async () => {
	let didProcess = false
	const handler = createCleanupOrphanedRecordCoversHandler(
		{ 'Content-Type': 'application/json' },
		dependencies({
			processOne: () => {
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
		request(SECRET_KEY, 'POST', JSON.stringify({ user_id: 'forbidden' }))
	)

	assert.equal(response.status, 400)
	assert.equal((await response.json()).code, 'invalid_request')
	assert.equal(didProcess, false)
})

Deno.test('orphan cleanup returns only generic processing state', async () => {
	const handler = createCleanupOrphanedRecordCoversHandler(
		{ 'Content-Type': 'application/json' },
		dependencies({
			processOne: () =>
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
				processOne: () => Promise.reject(new Error(privateDetail))
			})
		)

		const response = await handler(request())
		const payload = await response.json()

		assert.equal(response.status, 503)
		assert.deepEqual(payload, { processed: false, complete: false })
		assert.equal(JSON.stringify(payload).includes(privateDetail), false)
	}
)
