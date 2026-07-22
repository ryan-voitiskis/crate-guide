#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js'
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
	ACCOUNT_COVER_STORAGE_BATCH_LIMIT,
	createAccountCoverCleanupRepository,
	processNextAccountCoverCleanup
} from '../supabase/functions/_shared/accountCoverCleanup.ts'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const localSupabaseBinary = resolve(
	repositoryRoot,
	'node_modules/.bin/supabase'
)
const localConfigurationError =
	'Account cleanup smoke requires the running Crate Guide local Supabase stack on loopback ports 42821 and 42822.'
const localApiPort = '42821'
const localDatabasePort = '42822'
const localDatabaseName = '/postgres'
const recordCoverBucket = 'record-covers'
const fixtureObjectCount = ACCOUNT_COVER_STORAGE_BATCH_LIMIT * 2 + 1
const workerRetryDelayMs = 31_000
const workerDeadlineMs = 90_000
const maxWorkerInvocations = 4
const requestTimeoutMs = 10_000
const commandTimeoutMs = 15_000
const uploadConcurrency = 12
const rowBatchSize = 50
const cleanupBatchSize = 100
const webpFixture = Buffer.from(
	'UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA',
	'base64'
)

function isLoopbackHostname(hostname) {
	return hostname === '127.0.0.1' || hostname === '[::1]'
}

function parseLocalApiUrl(value) {
	if (typeof value !== 'string' || !value.trim()) {
		throw new Error(localConfigurationError)
	}
	let url
	try {
		url = new URL(value.trim())
	} catch {
		throw new Error(localConfigurationError)
	}
	if (
		url.protocol !== 'http:' ||
		!isLoopbackHostname(url.hostname) ||
		url.port !== localApiPort ||
		url.pathname !== '/' ||
		url.username ||
		url.password ||
		url.search ||
		url.hash
	) {
		throw new Error(localConfigurationError)
	}
	return url.origin
}

function parseLocalDatabaseUrl(value) {
	if (typeof value !== 'string' || !value.trim()) {
		throw new Error(localConfigurationError)
	}
	let url
	try {
		url = new URL(value.trim())
	} catch {
		throw new Error(localConfigurationError)
	}
	if (
		(url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') ||
		!isLoopbackHostname(url.hostname) ||
		url.port !== localDatabasePort ||
		url.pathname !== localDatabaseName ||
		url.search ||
		url.hash
	) {
		throw new Error(localConfigurationError)
	}
	return url.toString()
}

function parsePrivateKey(value) {
	if (
		typeof value !== 'string' ||
		value.trim().length < 16 ||
		/\s/.test(value.trim())
	) {
		throw new Error(localConfigurationError)
	}
	return value.trim()
}

export function parseLocalSupabaseStatus(output) {
	let status
	try {
		status = JSON.parse(String(output))
	} catch {
		throw new Error(localConfigurationError)
	}
	return {
		anonKey: parsePrivateKey(status?.ANON_KEY),
		apiUrl: parseLocalApiUrl(status?.API_URL),
		databaseUrl: parseLocalDatabaseUrl(status?.DB_URL),
		serviceRoleKey: parsePrivateKey(status?.SERVICE_ROLE_KEY)
	}
}

function readLocalSupabaseStatus(commandRunner = spawnSync) {
	const result = commandRunner(
		localSupabaseBinary,
		['status', '--output', 'json'],
		{
			cwd: repositoryRoot,
			encoding: 'utf8',
			shell: false,
			timeout: commandTimeoutMs
		}
	)
	if (result?.error || result?.status !== 0) {
		throw new Error(
			'Start the Crate Guide local Supabase stack before running the account cleanup smoke.'
		)
	}
	return parseLocalSupabaseStatus(result.stdout)
}

function resolvePsqlBinary(environment = process.env) {
	if (environment.PSQL_BIN) return environment.PSQL_BIN
	const homebrewPsql = '/opt/homebrew/opt/libpq/bin/psql'
	return existsSync(homebrewPsql) ? homebrewPsql : 'psql'
}

function runLocalSql({ databaseUrl, sql, variables = {} }) {
	const args = [
		'--no-psqlrc',
		'--no-align',
		'--tuples-only',
		'--quiet',
		'--set',
		'ON_ERROR_STOP=1'
	]
	for (const [name, value] of Object.entries(variables)) {
		if (!/^[a-z][a-z0-9_]*$/.test(name) || /[\r\n]/.test(String(value))) {
			throw new Error('Local database smoke variables were invalid.')
		}
		args.push('--set', `${name}=${String(value)}`)
	}
	args.push(databaseUrl)

	const result = spawnSync(resolvePsqlBinary(), args, {
		cwd: repositoryRoot,
		encoding: 'utf8',
		input: sql,
		shell: false,
		timeout: commandTimeoutMs
	})
	if (result.error || result.status !== 0) {
		throw new Error('A scoped command against the local smoke database failed.')
	}
	return result.stdout.trim()
}

function readInteger(query) {
	const value = runLocalSql(query)
	if (!/^\d+$/.test(value)) {
		throw new Error('A local smoke proof query returned an invalid count.')
	}
	return Number(value)
}

function chunk(values, size) {
	const chunks = []
	for (let index = 0; index < values.length; index += size) {
		chunks.push(values.slice(index, index + size))
	}
	return chunks
}

async function mapWithConcurrency(values, concurrency, operation) {
	let nextIndex = 0
	async function worker() {
		while (nextIndex < values.length) {
			const index = nextIndex
			nextIndex += 1
			await operation(values[index], index)
		}
	}
	await Promise.all(
		Array.from({ length: Math.min(concurrency, values.length) }, () => worker())
	)
}

function delay(milliseconds) {
	return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds))
}

