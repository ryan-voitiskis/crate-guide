import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export const REVIEWED_DEPENDENCIES = Object.freeze([
	'vue',
	'vue-router',
	'@vue/compiler-core',
	'@vue/compiler-dom',
	'@vue/compiler-sfc',
	'@vue/compiler-ssr',
	'@vue/server-renderer',
	'crossws',
	'h3',
	'h3-next'
])

export const VUE_ROUTER_VOLAR_PLUGIN = 'vue-router/volar/sfc-route-blocks'

export function evaluateWorkflowActionPins(contents) {
	const diagnostics = []
	for (const [index, line] of contents.split('\n').entries()) {
		const use = line.match(/^\s*-?\s*uses:\s*([^\s#]+)(?:\s+#\s*(.+))?\s*$/)
		if (!use) continue
		const reference = use[1]
		if (reference.startsWith('./') || reference.startsWith('docker://'))
			continue
		const separator = reference.lastIndexOf('@')
		const revision = separator === -1 ? '' : reference.slice(separator + 1)
		const releaseComment = use[2]?.trim() ?? ''
		if (!/^[0-9a-f]{40}$/.test(revision)) {
			diagnostics.push(`line ${index + 1}: action must use a full commit SHA`)
		}
		if (!/^v?\d+(?:\.\d+){0,2}$/.test(releaseComment)) {
			diagnostics.push(
				`line ${index + 1}: pinned action must include a release comment`
			)
		}
	}
	return diagnostics
}

export function evaluatePlaywrightManifest(packageJson) {
	const diagnostics = []
	const dependencySections = [
		packageJson.dependencies,
		packageJson.devDependencies,
		packageJson.optionalDependencies
	].filter(Boolean)
	if (dependencySections.some((section) => 'playwright-core' in section)) {
		diagnostics.push(
			'playwright-core must remain transitive; install browsers through playwright'
		)
	}
	const playwrightVersion = packageJson.devDependencies?.playwright
	if (!/^\d+\.\d+\.\d+$/.test(playwrightVersion ?? '')) {
		diagnostics.push('playwright must be an exact devDependency version')
	}
	return diagnostics
}

function runReviewedDependencyTree(root) {
	// npm 11 can leave orphaned, optional WASM artifacts in node_modules after
	// npm ci, so raw `npm ls --all` remains red for those non-required nodes.
	// This focused command asks npm itself to validate the reviewed Vue/crossws/H3
	// contract. Its output and exit status are inherited without filtering.
	execFileSync('npm', ['ls', '--all', ...REVIEWED_DEPENDENCIES], {
		cwd: root,
		stdio: 'inherit'
	})
}

function resolveVueRouterPlugin(root) {
	return createRequire(resolve(root, 'package.json')).resolve(
		VUE_ROUTER_VOLAR_PLUGIN
	)
}

function readInstalledPlaywrightVersions(root) {
	const require = createRequire(resolve(root, 'package.json'))
	return {
		core: require('playwright-core/package.json').version,
		playwright: require('playwright/package.json').version
	}
}

function readRepositoryFile(filepath) {
	return readFileSync(filepath, 'utf8')
}

export function checkDependencyTopology({
	root = process.cwd(),
	runDependencyTree = runReviewedDependencyTree,
	resolvePlugin = resolveVueRouterPlugin,
	readPlaywrightVersions = readInstalledPlaywrightVersions,
	readTextFile = readRepositoryFile
} = {}) {
	const packageJson = JSON.parse(readTextFile(resolve(root, 'package.json')))
	const manifestDiagnostics = evaluatePlaywrightManifest(packageJson)
	if (manifestDiagnostics.length > 0) {
		throw new Error(manifestDiagnostics.join('; '))
	}
	const workflowDiagnostics = evaluateWorkflowActionPins(
		readTextFile(resolve(root, '.github/workflows/verify.yml'))
	)
	if (workflowDiagnostics.length > 0) {
		throw new Error(workflowDiagnostics.join('; '))
	}

	try {
		runDependencyTree(root)
	} catch {
		throw new Error(
			'Reviewed Vue, crossws, or H3 dependency topology is invalid.'
		)
	}

	try {
		const pluginPath = resolvePlugin(root)
		if (typeof pluginPath !== 'string' || pluginPath.length === 0)
			throw new Error()
	} catch {
		throw new Error(
			`Required Vue Router plugin is not root-resolvable: ${VUE_ROUTER_VOLAR_PLUGIN}`
		)
	}

	let playwrightVersions
	try {
		playwrightVersions = readPlaywrightVersions(root)
	} catch {
		throw new Error('Playwright runtime packages are not root-resolvable.')
	}
	if (playwrightVersions.playwright !== playwrightVersions.core) {
		throw new Error(
			`Playwright package mismatch: playwright ${playwrightVersions.playwright} and playwright-core ${playwrightVersions.core}`
		)
	}
}

function run() {
	try {
		checkDependencyTopology()
		console.log('Reviewed dependency topology passed.')
	} catch (error) {
		console.error(`Dependency topology check failed: ${error.message}`)
		process.exitCode = 1
	}
}

const isDirectRun =
	process.argv[1] &&
	pathToFileURL(resolve(process.argv[1])).href === import.meta.url

if (isDirectRun) run()
