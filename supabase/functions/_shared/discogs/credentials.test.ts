import type { SupabaseClient, User } from '@supabase/supabase-js'
import assert from 'node:assert/strict'
import { createDiscogsCredentialRepository } from './credentials.ts'

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
			getAuthenticatedUser: () => Promise.reject(new Error('invalid jwt'))
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
		})
	} as unknown as SupabaseClient
	const repository = await createDiscogsCredentialRepository('Bearer valid', {
		createCallerClient: () => callerClient,
		createServiceClient: () => serviceClient,
		getAuthenticatedUser: () => Promise.resolve(user)
	})

	await repository.getCredentials()
	await repository.setRequestCredentials('fixture-token', 'fixture-secret')

	assert.equal(selectedUserId, user.id)
	assert.equal(upsertedRow?.user_id, user.id)
	assert.equal(upsertedRow?.request_token, 'fixture-token')
})