async function settleBeforeDeadline(operation, deadline, now) {
	const remainingMs = deadline - now()
	if (remainingMs <= 0) {
		throw new Error('Account cleanup worker exceeded its hard time limit.')
	}

	let timeout
	try {
		return await Promise.race([
			Promise.resolve().then(operation),
			new Promise((_, reject) => {
				timeout = setTimeout(
					() =>
						reject(
							new Error('Account cleanup worker exceeded its hard time limit.')
						),
					remainingMs
				)
			})
		])
	} finally {
		if (timeout) clearTimeout(timeout)
	}
}

function assertWorkerResult(result) {
	if (
		!result ||
		typeof result !== 'object' ||
		typeof result.processed !== 'boolean' ||
		typeof result.complete !== 'boolean' ||
		typeof result.failed !== 'boolean'
	) {
		throw new Error('Account cleanup worker returned an invalid result.')
	}
}

export async function driveAccountCoverCleanup({
	countObjects,
	deadlineMs = workerDeadlineMs,
	initialObjectCount,
	maxInvocations = maxWorkerInvocations,
	now = () => Date.now(),
	onProgress = () => undefined,
	processNext,
	retryDelayMs = workerRetryDelayMs,
	sleep = delay
}) {
	if (
		!Number.isInteger(initialObjectCount) ||
		initialObjectCount <= ACCOUNT_COVER_STORAGE_BATCH_LIMIT * 2 ||
		!Number.isInteger(maxInvocations) ||
		maxInvocations < 3 ||
		!Number.isFinite(deadlineMs) ||
		deadlineMs <= 0 ||
		!Number.isFinite(retryDelayMs) ||
		retryDelayMs < 0
	) {
		throw new Error('Account cleanup worker limits were invalid.')
	}

	const deadline = now() + deadlineMs
	const remainingObjectCounts = []
	let previousObjectCount = initialObjectCount

	for (let invocation = 1; invocation <= maxInvocations; invocation += 1) {
		const result = await settleBeforeDeadline(processNext, deadline, now)
		assertWorkerResult(result)
		if (!result.processed || result.failed) {
			throw new Error(
				'Account cleanup worker did not process its fixture claim.'
			)
		}

		const remainingObjectCount = await settleBeforeDeadline(
			countObjects,
			deadline,
			now
		)
		const expectedRemainingCount = Math.max(
			0,
			previousObjectCount - ACCOUNT_COVER_STORAGE_BATCH_LIMIT
		)
		if (remainingObjectCount !== expectedRemainingCount) {
			throw new Error('Account cleanup worker page progression was invalid.')
		}
		remainingObjectCounts.push(remainingObjectCount)
		onProgress({ invocation, remainingObjectCount, result })

		if (result.complete) {
			if (remainingObjectCount !== 0 || invocation < 3) {
				throw new Error(
					'Account cleanup worker completed before full traversal.'
				)
			}
			return { invocations: invocation, remainingObjectCounts }
		}
		if (remainingObjectCount === 0) {
			throw new Error(
				'Account cleanup worker retained a completed fixture claim.'
			)
		}

		previousObjectCount = remainingObjectCount
		if (now() + retryDelayMs >= deadline) {
			throw new Error('Account cleanup worker exceeded its hard time limit.')
		}
		await sleep(retryDelayMs)
	}

	throw new Error('Account cleanup worker exceeded its invocation cap.')
}

