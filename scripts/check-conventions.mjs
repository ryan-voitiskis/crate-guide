import { execFileSync } from 'node:child_process'
import { existsSync, lstatSync, readFileSync } from 'node:fs'
import { basename, extname, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

const COMPONENT_KIND_NAMES = [
	'Card',
	'Controls',
	'Header',
	'List',
	'Panel',
	'Picker',
	'Rating',
	'Select'
]

function toRepositoryPath(path) {
	return path.split(sep).join('/')
}

function isGeneratedUiPath(path) {
	return path.startsWith('app/components/ui/')
}

function isComponentPath(path) {
	return path.startsWith('app/components/') && path.endsWith('.vue')
}

function hasTypeSuffixInversion(componentName) {
	const endsWithKind = COMPONENT_KIND_NAMES.some(
		(kind) => componentName !== kind && componentName.endsWith(kind)
	)
	const beginsWithKind = COMPONENT_KIND_NAMES.some((kind) =>
		componentName.startsWith(kind)
	)

	return endsWithKind && !beginsWithKind
}

/**
 * Evaluate one repository-relative app path without reading or writing files.
 */
export function evaluateAppPath(path, contents = '') {
	const repositoryPath = toRepositoryPath(path)
	if (isGeneratedUiPath(repositoryPath)) return []

	const diagnostics = []
	const extension = extname(repositoryPath)

	if (extension === '.vue' && /<style\b/i.test(contents)) {
		diagnostics.push('contains a <style> block')
	}

	if (
		(extension === '.vue' || extension === '.css') &&
		/@apply\b/.test(contents)
	) {
		diagnostics.push('contains @apply')
	}

	if (extension === '.scss') {
		diagnostics.push('SCSS files are not allowed')
	}

	if (isComponentPath(repositoryPath)) {
		const componentName = basename(repositoryPath, '.vue')
		if (!/^[A-Z][A-Za-z0-9]*$/.test(componentName)) {
			diagnostics.push('component filename must be PascalCase')
		} else if (hasTypeSuffixInversion(componentName)) {
			diagnostics.push('component filename must use a type-first name')
		}
	}

	return diagnostics
}

/**
 * Evaluate the local Supabase task configuration without reading other files.
 */
export function evaluateEdgeDeployConfig(contents) {
	let config
	try {
		config = JSON.parse(contents)
	} catch {
		return ['must contain valid JSON']
	}

	if (!config || typeof config !== 'object' || Array.isArray(config)) return []
	const { tasks } = config
	if (!tasks || typeof tasks !== 'object' || Array.isArray(tasks)) return []

	return Object.entries(tasks).flatMap(([taskName, command]) => {
		if (
			typeof command === 'string' &&
			command.includes('supabase functions deploy') &&
			command.includes('--no-verify-jwt')
		) {
			return [
				`task "${taskName}" must not disable JWT verification during deployment`
			]
		}
		return []
	})
}

/**
 * Discover tracked and untracked, non-ignored app files without modifying Git.
 */
export function discoverAppFiles(root = process.cwd()) {
	const output = execFileSync(
		'git',
		['ls-files', '-co', '--exclude-standard', '-z', '--', 'app'],
		{ cwd: root }
	)

	return [...new Set(output.toString('utf8').split('\0').filter(Boolean))]
		.filter((path) => {
			try {
				return lstatSync(resolve(root, path)).isFile()
			} catch {
				return false
			}
		})
		.sort()
}

export function checkConventions(root = process.cwd()) {
	const diagnostics = discoverAppFiles(root).flatMap((path) => {
		const contents = readFileSync(resolve(root, path), 'utf8')
		return evaluateAppPath(path, contents).map((message) => ({ path, message }))
	})
	const edgeConfigPath = 'supabase/deno.json'
	const absoluteEdgeConfigPath = resolve(root, edgeConfigPath)
	if (existsSync(absoluteEdgeConfigPath)) {
		const contents = readFileSync(absoluteEdgeConfigPath, 'utf8')
		diagnostics.push(
			...evaluateEdgeDeployConfig(contents).map((message) => ({
				path: edgeConfigPath,
				message
			}))
		)
	}

	return diagnostics
}

function run() {
	const root = process.cwd()
	const diagnostics = checkConventions(root)

	if (diagnostics.length === 0) {
		console.log('Component and Tailwind conventions passed.')
		return
	}

	for (const diagnostic of diagnostics) {
		console.error(
			`${toRepositoryPath(relative(root, resolve(root, diagnostic.path)))}: ${diagnostic.message}`
		)
	}
	process.exitCode = 1
}

const isDirectRun =
	process.argv[1] &&
	pathToFileURL(resolve(process.argv[1])).href === import.meta.url

if (isDirectRun) run()
