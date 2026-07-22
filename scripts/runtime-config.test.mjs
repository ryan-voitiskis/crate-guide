import assert from 'node:assert/strict'
import test from 'node:test'
import {
	requiresCloudRuntimeConfig,
	validatePublicRuntimeConfig
} from './runtime-config.mjs'

test('accepts a complete redaction-safe public configuration', () => {
	assert.deepEqual(
		validatePublicRuntimeConfig(
			{
				SUPABASE_URL: ' https://project.supabase.co/ ',
				SUPABASE_ANON_KEY: 'test-public-anon-key'
			},
			{ required: true }
		),
		{
			key: 'test-public-anon-key',
			url: 'https://project.supabase.co'
		}
	)
})

test('rejects missing and malformed cloud configuration without echoing input', () => {
	const privateValue = 'https://user:private@example.test/path?secret=value'
	for (const environment of [
		{},
		{ SUPABASE_URL: 'not-a-url', SUPABASE_ANON_KEY: 'test-public-anon-key' },
		{ SUPABASE_URL: privateValue, SUPABASE_ANON_KEY: 'short' }
	]) {
		assert.throws(
			() => validatePublicRuntimeConfig(environment, { required: true }),
			(error) =>
				error instanceof Error &&
				/requires valid public/.test(error.message) &&
				!error.message.includes(privateValue)
		)
	}
})

test('requires cloud values for production-capable npm commands', () => {
	for (const npm_lifecycle_event of ['build', 'dev', 'generate', 'preview']) {
		assert.equal(requiresCloudRuntimeConfig({ npm_lifecycle_event }), true)
	}
	assert.equal(
		requiresCloudRuntimeConfig({ npm_lifecycle_event: 'test' }),
		false
	)
	assert.equal(
		requiresCloudRuntimeConfig({
			CRATE_GUIDE_STORAGE_MODE: 'local',
			npm_lifecycle_event: 'build'
		}),
		false
	)
})