export async function runCleanupSteps(steps) {
	const failures = []
	for (const { name, operation } of steps) {
		try {
			await operation()
		} catch {
			failures.push(name)
		}
	}
	return failures
}

function createTimeoutFetch(timeoutMs = requestTimeoutMs) {
	return async (input, init = {}) => {
		const timeoutSignal = AbortSignal.timeout(timeoutMs)
		const signal = init.signal
			? AbortSignal.any([init.signal, timeoutSignal])
			: timeoutSignal
		return fetch(input, { ...init, signal })
	}
}

function createLocalClient(apiUrl, key) {
	return createClient(apiUrl, key, {
		auth: {
			autoRefreshToken: false,
			detectSessionInUrl: false,
			persistSession: false
		},
		global: { fetch: createTimeoutFetch() }
	})
}

function assertNoApiError(error, message) {
	if (error) throw new Error(message)
}

function targetCountQuery(databaseUrl, table, userId) {
	return readInteger({
		databaseUrl,
		sql: `SELECT count(*) FROM ${table} WHERE user_id = :'target_user_id'::uuid;`,
		variables: { target_user_id: userId }
	})
}

function targetObjectCount(databaseUrl, userId) {
	return readInteger({
		databaseUrl,
		sql: `
			SELECT count(*)
			FROM storage.objects
			WHERE bucket_id = 'record-covers'
				AND left(name, length(:'target_user_id') + 1) = :'target_user_id' || '/';
		`,
		variables: { target_user_id: userId }
	})
}

function exactObjectCount(databaseUrl, objectPath) {
	return readInteger({
		databaseUrl,
		sql: `
			SELECT count(*)
			FROM storage.objects
			WHERE bucket_id = 'record-covers' AND name = :'object_path';
		`,
		variables: { object_path: objectPath }
	})
}

function exactRateLimitCount(databaseUrl, bucketKey) {
	return readInteger({
		databaseUrl,
		sql: `
			SELECT count(*)
			FROM public.discogs_request_rate_limits
			WHERE bucket_key = :'bucket_key';
		`,
		variables: { bucket_key: bucketKey }
	})
}

function readGlobalQuota(databaseUrl) {
	const output = runLocalSql({
		databaseUrl,
		sql: `
			SELECT COALESCE(
				(
					SELECT json_build_object(
						'requestCount', request_count,
						'resetAt', reset_at
					)::TEXT
					FROM public.discogs_request_rate_limits
					WHERE bucket_key = 'discogs:global'
				),
				'null'
			);
		`
	})
	try {
		return JSON.parse(output)
	} catch {
		throw new Error('The local global quota proof row was invalid.')
	}
}

export function didCreateGlobalQuotaSentinel(insertOutput) {
	if (insertOutput === '1') return true
	if (insertOutput === '') return false
	throw new Error('The local global quota sentinel insert was ambiguous.')
}

function createGlobalQuotaSentinel(databaseUrl) {
	const sentinel = {
		requestCount: 730023,
		resetAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
	}
	const inserted = runLocalSql({
		databaseUrl,
		sql: `
			INSERT INTO public.discogs_request_rate_limits (
				bucket_key,
				request_count,
				reset_at
			)
			VALUES (
				'discogs:global',
				:'request_count'::integer,
				:'reset_at'::timestamptz
			)
			ON CONFLICT (bucket_key) DO NOTHING
			RETURNING 1;
		`,
		variables: {
			request_count: sentinel.requestCount,
			reset_at: sentinel.resetAt
		}
	})
	return {
		created: didCreateGlobalQuotaSentinel(inserted),
		sentinel,
		value: readGlobalQuota(databaseUrl)
	}
}

