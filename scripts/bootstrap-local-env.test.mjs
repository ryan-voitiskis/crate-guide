import assert from 'node:assert/strict'
import { chmod, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
	bootstrapLocalEnv,
	decodeLocalSupabaseStatus,
	renderLocalEnv
} from './bootstrap-local-env.mjs'

const publicKey = 'public-local-anon-key'

test('decodes only the reserved public local values', () => {
	assert.deepEqual(
		decodeLocalSupabaseStatus(
			JSON.stringify({
				ANON_KEY: publicKey,
				API_URL: 'http://127.0.0.1:42821',
				SERVICE_ROLE_KEY: 'must-not-be-used'
			})
		),
		{ key: publicKey, url: 'http://127.0.0.1:42821' }
	)
	assert.equal(
		renderLocalEnv({ key: publicKey, url: 'http://127.0.0.1:42821' }).includes(
			'SERVICE_ROLE'
		),
		false
	)
})

test('writes a private public-only env file and refuses overwrite', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'crate-guide-local-env-'))
	const envPath = join(directory, '.env')
	const binary = join(directory, 'supabase')
	await writeFile(binary, '#!/bin/sh\n')
	await chmod(binary, 0o755)
	const commandRunner = () => ({
		status: 0,
		stdout: JSON.stringify({
			ANON_KEY: publicKey,
			API_URL: 'http://127.0.0.1:42821',
			SERVICE_ROLE_KEY: 'private-service-role'
		})
	})

	await bootstrapLocalEnv({ commandRunner, envPath, supabaseBinary: binary })
	const content = await readFile(envPath, 'utf8')
	assert.equal(content.includes(publicKey), true)
	assert.equal(content.includes('private-service-role'), false)
	await assert.rejects(
		bootstrapLocalEnv({ commandRunner, envPath, supabaseBinary: binary }),
		/already exists/
	)
})

test('rejects a status response on the wrong local port', () => {
	assert.throws(
		() =>
			decodeLocalSupabaseStatus(
				JSON.stringify({
					ANON_KEY: publicKey,
					API_URL: 'http://127.0.0.1:54321'
				})
			),
		/reserved API port 42821/
	)
})
