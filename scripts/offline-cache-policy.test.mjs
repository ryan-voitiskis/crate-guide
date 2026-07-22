import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import fixtures from '../test/fixtures/offlineCachePolicyAdversarial.json' with { type: 'json' }
import {
	assertOfflineCacheCandidate,
	assertOfflineCachePolicy,
	classifyOfflineCacheCandidate,
	offlineCachePolicy
} from './offline-cache-policy.mjs'

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url))

function classify(fixture) {
	return classifyOfflineCacheCandidate({
		applicationOrigin: fixtures.applicationOrigin,
		...fixture.input
	})
}

test('allows only the inventoried immutable first-party assets', () => {
	for (const fixture of fixtures.allowed) {
		const result = classify(fixture)
		assert.equal(result.cache, 'allow', fixture.name)
		assert.equal(result.reason, fixture.reason, fixture.name)
		assert.doesNotThrow(
			() =>
				assertOfflineCacheCandidate({
					applicationOrigin: fixtures.applicationOrigin,
					...fixture.input
				}),
			fixture.name
		)
	}
})

test('accepts the conservative Vite hash shape without assuming character classes', () => {
	for (const url of [
		'/_nuxt/abcdefgh.js',
		'/_nuxt/12345678.js',
		'/_nuxt/asset.abc12345.css'
	]) {
		assert.equal(
			classifyOfflineCacheCandidate({
				applicationOrigin: fixtures.applicationOrigin,
				url
			}).cache,
			'allow',
			url
		)
	}
})

test('keeps every allowlisted public asset source-controlled and cacheable', () => {
	for (const path of offlineCachePolicy.publicStaticPaths) {
		assert.ok(
			existsSync(resolve(repositoryRoot, 'public', path.slice(1))),
			path
		)
		assert.equal(
			classifyOfflineCacheCandidate({
				applicationOrigin: fixtures.applicationOrigin,
				url: path
			}).cache,
			'allow',
			path
		)
	}
})

test('denies every sensitive, dynamic, external, or ambiguous fixture', () => {
	for (const fixture of fixtures.denied) {
		const result = classify(fixture)
		assert.equal(result.cache, 'deny', fixture.name)
		assert.equal(result.reason, fixture.reason, fixture.name)
		assert.throws(
			() =>
				assertOfflineCacheCandidate({
					applicationOrigin: fixtures.applicationOrigin,
					...fixture.input
				}),
			new RegExp(result.reason),
			fixture.name
		)
	}
})

test('fails closed on malformed inputs and policy drift', () => {
	for (const input of [
		null,
		{},
		{ applicationOrigin: 'not-an-origin', url: '/favicon.svg' },
		{ applicationOrigin: fixtures.applicationOrigin, url: 'http://[' }
	]) {
		assert.equal(classifyOfflineCacheCandidate(input).cache, 'deny')
	}

	assert.throws(
		() => assertOfflineCachePolicy({ ...offlineCachePolicy, version: 2 }),
		/version 1/
	)
	assert.throws(
		() =>
			assertOfflineCachePolicy({
				...offlineCachePolicy,
				providerHostSuffixes: []
			}),
		/providerHostSuffixes/
	)
	for (const hashTokenLength of [1, 65]) {
		assert.throws(
			() =>
				assertOfflineCachePolicy({
					...offlineCachePolicy,
					immutableBuild: {
						...offlineCachePolicy.immutableBuild,
						hashTokenLength
					}
				}),
			/immutableBuild\.pathPrefix/,
			String(hashTokenLength)
		)
	}

	for (const pathPrefix of [
		'/',
		'_nuxt/',
		'/_nuxt',
		'//_nuxt/',
		'/_nuxt/../private/',
		'/_nuxt/%2fprivate/',
		'/_nuxt/?scope/'
	]) {
		assert.throws(
			() =>
				assertOfflineCachePolicy({
					...offlineCachePolicy,
					immutableBuild: {
						...offlineCachePolicy.immutableBuild,
						pathPrefix
					}
				}),
			/immutableBuild\.pathPrefix/,
			pathPrefix
		)
	}

	for (const extension of ['js', '.', '.js.map', '.js?download', '.JS']) {
		assert.throws(
			() =>
				assertOfflineCachePolicy({
					...offlineCachePolicy,
					immutableBuild: {
						...offlineCachePolicy.immutableBuild,
						extensions: [extension]
					}
				}),
			/immutableBuild\.extensions/,
			extension
		)
	}
})

test('host suffix checks do not trust lookalike provider or Supabase domains', () => {
	for (const url of [
		'https://discogs.com.evil.example/cover.jpg',
		'https://project.supabase.co.evil.example/cover.jpg'
	]) {
		const result = classifyOfflineCacheCandidate({
			applicationOrigin: fixtures.applicationOrigin,
			destination: 'image',
			url
		})
		assert.equal(result.cache, 'deny')
		assert.equal(result.reason, 'external-image')
	}
})
