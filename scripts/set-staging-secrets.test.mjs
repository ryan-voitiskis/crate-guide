import assert from 'node:assert/strict'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
	buildStagingSecretsCommand,
	prepareStagingSecretsCommand,
	readStagingProjectRef
} from './set-staging-secrets.mjs'

const stagingRef = 'abcdefghijklmnopqrst'

test('builds an exact argument array for the authoritative target', () => {
	assert.deepEqual(
		buildStagingSecretsCommand({
			authoritativeProjectRef: stagingRef,
			envFile: '/tmp/function.env',
			supabaseBinary: '/repo/node_modules/.bin/supabase'
		}),
		{
			args: [
				'secrets',
				'set',
				'--project-ref',
				stagingRef,
				'--env-file',
				'/tmp/function.env'
			],
			command: '/repo/node_modules/.bin/supabase'
		}
	)
})

test('rejects missing and different project refs', () => {
	assert.throws(
		() => buildStagingSecretsCommand({ authoritativeProjectRef: undefined }),
		/upload is disabled/
	)
	assert.throws(
		() =>
			buildStagingSecretsCommand({
				authoritativeProjectRef: stagingRef,
				requestedProjectRef: 'zyxwvutsrqponmlkjihg'
			}),
		/does not match/
	)
})

test('fails closed when the source-controlled staging record is absent', async () => {
	await assert.rejects(
		readStagingProjectRef('/missing/staging-project.json'),
		/supplied by a maintainer/
	)
})

test('validates the env file and locked CLI before a dry run', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'crate-guide-staging-'))
	const recordPath = join(directory, 'staging-project.json')
	const envFile = join(directory, 'functions.env')
	const binary = join(directory, 'supabase')
	await Promise.all([
		writeFile(recordPath, JSON.stringify({ supabaseProjectRef: stagingRef })),
		writeFile(envFile, 'SITE_URL=https://example.test\n'),
		writeFile(binary, '#!/bin/sh\n')
	])
	await import('node:fs/promises').then(({ chmod }) => chmod(binary, 0o755))

	assert.deepEqual(
		await prepareStagingSecretsCommand({
			envFile,
			recordPath,
			supabaseBinary: binary
		}),
		{
			args: [
				'secrets',
				'set',
				'--project-ref',
				stagingRef,
				'--env-file',
				envFile
			],
			command: binary
		}
	)

	await mkdir(join(directory, 'missing-parent'), { recursive: true })
	await assert.rejects(
		prepareStagingSecretsCommand({
			envFile: join(directory, 'missing.env'),
			recordPath,
			supabaseBinary: binary
		}),
		/readable function env file/
	)
})
