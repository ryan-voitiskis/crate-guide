import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, test } from 'node:test'
import { findDiscogsDocumentationDiagnostics } from './check-discogs-doc-contract.mjs'

const temporaryDirectories = []

afterEach(async () => {
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((directory) => rm(directory, { force: true, recursive: true }))
	)
})

async function createFixture({ readme = '', integration = '' } = {}) {
	const root = await mkdtemp(join(tmpdir(), 'crate-guide-discogs-docs-'))
	temporaryDirectories.push(root)
	await mkdir(join(root, 'docs'))
	await Promise.all([
		writeFile(join(root, 'README.md'), readme),
		writeFile(join(root, 'docs', 'discogs-integration.md'), integration)
	])
	return root
}

test('empty documents fail every positive contract', async () => {
	const root = await createFixture()
	const diagnostics = findDiscogsDocumentationDiagnostics(root)

	assert.ok(diagnostics.includes('README.md: documentation must not be empty'))
	assert.ok(
		diagnostics.includes(
			'docs/discogs-integration.md: documentation must not be empty'
		)
	)
	assert.ok(diagnostics.some((message) => message.includes('quota-bound')))
	assert.ok(diagnostics.some((message) => message.includes('gateway')))
})

test('a materially partial integration guide fails actionable contracts', async () => {
	const root = await createFixture({
		readme:
			'`get-discogs-request-token` `get-discogs-access-token` `authenticated-discogs-request` `cleanup-record-covers` `cleanup-orphaned-record-covers` `delete-account` verify_jwt = false. Handlers authenticate. Verify the hosted environment.',
		integration: '`authenticated-discogs-request` uses quota-bound transport.'
	})
	const diagnostics = findDiscogsDocumentationDiagnostics(root)

	assert.ok(
		diagnostics.includes(
			'docs/discogs-integration.md: missing current credential-free resume payload contract'
		)
	)
	assert.ok(
		diagnostics.includes(
			'docs/discogs-integration.md: missing current cleanup path ownership contract'
		)
	)
})

test('the repository documentation satisfies the positive contract', () => {
	assert.deepEqual(findDiscogsDocumentationDiagnostics(), [])
})