function createUserQuotaFixture(databaseUrl, userId) {
	runLocalSql({
		databaseUrl,
		sql: `
			INSERT INTO public.discogs_request_rate_limits (
				bucket_key,
				request_count,
				reset_at
			)
			VALUES (
				'discogs:user:' || :'target_user_id',
				17,
				statement_timestamp() + INTERVAL '1 hour'
			);
		`,
		variables: { target_user_id: userId }
	})
}

function assertEqual(actual, expected, message) {
	if (actual !== expected) throw new Error(message)
}

function assertJsonEqual(actual, expected, message) {
	if (JSON.stringify(actual) !== JSON.stringify(expected)) {
		throw new Error(message)
	}
}

async function findUserIdByEmail(client, email) {
	for (let page = 1; page <= 10; page += 1) {
		const { data, error } = await client.auth.admin.listUsers({
			page,
			perPage: 1000
		})
		assertNoApiError(error, 'Disposable auth user recovery failed.')
		const match = data.users.find((user) => user.email === email)
		if (match) return match.id
		if (data.users.length < 1000) return null
	}
	throw new Error('Disposable auth user recovery exceeded its page cap.')
}

async function removeStoragePaths(client, paths) {
	const bucket = client.storage.from(recordCoverBucket)
	for (const pathBatch of chunk(paths, cleanupBatchSize)) {
		const { error } = await bucket.remove(pathBatch)
		assertNoApiError(error, 'Disposable Storage cleanup failed.')
	}
}

function createFixtureDescriptors(userId) {
	return Array.from({ length: fixtureObjectCount }, (_, index) => {
		const recordId = randomUUID()
		const objectPath = `${userId}/${recordId}/${randomUUID()}.webp`
		return {
			objectPath,
			record: {
				artists: [],
				cover_storage_path: objectPath,
				id: recordId,
				labels: [],
				title: `Disposable cleanup smoke ${String(index + 1).padStart(3, '0')}`,
				user_id: userId
			}
		}
	})
}

async function seedRecordsAndObjects(client, descriptors) {
	for (const descriptorBatch of chunk(descriptors, rowBatchSize)) {
		const { error } = await client
			.from('records')
			.insert(descriptorBatch.map(({ record }) => record))
		assertNoApiError(error, 'Disposable managed-cover record creation failed.')
	}

	const bucket = client.storage.from(recordCoverBucket)
	await mapWithConcurrency(
		descriptors,
		uploadConcurrency,
		async ({ objectPath }) => {
			const { error } = await bucket.upload(objectPath, webpFixture, {
				contentType: 'image/webp',
				upsert: false
			})
			assertNoApiError(error, 'Disposable managed-cover upload failed.')
		}
	)
}

function preflightLocalState(databaseUrl) {
	const outboxCount = readInteger({
		databaseUrl,
		sql: 'SELECT count(*) FROM public.record_cover_account_cleanup_jobs;'
	})
	if (outboxCount !== 0) {
		throw new Error(
			'Local account cleanup outbox is not empty; drain it before running the smoke.'
		)
	}
	const expiredUserQuotaCount = readInteger({
		databaseUrl,
		sql: `
			SELECT count(*)
			FROM public.discogs_request_rate_limits
			WHERE reset_at <= statement_timestamp()
				AND bucket_key ~ '^discogs:user:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
		`
	})
	if (expiredUserQuotaCount !== 0) {
		throw new Error(
			'Local expired user quota work exists; prune it before running the smoke.'
		)
	}
}

