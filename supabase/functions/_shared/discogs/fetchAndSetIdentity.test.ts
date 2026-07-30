import type { SupabaseClient, User } from '@supabase/supabase-js'
import assert from 'node:assert/strict'
import type { DiscogsCredentialRepository } from './credentials.ts'
import { fetchAndSetIdentity } from './fetchAndSetIdentity.ts'

const config = {
	consumerKey: 'consumer-key-fixture',
	consumerSecret: 'consumer-secret-fixture',
	userAgent: 'crate-guide-test'
}

function repository(
	quotas: { allowed: boolean; retryAfterMs: number }[],
	updates: Record<string, unknown>[],
	onClear: () => void
): DiscogsCredentialRepository {
	const callerClient = {
		from: () => ({
			update: (values: Record<string, unknown>) => {
				updates.push(values)
				return {
					eq: () => Promise.resolve({ error: null })
				}
			}
		})
	} as unknown as SupabaseClient
	return {
		callerClient,
		user: { id: 'verified-user-id' } as User,
		getCredentials: () =>
			Promise.resolve({
				request_token: 'request-token',
				request_secret: 'request-secret',
				access_token: 'access-token',
				access_secret: 'access-secret'
			}),
		setRequestCredentials: () => Promise.resolve(),
		setAccessCredentials: () => Promise.resolve(),
		clearRequestCredentials: () => {
			onClear()
			return Promise.resolve()
		},
		consumeRequestQuota: () =>
			Promise.resolve(quotas.shift() ?? { allowed: true, retryAfterMs: 0 })
	}
}

Deno.test(
	'charges identity and avatar requests before publishing profile',
	async () => {
		const updates: Record<string, unknown>[] = []
		let cleared = false
		const requests: string[] = []
		await fetchAndSetIdentity(
			repository(
				[
					{ allowed: true, retryAfterMs: 0 },
					{ allowed: true, retryAfterMs: 0 }
				],
				updates,
				() => {
					cleared = true
				}
			),
			((url: string | URL | Request) => {
				requests.push(String(url))
				return Promise.resolve(
					requests.length === 1
						? Response.json({
								username: 'discogs-user',
								resource_url: 'https://api.discogs.com/users/discogs-user'
							})
						: Response.json({ avatar_url: 'https://i.discogs.com/avatar.png' })
				)
			}) as typeof fetch,
			config
		)

		assert.equal(requests.length, 2)
		assert.deepEqual(updates, [
			{
				discogs_username: 'discogs-user',
				discogs_avatar_url: 'https://i.discogs.com/avatar.png'
			}
		])
		assert.equal(cleared, true)
	}
)

Deno.test('treats avatar quota denial as non-fatal', async () => {
	const updates: Record<string, unknown>[] = []
	let cleared = false
	let fetchCalls = 0
	await fetchAndSetIdentity(
		repository(
			[
				{ allowed: true, retryAfterMs: 0 },
				{ allowed: false, retryAfterMs: 7000 }
			],
			updates,
			() => {
				cleared = true
			}
		),
		(() => {
			fetchCalls += 1
			return Promise.resolve(
				Response.json({
					username: 'discogs-user',
					resource_url: 'https://api.discogs.com/users/discogs-user'
				})
			)
		}) as typeof fetch,
		config
	)

	assert.equal(fetchCalls, 1)
	assert.deepEqual(updates, [
		{ discogs_username: 'discogs-user', discogs_avatar_url: null }
	])
	assert.equal(cleared, true)
})
