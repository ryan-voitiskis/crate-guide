import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { format, resolveConfig } from 'prettier'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const trackedTypesPath = 'shared/types/database.ts'

function runSupabaseGenerator(command, args, options) {
	return spawnSync(command, args, options)
}

async function formatGeneratedTypes(source, filepath) {
	const config = (await resolveConfig(filepath)) ?? {}
	return format(source, { ...config, filepath })
}

export async function checkDatabaseSchemaTypes({
	commandRunner = runSupabaseGenerator,
	formatter = formatGeneratedTypes,
	root = repositoryRoot
} = {}) {
	let result
	try {
		result = commandRunner(
			'supabase',
			['gen', 'types', '--lang=typescript', '--local'],
			{ cwd: root, encoding: 'utf8', shell: false }
		)
	} catch {
		throw new Error('Could not run the Supabase type generator')
	}

	if (result?.error)
		throw new Error('Could not run the Supabase type generator')
	if (result?.status !== 0) {
		throw new Error(
			`Supabase type generation exited with status ${String(result?.status)}`
		)
	}

	const generatedSource = String(result.stdout ?? '')
	if (!generatedSource.includes('export type Database')) {
		throw new Error('Supabase type generation returned invalid output')
	}

	const canonicalPath = resolve(root, trackedTypesPath)
	const generatedContent = Buffer.from(
		await formatter(generatedSource, canonicalPath)
	)

	let trackedContent
	try {
		trackedContent = await readFile(canonicalPath)
	} catch (error) {
		throw new Error(
			`Tracked database types could not be read (${trackedTypesPath})`,
			{ cause: error }
		)
	}

	if (trackedContent.length === 0) {
		throw new Error(`Tracked database types are empty (${trackedTypesPath})`)
	}

	if (!trackedContent.equals(generatedContent)) {
		throw new Error(
			`Tracked database types differ from the migrated schema (${trackedTypesPath})`
		)
	}
}

const isDirectRun =
	process.argv[1] &&
	pathToFileURL(resolve(process.argv[1])).href === import.meta.url

if (isDirectRun) {
	checkDatabaseSchemaTypes()
		.then(() =>
			console.log('Tracked database types match the migrated schema.')
		)
		.catch((error) => {
			console.error(`Database schema type check failed: ${error.message}`)
			process.exitCode = 1
		})
}
