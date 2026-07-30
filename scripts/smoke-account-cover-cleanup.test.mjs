import assert from 'node:assert/strict'
import test from 'node:test'
import {
	didCreateGlobalQuotaSentinel,
	driveAccountCoverCleanup,
	parseLocalSupabaseStatus,
	runCleanupSteps
} from './smoke-account-cover-cleanup.mjs'

const localStatus = {
	ANON_KEY: 'local-anon-key-at-least-sixteen-characters',
	API_URL: 'http://127.0.0.1:42821',
	DB_URL: 'postgresql://postgres:postgres@127.0.0.1:42822/postgres',
	SERVICE_ROLE_KEY: 'local-service-key-at-least-sixteen-characters'
}

test('accepts only the reserved local Supabase API and database endpoints', () => {
	assert.deepEqual(parseLocalSupabaseStatus(JSON.stringify(localStatus)), {
		anonKey: localStatus.ANON_KEY,
		apiUrl: localStatus.API_URL,
		databaseUrl: localStatus.DB_URL,
		serviceRoleKey: localStatus.SERVICE_ROLE_KEY
	})
})

test('rejects hosted, non-loopback, wrong-port, and decorated endpoints', () => {
	for (const override of [
		{ API_URL: 'https://project.supabase.co:42821' },
		{ API_URL: 'http://192.0.2.10:42821' },
		{ API_URL: 'http://localhost:42821' },
		{ API_URL: 'http://127.0.0.1:54321' },
		{ API_URL: 'http://127.0.0.1:42821/rest/v1' },
		{ API_URL: 'http://user:secret@127.0.0.1:42821' },
		{ DB_URL: 'postgresql://postgres:secret@db.example.test:42822/postgres' },
		{ DB_URL: 'postgresql://postgres:secret@127.0.0.1:54322/postgres' },
		{ DB_URL: 'postgresql://postgres:secret@127.0.0.1:42822/other' }
	]) {
		assert.throws(
			() =>
				parseLocalSupabaseStatus(
					JSON.stringify({ ...localStatus, ...override })
				),
			/requires the running Crate Guide local Supabase stack/
		)
	}
})

test('configuration failures do not echo private inputs', () => {
	const privateValue = 'private-service-key-that-must-not-be-logged'
	assert.throws(
		() =>
			parseLocalSupabaseStatus(
				JSON.stringify({
					...localStatus,
					API_URL: `http://user:${privateValue}@127.0.0.1:42821`,
					SERVICE_ROLE_KEY: privateValue
				})
			),
		(error) =>
			error instanceof Error &&
			!error.message.includes(privateValue) &&
			!error.message.includes(localStatus.SERVICE_ROLE_KEY)
	)
})

test('global quota ownership comes only from atomic insert returning', () => {
	assert.equal(didCreateGlobalQuotaSentinel('1'), true)
	assert.equal(
		didCreateGlobalQuotaSentinel(''),
		false,
		'a prior missing read must not claim a row created by a racing process'
	)
	assert.throws(
		() => didCreateGlobalQuotaSentinel('unexpected database output'),
		/sentinel insert was ambiguous/
	)
})

test('drives three bounded 100, 100, 1 cleanup pages to completion', async () => {
	let now = 1_000
	const sleeps = []
	const results = [
		{ processed: true, complete: false, failed: false },
		{ processed: true, complete: false, failed: false },
		{ processed: true, complete: true, failed: false }
	]
	const counts = [101, 1, 0]
	const progress = []

	const proof = await driveAccountCoverCleanup({
		countObjects: () => Promise.resolve(counts.shift()),
		deadlineMs: 90_000,
		initialObjectCount: 201,
		now: () => now,
		onProgress: (entry) => progress.push(entry.remainingObjectCount),
		processNext: () => Promise.resolve(results.shift()),
		retryDelayMs: 31_000,
		sleep: async (milliseconds) => {
			sleeps.push(milliseconds)
			now += milliseconds
		}
	})

	assert.deepEqual(proof, {
		invocations: 3,
		remainingObjectCounts: [101, 1, 0]
	})
	assert.deepEqual(progress, [101, 1, 0])
	assert.deepEqual(sleeps, [31_000, 31_000])
})

test('fails closed on stalled page progress and unexpected empty claims', async () => {
	await assert.rejects(
		driveAccountCoverCleanup({
			countObjects: () => Promise.resolve(201),
			initialObjectCount: 201,
			processNext: () =>
				Promise.resolve({ processed: true, complete: false, failed: false })
		}),
		/page progression was invalid/
	)
	await assert.rejects(
		driveAccountCoverCleanup({
			countObjects: () => Promise.resolve(201),
			initialObjectCount: 201,
			processNext: () =>
				Promise.resolve({ processed: false, complete: false, failed: false })
		}),
		/did not process its fixture claim/
	)
})

test('enforces invocation and time caps before another retry', async () => {
	let now = 0
	const counts = [301, 201, 101]
	await assert.rejects(
		driveAccountCoverCleanup({
			countObjects: () => Promise.resolve(counts.shift()),
			deadlineMs: 200_000,
			initialObjectCount: 401,
			maxInvocations: 3,
			now: () => now,
			processNext: () =>
				Promise.resolve({ processed: true, complete: false, failed: false }),
			retryDelayMs: 31_000,
			sleep: async (milliseconds) => {
				now += milliseconds
			}
		}),
		/invocation cap/
	)

	await assert.rejects(
		driveAccountCoverCleanup({
			countObjects: () => Promise.resolve(101),
			deadlineMs: 30_000,
			initialObjectCount: 201,
			now: () => 0,
			processNext: () =>
				Promise.resolve({ processed: true, complete: false, failed: false }),
			retryDelayMs: 31_000,
			sleep: () => Promise.reject(new Error('must not sleep'))
		}),
		/hard time limit/
	)
})

test('finally cleanup attempts every independent step and redacts failures', async () => {
	const calls = []
	const secret = 'private-cleanup-failure-detail'
	const failures = await runCleanupSteps([
		{
			name: 'first scoped artifact',
			operation: async () => {
				calls.push('first')
				throw new Error(secret)
			}
		},
		{
			name: 'second scoped artifact',
			operation: async () => {
				calls.push('second')
			}
		},
		{
			name: 'third scoped artifact',
			operation: async () => {
				calls.push('third')
				throw new Error('another private detail')
			}
		}
	])

	assert.deepEqual(calls, ['first', 'second', 'third'])
	assert.deepEqual(failures, ['first scoped artifact', 'third scoped artifact'])
	assert.equal(JSON.stringify(failures).includes(secret), false)
})
