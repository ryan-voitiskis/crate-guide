import type { SupabaseClient, User } from '@supabase/supabase-js'
import assert from 'node:assert/strict'
import type { DiscogsCredentialRepository } from './credentials.ts'
import { quotaBoundFetch } from './quotaBoundFetch.ts'
import { DiscogsQuotaExceededError } from './requestErrors.ts'

function credentials(
	consumeRequestQuota: DiscogsCredentialRepository['consumeRequestQuota']
): DiscogsCredentialRepository {
	return {
		callerClient: {} as SupabaseClient,
		user: { id: 'verified-user-id' } as User,
		getCredentials: () => Promise.resolve(null),
		setRequestCredentials: () => Promise.resolve(),
		setAccessCredentials: () => Promise.resolve(),
		clearRequestCredentials: () => Promise.resolve(),
		consumeRequestQuota
	}
}

Deno.test(
	'reserves one quota unit immediately before provider dispatch',
	async () => {
		const steps: string[] = []
		const response = await quotaBoundFetch(
			credentials(() => {
				steps.push('quota')
				return Promise.resolve({ allowed: true, retryAfterMs: 0 })
			}),
			(() => {
				steps.push('fetch')
				return Promise.resolve(new Response('ok'))
			}) as typeof fetch,
			'https://api.discogs.com/test'
		)

		assert.equal(response.status, 200)
		assert.deepEqual(steps, ['quota', 'fetch'])
	}
)

Deno.test('does not dispatch after quota denial', async () => {
	let fetchCalled = false
	await assert.rejects(
		() =>
			quotaBoundFetch(
				credentials(() =>
					Promise.resolve({ allowed: false, retryAfterMs: 9000 })
				),
				(() => {
					fetchCalled = true
					return Promise.resolve(new Response('private'))
				}) as typeof fetch,
				'https://api.discogs.com/test'
			),
		(error: Error) =>
			error instanceof DiscogsQuotaExceededError && error.retryAfterMs === 9000
	)
	assert.equal(fetchCalled, false)
})
