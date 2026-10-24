#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import {
	coverFile,
	downloadCover,
	sha256,
	verifyFiles
} from './recovery-core.mjs'
import {
	readLocalSupabaseStatus,
	runLocalSql
} from './smoke-account-cover-cleanup.mjs'

// Deliberately uses the existing strict localhost/port guard before any write.
const configuration = readLocalSupabaseStatus()
const client = createClient(
	configuration.apiUrl,
	configuration.serviceRoleKey,
	{ auth: { persistSession: false, autoRefreshToken: false } }
)
const directory = mkdtempSync(resolve(tmpdir(), 'crate-guide-recovery-cover-'))
const recordId = randomUUID()
const email = `crate-guide-recovery-${randomUUID()}@example.invalid`
const password = `${randomUUID()}Aa9!`
const bytes = Buffer.from(
	'UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA',
	'base64'
)
let userId
let path
const command = (binary, args) => {
	const result = spawnSync(binary, args, { encoding: 'utf8', timeout: 30_000 })
	assert.equal(result.status, 0, `${binary} failed; private output suppressed`)
	return result.stdout
}

process.umask(0o077)
try {
	const created = await client.auth.admin.createUser({
		email,
		email_confirm: true,
		password,
		user_metadata: { name: 'Disposable recovery cover fixture' }
	})
	assert.equal(created.error, null)
	userId = created.data.user.id
	path = `${userId}/${recordId}/${randomUUID()}.webp`
	const owner = createClient(configuration.apiUrl, configuration.anonKey, {
		auth: { persistSession: false, autoRefreshToken: false }
	})
	assert.equal(
		(await owner.auth.signInWithPassword({ email, password })).error,
		null
	)
	assert.equal(
		(
			await owner.from('records').insert({
				id: recordId,
				user_id: userId,
				title: 'Disposable recovery fixture',
				artists: [],
				labels: [],
				cover_storage_path: path
			})
		).error,
		null
	)
	assert.equal(
		(
			await client.storage
				.from('record-covers')
				.upload(path, bytes, { contentType: 'image/webp', upsert: false })
		).error,
		null
	)
	const metadata = JSON.parse(
		runLocalSql({
			databaseUrl: configuration.databaseUrl,
			sql: "SELECT metadata FROM storage.objects WHERE bucket_id='record-covers' AND name=:'object_path';",
			variables: { object_path: path }
		})
	)
	const captured = await downloadCover({
		apiUrl: configuration.apiUrl,
		apiKey: configuration.serviceRoleKey,
		path,
		expectedSize: metadata.size,
		expectedEtag: metadata.eTag
	})
	assert.equal(captured.sha256, sha256(bytes))
	mkdirSync(resolve(directory, 'covers'), { mode: 0o700 })
	const filename = coverFile(path)
	writeFileSync(resolve(directory, filename), captured.bytes, { mode: 0o600 })
	const files = { [filename]: { size: captured.size, sha256: captured.sha256 } }
	const identity = resolve(directory, 'fixture.agekey')
	command('age-keygen', ['--output', identity])
	const recipient = command('age-keygen', ['--y', identity]).trim()
	const archive = resolve(directory, 'fixture.tar.gz')
	const encrypted = resolve(directory, 'fixture.tar.gz.age')
	command('tar', ['-czf', archive, '-C', directory, filename])
	command('age', [
		'--encrypt',
		'--recipient',
		recipient,
		'--output',
		encrypted,
		archive
	])
	rmSync(resolve(directory, 'covers'), { recursive: true })
	rmSync(archive)
	command('age', [
		'--decrypt',
		'--identity',
		identity,
		'--output',
		archive,
		encrypted
	])
	command('tar', ['-xzf', archive, '-C', directory])
	verifyFiles(directory, files)
	assert.deepEqual(readFileSync(resolve(directory, filename)), bytes)
	console.log(
		'Synthetic local Storage cover downloaded, encrypted, restored and checksum verified.'
	)
} finally {
	const failures = []
	if (!userId)
		userId =
			runLocalSql({
				databaseUrl: configuration.databaseUrl,
				sql: "SELECT id FROM auth.users WHERE email=:'fixture_email' AND raw_user_meta_data->>'name'='Disposable recovery cover fixture';",
				variables: { fixture_email: email }
			}) || undefined
	if (path) {
		const result = await client.storage.from('record-covers').remove([path])
		if (result.error) failures.push('cover cleanup')
	}
	if (userId) {
		const result = await client.auth.admin.deleteUser(userId)
		if (result.error) failures.push('Auth cleanup')
		runLocalSql({
			databaseUrl: configuration.databaseUrl,
			sql: "DELETE FROM public.record_cover_cleanup_jobs WHERE user_id=:'fixture_id'::uuid; DELETE FROM public.record_cover_account_cleanup_jobs WHERE user_id=:'fixture_id'::uuid;",
			variables: { fixture_id: userId }
		})
		const remaining = runLocalSql({
			databaseUrl: configuration.databaseUrl,
			sql: "SELECT (SELECT count(*) FROM auth.users WHERE id=:'fixture_id'::uuid) + (SELECT count(*) FROM public.records WHERE user_id=:'fixture_id'::uuid) + (SELECT count(*) FROM storage.objects WHERE bucket_id='record-covers' AND name LIKE :'fixture_id' || '/%') + (SELECT count(*) FROM public.record_cover_account_cleanup_jobs WHERE user_id=:'fixture_id'::uuid) + (SELECT count(*) FROM public.record_cover_cleanup_jobs WHERE user_id=:'fixture_id'::uuid);",
			variables: { fixture_id: userId }
		})
		if (Number(remaining)) failures.push('fixture readback')
	}
	rmSync(directory, { recursive: true, force: true })
	assert.deepEqual(failures, [], 'Recovery fixture cleanup failed')
}
