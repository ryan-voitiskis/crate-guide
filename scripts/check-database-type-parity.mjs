import { readFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const defaultCanonicalPath = resolve(repositoryRoot, 'shared/types/database.ts')
const defaultEdgePath = resolve(
	repositoryRoot,
	'supabase/functions/_shared/types/database.ts'
)

function displayPath(filepath) {
	const relativePath = relative(repositoryRoot, filepath)

	return relativePath.startsWith('..') || isAbsolute(relativePath)
		? filepath
		: relativePath
}

async function readDatabaseTypeFile(filepath, configuredPaths) {
	try {
		return await readFile(filepath)
	} catch (error) {
		if (error?.code === 'ENOENT') {
			throw new Error(
				`Generated database type file is missing (${displayPath(filepath)}); configured copies: ${configuredPaths}`
			)
		}

		throw new Error(
			`Could not read generated database type file (${displayPath(filepath)}); configured copies: ${configuredPaths}`
		)
	}
}

export async function checkDatabaseTypeParity({
	canonicalPath = defaultCanonicalPath,
	edgePath = defaultEdgePath
} = {}) {
	const configuredPaths = `${displayPath(canonicalPath)} and ${displayPath(edgePath)}`
	const [canonicalContent, edgeContent] = await Promise.all([
		readDatabaseTypeFile(canonicalPath, configuredPaths),
		readDatabaseTypeFile(edgePath, configuredPaths)
	])

	if (canonicalContent.length === 0 || edgeContent.length === 0) {
		throw new Error(
			`Generated database type files must be nonempty: ${configuredPaths}`
		)
	}

	if (!canonicalContent.equals(edgeContent)) {
		throw new Error(`Generated database type files differ: ${configuredPaths}`)
	}
}

if (import.meta.main) {
	checkDatabaseTypeParity()
		.then(() => {
			console.log('Generated database type copies are identical.')
		})
		.catch((error) => {
			console.error(`Database type parity check failed: ${error.message}`)
			process.exitCode = 1
		})
}
