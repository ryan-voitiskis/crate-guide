import assert from 'node:assert/strict'
import { parseDefaultApiKeyMap } from './supabaseHelpers.ts'

Deno.test('Supabase key maps return the trimmed default key', () => {
	assert.equal(
		parseDefaultApiKeyMap(
			JSON.stringify({ default: '  sb_publishable_test  ', rotated: 'unused' }),
			'SUPABASE_PUBLISHABLE_KEYS'
		),
		'sb_publishable_test'
	)
})

Deno.test('Supabase key maps reject malformed or missing defaults', () => {
	for (const serializedKeys of [
		'not-json',
		'[]',
		'{}',
		JSON.stringify({ default: '' }),
		JSON.stringify({ default: 42 })
	]) {
		assert.throws(
			() => parseDefaultApiKeyMap(serializedKeys, 'SUPABASE_SECRET_KEYS'),
			/SUPABASE_SECRET_KEYS must contain a default API key/
		)
	}
})
