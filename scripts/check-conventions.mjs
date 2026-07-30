import { execFileSync } from 'node:child_process'
import { existsSync, lstatSync, readFileSync } from 'node:fs'
import { basename, extname, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

export const COMPONENT_KIND_NAMES = Object.freeze([
	'Alert',
	'Animation',
	'Button',
	'Card',
	'Checkbox',
	'Checklist',
	'Command',
	'Control',
	'Controls',
	'Deck',
	'Detail',
	'Details',
	'Dialog',
	'Form',
	'Header',
	'Image',
	'Input',
	'Inspector',
	'Layout',
	'Links',
	'List',
	'Logo',
	'Metric',
	'Nav',
	'Notice',
	'Panel',
	'Picker',
	'Progress',
	'Rating',
	'Section',
	'Select',
	'Selector',
	'Separator',
	'Shell',
	'Simulator',
	'Spinner',
	'State',
	'Status',
	'Table',
	'Toggle'
])

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
export function evaluateEdgeFunctionGatewayConfig(contents, functionNames) {
	return functionNames.flatMap((functionName) => {
		const header = `[functions.${functionName}]`
		const headerStart = contents
			.split('\n')
			.findIndex((line) => line.trim() === header)
		if (headerStart === -1) {
			return [`missing [functions.${functionName}] configuration`]
		}
		const sectionLines = contents.split('\n').slice(headerStart + 1)
		const nextSection = sectionLines.findIndex((line) => /^\s*\[/.test(line))
		const section = sectionLines
			.slice(0, nextSection === -1 ? undefined : nextSection)
			.join('\n')
		if (!/^verify_jwt\s*=\s*false\s*$/m.test(section)) {
			return [
				`[functions.${functionName}] must set verify_jwt = false because the handler authenticates internally`
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
	const edgeConfigPath = 'supabase/config.toml'
	const absoluteEdgeConfigPath = resolve(root, edgeConfigPath)
	if (existsSync(absoluteEdgeConfigPath)) {
		const contents = readFileSync(absoluteEdgeConfigPath, 'utf8')
		const functionsRoot = resolve(root, 'supabase/functions')
		const functionNames = existsSync(functionsRoot)
			? execFileSync(
					'git',
					[
						'ls-files',
						'-co',
						'--exclude-standard',
						'-z',
						'--',
						'supabase/functions/*/index.ts'
					],
					{ cwd: root }
				)
					.toString('utf8')
					.split('\0')
					.filter(Boolean)
					.map((path) => path.split('/').at(-2))
					.filter((name) => name && name !== '_shared')
					.sort()
			: []
		diagnostics.push(
			...evaluateEdgeFunctionGatewayConfig(contents, functionNames).map(
				(message) => ({
					path: edgeConfigPath,
					message
				})
			)
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