async function cleanFixture({
	artifacts,
	databaseUrl,
	serviceClient,
	serviceRepository
}) {
	let cleanupUserId = artifacts.userId
	const failures = []
	if (!cleanupUserId) {
		try {
			cleanupUserId = await findUserIdByEmail(serviceClient, artifacts.email)
		} catch {
			failures.push('auth user recovery')
		}
	}

	const steps = []
	if (cleanupUserId) {
		steps.push(
			{
				name: 'auth API user',
				operation: async () => {
					if (!(await serviceRepository.authUserExists(cleanupUserId))) return
					const { error } = await serviceClient.auth.admin.deleteUser(
						cleanupUserId,
						false
					)
					assertNoApiError(error, 'Disposable auth API cleanup failed.')
				}
			},
			{
				name: 'auth database user',
				operation: async () => {
					runLocalSql({
						databaseUrl,
						sql: "DELETE FROM auth.users WHERE id = :'target_user_id'::uuid;",
						variables: { target_user_id: cleanupUserId }
					})
				}
			},
			{
				name: 'managed-cover objects',
				operation: () =>
					removeStoragePaths(
						serviceClient,
						artifacts.descriptors.map(({ objectPath }) => objectPath)
					)
			},
			{
				name: 'record rows',
				operation: async () => {
					runLocalSql({
						databaseUrl,
						sql: "DELETE FROM public.records WHERE user_id = :'target_user_id'::uuid;",
						variables: { target_user_id: cleanupUserId }
					})
				}
			},
			{
				name: 'profile row',
				operation: async () => {
					runLocalSql({
						databaseUrl,
						sql: "DELETE FROM public.profiles WHERE id = :'target_user_id'::uuid;",
						variables: { target_user_id: cleanupUserId }
					})
				}
			},
			{
				name: 'ordinary cover jobs',
				operation: async () => {
					runLocalSql({
						databaseUrl,
						sql: "DELETE FROM public.record_cover_cleanup_jobs WHERE user_id = :'target_user_id'::uuid;",
						variables: { target_user_id: cleanupUserId }
					})
				}
			},
			{
				name: 'account cleanup outbox',
				operation: async () => {
					runLocalSql({
						databaseUrl,
						sql: "DELETE FROM public.record_cover_account_cleanup_jobs WHERE user_id = :'target_user_id'::uuid;",
						variables: { target_user_id: cleanupUserId }
					})
				}
			},
			{
				name: 'user quota row',
				operation: async () => {
					runLocalSql({
						databaseUrl,
						sql: "DELETE FROM public.discogs_request_rate_limits WHERE bucket_key = 'discogs:user:' || :'target_user_id';",
						variables: { target_user_id: cleanupUserId }
					})
				}
			}
		)
	}
	steps.push({
		name: 'unrelated sentinel object',
		operation: () =>
			removeStoragePaths(serviceClient, [artifacts.sentinelObjectPath])
	})
	if (artifacts.globalQuotaCreated) {
		steps.push({
			name: 'global quota sentinel row',
			operation: async () => {
				if (!artifacts.globalQuotaSentinel) {
					throw new Error('Global quota sentinel ownership was incomplete.')
				}
				runLocalSql({
					databaseUrl,
					sql: `
						DELETE FROM public.discogs_request_rate_limits
						WHERE bucket_key = 'discogs:global'
							AND request_count = :'request_count'::integer
							AND reset_at = :'reset_at'::timestamptz;
					`,
					variables: {
						request_count: artifacts.globalQuotaSentinel.requestCount,
						reset_at: artifacts.globalQuotaSentinel.resetAt
					}
				})
			}
		})
	}

	failures.push(...(await runCleanupSteps(steps)))
	if (cleanupUserId) {
		const verificationSteps = [
			{
				name: 'target rows and objects verification',
				operation: async () => {
					const counts = [
						targetObjectCount(databaseUrl, cleanupUserId),
						readInteger({
							databaseUrl,
							sql: "SELECT count(*) FROM auth.users WHERE id = :'target_user_id'::uuid;",
							variables: { target_user_id: cleanupUserId }
						}),
						readInteger({
							databaseUrl,
							sql: "SELECT count(*) FROM public.profiles WHERE id = :'target_user_id'::uuid;",
							variables: { target_user_id: cleanupUserId }
						}),
						targetCountQuery(databaseUrl, 'public.records', cleanupUserId),
						targetCountQuery(
							databaseUrl,
							'public.record_cover_cleanup_jobs',
							cleanupUserId
						),
						targetCountQuery(
							databaseUrl,
							'public.record_cover_account_cleanup_jobs',
							cleanupUserId
						),
						exactRateLimitCount(databaseUrl, `discogs:user:${cleanupUserId}`)
					]
					if (counts.some((count) => count !== 0)) {
						throw new Error('Disposable target cleanup was incomplete.')
					}
				}
			}
		]
		failures.push(...(await runCleanupSteps(verificationSteps)))
	}
	const sentinelCount = exactObjectCount(
		databaseUrl,
		artifacts.sentinelObjectPath
	)
	if (sentinelCount !== 0) failures.push('sentinel object verification')
	if (
		artifacts.globalQuotaCreated &&
		exactRateLimitCount(databaseUrl, 'discogs:global') !== 0
	) {
		failures.push('global quota sentinel verification')
	}
	if (
		!artifacts.globalQuotaCreated &&
		JSON.stringify(readGlobalQuota(databaseUrl)) !==
			JSON.stringify(artifacts.globalQuotaValue)
	) {
		failures.push('pre-existing global quota verification')
	}
	return failures
}

