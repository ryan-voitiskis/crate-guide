import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { chmod, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { format, resolveConfig } from 'prettier'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const defaultCanonicalPath = resolve(repositoryRoot, 'shared/types/database.ts')

function runSupabaseGenerator(command, args, options) {
	return spawnSync(command, args, options)
}

async function formatWithPrettier(source, { filepath }) {
	const config = (await resolveConfig(filepath)) ?? {}

	return format(source, {
		...config,
		filepath
	})
}

async function readOriginalState(filepath) {
	try {
		const [content, fileStats] = await Promise.all([
			readFile(filepath),
			stat(filepath)
		])

		return {
			content,
			exists: true,
			mode: fileStats.mode & 0o777
		}
	} catch (error) {
		if (error?.code === 'ENOENT') {
			return {
				content: null,
				exists: false,
				mode: null
			}
		}

		throw error
	}
}

function createTemporaryPath(filepath) {
	return resolve(
		dirname(filepath),
		`.${basename(filepath)}.tmp-${process.pid}-${randomUUID()}`
	)
}

async function writeTemporaryFile(filepath, content, temporaryPaths, mode) {
	const temporaryPath = createTemporaryPath(filepath)
	temporaryPaths.add(temporaryPath)
	await writeFile(temporaryPath, content, {
		flag: 'wx',
		...(mode === null ? {} : { mode })
	})

	return temporaryPath
}

async function restoreDestination(filepath, originalState, temporaryPaths) {
	if (!originalState.exists) {
		await rm(filepath, { force: true })
		return
	}

	const temporaryPath = await writeTemporaryFile(
		filepath,
		originalState.content,
		temporaryPaths,
		originalState.mode
	)
	await rename(temporaryPath, filepath)
	temporaryPaths.delete(temporaryPath)
	await chmod(filepath, originalState.mode)
}

async function removeTemporaryFiles(temporaryPaths) {
	await Promise.all(
		[...temporaryPaths].map((temporaryPath) =>
			rm(temporaryPath, { force: true })
		)
	)
}

export async function generateDatabaseTypes({
	canonicalPath = defaultCanonicalPath,
	commandRunner = runSupabaseGenerator,
	formatter = formatWithPrettier,
	replaceDestination = rename,
	workingDirectory = repositoryRoot
} = {}) {
	const originalState = await readOriginalState(canonicalPath)
	const temporaryPaths = new Set()

	try {
		let generatorResult

		try {
			generatorResult = await commandRunner(
				'supabase',
				['gen', 'types', '--lang=typescript', '--local'],
				{
					cwd: workingDirectory,
					encoding: 'utf8',
					shell: false
				}
			)
		} catch {
			throw new Error('Could not run the Supabase type generator')
		}

		if (generatorResult?.error) {
			throw new Error('Could not run the Supabase type generator')
		}

		if (generatorResult?.status !== 0) {
			throw new Error(
				`Supabase type generation exited with status ${String(generatorResult?.status)}`
			)
		}

		const generatedOutput = String(generatorResult.stdout ?? '')

		if (generatedOutput.trim().length === 0) {
			throw new Error('Supabase type generation returned empty output')
		}

		if (!generatedOutput.includes('export type Database')) {
			throw new Error(
				'Supabase type generation returned output without the Database type'
			)
		}

		const formattedOutput = await formatter(generatedOutput, {
			filepath: canonicalPath,
			workingDirectory
		})

		if (
			typeof formattedOutput !== 'string' ||
			formattedOutput.trim().length === 0 ||
			!formattedOutput.includes('export type Database')
		) {
			throw new Error('Formatting produced invalid database types')
		}

		const temporaryFile = await writeTemporaryFile(
			canonicalPath,
			formattedOutput,
			temporaryPaths,
			originalState.mode
		)

		try {
			await replaceDestination(temporaryFile, canonicalPath)
			temporaryPaths.delete(temporaryFile)
		} catch (error) {
			try {
				await restoreDestination(canonicalPath, originalState, temporaryPaths)
			} catch (restoreError) {
				throw new Error(
					'Database type update failed and the original file could not be restored',
					{ cause: restoreError }
				)
			}

			throw new Error(
				'Database type update failed; the original file was restored',
				{ cause: error }
			)
		}
	} finally {
		await removeTemporaryFiles(temporaryPaths)
	}
}

if (import.meta.main) {
	generateDatabaseTypes().catch((error) => {
		console.error(`Database type generation failed: ${error.message}`)
		process.exitCode = 1
	})
}
