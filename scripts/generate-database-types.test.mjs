import assert from 'node:assert/strict'
import {
	mkdir,
	mkdtemp,
	readFile,
	readdir,
	rename,
	rm,
	writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, test } from 'node:test'
import { generateDatabaseTypes } from './generate-database-types.mjs'

const temporaryDirectories = []
const generatedSource = 'export type Database={public:{Tables:{}}}'

afterEach(async () => {
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((directory) => rm(directory, { force: true, recursive: true }))
	)
})

async function createFixture({ fileExists = true } = {}) {
	const root = await mkdtemp(join(tmpdir(), 'crate-guide-typegen-'))
	const canonicalDirectory = join(root, 'shared', 'types')
	const canonicalPath = join(canonicalDirectory, 'database.ts')
	temporaryDirectories.push(root)
	await mkdir(canonicalDirectory, { recursive: true })

	if (fileExists) {
		await writeFile(canonicalPath, 'canonical original\n')
	}

	return { canonicalDirectory, canonicalPath, root }
}

function createOptions(fixture, overrides = {}) {
	return {
		canonicalPath: fixture.canonicalPath,
		commandRunner: () => ({ status: 0, stdout: generatedSource }),
		formatter: async (source) => `${source.trim()}\n`,
		workingDirectory: fixture.root,
		...overrides
	}
}

async function assertNoTemporaryFiles(fixture) {
	const entries = await readdir(fixture.canonicalDirectory)

	assert.deepEqual(
		entries.filter((entry) => entry.includes('.tmp-')),
		[]
	)
}

test('writes validated output to the canonical destination', async () => {
	const fixture = await createFixture()
	let commandInvocation

	await generateDatabaseTypes(
		createOptions(fixture, {
			commandRunner: (...args) => {
				commandInvocation = args
				return { status: 0, stdout: generatedSource }
			}
		})
	)

	assert.equal(
		await readFile(fixture.canonicalPath, 'utf8'),
		`${generatedSource}\n`
	)
	assert.deepEqual(commandInvocation, [
		'supabase',
		['gen', 'types', '--lang=typescript', '--local'],
		{
			cwd: fixture.root,
			encoding: 'utf8',
			shell: false
		}
	])
	await assertNoTemporaryFiles(fixture)
})

test('preserves the destination bytes when generation fails', async () => {
	const fixture = await createFixture()
	const before = await readFile(fixture.canonicalPath)

	await assert.rejects(
		generateDatabaseTypes(
			createOptions(fixture, {
				commandRunner: () => ({ status: 1, stdout: generatedSource })
			})
		),
		/exited with status 1/
	)

	assert.deepEqual(await readFile(fixture.canonicalPath), before)
	await assertNoTemporaryFiles(fixture)
})

test('preserves the destination bytes when output is empty', async () => {
	const fixture = await createFixture()
	const before = await readFile(fixture.canonicalPath)

	await assert.rejects(
		generateDatabaseTypes(
			createOptions(fixture, {
				commandRunner: () => ({ status: 0, stdout: ' \n' })
			})
		),
		/returned empty output/
	)

	assert.deepEqual(await readFile(fixture.canonicalPath), before)
	await assertNoTemporaryFiles(fixture)
})

test('preserves the destination bytes when the Database type is missing', async () => {
	const fixture = await createFixture()
	const before = await readFile(fixture.canonicalPath)

	await assert.rejects(
		generateDatabaseTypes(
			createOptions(fixture, {
				commandRunner: () => ({
					status: 0,
					stdout: 'export type PublicSchema = {}'
				})
			})
		),
		/output without the Database type/
	)

	assert.deepEqual(await readFile(fixture.canonicalPath), before)
	await assertNoTemporaryFiles(fixture)
})

test('restores the original when replacement fails after renaming', async () => {
	const fixture = await createFixture()
	const before = await readFile(fixture.canonicalPath)
	let replacementCount = 0

	await assert.rejects(
		generateDatabaseTypes(
			createOptions(fixture, {
				replaceDestination: async (source, destination) => {
					replacementCount += 1
					await rename(source, destination)
					throw new Error('simulated failure after replacement')
				}
			})
		),
		/original file was restored/
	)

	assert.equal(replacementCount, 1)
	assert.deepEqual(await readFile(fixture.canonicalPath), before)
	await assertNoTemporaryFiles(fixture)
})

test('preserves the original when replacement fails before renaming', async () => {
	const fixture = await createFixture()
	const before = await readFile(fixture.canonicalPath)

	await assert.rejects(
		generateDatabaseTypes(
			createOptions(fixture, {
				replaceDestination: async () => {
					throw new Error('simulated replacement failure')
				}
			})
		),
		/original file was restored/
	)

	assert.deepEqual(await readFile(fixture.canonicalPath), before)
	await assertNoTemporaryFiles(fixture)
})

test('removes an absent destination when replacement fails', async () => {
	const fixture = await createFixture({ fileExists: false })

	await assert.rejects(
		generateDatabaseTypes(
			createOptions(fixture, {
				replaceDestination: async (source, destination) => {
					await rename(source, destination)
					throw new Error('simulated failure after replacement')
				}
			})
		),
		/original file was restored/
	)

	await assert.rejects(readFile(fixture.canonicalPath), { code: 'ENOENT' })
	await assertNoTemporaryFiles(fixture)
})
