import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, test } from 'node:test'
import { checkDatabaseSchemaTypes } from './check-database-schema-types.mjs'

const temporaryDirectories = []
const currentSource = 'export type Database={current:true}'
const currentFormatted = 'export type Database = { current: true }\n'

afterEach(async () => {
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((directory) => rm(directory, { force: true, recursive: true }))
	)
})

async function createFixture(trackedContent) {
	const root = await mkdtemp(join(tmpdir(), 'crate-guide-schema-check-'))
	temporaryDirectories.push(root)
	await mkdir(join(root, 'shared', 'types'), { recursive: true })
	if (trackedContent !== undefined) {
		await writeFile(
			join(root, 'shared', 'types', 'database.ts'),
			trackedContent
		)
	}
	return root
}

function checkAgainst(root, overrides = {}) {
	return checkDatabaseSchemaTypes({
		commandRunner: () => ({ status: 0, stdout: currentSource }),
		formatter: async () => currentFormatted,
		root,
		...overrides
	})
}

test('compares formatted live output without changing the tracked file', async () => {
	const root = await createFixture(currentFormatted)
	let formattedPath

	await checkAgainst(root, {
		formatter: async (_source, filepath) => {
			formattedPath = filepath
			return currentFormatted
		}
	})

	assert.equal(formattedPath, join(root, 'shared', 'types', 'database.ts'))
	assert.equal(
		await readFile(join(root, 'shared', 'types', 'database.ts'), 'utf8'),
		currentFormatted
	)
})

test('fails when the tracked file is stale against the migrated schema', async () => {
	const root = await createFixture('export type Database = { stale: true }\n')

	await assert.rejects(checkAgainst(root), (error) => {
		assert.match(error.message, /differ from the migrated schema/)
		assert.match(error.message, /shared\/types\/database\.ts/)
		return true
	})
})

test('fails when the tracked file drifts by one byte', async () => {
	const root = await createFixture('export type Database = { current: true }')

	await assert.rejects(checkAgainst(root), /differ from the migrated schema/)
})

test('fails when the tracked file is missing', async () => {
	const root = await createFixture()

	await assert.rejects(checkAgainst(root), (error) => {
		assert.match(error.message, /could not be read/)
		assert.match(error.message, /shared\/types\/database\.ts/)
		assert.equal(error.cause?.code, 'ENOENT')
		return true
	})
})

test('fails when the tracked file is empty', async () => {
	const root = await createFixture('')

	await assert.rejects(checkAgainst(root), /are empty/)
})

test('fails when the generator exits unsuccessfully', async () => {
	const root = await createFixture(currentFormatted)

	await assert.rejects(
		checkAgainst(root, {
			commandRunner: () => ({ status: 1, stdout: currentSource })
		}),
		/exited with status 1/
	)
})

test('fails when the generator returns output without the Database type', async () => {
	const root = await createFixture(currentFormatted)

	await assert.rejects(
		checkAgainst(root, {
			commandRunner: () => ({ status: 0, stdout: 'export type Other = {}' })
		}),
		/returned invalid output/
	)
})
