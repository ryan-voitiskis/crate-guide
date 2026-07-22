import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, test } from 'node:test'
import { findDiscogsDocumentationDiagnostics } from './check-discogs-doc-contract.mjs'

const temporaryDirectories = []
const PORTABILITY_DECISION_PATH = 'docs/decisions/discogs-data-portability.md'
const ACCOUNTLESS_DECISION_PATH = 'docs/decisions/accountless-discogs.md'

afterEach(async () => {
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((directory) => rm(directory, { force: true, recursive: true }))
	)
})

async function createFixture({
	readme = '',
	integration = '',
	portability = '',
	accountless = ''
} = {}) {
	const root = await mkdtemp(join(tmpdir(), 'crate-guide-discogs-docs-'))
	temporaryDirectories.push(root)
	await mkdir(join(root, 'docs', 'decisions'), { recursive: true })
	await Promise.all([
		writeFile(join(root, 'README.md'), readme),
		writeFile(join(root, 'docs', 'discogs-integration.md'), integration),
		writeFile(join(root, PORTABILITY_DECISION_PATH), portability),
		writeFile(join(root, ACCOUNTLESS_DECISION_PATH), accountless)
	])
	return root
}

async function readRepositoryDocument(path) {
	return readFile(new URL(`../${path}`, import.meta.url), 'utf8')
}

async function createRepositoryFixture(overrides = {}) {
	const [readme, integration, portability, accountless] = await Promise.all([
		readRepositoryDocument('README.md'),
		readRepositoryDocument('docs/discogs-integration.md'),
		readRepositoryDocument(PORTABILITY_DECISION_PATH),
		readRepositoryDocument(ACCOUNTLESS_DECISION_PATH)
	])

	return createFixture({
		readme,
		integration,
		portability,
		accountless,
		...overrides
	})
}

function replaceRequired(contents, search, replacement) {
	assert.ok(contents.includes(search), `fixture must contain ${search}`)
	return contents.replace(search, replacement)
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
	assert.ok(
		diagnostics.includes(
			`${PORTABILITY_DECISION_PATH}: documentation must not be empty`
		)
	)
	assert.ok(
		diagnostics.includes(
			`${ACCOUNTLESS_DECISION_PATH}: documentation must not be empty`
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

test('portability evidence, source paths, and archive exclusions fail closed', async () => {
	const source = await readRepositoryDocument(PORTABILITY_DECISION_PATH)
	const portability = replaceRequired(
		replaceRequired(
			replaceRequired(
				source,
				'Last updated 2025-05-27',
				'Last updated date removed'
			),
			'Restricted-explicit: release image',
			'CC0-explicit: release image'
		),
		'exclude every Unknown field',
		'allow unclassified fields'
	)
	const root = await createRepositoryFixture({ portability })
	const diagnostics = findDiscogsDocumentationDiagnostics(root)

	assert.ok(
		diagnostics.includes(
			`${PORTABILITY_DECISION_PATH}: missing current API Terms source date contract`
		)
	)
	assert.ok(
		diagnostics.includes(
			`${PORTABILITY_DECISION_PATH}: missing current external cover matrix classification contract`
		)
	)
	assert.ok(
		diagnostics.includes(
			`${PORTABILITY_DECISION_PATH}: missing current archive Unknown exclusion contract`
		)
	)
})

test('freshness and exact adjacent attribution cannot be reduced to a generic notice', async () => {
	const source = await readRepositoryDocument(PORTABILITY_DECISION_PATH)
	const portability = replaceRequired(
		replaceRequired(
			replaceRequired(
				source,
				'`updated_at` is not provider freshness',
				'`updated_at` can represent freshness'
			),
			'`Data provided by Discogs.` directly next',
			'`Discogs data` on a generic legal page'
		),
		'exact Discogs page containing that data',
		'Discogs home page'
	)
	const root = await createRepositoryFixture({ portability })
	const diagnostics = findDiscogsDocumentationDiagnostics(root)

	assert.ok(
		diagnostics.includes(
			`${PORTABILITY_DECISION_PATH}: missing current provider freshness boundary contract`
		)
	)
	assert.ok(
		diagnostics.includes(
			`${PORTABILITY_DECISION_PATH}: missing current adjacent attribution text contract`
		)
	)
	assert.ok(
		diagnostics.includes(
			`${PORTABILITY_DECISION_PATH}: missing current exact attribution link contract`
		)
	)
})

test('accountless alternatives and threat controls remain mandatory', async () => {
	const source = await readRepositoryDocument(ACCOUNTLESS_DECISION_PATH)
	const accountless = replaceRequired(
		replaceRequired(
			replaceRequired(
				replaceRequired(
					source,
					'Browser-held consumer secret',
					'Browser credential shortcut'
				),
				'Public-by-username folder-zero import',
				'Public import'
			),
			'Same-origin XSS',
			'browser compromise'
		),
		'source-IP, device, and global quotas',
		'generic quotas'
	)
	const root = await createRepositoryFixture({ accountless })
	const diagnostics = findDiscogsDocumentationDiagnostics(root)

	assert.ok(
		diagnostics.includes(
			`${ACCOUNTLESS_DECISION_PATH}: missing current browser-held rejection contract`
		)
	)
	assert.ok(
		diagnostics.includes(
			`${ACCOUNTLESS_DECISION_PATH}: missing current public username alternative contract`
		)
	)
	assert.ok(
		diagnostics.includes(
			`${ACCOUNTLESS_DECISION_PATH}: missing current XSS threat contract`
		)
	)
	assert.ok(
		diagnostics.includes(
			`${ACCOUNTLESS_DECISION_PATH}: missing current IP device global quotas contract`
		)
	)
})

test('unresolved STOP state rejects approval drift', async () => {
	const source = await readRepositoryDocument(ACCOUNTLESS_DECISION_PATH)
	const accountless = `${replaceRequired(
		replaceRequired(
			source,
			'**Status:** STOP - unresolved',
			'**Status:** APPROVED'
		),
		'**Provider approval:** unresolved',
		'**Provider approval:** complete'
	)}\n\nDiscogs has approved this model.\n`
	const root = await createRepositoryFixture({ accountless })
	const diagnostics = findDiscogsDocumentationDiagnostics(root)

	assert.ok(
		diagnostics.includes(
			`${ACCOUNTLESS_DECISION_PATH}: missing current unresolved STOP status contract`
		)
	)
	assert.ok(
		diagnostics.includes(
			`${ACCOUNTLESS_DECISION_PATH}: missing current provider approval unresolved contract`
		)
	)
	assert.ok(
		diagnostics.includes(
			`${ACCOUNTLESS_DECISION_PATH}: remove unsupported provider approval claim`
		)
	)
	assert.ok(
		diagnostics.includes(
			`${ACCOUNTLESS_DECISION_PATH}: remove unsupported approved status claim`
		)
	)
})

test('the integration guide must keep both decision links and the no-approval boundary', async () => {
	const source = await readRepositoryDocument('docs/discogs-integration.md')
	const integration = replaceRequired(
		replaceRequired(
			source,
			'./decisions/accountless-discogs.md',
			'./decisions/removed-accountless-decision.md'
		),
		'No provider, legal, or maintainer\napproval is recorded',
		'External approval is assumed'
	)
	const root = await createRepositoryFixture({ integration })
	const diagnostics = findDiscogsDocumentationDiagnostics(root)

	assert.ok(
		diagnostics.includes(
			'docs/discogs-integration.md: missing current accountless decision link contract'
		)
	)
	assert.ok(
		diagnostics.includes(
			'docs/discogs-integration.md: missing current no external approval boundary contract'
		)
	)
})
