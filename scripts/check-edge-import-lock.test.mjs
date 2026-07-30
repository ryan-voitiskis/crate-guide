import assert from 'node:assert/strict'
import test from 'node:test'
import {
	SUPABASE_JS_SPECIFIER,
	checkEdgeImportLock
} from './check-edge-import-lock.mjs'

test('every function config matches the checked-in root Deno lock', async () => {
	const names = await checkEdgeImportLock({ resolveImports: false })
	assert.deepEqual(names, [
		'authenticated-discogs-request',
		'cleanup-orphaned-record-covers',
		'cleanup-record-covers',
		'delete-account',
		'get-discogs-access-token',
		'get-discogs-request-token'
	])
	assert.equal(SUPABASE_JS_SPECIFIER, 'npm:@supabase/supabase-js@2.111.0')
})

test('uses frozen resolution for every function-local config', async () => {
	const invocations = []
	await checkEdgeImportLock({
		commandRunner: (...args) => {
			invocations.push(args)
			return { status: 0 }
		}
	})
	assert.equal(invocations.length, 6)
	for (const [command, args, options] of invocations) {
		assert.equal(command, 'deno')
		assert.equal(args[0], 'cache')
		assert.equal(args.includes('--frozen'), true)
		assert.equal(args.includes('--lock=deno.lock'), true)
		assert.equal(
			args.some((argument) => argument.startsWith('--config=')),
			true
		)
		assert.equal(options.shell, false)
	}
})
