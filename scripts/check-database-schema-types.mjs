import { spawnSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { format, resolveConfig } from 'prettier'
import { checkDatabaseTypeParity } from './check-database-type-parity.mjs'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

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
	root = repositoryRoot,
	temporaryRoot = tmpdir()
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

	const canonicalPath = resolve(root, 'shared/types/database.ts')
	const generatedContent = await formatter(generatedSource, canonicalPath)
	const temporaryDirectory = await mkdtemp(
		join(temporaryRoot, 'crate-guide-schema-types-')
	)
	const generatedPath = join(temporaryDirectory, 'database.ts')

	try {
		await writeFile(generatedPath, generatedContent, { flag: 'wx' })
		await checkDatabaseTypeParity({
			canonicalPath,
			edgePath: resolve(root, 'supabase/functions/_shared/types/database.ts'),
			generatedPath
		})
	} finally {
		await rm(temporaryDirectory, { force: true, recursive: true })
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
