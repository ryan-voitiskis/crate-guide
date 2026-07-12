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

async function createFixture({ filesExist = true } = {}) {
	const root = await mkdtemp(join(tmpdir(), 'crate-guide-typegen-'))
	const canonicalDirectory = join(root, 'shared', 'types')
	const edgeDirectory = join(root, 'supabase', 'functions', '_shared', 'types')
	const canonicalPath = join(canonicalDirectory, 'database.ts')
	const edgePath = join(edgeDirectory, 'database.ts')
	temporaryDirectories.push(root)
	await Promise.all([
		mkdir(canonicalDirectory, { recursive: true }),
		mkdir(edgeDirectory, { recursive: true })
	])

	if (filesExist) {
		await Promise.all([
			writeFile(canonicalPath, 'canonical original\n'),
			writeFile(edgePath, 'edge original\n')
		])
	}

	return {
		canonicalDirectory,
		canonicalPath,
		edgeDirectory,
		edgePath,
		root
	}
}

function createOptions(fixture, overrides = {}) {
	return {
		canonicalPath: fixture.canonicalPath,
		commandRunner: () => ({ status: 0, stdout: generatedSource }),
		edgePath: fixture.edgePath,
		formatter: async (source) => `${source.trim()}\n`,
		workingDirectory: fixture.root,
		...overrides
	}
}

async function readFixtureFiles(fixture) {
	return Promise.all([
		readFile(fixture.canonicalPath),
		readFile(fixture.edgePath)
	])
}

async function assertNoTemporaryFiles(fixture) {
	const entries = await Promise.all([
		readdir(fixture.canonicalDirectory),
		readdir(fixture.edgeDirectory)
	])

	assert.deepEqual(
		entries.flat().filter((entry) => entry.includes('.tmp-')),
		[]
	)
}

test('writes identical validated output to both destinations', async () => {
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

	const [canonicalContent, edgeContent] = await readFixtureFiles(fixture)
	assert.equal(canonicalContent.toString(), `${generatedSource}\n`)
	assert.deepEqual(canonicalContent, edgeContent)
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

test('preserves both destination bytes when generation fails', async () => {
	const fixture = await createFixture()
	const before = await readFixtureFiles(fixture)

	await assert.rejects(
		generateDatabaseTypes(
			createOptions(fixture, {
				commandRunner: () => ({ status: 1, stdout: generatedSource })
			})
		),
		/exited with status 1/
	)

	assert.deepEqual(await readFixtureFiles(fixture), before)
	await assertNoTemporaryFiles(fixture)
})

test('preserves both destination bytes when output is empty', async () => {
	const fixture = await createFixture()
	const before = await readFixtureFiles(fixture)

	await assert.rejects(
		generateDatabaseTypes(
			createOptions(fixture, {
				commandRunner: () => ({ status: 0, stdout: ' \n' })
			})
		),
		/returned empty output/
	)

	assert.deepEqual(await readFixtureFiles(fixture), before)
	await assertNoTemporaryFiles(fixture)
})

test('preserves both destination bytes when the Database type is missing', async () => {
	const fixture = await createFixture()
	const before = await readFixtureFiles(fixture)

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

	assert.deepEqual(await readFixtureFiles(fixture), before)
	await assertNoTemporaryFiles(fixture)
})

test('restores both originals when replacing the second destination fails', async () => {
	const fixture = await createFixture()
	const before = await readFixtureFiles(fixture)
	let replacementCount = 0

	await assert.rejects(
		generateDatabaseTypes(
			createOptions(fixture, {
				replaceDestination: async (source, destination) => {
					replacementCount += 1

					if (replacementCount === 2) {
						throw new Error('simulated replacement failure')
					}

					await rename(source, destination)
				}
			})
		),
		/original files were restored/
	)

	assert.equal(replacementCount, 2)
	assert.deepEqual(await readFixtureFiles(fixture), before)
	await assertNoTemporaryFiles(fixture)
})

test('restores absent destinations when replacement fails', async () => {
	const fixture = await createFixture({ filesExist: false })
	let replacementCount = 0

	await assert.rejects(
		generateDatabaseTypes(
			createOptions(fixture, {
				replaceDestination: async (source, destination) => {
					replacementCount += 1
					await rename(source, destination)

					if (replacementCount === 2) {
						throw new Error('simulated failure after replacement')
					}
				}
			})
		),
		/original files were restored/
	)

	await Promise.all([
		assert.rejects(readFile(fixture.canonicalPath), { code: 'ENOENT' }),
		assert.rejects(readFile(fixture.edgePath), { code: 'ENOENT' })
	])
	await assertNoTemporaryFiles(fixture)
})
