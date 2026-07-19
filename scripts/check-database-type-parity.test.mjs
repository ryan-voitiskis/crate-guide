import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, test } from 'node:test'
import { checkDatabaseTypeParity } from './check-database-type-parity.mjs'

const temporaryDirectories = []

afterEach(async () => {
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((directory) => rm(directory, { force: true, recursive: true }))
	)
})

async function createFixture({
	canonicalContent = 'export type Database = {}\n',
	edgeContent = canonicalContent,
	missing
} = {}) {
	const root = await mkdtemp(join(tmpdir(), 'crate-guide-type-parity-'))
	const canonicalPath = join(root, 'shared', 'types', 'database.ts')
	const edgePath = join(
		root,
		'supabase',
		'functions',
		'_shared',
		'types',
		'database.ts'
	)
	temporaryDirectories.push(root)
	await Promise.all([
		mkdir(join(root, 'shared', 'types'), { recursive: true }),
		mkdir(join(root, 'supabase', 'functions', '_shared', 'types'), {
			recursive: true
		})
	])

	await Promise.all([
		...(missing === 'canonical'
			? []
			: [writeFile(canonicalPath, canonicalContent)]),
		...(missing === 'edge' ? [] : [writeFile(edgePath, edgeContent)])
	])

	return { canonicalPath, edgePath }
}

test('accepts identical nonempty generated type files', async () => {
	const fixture = await createFixture()

	await assert.doesNotReject(checkDatabaseTypeParity(fixture))
})

test('rejects one-byte drift and names both files', async () => {
	const fixture = await createFixture({
		edgeContent: 'export type Database = { }\n'
	})

	await assert.rejects(checkDatabaseTypeParity(fixture), (error) => {
		assert.match(error.message, /Generated database type files differ/)
		assert.match(error.message, /shared\/types\/database\.ts/)
		assert.match(
			error.message,
			/supabase\/functions\/_shared\/types\/database\.ts/
		)
		return true
	})
})

test('rejects a missing canonical file and names it', async () => {
	const fixture = await createFixture({ missing: 'canonical' })

	await assert.rejects(checkDatabaseTypeParity(fixture), (error) => {
		assert.match(error.message, /is missing/)
		assert.match(error.message, /shared\/types\/database\.ts/)
		assert.match(
			error.message,
			/supabase\/functions\/_shared\/types\/database\.ts/
		)
		return true
	})
})

test('rejects a missing edge file and names it', async () => {
	const fixture = await createFixture({ missing: 'edge' })

	await assert.rejects(checkDatabaseTypeParity(fixture), (error) => {
		assert.match(error.message, /is missing/)
		assert.match(error.message, /shared\/types\/database\.ts/)
		assert.match(
			error.message,
			/supabase\/functions\/_shared\/types\/database\.ts/
		)
		return true
	})
})

test('rejects one empty file and names both', async () => {
	const fixture = await createFixture({
		canonicalContent: '',
		edgeContent: 'export type Database = {}\n'
	})

	await assert.rejects(checkDatabaseTypeParity(fixture), (error) => {
		assert.match(error.message, /must be nonempty/)
		assert.match(error.message, /shared\/types\/database\.ts/)
		assert.match(
			error.message,
			/supabase\/functions\/_shared\/types\/database\.ts/
		)
		return true
	})
})
