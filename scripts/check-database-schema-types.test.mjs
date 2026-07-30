import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, test } from 'node:test'
import { checkDatabaseSchemaTypes } from './check-database-schema-types.mjs'

const temporaryDirectories = []

afterEach(async () => {
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((directory) => rm(directory, { force: true, recursive: true }))
	)
})

async function createFixture(trackedContent) {
	const root = await mkdtemp(join(tmpdir(), 'crate-guide-schema-check-'))
	const scratch = await mkdtemp(join(tmpdir(), 'crate-guide-schema-scratch-'))
	temporaryDirectories.push(root, scratch)
	await Promise.all([
		mkdir(join(root, 'shared', 'types'), { recursive: true }),
		mkdir(join(root, 'supabase', 'functions', '_shared', 'types'), {
			recursive: true
		})
	])
	await Promise.all([
		writeFile(join(root, 'shared', 'types', 'database.ts'), trackedContent),
		writeFile(
			join(root, 'supabase', 'functions', '_shared', 'types', 'database.ts'),
			trackedContent
		)
	])
	return { root, scratch }
}

test('compares formatted live output without changing tracked files', async () => {
	const tracked = 'export type Database = { current: true }\n'
	const fixture = await createFixture(tracked)

	await checkDatabaseSchemaTypes({
		commandRunner: () => ({
			status: 0,
			stdout: 'export type Database={current:true}'
		}),
		formatter: async () => tracked,
		root: fixture.root,
		temporaryRoot: fixture.scratch
	})

	assert.equal(
		await readFile(
			join(fixture.root, 'shared', 'types', 'database.ts'),
			'utf8'
		),
		tracked
	)
})

test('fails when two identical tracked copies are stale', async () => {
	const fixture = await createFixture(
		'export type Database = { stale: true }\n'
	)

	await assert.rejects(
		checkDatabaseSchemaTypes({
			commandRunner: () => ({
				status: 0,
				stdout: 'export type Database={current:true}'
			}),
			formatter: async () => 'export type Database = { current: true }\n',
			root: fixture.root,
			temporaryRoot: fixture.scratch
		}),
		/differ from the migrated schema/
	)
})
