import { afterEach, describe, expect, it } from 'vitest'
import { openBrowserLibraryRepository } from '../../app/repositories/library/browser/browserLibraryRepository'
import type {
	BrowserLibraryDependencies,
	BrowserLibraryRepository
} from '../../app/repositories/library/browser/browserLibraryTypes'
import { createBrowserWorkspaceCatalog } from '../../app/repositories/library/browser/browserWorkspaceCatalog'
import type { ExternalRecordWithTracksInput } from '../../shared/types/library'

const NOW = '2026-07-23T06:00:00.000Z'
const repositories = new Set<BrowserLibraryRepository>()
const databaseNames = new Set<string>()

function deleteDatabase(name: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.deleteDatabase(name)
		request.addEventListener('success', () => resolve(), { once: true })
		request.addEventListener(
			'error',
			() => reject(request.error ?? new Error(`Could not delete ${name}.`)),
			{ once: true }
		)
	})
}

async function createHarness(
	label: string,
	overrides: BrowserLibraryDependencies = {}
) {
	const databaseName = `crate-guide-discogs-${label}-${crypto.randomUUID()}`
	databaseNames.add(databaseName)
	const dependencies: BrowserLibraryDependencies = {
		databaseName,
		now: () => new Date(NOW),
		createBroadcastChannel: () => null,
		...overrides
	}
	const catalog = await createBrowserWorkspaceCatalog(dependencies)
	const created = await catalog.createWorkspace(
		{ id: 'workspace-a', name: 'Local library' },
		0
	)
	catalog.close()
	const context = {
		workspaceId: created.value.id,
		repositoryId: created.value.repositoryId,
		activationGeneration: 0
	}
	const repository = await openBrowserLibraryRepository({
		workspaceId: context.workspaceId,
		repositoryId: context.repositoryId,
		isCurrentContext: (candidate) => candidate.activationGeneration === 0,
		dependencies
	})
	repositories.add(repository)
	return { context, databaseName, dependencies, repository }
}

function externalInput(
	discogsId = 42,
	title = 'Imported release'
): ExternalRecordWithTracksInput {
	return {
		record: {
			title,
			artists: [{ discogs_id: 10, name: 'Artist', role: null }],
			labels: [{ discogs_id: 20, name: 'Label', catno: 'CAT-1' }],
			year: 2026,
			cover: { kind: 'external', url: 'https://images.example.test/cover.jpg' },
			discogs_id: discogsId,
			discogs_release_url: `https://discogs.example.test/release/${discogsId}`
		},
		tracks: [
			{
				title: 'Track A',
				artists: [{ discogs_id: 10, name: 'Artist', role: null }],
				extraartists: [],
				position: 'A1',
				duration: 180_000,
				bpm: null,
				rpm: 33,
				key: null,
				mode: null,
				genres: ['House'],
				time_signature_upper: null,
				time_signature_lower: null,
				playable: true
			}
		]
	}
}

afterEach(async () => {
	for (const repository of repositories) repository.close()
	repositories.clear()
	for (const databaseName of databaseNames) await deleteDatabase(databaseName)
	databaseNames.clear()
})

describe('browser Discogs import destination', () => {
	it('atomically resolves concurrent duplicate imports to one record and track set', async () => {
		const { context, repository } = await createHarness('duplicate-race')
		const input = externalInput()

		const outcomes = await Promise.all([
			repository.records.importExternalWithTracks(context, input),
			repository.records.importExternalWithTracks(context, input)
		])
		expect(
			outcomes.map((outcome) =>
				outcome.status === 'success' ? outcome.value.inserted : null
			)
		).toEqual([true, false])

		await expect(
			repository.records.findExistingDiscogsIds(context, [42, 99])
		).resolves.toMatchObject({ status: 'success', value: new Set([42]) })
		const records = await repository.records.list(context)
		const tracks = await repository.tracks.list(context)
		expect(records).toMatchObject({
			status: 'success',
			value: [
				{
					title: 'Imported release',
					discogs_id: 42,
					cover: {
						kind: 'external',
						url: 'https://images.example.test/cover.jpg'
					}
				}
			]
		})
		expect(tracks).toMatchObject({
			status: 'success',
			value: [{ title: 'Track A', genres: ['House'] }]
		})
	})

	it('prevents a two-handle same-workspace race from creating duplicates', async () => {
		const { context, dependencies, repository } =
			await createHarness('two-handle-race')
		const second = await openBrowserLibraryRepository({
			workspaceId: context.workspaceId,
			repositoryId: context.repositoryId,
			isCurrentContext: () => true,
			dependencies
		})
		repositories.add(second)

		const outcomes = await Promise.all([
			repository.records.importExternalWithTracks(context, externalInput()),
			second.records.importExternalWithTracks(context, externalInput())
		])
		expect(
			outcomes.filter(
				(outcome) =>
					outcome.status === 'success' && outcome.value.inserted === true
			)
		).toHaveLength(1)
		expect(
			outcomes.every(
				(outcome) =>
					outcome.status === 'success' || outcome.status === 'conflict'
			)
		).toBe(true)

		await expect(repository.records.list(context)).resolves.toMatchObject({
			status: 'success',
			value: [{ discogs_id: 42 }]
		})
		await expect(repository.tracks.list(context)).resolves.toMatchObject({
			status: 'success',
			value: [{ title: 'Track A' }]
		})
	})

	it('rolls back both entities when the record-and-tracks transaction aborts', async () => {
		let abortImport = false
		const { context, dependencies, repository } = await createHarness('abort', {
			onTransactionStep: ({ command, ordinal }) => {
				if (
					abortImport &&
					command === 'import-external-record-with-tracks' &&
					ordinal === 2
				) {
					throw new Error('Abort import')
				}
			}
		})
		abortImport = true
		await expect(
			repository.records.importExternalWithTracks(context, externalInput())
		).resolves.toMatchObject({ status: 'unavailable' })
		repository.close()
		repositories.delete(repository)

		const reopened = await openBrowserLibraryRepository({
			workspaceId: context.workspaceId,
			repositoryId: context.repositoryId,
			isCurrentContext: () => true,
			dependencies: { ...dependencies, onTransactionStep: undefined }
		})
		repositories.add(reopened)
		await expect(reopened.records.list(context)).resolves.toMatchObject({
			status: 'success',
			value: []
		})
		await expect(reopened.tracks.list(context)).resolves.toMatchObject({
			status: 'success',
			value: []
		})
	})

	it('rejects malformed external metadata before opening a content write', async () => {
		let importSteps = 0
		const { context, repository } = await createHarness('invalid', {
			onTransactionStep: ({ command }) => {
				if (command === 'import-external-record-with-tracks') importSteps += 1
			}
		})
		const input = externalInput(42, '   ')

		await expect(
			repository.records.importExternalWithTracks(context, input)
		).resolves.toMatchObject({ status: 'conflict', reason: 'integrity' })
		expect(importSteps).toBe(0)
		await expect(repository.records.list(context)).resolves.toMatchObject({
			status: 'success',
			value: []
		})
	})
})
