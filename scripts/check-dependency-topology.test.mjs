import assert from 'node:assert/strict'
import test from 'node:test'
import {
	REVIEWED_DEPENDENCIES,
	VUE_ROUTER_VOLAR_PLUGIN,
	checkDependencyTopology
} from './check-dependency-topology.mjs'

test('checks the complete reviewed peer contract without scanning npm optional WASM artifacts', () => {
	// npm 11.6.2 currently leaves orphaned optional WASM nodes after npm ci, so
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
		checkDependencyTopology({
			root,
			runDependencyTree(receivedRoot) {
				calls.push(['tree', receivedRoot])
			},
			resolvePlugin(receivedRoot) {
				calls.push(['plugin', receivedRoot])
				return '/fixture/root/node_modules/vue-router/dist/volar/plugin.cjs'
			}
		})
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
			checkDependencyTopology({
				runDependencyTree() {
					throw new Error('npm reported an invalid peer')
				},
				resolvePlugin() {
					didResolvePlugin = true
					return '/must/not/run'
				}
			}),
		/Reviewed Vue, crossws, or H3 dependency topology is invalid/
	)
	assert.equal(didResolvePlugin, false)
})

test('rejects an unresolvable Vue Router Volar plugin', () => {
	assert.throws(
		() =>
			checkDependencyTopology({
				runDependencyTree() {},
				resolvePlugin() {
					throw new Error('module not found')
				}
			}),
		new RegExp(VUE_ROUTER_VOLAR_PLUGIN.replaceAll('/', '\\/'))
	)
})
