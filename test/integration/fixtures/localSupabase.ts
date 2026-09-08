import { createClient } from '@supabase/supabase-js'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import {
	readLocalSupabaseStatus,
	runLocalSql
} from '../../../scripts/smoke-account-cover-cleanup.mjs'
import type { Database } from '../../../shared/types/database'
import {
	createAccountCoverCleanupRepository,
	processNextAccountCoverCleanup
} from '../../../supabase/functions/_shared/accountCoverCleanup'
import {
	createCleanupRecordCoversHandler,
	createCleanupRepository
} from '../../../supabase/functions/cleanup-record-covers/handler'
import { createDeleteAccountHandler } from '../../../supabase/functions/delete-account/handler'

// This reads only the repository's running local CLI status. The shared parser
// rejects hosted endpoints, alternate ports, and malformed keys before writes.
export const localConfiguration = readLocalSupabaseStatus()
const options = {
	auth: { autoRefreshToken: false, persistSession: false },
	global: {
		fetch: (input: RequestInfo | URL, init?: RequestInit) =>
			fetch(input, { ...init, signal: AbortSignal.timeout(15_000) })
	}
}
export const localService = createClient<Database>(
	localConfiguration.apiUrl,
	localConfiguration.serviceRoleKey,
	options
)
export const coverBytes = Buffer.from(
	'UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA',
	'base64'
)

type CreateAuthUser = typeof localService.auth.admin.createUser