export async function runAccountCoverCleanupSmoke() {
	const configuration = readLocalSupabaseStatus()
	preflightLocalState(configuration.databaseUrl)

	const serviceClient = createLocalClient(
		configuration.apiUrl,
		configuration.serviceRoleKey
	)
	const serviceRepository = createAccountCoverCleanupRepository(serviceClient)
	const runLabel = `${Date.now()}-${randomUUID()}`
	const artifacts = {
		descriptors: [],
		email: `crate-guide-account-cleanup-smoke-${runLabel}@example.invalid`,
		globalQuotaCreated: false,
		globalQuotaSentinel: null,
		globalQuotaValue: null,
		sentinelObjectPath: `${randomUUID()}/${randomUUID()}/${randomUUID()}.webp`,
		userId: null
	}

	let primaryFailure = null
	let proof = null
	try {
		const globalQuota = createGlobalQuotaSentinel(configuration.databaseUrl)
		artifacts.globalQuotaCreated = globalQuota.created
		artifacts.globalQuotaSentinel = globalQuota.sentinel
		artifacts.globalQuotaValue = globalQuota.value

		const sentinelUpload = await serviceClient.storage
			.from(recordCoverBucket)
			.upload(artifacts.sentinelObjectPath, webpFixture, {
				contentType: 'image/webp',
				upsert: false
			})
		assertNoApiError(
			sentinelUpload.error,
			'Unrelated Storage sentinel creation failed.'
		)

		const password = `Cleanup-${randomUUID()}!`
		const createdUser = await serviceClient.auth.admin.createUser({
			email: artifacts.email,
			email_confirm: true,
			password,
			user_metadata: { name: 'Disposable account cleanup smoke' }
		})
		assertNoApiError(createdUser.error, 'Disposable auth user creation failed.')
		if (!createdUser.data.user) {
			throw new Error('Disposable auth user creation was ambiguous.')
		}
		artifacts.userId = createdUser.data.user.id
		artifacts.descriptors = createFixtureDescriptors(artifacts.userId)

		const fixtureClient = createLocalClient(
			configuration.apiUrl,
			configuration.anonKey
		)
		const signIn = await fixtureClient.auth.signInWithPassword({
			email: artifacts.email,
			password
		})
		assertNoApiError(signIn.error, 'Disposable auth user sign-in failed.')
		if (signIn.data.user?.id !== artifacts.userId) {
			throw new Error('Disposable auth user sign-in was ambiguous.')
		}

		console.log(
			`Seeding ${fixtureObjectCount} canonical managed-cover records and objects in the local stack.`
		)
		await seedRecordsAndObjects(fixtureClient, artifacts.descriptors)
		createUserQuotaFixture(configuration.databaseUrl, artifacts.userId)
		assertEqual(
			targetObjectCount(configuration.databaseUrl, artifacts.userId),
			fixtureObjectCount,
			'Disposable managed-cover object seeding was incomplete.'
		)
		assertEqual(
			targetCountQuery(
				configuration.databaseUrl,
				'public.records',
				artifacts.userId
			),
			fixtureObjectCount,
			'Disposable managed-cover record seeding was incomplete.'
		)

		await serviceRepository.schedule(artifacts.userId)
		assertEqual(
			targetCountQuery(
				configuration.databaseUrl,
				'public.record_cover_account_cleanup_jobs',
				artifacts.userId
			),
			1,
			'Durable cleanup intent was not present before Auth deletion.'
		)
		console.log('Durable cleanup intent exists before Auth deletion.')

		const deletedUser = await serviceClient.auth.admin.deleteUser(
			artifacts.userId,
			false
		)
		assertNoApiError(deletedUser.error, 'Disposable auth user deletion failed.')
		assertEqual(
			await serviceRepository.authUserExists(artifacts.userId),
			false,
			'Disposable auth user still exists after deletion.'
		)
		assertEqual(
			targetCountQuery(
				configuration.databaseUrl,
				'public.record_cover_cleanup_jobs',
				artifacts.userId
			),
			fixtureObjectCount,
			'Auth deletion did not create every ordinary cover job.'
		)

		const removalBatchSizes = []
		const observedRepository = {
			...serviceRepository,
			async removeObjects(paths) {
				await serviceRepository.removeObjects(paths)
				removalBatchSizes.push(paths.length)
			}
		}
		proof = await driveAccountCoverCleanup({
			countObjects: () =>
				Promise.resolve(
					targetObjectCount(configuration.databaseUrl, artifacts.userId)
				),
			initialObjectCount: fixtureObjectCount,
			onProgress: ({ invocation, remainingObjectCount }) => {
				console.log(
					`Worker invocation ${invocation}: ${remainingObjectCount} fixture object(s) remain.`
				)
			},
			processNext: () => processNextAccountCoverCleanup(observedRepository)
		})

		assertJsonEqual(
			removalBatchSizes,
			[ACCOUNT_COVER_STORAGE_BATCH_LIMIT, ACCOUNT_COVER_STORAGE_BATCH_LIMIT, 1],
			'The real cleanup repository did not remove the expected bounded pages.'
		)
		assertEqual(
			targetCountQuery(
				configuration.databaseUrl,
				'public.record_cover_account_cleanup_jobs',
				artifacts.userId
			),
			0,
			'Completed account cleanup retained its outbox row.'
		)
		assertEqual(
			targetCountQuery(
				configuration.databaseUrl,
				'public.record_cover_cleanup_jobs',
				artifacts.userId
			),
			0,
			'Completed account cleanup retained ordinary cover jobs.'
		)
		assertEqual(
			exactRateLimitCount(
				configuration.databaseUrl,
				`discogs:user:${artifacts.userId}`
			),
			0,
			'Completed account cleanup retained its user quota row.'
		)
		assertEqual(
			exactObjectCount(configuration.databaseUrl, artifacts.sentinelObjectPath),
			1,
			'Account cleanup removed the unrelated Storage sentinel.'
		)
		assertJsonEqual(
			readGlobalQuota(configuration.databaseUrl),
			artifacts.globalQuotaValue,
			'Account cleanup changed the global quota sentinel.'
		)
	} catch (error) {
		primaryFailure =
			error instanceof Error
				? error
				: new Error('Account cleanup smoke failed unexpectedly.')
	}

	const cleanupFailures = await cleanFixture({
		artifacts,
		databaseUrl: configuration.databaseUrl,
		serviceClient,
		serviceRepository
	})
	if (cleanupFailures.length) {
		throw new Error(
			`Account cleanup smoke could not remove: ${cleanupFailures.join(', ')}.`
		)
	}
	if (primaryFailure) throw primaryFailure

	console.log(
		`Account cleanup smoke passed in ${proof.invocations} bounded worker invocations; every disposable artifact was removed.`
	)
	return proof
}

async function main() {
	if (process.argv.length !== 2) {
		throw new Error('Usage: npm run smoke:account-cleanup')
	}
	await runAccountCoverCleanupSmoke()
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	main().catch((error) => {
		console.error(error instanceof Error ? error.message : 'Smoke failed.')
		process.exitCode = 1
	})
}
