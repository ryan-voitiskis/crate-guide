import type { SupabaseClient, User } from '@supabase/supabase-js'
import assert from 'node:assert/strict'
import { createDiscogsCredentialRepository } from './credentials.ts'
import { DiscogsRateLimitError } from './rateLimit.ts'

const callerClient = {} as SupabaseClient
const user = { id: 'verified-user-id' } as User

Deno.test(
	'validates the caller before creating a service-role client',
	async () => {
		let serviceClientCreated = false
		const dependencies = {
			createCallerClient: () => callerClient,
			createServiceClient: () => {
				serviceClientCreated = true
				return {} as SupabaseClient
			},
			getAuthenticatedUser: () => Promise.reject(new Error('invalid jwt')),
			getRateLimitConfig: () => ({
				perUserLimit: 45,
				globalLimit: 55,
				windowSeconds: 60
			})
		}

		await assert.rejects(() =>
			createDiscogsCredentialRepository('Bearer invalid', dependencies)
		)
		assert.equal(serviceClientCreated, false)
	}
)

Deno.test('scopes reads and writes to the verified user id', async () => {
	let selectedUserId: unknown
	let upsertedRow: Record<string, unknown> | undefined
	const serviceClient = {
		from: () => ({
			select: () => ({
				eq: (_column: string, value: unknown) => {
					selectedUserId = value
					return {
						maybeSingle: () =>
							Promise.resolve({
								data: {
									request_token: null,
									request_secret: null,
									access_token: null,
									access_secret: null
								},
								error: null
							})
					}
				}
			}),
			upsert: (row: Record<string, unknown>) => {
				upsertedRow = row
				return Promise.resolve({ error: null })
			}
		}),
		rpc: () =>
			Promise.resolve({
				data: [{ allowed: true, retry_after_seconds: 0 }],
				error: null
			})
	} as unknown as SupabaseClient
	const repository = await createDiscogsCredentialRepository('Bearer valid', {
		createCallerClient: () => callerClient,
		createServiceClient: () => serviceClient,
		getAuthenticatedUser: () => Promise.resolve(user),
		getRateLimitConfig: () => ({
			perUserLimit: 45,
			globalLimit: 55,
			windowSeconds: 60
		})
	})

	await repository.getCredentials()
	await repository.setRequestCredentials('fixture-token', 'fixture-secret')

	assert.equal(selectedUserId, user.id)
	assert.equal(upsertedRow?.user_id, user.id)
	assert.equal(upsertedRow?.request_token, 'fixture-token')
})

Deno.test(
	'consumes quota for the verified user with validated limits',
	async () => {
		let rpcName = ''
		let rpcArguments: Record<string, unknown> | undefined
		const serviceClient = {
			rpc: (name: string, values: Record<string, unknown>) => {
				rpcName = name
				rpcArguments = values
				return Promise.resolve({
					data: [{ allowed: false, retry_after_seconds: 7 }],
					error: null
				})
			}
		} as unknown as SupabaseClient
		const repository = await createDiscogsCredentialRepository('Bearer valid', {
			createCallerClient: () => callerClient,
			createServiceClient: () => serviceClient,
			getAuthenticatedUser: () => Promise.resolve(user),
			getRateLimitConfig: () => ({
				perUserLimit: 45,
				globalLimit: 55,
				windowSeconds: 60
			})
		})

		assert.deepEqual(await repository.consumeRequestQuota(), {
			allowed: false,
			retryAfterMs: 7000
		})
		assert.equal(rpcName, 'consume_discogs_request_quota')
		assert.deepEqual(rpcArguments, {
			target_user_id: user.id,
			per_user_limit: 45,
			global_limit: 55,
			window_seconds: 60
		})
	}
)

Deno.test('sanitizes quota database failures', async () => {
	const privateMessage = 'private database connection details'
	const serviceClient = {
		rpc: () => Promise.resolve({ data: null, error: new Error(privateMessage) })
	} as unknown as SupabaseClient
	const repository = await createDiscogsCredentialRepository('Bearer valid', {
		createCallerClient: () => callerClient,
		createServiceClient: () => serviceClient,
		getAuthenticatedUser: () => Promise.resolve(user),
		getRateLimitConfig: () => ({
			perUserLimit: 45,
			globalLimit: 55,
			windowSeconds: 60
		})
	})

	await assert.rejects(
		() => repository.consumeRequestQuota(),
		(error: Error) =>
			error instanceof DiscogsRateLimitError &&
			!error.message.includes(privateMessage)
	)
})