export async function createLocalFixture(
	createAuthUser: CreateAuthUser = (attributes) =>
		localService.auth.admin.createUser(attributes)
) {
	const email = `crate-guide-integration-${randomUUID()}@example.invalid`
	const password = `${randomUUID()}Aa9!`
	const client = createClient<Database>(
		localConfiguration.apiUrl,
		localConfiguration.anonKey,
		options
	)
	const records = [randomUUID(), randomUUID()]
	const tracks = [randomUUID(), randomUUID()]
	let userId: string
	try {
		const created = await createAuthUser({
			email,
			password,
			email_confirm: true,
			user_metadata: { name: 'Disposable integration fixture' }
		})
		assert.equal(
			created.error,
			null,
			'Could not create disposable local account'
		)
		assert.ok(created.data.user)
		assert.equal(created.data.user.email, email)
		userId = created.data.user.id
	} catch (error) {
		// Auth can commit before its response is lost. Find only this attempt's
		// unique email and fixture marker, before any library objects were seeded.
		const committedId = runLocalSql({
			databaseUrl: localConfiguration.databaseUrl,
			sql: "SELECT id FROM auth.users WHERE email = :'fixture_email' AND raw_user_meta_data->>'name' = 'Disposable integration fixture';",
			variables: { fixture_email: email }
		})
		if (committedId) {
			assert.equal(
				(await localService.auth.admin.deleteUser(committedId)).error,
				null
			)
			assert.equal(
				(await localService.auth.admin.getUserById(committedId)).error?.status,
				404
			)
		}
		throw error
	}
	const paths = records.map((id) => `${userId}/${id}/${randomUUID()}.webp`)
	let disposed = false
	const fixture = {
		email,
		password,
		userId,
		client,
		records,
		tracks,
		paths,
		ownedRowCount(table: 'records' | 'tracks') {
			assert.ok(table === 'records' || table === 'tracks')
			return Number(
				runLocalSql({
					databaseUrl: localConfiguration.databaseUrl,
					sql: `SELECT count(*) FROM public.${table} WHERE user_id = :'target_user_id'::uuid;`,
					variables: { target_user_id: userId }
				})
			)
		},
		accountJobCount() {
			return Number(
				runLocalSql({
					databaseUrl: localConfiguration.databaseUrl,
					sql: "SELECT count(*) FROM public.record_cover_account_cleanup_jobs WHERE user_id = :'target_user_id'::uuid;",
					variables: { target_user_id: userId }
				})
			)
		},
		async dispose() {
			if (disposed) return
			const failures: unknown[] = []
			// Attempt all owned cleanup steps even if one fails. Never enumerate or
			// delete another account or invoke the global cleanup queue.
			const attempt = async (operation: () => Promise<void>) => {
				try {
					await operation()
				} catch (error) {
					failures.push(error)
				}
			}
			await attempt(async () => {
				assert.equal(
					(await localService.storage.from('record-covers').remove(paths))
						.error,
					null
				)
			})
			await attempt(async () => {
				const existing = await localService.auth.admin.getUserById(userId)
				if (existing.error?.status !== 404) {
					assert.equal(existing.error, null)
					assert.equal(
						(await localService.auth.admin.deleteUser(userId)).error,
						null
					)
				}
			})
			for (const table of ['record_cover_cleanup_jobs'] as const) {
				await attempt(async () => {
					assert.equal(
						(await localService.from(table).delete().eq('user_id', userId))
							.error,
						null
					)
				})
			}
			await attempt(async () => {
				runLocalSql({
					databaseUrl: localConfiguration.databaseUrl,
					sql: "DELETE FROM public.record_cover_account_cleanup_jobs WHERE user_id = :'target_user_id'::uuid;",
					variables: { target_user_id: userId }
				})
			})
			await attempt(async () => {
				assert.equal(
					(await localService.auth.admin.getUserById(userId)).error?.status,
					404
				)
				assert.equal(fixture.accountJobCount(), 0)
				for (const table of [
					'records',
					'tracks',
					'record_cover_cleanup_jobs'
				] as const) {
					const remaining = runLocalSql({
						databaseUrl: localConfiguration.databaseUrl,
						sql: `SELECT count(*) FROM public.${table} WHERE user_id = :'target_user_id'::uuid;`,
						variables: { target_user_id: userId }
					})
					assert.equal(remaining, '0', `Fixture retained ${table}`)
				}
				for (const recordId of records) {
					const remaining = await localService.storage
						.from('record-covers')
						.list(`${userId}/${recordId}`)
					assert.equal(remaining.error, null)
					assert.equal(remaining.data?.length, 0, 'Fixture retained a cover')
				}
			})
			if (failures.length)
				throw new AggregateError(
					failures,
					`Local integration fixture cleanup failed for ${userId}`
				)
			disposed = true
		},
		async readTrack(index = 0) {
			const result = await client
				.from('tracks')
				.select('*')
				.eq('id', tracks[index]!)
				.single()
			assert.equal(result.error, null)
			assert.ok(result.data)
			return result.data
		},
		async authenticate(header: string) {
			const result = await client.auth.getUser(
				header.replace(/^Bearer\s+/i, '')
			)
			assert.equal(result.error, null)
			assert.equal(result.data.user?.id, userId)
			return result.data.user!
		},
		async deleteAccount(request: Request) {
			// Execute the production handler and real Auth/PostgREST/Storage clients.
			// Only the local credential providers differ from the Edge entry point.
			return createDeleteAccountHandler(
				{ 'Content-Type': 'application/json' },
				{
					authenticate: fixture.authenticate,
					async verifyClaims(header) {
						const result = await client.auth.getClaims(
							header.replace(/^Bearer\s+/i, '')
						)
						assert.equal(result.error, null)
						assert.ok(result.data)
						return result.data.claims
					},
					createRepository: () => ({
						...createAccountCoverCleanupRepository(localService),
						async deleteUser(id) {
							assert.equal(id, userId)
							assert.equal(
								(await localService.auth.admin.deleteUser(id)).error,
								null
							)
						}
					}),
					nowSeconds: () => Math.floor(Date.now() / 1000)
				}
			)(request)
		},
		async cleanupCovers(request: Request) {
			return createCleanupRecordCoversHandler(
				{ 'Content-Type': 'application/json' },
				{
					authenticate: fixture.authenticate,
					createRepository: () => createCleanupRepository(localService),
					now: () => new Date(),
					// The global orphan queue belongs to the developer's stack. Its
					// per-account worker is exercised separately with a scoped claim.
					processOrphanedAccountCleanup: async () => {},
					scheduleBackground: () => {}
				}
			)(request)
		},
		async drainAccountCovers() {
			// Acquire only this run's scheduled job. Global claim selection is
			// covered by pgTAP; invoking it here could consume a developer's job.
			const claimed = runLocalSql({
				databaseUrl: localConfiguration.databaseUrl,
				sql: "WITH claimed AS (UPDATE public.record_cover_account_cleanup_jobs SET last_attempted_at = statement_timestamp(), locked_until = statement_timestamp() + INTERVAL '2 minutes', claim_token = gen_random_uuid() WHERE user_id = :'target_user_id'::uuid AND (locked_until IS NULL OR locked_until <= statement_timestamp()) RETURNING user_id, claim_token) SELECT row_to_json(claimed) FROM claimed;",
				variables: { target_user_id: userId }
			})
			assert.ok(claimed, 'The fixture account cleanup job was not claimable')
			const row = JSON.parse(claimed) as {
				user_id: string
				claim_token: string
			}
			assert.equal(row.user_id, userId)
			return processNextAccountCoverCleanup({
				...createAccountCoverCleanupRepository(localService),
				claim: async () => ({ userId, claimToken: row.claim_token })
			})
		}
	}
	try {
		assert.equal(
			(await client.auth.signInWithPassword({ email, password })).error,
			null
		)
		for (let index = 0; index < records.length; index++) {
			assert.equal(
				(
					await client.from('records').insert({
						id: records[index]!,
						user_id: userId,
						title: `Integration record ${index + 1}`,
						artists: [{ name: 'Integration Artist' }],
						labels: [],
						cover_storage_path: paths[index]!
					})
				).error,
				null
			)
			assert.equal(
				(
					await client.storage
						.from('record-covers')
						.upload(paths[index]!, coverBytes, { contentType: 'image/webp' })
				).error,
				null
			)
			assert.equal(
				(
					await client.from('tracks').insert({
						id: tracks[index]!,
						record_id: records[index]!,
						user_id: userId,
						title: `Integration track ${index + 1}`,
						artists: [{ name: 'Integration Artist' }],
						extraartists: [],
						genres: [],
						duration: index === 0 ? 180 : 180000,
						position: 'A1',
						playable: true,
						bpm: index === 0 ? 128 : null
					})
				).error,
				null
			)
		}
		return fixture
	} catch (error) {
		await fixture.dispose()
		throw error
	}
}

export type LocalFixture = Awaited<ReturnType<typeof createLocalFixture>>
