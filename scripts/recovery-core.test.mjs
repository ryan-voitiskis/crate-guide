import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import test from 'node:test'
import {
	assertPrivateDirectory,
	assertRestoreContainer,
	coverFile,
	downloadCover,
	sha256,
	sqlLiteral,
	vaultRestoreSql,
	verifyFiles
} from './recovery-core.mjs'

test('rejects recovery files inside the checkout and path traversal in cover names', () => {
	assert.throws(() => assertPrivateDirectory('/repo/private', '/repo'))
	assert.equal(
		assertPrivateDirectory('/private/recovery', '/repo'),
		'/private/recovery'
	)
	for (const path of ['../x', '/etc/passwd', 'x/../y', 'x\\y', 'x\ny', 'x//y'])
		assert.throws(() => coverFile(path))
	assert.match(
		coverFile('owner/record/cover.webp'),
		/^covers\/[a-f0-9]{64}\.bin$/
	)
})

test('missing, redirected, same-size changed and truncated covers fail capture without exposing credentials', async () => {
	const bytes = Buffer.from('synthetic cover')
	const etag = createHash('md5').update(bytes).digest('hex')
	const options = {
		apiUrl: 'https://czlfiwivlgqhqezmywfx.supabase.co',
		apiKey: 'private-key',
		path: 'owner/record/cover.webp',
		expectedSize: bytes.length,
		expectedEtag: etag
	}
	let request
	const result = await downloadCover({
		...options,
		fetchFn: async (url, init) => {
			request = { url, init }
			return new Response(bytes, { headers: { etag: `"${etag}"` } })
		}
	})
	assert.equal(result.sha256, sha256(bytes))
	assert.equal(request.init.redirect, 'error')
	assert.equal(request.init.headers.apikey, 'private-key')
	for (const response of [
		new Response(null, { status: 404 }),
		new Response(null, { status: 302 }),
		new Response(Buffer.from('different cover')),
		new Response(Buffer.from('short'))
	]) {
		await assert.rejects(
			downloadCover({ ...options, fetchFn: async () => response }),
			(error) => !error.message.includes('private-key')
		)
	}
	await assert.rejects(
		downloadCover({
			...options,
			apiUrl: 'https://other.supabase.co',
			fetchFn: () => assert.fail('Unexpected source requested')
		})
	)
})

test('manifest verification rejects tampering and unexpected files', () => {
	const directory = mkdtempSync(resolve(tmpdir(), 'crate-recovery-test-'))
	try {
		writeFileSync(resolve(directory, 'data.sql'), 'original')
		const files = { 'data.sql': { size: 8, sha256: sha256('original') } }
		verifyFiles(directory, files)
		writeFileSync(resolve(directory, 'data.sql'), 'modified')
		assert.throws(() => verifyFiles(directory, files), /checksum/)
		assert.throws(
			() => verifyFiles(directory, { '../secret': files['data.sql'] }),
			/path/
		)
	} finally {
		rmSync(directory, { recursive: true })
	}
})

test('restore SQL and cleanup reject another container, network access or an exposed port', () => {
	const container = {
		Config: { Labels: { 'guide.crate.recovery': 'run-id' } },
		HostConfig: { NetworkMode: 'none', PortBindings: {} }
	}
	assertRestoreContainer(container, 'run-id')
	assert.throws(() => assertRestoreContainer(container, 'different-run'))
	assert.throws(() =>
		assertRestoreContainer(
			{ ...container, HostConfig: { NetworkMode: 'bridge' } },
			'run-id'
		)
	)
	assert.throws(() =>
		assertRestoreContainer(
			{
				...container,
				HostConfig: {
					...container.HostConfig,
					PortBindings: { '5432/tcp': [{}] }
				}
			},
			'run-id'
		)
	)
})

test('Vault recovery escapes values and binds encryption to the original UUID', () => {
	assert.equal(sqlLiteral("secret'value"), "'secret''value'")
	assert.equal(sqlLiteral(null), 'NULL')
	const sql = vaultRestoreSql([
		{
			id: 'original-id',
			name: 'test',
			description: '',
			decrypted_secret: "secret'value",
			created_at: null,
			updated_at: null
		}
	])
	assert.match(sql, /secret''value/)
	assert.match(sql, /additional:=convert_to\(id::text,'utf8'\)/)
	assert.match(sql, /WHERE id='original-id'::uuid/)
})
