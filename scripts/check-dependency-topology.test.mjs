import assert from 'node:assert/strict'
import test from 'node:test'
import {
	REVIEWED_DEPENDENCIES,
	VUE_ROUTER_VOLAR_PLUGIN,
	checkDependencyTopology,
	evaluatePlaywrightManifest,
	evaluateWorkflowActionPins
} from './check-dependency-topology.mjs'

const validPackageJson = {
	devDependencies: { playwright: '1.59.1' }
}
const validWorkflow =
	'jobs:\n  verify:\n    steps:\n      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2\n'

function createTemporaryFiles() {
	return {
		'/fixture/root/package.json': JSON.stringify(validPackageJson),
		'/fixture/root/.github/workflows/verify.yml': validWorkflow
	}
}

function createCheckOptions(overrides = {}) {
	const root = '/fixture/root'
	const files = createTemporaryFiles()
	return {
		root,
		readTextFile(path) {
			return files[path]
		},
		readPlaywrightVersions() {
			return { core: '1.59.1', playwright: '1.59.1' }
		},
		resolvePlugin() {
			return '/fixture/root/node_modules/vue-router/dist/volar/plugin.cjs'
		},
		runDependencyTree() {},
		...overrides
	}
}

test('checks the complete reviewed peer contract without scanning npm optional WASM artifacts', () => {
	// npm 11 can leave orphaned optional WASM nodes after npm ci, so
	// raw `npm ls --all` remains red for those artifacts. The durable gate keeps
	// npm's validation intact for every required Vue/crossws/H3 node under review.
	assert.deepEqual(REVIEWED_DEPENDENCIES, [
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
})

test('accepts a valid reviewed tree with a root-resolvable router plugin', () => {
	const root = '/fixture/root'
	const calls = []

	assert.doesNotThrow(() =>
		checkDependencyTopology(
			createCheckOptions({
				runDependencyTree(receivedRoot) {
					calls.push(['tree', receivedRoot])
				},
				resolvePlugin(receivedRoot) {
					calls.push(['plugin', receivedRoot])
					return '/fixture/root/node_modules/vue-router/dist/volar/plugin.cjs'
				}
			})
		)
	)
	assert.deepEqual(calls, [
		['tree', root],
		['plugin', root]
	])
})

test('rejects a failing focused npm dependency command', () => {
	let didResolvePlugin = false

	assert.throws(
		() =>
			checkDependencyTopology(
				createCheckOptions({
					runDependencyTree() {
						throw new Error('npm reported an invalid peer')
					},
					resolvePlugin() {
						didResolvePlugin = true
						return '/must/not/run'
					}
				})
			),
		/Reviewed Vue, crossws, or H3 dependency topology is invalid/
	)
	assert.equal(didResolvePlugin, false)
})

test('rejects an unresolvable Vue Router Volar plugin', () => {
	assert.throws(
		() =>
			checkDependencyTopology(
				createCheckOptions({
					runDependencyTree() {},
					resolvePlugin() {
						throw new Error('module not found')
					}
				})
			),
		new RegExp(VUE_ROUTER_VOLAR_PLUGIN.replaceAll('/', '\\/'))
	)
})

test('rejects an unpinned third-party action', () => {
	assert.deepEqual(
		evaluateWorkflowActionPins('steps:\n  - uses: actions/checkout@v4\n'),
		[
			'line 2: action must use a full commit SHA',
			'line 2: pinned action must include a release comment'
		]
	)
})

test('rejects direct or ranged Playwright runtime declarations', () => {
	assert.deepEqual(
		evaluatePlaywrightManifest({
			devDependencies: {
				playwright: '^1.59.1',
				'playwright-core': '1.59.0'
			}
		}),
		[
			'playwright-core must remain transitive; install browsers through playwright',
			'playwright must be an exact devDependency version'
		]
	)
})

test('rejects installed Playwright package mismatches', () => {
	assert.throws(
		() =>
			checkDependencyTopology(
				createCheckOptions({
					readPlaywrightVersions() {
						return { core: '1.59.0', playwright: '1.59.1' }
					}
				})
			),
		/Playwright package mismatch/
	)
})
