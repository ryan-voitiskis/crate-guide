import { execFileSync } from 'node:child_process'
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

function runReviewedDependencyTree(root) {
	// npm 11.6.2 leaves orphaned, optional WASM artifacts in node_modules after
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

export function checkDependencyTopology({
	root = process.cwd(),
	runDependencyTree = runReviewedDependencyTree,
	resolvePlugin = resolveVueRouterPlugin
} = {}) {
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
