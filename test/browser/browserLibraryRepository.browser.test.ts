import { afterEach, describe, expect, it, vi } from 'vitest'
import {
	encodeBrowserManagedCover,
	encodeBrowserPreferencesRow
} from '../../app/repositories/library/browser/browserLibraryCodecs'
import {
	BrowserStorageCodecError,
	BrowserStorageError
} from '../../app/repositories/library/browser/browserLibraryErrors'
import { openBrowserLibraryRepository } from '../../app/repositories/library/browser/browserLibraryRepository'
import {
	BROWSER_LIBRARY_SCHEMA,
	BROWSER_LIBRARY_STORES,
	openBrowserLibraryDatabase,
	probeBrowserLibraryStorage,
	transactionComplete
} from '../../app/repositories/library/browser/browserLibrarySchema'
import type {
	BrowserBroadcastChannel,
	BrowserLibraryDependencies,
	BrowserLibraryRepository,
	BrowserWorkspaceManifest
} from '../../app/repositories/library/browser/browserLibraryTypes'
import {
	BROWSER_LIBRARY_BROADCAST_PROTOCOL_VERSION,
	BROWSER_LIBRARY_SCHEMA_VERSION
} from '../../app/repositories/library/browser/browserLibraryTypes'
import { createBrowserWorkspaceCatalog } from '../../app/repositories/library/browser/browserWorkspaceCatalog'
import {
	LOCAL_AUDIO_CACHE_DATABASE_NAME,
	clearLocalAudioAnalysisCache,
	getCachedLocalAudioResult,
	putCachedLocalAudioResult
} from '../../app/utils/localAudioCache'
import type { LibraryDataset } from '../../shared/types/library'
import {
	BROWSER_LIBRARY_SCALE,
	createBrowserLibraryScaleFixture,
	createDeterministicCoverBlob
} from '../fixtures/browserLibrary'
import { createTrackEnrichmentDraftFixture } from '../fixtures/trackEnrichmentDraft'

const NOW = '2026-07-23T04:00:00.000Z'
const repositories = new Set<BrowserLibraryRepository>()
const databaseNames = new Set<string>()

function repositoryDatabaseName(label: string) {
	const name = `crate-guide-browser-repository-${label}-${crypto.randomUUID()}`
	databaseNames.add(name)
	return name
}

function deleteDatabase(name: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.deleteDatabase(name)
		request.addEventListener('success', () => resolve(), { once: true })
		request.addEventListener(
			'error',
			() => reject(request.error ?? new Error(`Could not delete ${name}.`)),
			{ once: true }
		)
		request.addEventListener(
			'blocked',
			() =>
				reject(new Error(`Database deletion remained blocked for ${name}.`)),
			{ once: true }
		)
	})
}

type RepositoryHarness = {
	context: {
		workspaceId: string
		repositoryId: string
		activationGeneration: number
	}
	databaseName: string
	manifest: BrowserWorkspaceManifest
	repository: BrowserLibraryRepository
	setGeneration(value: number): void
}

async function createRepositoryHarness(
	label: string,
	overrides: BrowserLibraryDependencies = {}
): Promise<RepositoryHarness> {
	const databaseName = repositoryDatabaseName(label)
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
	let generation = 0
	const context = {
		workspaceId: created.value.id,
		repositoryId: created.value.repositoryId,
		activationGeneration: 0
	}
	const repository = await openBrowserLibraryRepository({
		workspaceId: context.workspaceId,
		repositoryId: context.repositoryId,
		isCurrentContext: (candidate) =>
			candidate.activationGeneration === generation,
		dependencies
	})
	repositories.add(repository)
	return {
		context,
		databaseName,
		manifest: created.value,
		repository,
		setGeneration(value) {
			generation = value
		}
	}
}

function smallDataset(title = 'Release'): LibraryDataset {
	return {
		records: [
			{
				id: 'record-a',
				title,
				artists: [{ name: 'Artist', role: null }],
				labels: [{ name: 'Label', catno: 'CAT-1' }],
				year: 2026,
				cover: {
					kind: 'browser',
					assetId: 'record-a/cover.webp',
					fallbackUrl: null
				},
				discogs_id: null,
				discogs_release_url: null,
				created_at: NOW,
				updated_at: NOW
			}
		],
		tracks: [
			{
				id: 'track-a',
				record_id: 'record-a',
				title: 'Track A',
				artists: [{ name: 'Artist', role: null }],
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
				playable: true,
				beatport_data: null,
				audio_features: null,
				created_at: NOW,
				updated_at: NOW
			}
		],
		crates: [
			{
				id: 'crate-a',
				name: 'Crate A',
				description: null,
				color: null,
				records: ['record-a'],
				created_at: NOW,
				updated_at: NOW
			}
		],
		savedSets: [
			{
				id: 'set-a',
				name: 'Set A',
				played_tracks: [
					{
						track_id: 'track-a',
						time_added: Date.parse(NOW),
						adjusted_bpm: null,
						transition_rating: null
					}
				],
				created_at: NOW,
				updated_at: NOW
			}
		],
		preferences: {
			ui_theme: 'dark',
			key_format: 'camelot',
			list_layout: 'compact',
			selected_crate: 'crate-a',
			turntable_pitch_range: 8,
			turntable_theme: 'black'
		}
	}
}

function smallCover() {
	return createDeterministicCoverBlob('record-a/cover.webp', 1_024)
}

function openDatabaseVersion(name: string, version: number) {
	return new Promise<IDBDatabase>((resolve, reject) => {
		const request = indexedDB.open(name, version)
		request.addEventListener('success', () => resolve(request.result), {
			once: true
		})
		request.addEventListener(
			'error',
			() => reject(request.error ?? new Error(`Could not open ${name}.`)),
			{ once: true }
		)
	})
}

async function manifestRevisions(repository: BrowserLibraryRepository) {
	const manifest = await repository.readManifest()
	if (!manifest)
		throw new Error('Expected the Local library manifest to exist.')
	return {
		contentRevision: manifest.contentRevision,
		repositoryRevision: manifest.repositoryRevision
	}
}

async function mutatePreferencesRow(
	databaseName: string,
	workspaceId: string,
	value: 'delete' | LibraryDataset['preferences']
) {
	const database = await openBrowserLibraryDatabase({ databaseName })
	try {
		const transaction = database.transaction(
			BROWSER_LIBRARY_STORES.preferences,
			'readwrite'
		)
		const completion = transactionComplete(transaction)
		const store = transaction.objectStore(BROWSER_LIBRARY_STORES.preferences)
		if (value === 'delete') store.delete(workspaceId)
		else store.put(encodeBrowserPreferencesRow(workspaceId, value))
		await completion
	} finally {
		database.close()
	}
}

async function mutateCoverRow(
	databaseName: string,
	workspaceId: string,
	assetId: string,
	row: ReturnType<typeof encodeBrowserManagedCover> | null
) {
	const database = await openBrowserLibraryDatabase({ databaseName })
	try {
		const transaction = database.transaction(
			BROWSER_LIBRARY_STORES.covers,
			'readwrite'
		)
		const completion = transactionComplete(transaction)
		const store = transaction.objectStore(BROWSER_LIBRARY_STORES.covers)
		if (row === null) store.delete([workspaceId, assetId])
		else store.put(row)
		await completion
	} finally {
		database.close()
	}
}

afterEach(async () => {
	for (const repository of repositories) repository.close()
	repositories.clear()
	await Promise.all([...databaseNames].map((name) => deleteDatabase(name)))
	databaseNames.clear()
})

async function sha256(blob: Blob) {
	const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
	return Array.from(new Uint8Array(digest), (byte) =>
		byte.toString(16).padStart(2, '0')
	).join('')
}

describe('browser library deterministic fixtures', () => {
	it('builds the declared 1k-record and 10k-track graph without broken references', () => {
		const fixture = createBrowserLibraryScaleFixture()
		const recordIds = new Set(
			fixture.snapshot.records.map((record) => record.id)
		)
		const trackIds = new Set(fixture.snapshot.tracks.map((track) => track.id))

		expect(fixture.snapshot.records).toHaveLength(BROWSER_LIBRARY_SCALE.records)
		expect(fixture.snapshot.tracks).toHaveLength(BROWSER_LIBRARY_SCALE.tracks)
		expect(fixture.snapshot.crates).toHaveLength(BROWSER_LIBRARY_SCALE.crates)
		expect(fixture.snapshot.savedSets).toHaveLength(
			BROWSER_LIBRARY_SCALE.savedSets
		)
		expect(
			fixture.snapshot.tracks.every((track) => recordIds.has(track.record_id))
		).toBe(true)
		expect(
			fixture.snapshot.crates.every((crate) =>
				crate.records.every((recordId) => recordIds.has(recordId))
			)
		).toBe(true)
		expect(
			fixture.snapshot.savedSets.every((savedSet) =>
				savedSet.played_tracks.every((entry) => trackIds.has(entry.track_id))
			)
		).toBe(true)
		expect(fixture.managedCoverAssetIds).toHaveLength(10)
		expect(fixture.snapshot.preferences.selected_crate).toBe(
			fixture.snapshot.crates[0]!.id
		)
	})

	it('creates a deterministic 2 MiB WebP-typed cover payload', async () => {
		const first = createDeterministicCoverBlob('record-00000/cover.webp')
		const second = createDeterministicCoverBlob('record-00000/cover.webp')
		const digest = await sha256(first)

		expect(first.size).toBe(BROWSER_LIBRARY_SCALE.coverBytes)
		expect(first.type).toBe('image/webp')
		expect(digest).toBe(
			'5189d7c852696ff2c2c874c793da1932e389abf146ac57ae6145d7d2f3dda5ae'
		)
		expect(await sha256(second)).toBe(digest)
	})
})

describe('browser library repository core contract', () => {
	it('matches the shared isolated-read and stale-activation contract', async () => {
		const { repository, context, setGeneration } =
			await createRepositoryHarness('shared-read-contract')
		await repository.replaceSnapshot(context, {
			snapshot: smallDataset(),
			covers: { 'record-a/cover.webp': smallCover() }
		})
		const first = await repository.readObservedLibraryView(context)
		expect(first).toMatchObject({
			status: 'success',
			value: {
				consistency: 'non-atomic-observation',
				records: [{ title: 'Release' }],
				preferences: { key_format: 'camelot' }
			}
		})
		if (first.status !== 'success') return
		first.value.records[0]!.title = 'Mutated caller copy'
		first.value.preferences.key_format = 'key'

		expect(await repository.readObservedLibraryView(context)).toMatchObject({
			status: 'success',
			value: {
				records: [{ title: 'Release' }],
				preferences: { key_format: 'camelot' }
			}
		})
		const firstSnapshot = await repository.readLibrarySnapshot(context)
		if (firstSnapshot.status !== 'success') {
			throw new Error('Expected coherent browser snapshot.')
		}
		firstSnapshot.value.dataset.records[0]!.title = 'Mutated snapshot copy'
		expect(await repository.readLibrarySnapshot(context)).toMatchObject({
			status: 'success',
			value: { dataset: { records: [{ title: 'Release' }] } }
		})

		setGeneration(1)
		for (const outcome of await Promise.all([
			repository.readObservedLibraryView(context),
			repository.readLibrarySnapshot(context),
			repository.records.list(context),
			repository.tracks.list(context),
			repository.crates.list(context),
			repository.savedSets.list(context),
			repository.preferences.read(context)
		])) {
			expect(outcome).toEqual({ status: 'stale' })
		}
	})

	it('round-trips one coherent snapshot and implements atomic domain commands', async () => {
		const { repository, context } = await createRepositoryHarness('domain')
		const dataset = smallDataset()
		const replacement = await repository.replaceSnapshot(context, {
			snapshot: dataset,
			covers: new Map([['record-a/cover.webp', smallCover()]])
		})
		expect(replacement).toMatchObject({
			status: 'success',
			value: { records: [{ id: 'record-a' }], tracks: [{ id: 'track-a' }] }
		})
		expect(await repository.readManifest()).toMatchObject({
			contentRevision: 1,
			repositoryRevision: 1,
			coverCompleteness: 'complete'
		})

		const snapshot = await repository.readLibrarySnapshot(context)
		expect(snapshot).toMatchObject({
			status: 'success',
			value: {
				dataset,
				managedCovers: [
					{
						assetId: 'record-a/cover.webp',
						recordId: 'record-a',
						blob: { size: 1_024, type: 'image/webp' }
					}
				],
				contentRevision: 1,
				repositoryRevision: 1
			}
		})

		expect(
			await repository.records.update(context, {
				id: 'record-a',
				updates: { title: 'Updated release' }
			})
		).toMatchObject({ status: 'success', value: { title: 'Updated release' } })
		expect(
			await repository.crates.removeRecord(context, {
				crateId: 'crate-a',
				recordId: 'record-a'
			})
		).toMatchObject({ status: 'success', value: { records: [] } })
		expect(
			await repository.crates.addRecord(context, {
				crateId: 'crate-a',
				recordId: 'record-a'
			})
		).toMatchObject({
			status: 'success',
			value: { records: ['record-a'] }
		})

		const batch = await repository.tracks.updateBatch(context, [
			{
				id: 'track-a',
				expectedUpdatedAt: NOW,
				updates: { bpm: 124, key: 2, mode: 1 },
				preconditions: { bpmMustBeNull: true, keyModeMustBeNull: true }
			}
		])
		expect(batch).toMatchObject({
			status: 'success',
			value: {
				requiresReview: false,
				results: [{ status: 'updated', track: { bpm: 124, key: 2, mode: 1 } }]
			}
		})
		expect(
			await repository.savedSets.save(context, {
				setId: null,
				kind: 'auto',
				name: 'Ignored auto name',
				playedTracks: []
			})
		).toMatchObject({ status: 'success', value: { name: null } })
		expect(
			await repository.preferences.update(context, { ui_theme: 'light' })
		).toMatchObject({
			status: 'success',
			value: { ui_theme: 'light', selected_crate: 'crate-a' }
		})

		expect(
			await repository.records.removeFromCollection(context, { id: 'record-a' })
		).toMatchObject({ status: 'success', value: { id: 'record-a' } })
		const afterRemoval = await repository.readLibrarySnapshot(context)
		expect(afterRemoval).toMatchObject({
			status: 'success',
			value: {
				dataset: {
					records: [],
					tracks: [],
					crates: [{ id: 'crate-a', records: [] }]
				},
				managedCovers: []
			}
		})
	})

	it('applies every domain command with exact revisions, no-ops, and preconditions', async () => {
		const progress = vi.fn()
		const harness = await createRepositoryHarness('all-domain-commands', {
			processCoverFile: async () => smallCover()
		})
		const { repository, context } = harness

		const mutation = async <T>(run: () => Promise<T>) => {
			const before = await manifestRevisions(repository)
			const outcome = await run()
			const after = await manifestRevisions(repository)
			expect(outcome).toMatchObject({ status: 'success' })
			expect(after).toEqual({
				contentRevision: before.contentRevision + 1,
				repositoryRevision: before.repositoryRevision + 1
			})
			return outcome
		}
		const noMutation = async <T>(run: () => Promise<T>) => {
			const before = await manifestRevisions(repository)
			const outcome = await run()
			expect(await manifestRevisions(repository)).toEqual(before)
			return outcome
		}

		const createdRecord = await mutation(() =>
			repository.records.createWithTracks(context, {
				title: 'Manual release',
				artistName: 'Artist',
				labelName: 'Label',
				catno: 'CAT-2',
				year: 2025,
				cover: 'https://images.example.test/release.webp',
				defaultGenres: ['Techno'],
				defaultRpm: 45,
				tracks: [
					{ title: 'First', position: 'A1' },
					{ title: 'Second', artistName: 'Guest', bpm: 128 }
				]
			})
		)
		if (
			typeof createdRecord !== 'object' ||
			createdRecord === null ||
			!('status' in createdRecord) ||
			createdRecord.status !== 'success'
		) {
			throw new Error('Expected record creation to succeed.')
		}
		const recordId = createdRecord.value.id
		const createdTracks = await repository.tracks.list(context)
		expect(createdTracks.status).toBe('success')
		if (createdTracks.status === 'success') {
			expect(createdTracks.value).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						record_id: recordId,
						title: 'Second',
						rpm: 45
					}),
					expect.objectContaining({
						record_id: recordId,
						title: 'First',
						genres: ['Techno'],
						rpm: 45
					})
				])
			)
			expect(createdTracks.value).toHaveLength(2)
		}

		await mutation(() =>
			repository.records.update(context, {
				id: recordId,
				updates: { year: 2026 }
			})
		)
		const uploaded = await mutation(() =>
			repository.records.updateWithCover(context, {
				id: recordId,
				updates: { title: 'Manual release with cover' },
				change: {
					type: 'upload',
					file: new File(['source'], 'cover.png', { type: 'image/png' }),
					crop: { positionX: 50, positionY: 50 }
				}
			})
		)
		if (
			typeof uploaded !== 'object' ||
			uploaded === null ||
			!('status' in uploaded) ||
			uploaded.status !== 'success' ||
			uploaded.value.cover.kind !== 'browser'
		) {
			throw new Error('Expected managed cover upload to succeed.')
		}
		await expect(
			repository.covers.resolve(context, uploaded.value.cover)
		).resolves.toMatch(/^blob:/)
		await mutation(() =>
			repository.records.updateWithCover(context, {
				id: recordId,
				updates: {},
				change: { type: 'remove' }
			})
		)
		expect(
			await noMutation(() => repository.records.drainCoverCleanup(context))
		).toMatchObject({ status: 'success', value: undefined })

		const trackList = await repository.tracks.list(context)
		if (trackList.status !== 'success') {
			throw new Error('Expected manual tracks to be readable.')
		}
		const firstTrack = trackList.value.find((track) => track.title === 'First')!
		await mutation(() =>
			repository.tracks.update(context, {
				id: firstTrack.id,
				updates: { playable: false }
			})
		)
		const createdTrack = await mutation(() =>
			repository.tracks.create(context, {
				record_id: recordId,
				title: 'Third',
				artists: [],
				extraartists: [],
				position: 'B1',
				duration: null,
				bpm: null,
				rpm: 45,
				key: null,
				mode: null,
				genres: [],
				time_signature_upper: null,
				time_signature_lower: null,
				playable: true,
				beatport_data: null,
				audio_features: null
			})
		)
		if (
			typeof createdTrack !== 'object' ||
			createdTrack === null ||
			!('status' in createdTrack) ||
			createdTrack.status !== 'success'
		) {
			throw new Error('Expected track creation to succeed.')
		}
		const batchUpdated = await mutation(() =>
			repository.tracks.updateBatch(
				context,
				[
					{
						id: createdTrack.value.id,
						expectedUpdatedAt: NOW,
						updates: { bpm: 126 },
						preconditions: { bpmMustBeNull: true }
					}
				],
				{ onProgress: progress }
			)
		)
		expect(batchUpdated).toMatchObject({
			status: 'success',
			value: { results: [{ status: 'updated' }], requiresReview: false }
		})
		expect(progress).toHaveBeenCalledTimes(1)
		const rejectedBatch = await noMutation(() =>
			repository.tracks.updateBatch(context, [
				{
					id: createdTrack.value.id,
					expectedUpdatedAt: '2020-01-01T00:00:00.000Z',
					updates: { bpm: 130 }
				},
				{
					id: 'missing-track',
					expectedUpdatedAt: NOW,
					updates: { bpm: 130 }
				},
				{
					id: 'duplicate-track',
					expectedUpdatedAt: NOW,
					updates: { bpm: 130 }
				},
				{
					id: 'duplicate-track',
					expectedUpdatedAt: NOW,
					updates: { bpm: 131 }
				}
			])
		)
		expect(rejectedBatch).toMatchObject({
			status: 'success',
			value: {
				requiresReview: true,
				results: [
					{ status: 'stale' },
					{ status: 'not_found' },
					{ status: 'invalid' },
					{ status: 'invalid' }
				]
			}
		})
		await mutation(() =>
			repository.tracks.delete(context, { id: createdTrack.value.id })
		)

		const createdCrate = await mutation(() =>
			repository.crates.create(context, {
				name: 'Command crate',
				description: null,
				color: '#334155'
			})
		)
		if (
			typeof createdCrate !== 'object' ||
			createdCrate === null ||
			!('status' in createdCrate) ||
			createdCrate.status !== 'success'
		) {
			throw new Error('Expected crate creation to succeed.')
		}
		const crateId = createdCrate.value.id
		await mutation(() =>
			repository.crates.updateMetadata(context, {
				id: crateId,
				updates: { description: 'Updated crate' }
			})
		)
		await mutation(() =>
			repository.crates.addRecord(context, { crateId, recordId })
		)
		expect(
			await noMutation(() =>
				repository.crates.addRecord(context, { crateId, recordId })
			)
		).toMatchObject({ status: 'success', value: { records: [recordId] } })
		await mutation(() =>
			repository.crates.removeRecord(context, { crateId, recordId })
		)
		expect(
			await noMutation(() =>
				repository.crates.removeRecord(context, { crateId, recordId })
			)
		).toMatchObject({ status: 'success', value: { records: [] } })

		await mutation(() =>
			repository.preferences.update(context, {
				selected_crate: crateId,
				list_layout: 'cover'
			})
		)
		const invalidPreference = await noMutation(() =>
			repository.preferences.update(context, {
				selected_crate: 'missing-crate'
			})
		)
		expect(invalidPreference).toMatchObject({
			status: 'conflict',
			reason: 'precondition-failed'
		})

		const createdSet = await mutation(() =>
			repository.savedSets.save(context, {
				setId: null,
				kind: 'manual',
				name: 'Command set',
				playedTracks: []
			})
		)
		if (
			typeof createdSet !== 'object' ||
			createdSet === null ||
			!('status' in createdSet) ||
			createdSet.status !== 'success'
		) {
			throw new Error('Expected set creation to succeed.')
		}
		await mutation(() =>
			repository.savedSets.save(context, {
				setId: createdSet.value.id,
				kind: 'manual',
				name: 'Renamed command set',
				playedTracks: []
			})
		)
		await mutation(() =>
			repository.savedSets.delete(context, { id: createdSet.value.id })
		)

		await mutation(() => repository.crates.delete(context, { id: crateId }))
		expect(await repository.preferences.read(context)).toMatchObject({
			status: 'success',
			value: { selected_crate: '' }
		})
		await mutation(() =>
			repository.records.removeFromCollection(context, { id: recordId })
		)
		expect(await repository.records.list(context)).toMatchObject({
			status: 'success',
			value: []
		})
		expect(await repository.tracks.list(context)).toMatchObject({
			status: 'success',
			value: []
		})
	})

	it('rejects a stale track editor without mutating its current metadata', async () => {
		const { repository, context } =
			await createRepositoryHarness('track-editor-cas')
		const dataset = smallDataset()
		await repository.replaceSnapshot(context, {
			snapshot: dataset,
			covers: { 'record-a/cover.webp': smallCover() }
		})
		const baseline = dataset.tracks[0]!
		const first = await repository.tracks.update(context, {
			id: baseline.id,
			updates: { bpm: 140 },
			expectedUpdatedAt: baseline.updated_at
		})
		expect(first.status).toBe('success')
		expect(
			await repository.tracks.update(context, {
				id: baseline.id,
				updates: { title: 'Stale editor' },
				expectedUpdatedAt: baseline.updated_at
			})
		).toMatchObject({ status: 'conflict', reason: 'precondition-failed' })
		expect(await repository.tracks.list(context)).toMatchObject({
			status: 'success',
			value: [expect.objectContaining({ title: baseline.title, bpm: 140 })]
		})
		if (first.status !== 'success')
			throw new Error('Expected the current editor to save')
		expect(
			await repository.tracks.update(context, {
				id: baseline.id,
				updates: { title: 'Reviewed edit' },
				expectedUpdatedAt: first.value.updated_at
			})
		).toMatchObject({
			status: 'success',
			value: { title: 'Reviewed edit', bpm: 140 }
		})
	})

	it('does not advance backup revisions or timestamps for semantic resaves', async () => {
		const { repository, context } =
			await createRepositoryHarness('semantic-noops')
		const dataset = smallDataset()
		expect(
			await repository.replaceSnapshot(context, {
				snapshot: dataset,
				covers: { 'record-a/cover.webp': smallCover() }
			})
		).toMatchObject({ status: 'success' })
		const before = await manifestRevisions(repository)

		for (const outcome of [
			await repository.records.update(context, {
				id: 'record-a',
				updates: { title: dataset.records[0]!.title }
			}),
			await repository.tracks.update(context, {
				id: 'track-a',
				updates: { title: dataset.tracks[0]!.title }
			}),
			await repository.crates.updateMetadata(context, {
				id: 'crate-a',
				updates: { description: dataset.crates[0]!.description }
			}),
			await repository.savedSets.save(context, {
				setId: 'set-a',
				kind: 'manual',
				name: dataset.savedSets[0]!.name,
				playedTracks: dataset.savedSets[0]!.played_tracks
			}),
			await repository.preferences.update(context, {})
		]) {
			expect(outcome).toMatchObject({ status: 'success' })
			expect(await manifestRevisions(repository)).toEqual(before)
		}

		const snapshot = await repository.readLibrarySnapshot(context)
		expect(snapshot).toMatchObject({
			status: 'success',
			value: {
				dataset: {
					records: [{ updated_at: NOW }],
					tracks: [{ updated_at: NOW }],
					crates: [{ updated_at: NOW }],
					savedSets: [{ updated_at: NOW }]
				}
			}
		})
	})

	it('uses monotonic entity tokens so same-clock enrichment cannot apply stale review', async () => {
		const { repository, context } = await createRepositoryHarness(
			'monotonic-entity-tokens'
		)
		await repository.replaceSnapshot(context, {
			snapshot: smallDataset(),
			covers: { 'record-a/cover.webp': smallCover() }
		})
		const edited = await repository.tracks.update(context, {
			id: 'track-a',
			updates: { title: 'Edited in another flow' }
		})
		expect(edited).toMatchObject({
			status: 'success',
			value: {
				created_at: NOW,
				updated_at: '2026-07-23T04:00:00.001Z'
			}
		})
		await expect(repository.recoverStorage()).resolves.toMatchObject({
			status: 'recovered',
			health: { code: 'healthy' }
		})
		const beforeStale = await manifestRevisions(repository)
		expect(
			await repository.tracks.updateBatch(context, [
				{
					id: 'track-a',
					expectedUpdatedAt: NOW,
					updates: { bpm: 128 }
				}
			])
		).toMatchObject({
			status: 'success',
			value: { results: [{ status: 'stale' }], requiresReview: true }
		})
		expect(await manifestRevisions(repository)).toEqual(beforeStale)

		expect(
			await repository.tracks.updateBatch(context, [
				{
					id: 'track-a',
					expectedUpdatedAt: '2026-07-23T04:00:00.001Z',
					updates: { bpm: 128 }
				}
			])
		).toMatchObject({
			status: 'success',
			value: {
				results: [
					{
						status: 'updated',
						track: {
							created_at: NOW,
							updated_at: '2026-07-23T04:00:00.002Z'
						}
					}
				]
			}
		})
	})

	it('updates crate timestamps when record deletion cascades membership', async () => {
		const { repository, context } = await createRepositoryHarness(
			'cascade-crate-timestamp'
		)
		await repository.replaceSnapshot(context, {
			snapshot: smallDataset(),
			covers: { 'record-a/cover.webp': smallCover() }
		})
		expect(
			await repository.records.removeFromCollection(context, { id: 'record-a' })
		).toMatchObject({ status: 'success' })
		expect(await repository.crates.list(context)).toMatchObject({
			status: 'success',
			value: [
				{
					id: 'crate-a',
					records: [],
					created_at: NOW,
					updated_at: '2026-07-23T04:00:00.001Z'
				}
			]
		})
	})

	it('fails closed when mandatory preferences disappear until explicit repair', async () => {
		for (const detection of ['read', 'update', 'crate-delete'] as const) {
			const harness = await createRepositoryHarness(
				`missing-preferences-${detection}`
			)
			if (detection === 'crate-delete') {
				await harness.repository.replaceSnapshot(harness.context, {
					snapshot: smallDataset(),
					covers: { 'record-a/cover.webp': smallCover() }
				})
			}
			await mutatePreferencesRow(
				harness.databaseName,
				harness.context.workspaceId,
				'delete'
			)
			const detected =
				detection === 'read'
					? await harness.repository.preferences.read(harness.context)
					: detection === 'update'
						? await harness.repository.preferences.update(harness.context, {
								ui_theme: 'dark'
							})
						: await harness.repository.crates.delete(harness.context, {
								id: 'crate-a'
							})
			expect(detected).toMatchObject({
				status: 'conflict',
				reason: 'integrity'
			})
			expect(
				await harness.repository.preferences.update(harness.context, {
					ui_theme: 'light'
				})
			).toMatchObject({ status: 'unavailable', reason: 'read-only' })
			await expect(harness.repository.recoverStorage()).resolves.toMatchObject({
				status: 'failed',
				health: { code: 'corrupt' }
			})

			const repairedPreferences =
				detection === 'crate-delete'
					? smallDataset().preferences
					: {
							ui_theme: 'auto' as const,
							key_format: 'camelot' as const,
							list_layout: 'cover',
							selected_crate: '',
							turntable_pitch_range: 8,
							turntable_theme: 'silver' as const
						}
			await mutatePreferencesRow(
				harness.databaseName,
				harness.context.workspaceId,
				repairedPreferences
			)
			await expect(harness.repository.recoverStorage()).resolves.toMatchObject({
				status: 'recovered',
				health: { code: 'healthy' }
			})
			expect(
				await harness.repository.preferences.update(harness.context, {
					ui_theme: 'light'
				})
			).toMatchObject({ status: 'success' })
			if (detection === 'crate-delete') {
				expect(
					await harness.repository.crates.list(harness.context)
				).toMatchObject({ status: 'success', value: [{ id: 'crate-a' }] })
			}
		}
	})

	it('lets a stale instance read newer data but blocks writes until coherent recovery', async () => {
		const databaseName = repositoryDatabaseName('lease-cas')
		const dependencies: BrowserLibraryDependencies = {
			databaseName,
			now: () => new Date(NOW),
			createBroadcastChannel: () => null
		}
		const catalog = await createBrowserWorkspaceCatalog(dependencies)
		const manifest = (
			await catalog.createWorkspace(
				{ id: 'workspace-a', name: 'CAS library' },
				0
			)
		).value
		catalog.close()
		const context = {
			workspaceId: manifest.id,
			repositoryId: manifest.repositoryId,
			activationGeneration: 0
		}
		const open = () =>
			openBrowserLibraryRepository({
				workspaceId: context.workspaceId,
				repositoryId: context.repositoryId,
				isCurrentContext: () => true,
				dependencies
			})
		const first = await open()
		const stale = await open()
		repositories.add(first)
		repositories.add(stale)

		expect(
			await first.preferences.update(context, { ui_theme: 'dark' })
		).toMatchObject({ status: 'success' })
		const observed = await stale.readLibrarySnapshot(context)
		expect(observed).toMatchObject({
			status: 'success',
			value: { dataset: { preferences: { ui_theme: 'dark' } } }
		})
		expect(
			await stale.preferences.update(context, { ui_theme: 'light' })
		).toEqual({
			status: 'conflict',
			reason: 'revision-mismatch',
			current: { repositoryRevision: 1 }
		})

		await expect(stale.recoverStorage()).resolves.toMatchObject({
			status: 'recovered',
			health: { code: 'healthy' }
		})
		expect(
			await stale.preferences.update(context, { ui_theme: 'light' })
		).toMatchObject({ status: 'success', value: { ui_theme: 'light' } })
	})

	it('atomically rebases operational-only draft/export revisions before a content write', async () => {
		const harness = await createRepositoryHarness('operational-rebase')
		const catalog = await createBrowserWorkspaceCatalog({
			databaseName: harness.databaseName,
			now: () => new Date(NOW),
			createBroadcastChannel: () => null
		})
		const exported = await catalog.recordExport(harness.context, 0, 0, NOW)
		expect(exported).toMatchObject({
			repositoryRevision: 1,
			value: { lastExportedContentRevision: 0 }
		})
		const payload = createTrackEnrichmentDraftFixture()
		payload.workspace = {
			workspaceId: harness.context.workspaceId,
			repositoryId: harness.context.repositoryId,
			repositoryRevision: 0
		}
		payload.draftRevision = 0
		payload.updatedAt = NOW
		const draft = {
			id: payload.id,
			kind: 'track-enrichment' as const,
			draftRevision: 0,
			updatedAt: NOW,
			payload
		}
		expect(
			await catalog.createDraftAndClaim(
				harness.context,
				draft,
				'operational-rebase-owner',
				{
					repositoryRevision: 1,
					draftRevision: null
				}
			)
		).toMatchObject({ repositoryRevision: 2, value: { draft } })

		expect(
			await harness.repository.preferences.update(harness.context, {
				ui_theme: 'dark'
			})
		).toMatchObject({ status: 'success', value: { ui_theme: 'dark' } })
		expect(await harness.repository.readManifest()).toMatchObject({
			contentRevision: 1,
			repositoryRevision: 3
		})
		expect(await catalog.readOperations(harness.context)).toMatchObject({
			repositoryRevision: 3,
			value: { lastExportedContentRevision: 0, lastExportedAt: NOW }
		})
		expect(await catalog.readDraft(harness.context, draft.id)).toMatchObject({
			repositoryRevision: 3,
			value: { draft: { status: 'ready', draft } }
		})
		catalog.close()
	})

	it('uses one wide-lock namespace for snapshot replacement and deletion', async () => {
		const request = vi.fn(
			async (
				_name: string,
				_options: LockOptions,
				callback: () => Promise<unknown>
			) => callback()
		)
		const harness = await createRepositoryHarness('wide-lock-convergence', {
			lockManager: { request } as unknown as LockManager
		})
		await harness.repository.replaceSnapshot(harness.context, {
			snapshot: smallDataset(),
			covers: { 'record-a/cover.webp': smallCover() }
		})
		const manifest = await harness.repository.readManifest()
		if (!manifest) throw new Error('Expected manifest before deletion.')
		const deletingCatalog = await createBrowserWorkspaceCatalog({
			databaseName: harness.databaseName,
			now: () => new Date(NOW),
			createBroadcastChannel: () => null,
			lockManager: { request } as unknown as LockManager
		})
		await deletingCatalog.deleteWorkspace({
			workspaceId: manifest.id,
			repositoryId: manifest.repositoryId,
			catalogRevision: 1,
			repositoryRevision: manifest.repositoryRevision
		})
		deletingCatalog.close()

		const lockNames = request.mock.calls.map(([name]) => name)
		expect(lockNames).toHaveLength(2)
		expect(new Set(lockNames)).toEqual(
			new Set([
				`${harness.databaseName}:workspace:${harness.context.workspaceId}:wide-write`
			])
		)
	})

	it('round-trips the 1k/10k graph and 2 MiB managed covers after reload', async () => {
		const fixture = createBrowserLibraryScaleFixture()
		const harness = await createRepositoryHarness('scale-reload')
		const covers = new Map(
			fixture.managedCoverAssetIds.map((assetId) => [
				assetId,
				createDeterministicCoverBlob(assetId)
			])
		)
		expect(
			await harness.repository.replaceSnapshot(harness.context, {
				snapshot: fixture.snapshot,
				covers
			})
		).toMatchObject({ status: 'success' })
		harness.repository.close()

		const reopened = await openBrowserLibraryRepository({
			workspaceId: harness.context.workspaceId,
			repositoryId: harness.context.repositoryId,
			isCurrentContext: () => true,
			dependencies: {
				databaseName: harness.databaseName,
				now: () => new Date(NOW),
				createBroadcastChannel: () => null
			}
		})
		repositories.add(reopened)
		const persisted = await reopened.readLibrarySnapshot(harness.context)
		expect(persisted).toMatchObject({
			status: 'success',
			value: {
				dataset: {
					records: { length: BROWSER_LIBRARY_SCALE.records },
					tracks: { length: BROWSER_LIBRARY_SCALE.tracks },
					crates: { length: BROWSER_LIBRARY_SCALE.crates },
					savedSets: { length: BROWSER_LIBRARY_SCALE.savedSets }
				},
				managedCovers: { length: fixture.managedCoverAssetIds.length },
				contentRevision: 1,
				repositoryRevision: 1,
				coverCompleteness: 'complete'
			}
		})
		if (persisted.status !== 'success') return
		const recordIds = new Set(
			persisted.value.dataset.records.map((record) => record.id)
		)
		expect(
			persisted.value.dataset.tracks.every((track) =>
				recordIds.has(track.record_id)
			)
		).toBe(true)
		expect(
			persisted.value.managedCovers.every(
				(cover) =>
					cover.blob.size === BROWSER_LIBRARY_SCALE.coverBytes &&
					cover.blob.type === 'image/webp'
			)
		).toBe(true)
		const firstCover = persisted.value.managedCovers.find(
			(cover) => cover.assetId === fixture.managedCoverAssetIds[0]
		)!
		expect(await sha256(firstCover.blob)).toBe(
			'5189d7c852696ff2c2c874c793da1932e389abf146ac57ae6145d7d2f3dda5ae'
		)
	})

	it('uses the activation guard before publishing a late managed-cover URL', async () => {
		const createObjectURL = vi.fn(() => 'blob:managed-cover')
		const { repository, context, setGeneration } =
			await createRepositoryHarness('cover-stale', { createObjectURL })
		await repository.replaceSnapshot(context, {
			snapshot: smallDataset(),
			covers: { 'record-a/cover.webp': smallCover() }
		})
		const reference = {
			kind: 'browser',
			assetId: 'record-a/cover.webp',
			fallbackUrl: 'https://cdn.example.test/fallback.webp'
		} as const
		const pending = repository.covers.resolve(context, reference)
		const joinedPending = repository.covers.resolve(context, reference)
		setGeneration(1)
		const currentPending = repository.covers.resolve(
			{ ...context, activationGeneration: 1 },
			reference
		)

		await expect(pending).resolves.toBeNull()
		await expect(joinedPending).resolves.toBeNull()
		await expect(currentPending).resolves.toBe('blob:managed-cover')
		expect(createObjectURL).toHaveBeenCalledOnce()
	})

	it('skips stale cover processing and suppresses failures after activation changes', async () => {
		let rejectProcessing: ((error: unknown) => void) | null = null
		const processCoverFile = vi.fn(
			() =>
				new Promise<Blob>((_resolve, reject) => {
					rejectProcessing = reject
				})
		)
		const { repository, context, setGeneration } =
			await createRepositoryHarness('cover-processing-stale', {
				processCoverFile
			})
		const upload = {
			id: 'missing-record',
			updates: {},
			change: {
				type: 'upload' as const,
				file: new File(['cover'], 'cover.webp', { type: 'image/webp' }),
				crop: { positionX: 50, positionY: 50 }
			}
		}

		setGeneration(1)
		await expect(
			repository.records.updateWithCover(context, upload)
		).resolves.toEqual({ status: 'stale' })
		expect(processCoverFile).not.toHaveBeenCalled()

		const currentContext = { ...context, activationGeneration: 1 }
		const pending = repository.records.updateWithCover(currentContext, upload)
		expect(processCoverFile).toHaveBeenCalledOnce()
		setGeneration(2)
		rejectProcessing?.(new Error('Processing failed after workspace switch.'))
		await expect(pending).resolves.toEqual({ status: 'stale' })
	})

	it('revokes managed-cover object URLs after invalidation and close', async () => {
		const createObjectURL = vi
			.fn()
			.mockReturnValueOnce('blob:managed-cover-1')
			.mockReturnValueOnce('blob:managed-cover-2')
		const revokeObjectURL = vi.fn()
		const { repository, context } = await createRepositoryHarness(
			'cover-revocation',
			{ createObjectURL, revokeObjectURL }
		)
		await repository.replaceSnapshot(context, {
			snapshot: smallDataset(),
			covers: { 'record-a/cover.webp': smallCover() }
		})
		const reference = smallDataset().records[0]!.cover
		await expect(repository.covers.resolve(context, reference)).resolves.toBe(
			'blob:managed-cover-1'
		)

		await repository.records.update(context, {
			id: 'record-a',
			updates: { title: 'Invalidates cached cover URL' }
		})
		expect(revokeObjectURL).toHaveBeenCalledWith('blob:managed-cover-1')
		await expect(repository.covers.resolve(context, reference)).resolves.toBe(
			'blob:managed-cover-2'
		)

		repository.close()
		expect(revokeObjectURL).toHaveBeenCalledWith('blob:managed-cover-2')
	})

	it('deduplicates concurrent managed-cover loads without leaking object URLs', async () => {
		const createObjectURL = vi.fn(() => 'blob:deduplicated-cover')
		const revokeObjectURL = vi.fn()
		const { repository, context } = await createRepositoryHarness(
			'cover-concurrency',
			{ createObjectURL, revokeObjectURL }
		)
		await repository.replaceSnapshot(context, {
			snapshot: smallDataset(),
			covers: { 'record-a/cover.webp': smallCover() }
		})
		const reference = smallDataset().records[0]!.cover

		await expect(
			Promise.all([
				repository.covers.resolve(context, reference),
				repository.covers.resolve(context, reference),
				repository.covers.resolve(context, reference)
			])
		).resolves.toEqual([
			'blob:deduplicated-cover',
			'blob:deduplicated-cover',
			'blob:deduplicated-cover'
		])
		expect(createObjectURL).toHaveBeenCalledTimes(1)

		repository.close()
		expect(revokeObjectURL).toHaveBeenCalledTimes(1)
		expect(revokeObjectURL).toHaveBeenCalledWith('blob:deduplicated-cover')
	})

	it('fails closed for missing complete covers and orphaned cover rows', async () => {
		const missing = await createRepositoryHarness('missing-complete-cover')
		await missing.repository.replaceSnapshot(missing.context, {
			snapshot: smallDataset(),
			covers: { 'record-a/cover.webp': smallCover() }
		})
		await mutateCoverRow(
			missing.databaseName,
			missing.context.workspaceId,
			'record-a/cover.webp',
			null
		)
		await expect(
			missing.repository.covers.resolve(missing.context, {
				kind: 'browser',
				assetId: 'record-a/cover.webp',
				fallbackUrl: 'https://cdn.example.test/fallback.webp'
			})
		).rejects.toMatchObject({
			code: 'corrupt',
			path: '/snapshot/covers/missing'
		})
		expect(
			await missing.repository.preferences.update(missing.context, {
				ui_theme: 'light'
			})
		).toMatchObject({ status: 'unavailable', reason: 'read-only' })
		await expect(missing.repository.recoverStorage()).resolves.toMatchObject({
			status: 'failed',
			health: { code: 'corrupt' }
		})

		const orphaned = await createRepositoryHarness('orphaned-cover-row')
		await mutateCoverRow(
			orphaned.databaseName,
			orphaned.context.workspaceId,
			'record-z/orphan.webp',
			encodeBrowserManagedCover({
				workspaceId: orphaned.context.workspaceId,
				assetId: 'record-z/orphan.webp',
				recordId: 'record-z',
				blob: smallCover(),
				createdAt: NOW,
				updatedAt: NOW
			})
		)
		await expect(
			orphaned.repository.covers.resolve(orphaned.context, {
				kind: 'browser',
				assetId: 'record-z/orphan.webp',
				fallbackUrl: null
			})
		).rejects.toMatchObject({
			code: 'corrupt',
			path: '/snapshot/covers/recordId'
		})
	})

	it('ignores forged and old-incarnation broadcasts around coherent recovery', async () => {
		const channels: Array<{
			channel: BrowserBroadcastChannel
			emit(value: unknown): void
		}> = []
		const createBroadcastChannel = () => {
			const listeners = new Set<EventListener>()
			const channel: BrowserBroadcastChannel = {
				addEventListener(_type, listener) {
					listeners.add(listener as EventListener)
				},
				removeEventListener(_type, listener) {
					listeners.delete(listener as EventListener)
				},
				postMessage() {},
				close() {
					listeners.clear()
				}
			}
			channels.push({
				channel,
				emit(value) {
					for (const listener of listeners) {
						listener(new MessageEvent('message', { data: value }))
					}
				}
			})
			return channel
		}
		const databaseName = repositoryDatabaseName('out-of-order-broadcast')
		const dependencies = {
			databaseName,
			now: () => new Date(NOW),
			createBroadcastChannel
		}
		const catalog = await createBrowserWorkspaceCatalog(dependencies)
		const manifest = (
			await catalog.createWorkspace(
				{ id: 'workspace-a', name: 'Revision library' },
				0
			)
		).value
		catalog.close()
		const context = {
			workspaceId: manifest.id,
			repositoryId: manifest.repositoryId,
			activationGeneration: 0
		}
		const open = () =>
			openBrowserLibraryRepository({
				workspaceId: manifest.id,
				repositoryId: manifest.repositoryId,
				isCurrentContext: () => true,
				dependencies
			})
		const writer = await open()
		const observer = await open()
		repositories.add(writer)
		repositories.add(observer)
		const observerChannel = channels.at(-1)!
		const change = (
			repositoryId: string,
			repositoryRevision: number,
			contentRevision: number
		) => ({
			protocolVersion: BROWSER_LIBRARY_BROADCAST_PROTOCOL_VERSION,
			eventId: `external-${repositoryId}-${repositoryRevision}`,
			senderId: 'external-page',
			type: 'commit' as const,
			workspaceId: manifest.id,
			repositoryId,
			catalogRevision: null,
			repositoryRevision,
			contentRevision,
			committedAt: NOW,
			invalidations: []
		})
		observerChannel.emit(change(manifest.repositoryId, 999, 0))
		await writer.preferences.update(context, { ui_theme: 'dark' })
		expect(
			await observer.preferences.update(context, { ui_theme: 'light' })
		).toMatchObject({ status: 'conflict', reason: 'revision-mismatch' })
		await expect(observer.recoverStorage()).resolves.toMatchObject({
			status: 'recovered',
			health: { code: 'healthy' }
		})
		observerChannel.emit(change('old-repository-incarnation', 10_000, 10_000))
		expect(
			await observer.preferences.update(context, { ui_theme: 'dark' })
		).toMatchObject({ status: 'success' })

		await writer.recoverStorage()
		await writer.preferences.update(context, { ui_theme: 'light' })
		const current = await writer.readManifest()
		if (!current) throw new Error('Expected current manifest.')
		observerChannel.emit(
			change(
				manifest.repositoryId,
				current.repositoryRevision,
				current.contentRevision
			)
		)

		expect(
			await observer.preferences.update(context, { ui_theme: 'dark' })
		).toMatchObject({ status: 'conflict', reason: 'revision-mismatch' })
		await observer.recoverStorage()
		observerChannel.emit(change(manifest.repositoryId, 1, 1))
		expect(
			await observer.preferences.update(context, { ui_theme: 'dark' })
		).toMatchObject({ status: 'success' })
	})

	it('broadcasts committed reset/delete revisions and invalidates another instance', async () => {
		const databaseName = repositoryDatabaseName('broadcast-reset-delete')
		const dependencies: BrowserLibraryDependencies = {
			databaseName,
			now: () => new Date(NOW)
		}
		const catalog = await createBrowserWorkspaceCatalog(dependencies)
		const manifest = (
			await catalog.createWorkspace(
				{ id: 'workspace-a', name: 'Broadcast library' },
				0
			)
		).value
		catalog.close()
		const context = {
			workspaceId: manifest.id,
			repositoryId: manifest.repositoryId,
			activationGeneration: 0
		}
		const seed = await openBrowserLibraryRepository({
			workspaceId: manifest.id,
			repositoryId: manifest.repositoryId,
			isCurrentContext: () => true,
			dependencies
		})
		await seed.replaceSnapshot(context, {
			snapshot: smallDataset(),
			covers: { 'record-a/cover.webp': smallCover() }
		})
		seed.close()

		const first = await openBrowserLibraryRepository({
			workspaceId: manifest.id,
			repositoryId: manifest.repositoryId,
			isCurrentContext: () => true,
			dependencies
		})
		const revokeObjectURL = vi.fn()
		const second = await openBrowserLibraryRepository({
			workspaceId: manifest.id,
			repositoryId: manifest.repositoryId,
			isCurrentContext: () => true,
			dependencies: {
				...dependencies,
				createObjectURL: () => 'blob:remote-cover',
				revokeObjectURL
			}
		})
		repositories.add(first)
		repositories.add(second)
		await expect(
			second.covers.resolve(context, smallDataset().records[0]!.cover)
		).resolves.toBe('blob:remote-cover')

		const resetReceived = new Promise<void>((resolve) => {
			const unsubscribe = second.subscribe((change) => {
				if (change.type !== 'reset') return
				expect(change).toMatchObject({
					workspaceId: manifest.id,
					repositoryId: manifest.repositoryId,
					repositoryRevision: 2,
					contentRevision: 2,
					invalidations: expect.arrayContaining([
						{ entity: 'records', ids: ['record-a'] },
						{ entity: 'covers', ids: ['record-a/cover.webp'] }
					])
				})
				unsubscribe()
				resolve()
			})
		})
		await first.replaceSnapshot(context, {
			snapshot: smallDataset('Remote replacement'),
			covers: { 'record-a/cover.webp': smallCover() }
		})
		await resetReceived
		expect(revokeObjectURL).toHaveBeenCalledWith('blob:remote-cover')
		expect(
			await second.preferences.update(context, { ui_theme: 'light' })
		).toEqual({
			status: 'conflict',
			reason: 'revision-mismatch',
			current: { repositoryRevision: 2 }
		})

		const deletingCatalog = await createBrowserWorkspaceCatalog(dependencies)
		const deleteReceived = new Promise<void>((resolve) => {
			const unsubscribe = second.subscribe((change) => {
				if (change.type !== 'delete') return
				expect(change).toMatchObject({
					workspaceId: manifest.id,
					repositoryRevision: null,
					contentRevision: null
				})
				unsubscribe()
				resolve()
			})
		})
		await deletingCatalog.deleteWorkspace({
			workspaceId: manifest.id,
			repositoryId: manifest.repositoryId,
			catalogRevision: 1,
			repositoryRevision: 2
		})
		await deleteReceived
		expect(
			await second.preferences.update(context, { ui_theme: 'dark' })
		).toEqual({
			status: 'conflict',
			reason: 'not-found'
		})
		expect(await second.readLibrarySnapshot(context)).toEqual({
			status: 'conflict',
			reason: 'not-found'
		})
		await expect(second.recoverStorage()).resolves.toEqual({
			status: 'not-found'
		})

		const replacement = (
			await deletingCatalog.createWorkspace(
				{ id: manifest.id, name: 'Replacement library' },
				2
			)
		).value
		expect(replacement.repositoryId).not.toBe(manifest.repositoryId)
		expect(await second.readManifest()).toBeNull()
		expect(await second.readLibrarySnapshot(context)).toEqual({
			status: 'conflict',
			reason: 'not-found'
		})
		expect(
			await second.preferences.update(context, { ui_theme: 'light' })
		).toEqual({ status: 'conflict', reason: 'not-found' })
		await expect(second.recoverStorage()).resolves.toEqual({
			status: 'not-found'
		})
		deletingCatalog.close()
	})

	it('never publishes a late command result after the repository closes', async () => {
		let repositoryToClose: BrowserLibraryRepository | null = null
		let closeOnWrite = false
		const harness = await createRepositoryHarness('close-in-flight', {
			onTransactionStep: ({ command }) => {
				if (closeOnWrite && command === 'update-preferences') {
					repositoryToClose?.close()
				}
			}
		})
		repositoryToClose = harness.repository
		closeOnWrite = true

		await expect(
			harness.repository.preferences.update(harness.context, {
				ui_theme: 'dark'
			})
		).resolves.toEqual({ status: 'stale' })
	})

	it('rejects the repository identity of a deleted and recreated workspace', async () => {
		const databaseName = repositoryDatabaseName('recreated-identity')
		const dependencies = {
			databaseName,
			now: () => new Date(NOW),
			createBroadcastChannel: () => null
		}
		const catalog = await createBrowserWorkspaceCatalog(dependencies)
		const original = (
			await catalog.createWorkspace({ id: 'workspace-a', name: 'Original' }, 0)
		).value
		await catalog.deleteWorkspace({
			workspaceId: original.id,
			repositoryId: original.repositoryId,
			catalogRevision: 1,
			repositoryRevision: 0
		})
		const replacement = (
			await catalog.createWorkspace(
				{ id: 'workspace-a', name: 'Replacement' },
				2
			)
		).value
		catalog.close()
		expect(replacement.repositoryId).not.toBe(original.repositoryId)

		await expect(
			openBrowserLibraryRepository({
				workspaceId: original.id,
				repositoryId: original.repositoryId,
				isCurrentContext: () => true,
				dependencies
			})
		).rejects.toMatchObject({ code: 'not-found', entity: 'workspace' })
	})

	it('isolates identical entity ids across two durable workspaces', async () => {
		const databaseName = repositoryDatabaseName('workspace-isolation')
		const dependencies = {
			databaseName,
			now: () => new Date(NOW),
			createBroadcastChannel: () => null
		}
		const catalog = await createBrowserWorkspaceCatalog(dependencies)
		const workspaceA = (
			await catalog.createWorkspace({ id: 'workspace-a', name: 'A' }, 0)
		).value
		const workspaceB = (
			await catalog.createWorkspace({ id: 'workspace-b', name: 'B' }, 1)
		).value
		const contextA = {
			workspaceId: workspaceA.id,
			repositoryId: workspaceA.repositoryId,
			activationGeneration: 0
		}
		const contextB = {
			workspaceId: workspaceB.id,
			repositoryId: workspaceB.repositoryId,
			activationGeneration: 0
		}
		const repositoryA = await openBrowserLibraryRepository({
			...contextA,
			isCurrentContext: () => true,
			dependencies
		})
		const repositoryB = await openBrowserLibraryRepository({
			...contextB,
			isCurrentContext: () => true,
			dependencies
		})
		repositories.add(repositoryA)
		repositories.add(repositoryB)
		await repositoryA.replaceSnapshot(contextA, {
			snapshot: smallDataset('Workspace A'),
			covers: { 'record-a/cover.webp': smallCover() }
		})
		await repositoryB.replaceSnapshot(contextB, {
			snapshot: smallDataset('Workspace B'),
			covers: { 'record-a/cover.webp': smallCover() }
		})
		await repositoryA.records.update(contextA, {
			id: 'record-a',
			updates: { title: 'Workspace A mutation' }
		})

		const createDraft = (
			context: typeof contextA,
			repositoryRevision: number
		) => {
			const payload = createTrackEnrichmentDraftFixture()
			payload.workspace = {
				workspaceId: context.workspaceId,
				repositoryId: context.repositoryId,
				repositoryRevision
			}
			payload.draftRevision = 0
			payload.updatedAt = NOW
			return {
				id: payload.id,
				kind: 'track-enrichment' as const,
				draftRevision: 0,
				updatedAt: NOW,
				payload
			}
		}
		await catalog.createDraftAndClaim(
			contextA,
			createDraft(contextA, 2),
			'workspace-a-owner',
			{
				repositoryRevision: 2,
				draftRevision: null
			}
		)
		const draftB = createDraft(contextB, 1)
		await catalog.createDraftAndClaim(contextB, draftB, 'workspace-b-owner', {
			repositoryRevision: 1,
			draftRevision: null
		})
		const resetA = smallDataset('Workspace A reset')
		resetA.preferences.ui_theme = 'auto'
		await repositoryA.replaceSnapshot(contextA, {
			snapshot: resetA,
			covers: { 'record-a/cover.webp': smallCover() }
		})
		const manifestA = await repositoryA.readManifest()
		if (!manifestA) throw new Error('Expected workspace A manifest.')
		await catalog.deleteWorkspace({
			workspaceId: workspaceA.id,
			repositoryId: workspaceA.repositoryId,
			catalogRevision: 2,
			repositoryRevision: manifestA.repositoryRevision
		})

		expect(await repositoryB.readLibrarySnapshot(contextB)).toMatchObject({
			status: 'success',
			value: {
				dataset: {
					records: [{ id: 'record-a', title: 'Workspace B' }],
					tracks: [{ id: 'track-a', record_id: 'record-a' }],
					crates: [{ id: 'crate-a', records: ['record-a'] }],
					savedSets: [{ id: 'set-a' }],
					preferences: { ui_theme: 'dark', selected_crate: 'crate-a' }
				},
				managedCovers: [
					{ assetId: 'record-a/cover.webp', recordId: 'record-a' }
				],
				contentRevision: 1,
				repositoryRevision: 2
			}
		})
		expect(await catalog.readDraft(contextB, draftB.id)).toMatchObject({
			repositoryRevision: 2,
			value: { draft: { status: 'ready', draft: draftB } }
		})
		expect((await catalog.listWorkspaces()).workspaces).toMatchObject([
			{ id: 'workspace-b', repositoryId: workspaceB.repositoryId }
		])
		catalog.close()
	})

	it('migrates schema v0 once and closes cleanly for a future versionchange', async () => {
		const databaseName = repositoryDatabaseName('schema-versionchange')
		const blocking = vi.fn()
		const dependencies = {
			databaseName,
			now: () => new Date(NOW),
			createBroadcastChannel: () => null,
			onBlockingUpgrade: blocking
		}
		const firstOpen = await openBrowserLibraryDatabase(dependencies)
		expect(firstOpen.version).toBe(BROWSER_LIBRARY_SCHEMA_VERSION)
		expect([...firstOpen.objectStoreNames].sort()).toEqual(
			BROWSER_LIBRARY_SCHEMA.map((store) => store.name).sort()
		)
		firstOpen.close()
		const secondOpen = await openBrowserLibraryDatabase(dependencies)
		expect(secondOpen.version).toBe(BROWSER_LIBRARY_SCHEMA_VERSION)
		expect([...secondOpen.objectStoreNames].sort()).toEqual(
			BROWSER_LIBRARY_SCHEMA.map((store) => store.name).sort()
		)
		secondOpen.close()

		const catalog = await createBrowserWorkspaceCatalog(dependencies)
		const manifest = (
			await catalog.createWorkspace(
				{ id: 'workspace-a', name: 'Upgrade library' },
				0
			)
		).value
		catalog.close()
		const context = {
			workspaceId: manifest.id,
			repositoryId: manifest.repositoryId,
			activationGeneration: 0
		}
		const repository = await openBrowserLibraryRepository({
			workspaceId: manifest.id,
			repositoryId: manifest.repositoryId,
			isCurrentContext: () => true,
			dependencies
		})
		repositories.add(repository)
		const future = await openDatabaseVersion(
			databaseName,
			BROWSER_LIBRARY_SCHEMA_VERSION + 1
		)
		expect(blocking).toHaveBeenCalled()
		expect(
			await repository.preferences.update(context, { ui_theme: 'dark' })
		).toMatchObject({ status: 'unavailable', reason: 'read-only' })
		future.close()
	})

	it('classifies storage failures, prevents phantom writes, and recovers explicitly', async () => {
		const unavailableFactory = {
			open() {
				throw new DOMException('Unavailable', 'SecurityError')
			}
		} as unknown as IDBFactory
		await expect(
			probeBrowserLibraryStorage({
				indexedDB: unavailableFactory,
				now: () => new Date(NOW),
				randomUUID: () => 'probe-id'
			})
		).resolves.toMatchObject({ code: 'unavailable' })

		for (const failure of [
			new DOMException('Full', 'QuotaExceededError'),
			new BrowserStorageError('blocked-upgrade', 'Upgrade blocked.'),
			new Error('Unknown durable failure')
		]) {
			let injectedFailure: unknown = null
			const harness = await createRepositoryHarness(`failure-${failure.name}`, {
				onTransactionStep: ({ command }) => {
					if (command === 'update-preferences' && injectedFailure) {
						throw injectedFailure
					}
				}
			})
			const before = await manifestRevisions(harness.repository)
			injectedFailure = failure
			const failed = await harness.repository.preferences.update(
				harness.context,
				{ ui_theme: 'dark' }
			)
			expect(failed).toMatchObject({
				status: 'unavailable',
				reason: 'read-only',
				error: {
					code:
						failure instanceof BrowserStorageError
							? failure.code
							: failure.name === 'QuotaExceededError'
								? 'quota'
								: 'unknown'
				}
			})
			expect(await manifestRevisions(harness.repository)).toEqual(before)
			expect(
				await harness.repository.preferences.update(harness.context, {
					ui_theme: 'light'
				})
			).toMatchObject({ status: 'unavailable', reason: 'read-only' })

			injectedFailure = null
			await expect(harness.repository.recoverStorage()).resolves.toMatchObject({
				status: 'recovered',
				health: { code: 'healthy' }
			})
			expect(
				await harness.repository.preferences.update(harness.context, {
					ui_theme: 'light'
				})
			).toMatchObject({ status: 'success' })
		}

		let corrupt = false
		const corruptHarness = await createRepositoryHarness('failure-corrupt', {
			onTransactionStep: ({ command }) => {
				if (corrupt && command === 'update-preferences') {
					throw new BrowserStorageCodecError('/injected/corrupt')
				}
			}
		})
		corrupt = true
		expect(
			await corruptHarness.repository.preferences.update(
				corruptHarness.context,
				{ ui_theme: 'dark' }
			)
		).toMatchObject({ status: 'conflict', reason: 'integrity' })
		expect(
			await corruptHarness.repository.preferences.update(
				corruptHarness.context,
				{ ui_theme: 'light' }
			)
		).toMatchObject({ status: 'unavailable', reason: 'read-only' })
	})

	it('rolls back a real asynchronous IndexedDB request failure before recovery', async () => {
		const randomUUID = vi.fn(() => crypto.randomUUID())
		const harness = await createRepositoryHarness('constraint-request-abort', {
			randomUUID
		})
		await harness.repository.replaceSnapshot(harness.context, {
			snapshot: smallDataset(),
			covers: { 'record-a/cover.webp': smallCover() }
		})
		const before = await manifestRevisions(harness.repository)
		randomUUID.mockReturnValue('track-a')

		expect(
			await harness.repository.tracks.create(harness.context, {
				record_id: 'record-a',
				title: 'Duplicate primary key',
				artists: [],
				extraartists: [],
				position: null,
				duration: null,
				bpm: null,
				rpm: null,
				key: null,
				mode: null,
				genres: [],
				time_signature_upper: null,
				time_signature_lower: null,
				playable: true,
				beatport_data: null,
				audio_features: null
			})
		).toMatchObject({
			status: 'unavailable',
			reason: 'read-only',
			error: { code: 'corrupt' }
		})
		expect(await manifestRevisions(harness.repository)).toEqual(before)
		expect(await harness.repository.tracks.list(harness.context)).toMatchObject(
			{
				status: 'success',
				value: [{ id: 'track-a', title: 'Track A' }]
			}
		)
		expect(
			await harness.repository.preferences.update(harness.context, {
				ui_theme: 'light'
			})
		).toMatchObject({ status: 'unavailable', reason: 'read-only' })

		randomUUID.mockReturnValue('track-b')
		await expect(harness.repository.recoverStorage()).resolves.toMatchObject({
			status: 'recovered',
			health: { code: 'healthy' }
		})
		expect(
			await harness.repository.tracks.create(harness.context, {
				record_id: 'record-a',
				title: 'After recovery',
				artists: [],
				extraartists: [],
				position: null,
				duration: null,
				bpm: null,
				rpm: null,
				key: null,
				mode: null,
				genres: [],
				time_signature_upper: null,
				time_signature_lower: null,
				playable: true,
				beatport_data: null,
				audio_features: null
			})
		).toMatchObject({ status: 'success', value: { id: 'track-b' } })
	})

	it('keeps durable library and disposable audio cache lifecycles isolated', async () => {
		const databaseName = repositoryDatabaseName('database-separation')
		const openedNames: string[] = []
		const recordingFactory = {
			open(name: string, version?: number) {
				openedNames.push(name)
				return version === undefined
					? indexedDB.open(name)
					: indexedDB.open(name, version)
			}
		} as unknown as IDBFactory
		const dependencies = {
			databaseName,
			indexedDB: recordingFactory,
			now: () => new Date(NOW),
			createBroadcastChannel: () => null
		}
		const cacheRecord = {
			cacheKey: `crate-guide-local-audio-v3|separation-${crypto.randomUUID()}`,
			tags: {
				title: 'Cached track',
				artist: 'Cached artist',
				album: null,
				genres: ['House'],
				durationSeconds: 180,
				bpm: 124,
				key: '8A'
			},
			analysis: null,
			updatedAt: Date.parse(NOW)
		}
		await clearLocalAudioAnalysisCache()
		await putCachedLocalAudioResult(cacheRecord)
		const catalog = await createBrowserWorkspaceCatalog(dependencies)
		const manifest = (
			await catalog.createWorkspace(
				{ id: 'workspace-a', name: 'Separated library' },
				0
			)
		).value
		catalog.close()
		const repository = await openBrowserLibraryRepository({
			workspaceId: manifest.id,
			repositoryId: manifest.repositoryId,
			isCurrentContext: () => true,
			dependencies
		})
		repositories.add(repository)
		await repository.replaceSnapshot(
			{
				workspaceId: manifest.id,
				repositoryId: manifest.repositoryId,
				activationGeneration: 0
			},
			{
				snapshot: smallDataset(),
				covers: { 'record-a/cover.webp': smallCover() }
			}
		)
		await repository.recoverStorage()
		const beforeClear = await repository.readLibrarySnapshot({
			workspaceId: manifest.id,
			repositoryId: manifest.repositoryId,
			activationGeneration: 0
		})
		await clearLocalAudioAnalysisCache()
		expect(await getCachedLocalAudioResult(cacheRecord.cacheKey)).toBeNull()
		const afterClear = await repository.readLibrarySnapshot({
			workspaceId: manifest.id,
			repositoryId: manifest.repositoryId,
			activationGeneration: 0
		})
		expect(afterClear).toEqual(beforeClear)
		if (afterClear.status === 'success') {
			expect(afterClear.value.managedCovers).toHaveLength(1)
			expect(await sha256(afterClear.value.managedCovers[0]!.blob)).toBe(
				await sha256(smallCover())
			)
		}

		await putCachedLocalAudioResult(cacheRecord)
		await repository.replaceSnapshot(
			{
				workspaceId: manifest.id,
				repositoryId: manifest.repositoryId,
				activationGeneration: 0
			},
			{
				snapshot: smallDataset('Reset library'),
				covers: { 'record-a/cover.webp': smallCover() }
			}
		)
		expect(await getCachedLocalAudioResult(cacheRecord.cacheKey)).toEqual(
			cacheRecord
		)
		const currentManifest = await repository.readManifest()
		if (!currentManifest) throw new Error('Expected library before deletion.')
		const deletingCatalog = await createBrowserWorkspaceCatalog(dependencies)
		await deletingCatalog.deleteWorkspace({
			workspaceId: currentManifest.id,
			repositoryId: currentManifest.repositoryId,
			catalogRevision: 1,
			repositoryRevision: currentManifest.repositoryRevision
		})
		deletingCatalog.close()
		expect(await getCachedLocalAudioResult(cacheRecord.cacheKey)).toEqual(
			cacheRecord
		)
		await clearLocalAudioAnalysisCache()

		expect(openedNames.length).toBeGreaterThan(4)
		expect(new Set(openedNames)).toEqual(new Set([databaseName]))
		expect(openedNames).not.toContain(LOCAL_AUDIO_CACHE_DATABASE_NAME)
	})
})

describe('browser library repository transaction aborts', () => {
	it('rolls back a representative write from every domain command family', async () => {
		let abortCommand: string | null = null
		const harness = await createRepositoryHarness('abort-domain-commands', {
			processCoverFile: async () => smallCover(),
			onTransactionStep: ({ command }) => {
				if (command === abortCommand) {
					throw new Error(`Abort ${command}`)
				}
			}
		})
		const { repository, context } = harness
		await repository.replaceSnapshot(context, {
			snapshot: smallDataset(),
			covers: { 'record-a/cover.webp': smallCover() }
		})

		const trackInput = {
			record_id: 'record-a',
			title: 'New track',
			artists: [],
			extraartists: [],
			position: null,
			duration: null,
			bpm: null,
			rpm: 33,
			key: null,
			mode: null,
			genres: [],
			time_signature_upper: null,
			time_signature_lower: null,
			playable: true,
			beatport_data: null,
			audio_features: null
		}
		const cases: Array<{
			command: string
			run: () => Promise<unknown>
		}> = [
			{
				command: 'create-record-with-tracks',
				run: () =>
					repository.records.createWithTracks(context, {
						title: 'Aborted record',
						tracks: [{ title: 'Aborted track' }]
					})
			},
			{
				command: 'update-record',
				run: () =>
					repository.records.update(context, {
						id: 'record-a',
						updates: { title: 'Aborted update' }
					})
			},
			{
				command: 'update-record-cover',
				run: () =>
					repository.records.updateWithCover(context, {
						id: 'record-a',
						updates: {},
						change: { type: 'remove' }
					})
			},
			{
				command: 'remove-record-from-collection',
				run: () =>
					repository.records.removeFromCollection(context, { id: 'record-a' })
			},
			{
				command: 'create-track',
				run: () => repository.tracks.create(context, trackInput)
			},
			{
				command: 'update-track',
				run: () =>
					repository.tracks.update(context, {
						id: 'track-a',
						updates: { title: 'Aborted track update' }
					})
			},
			{
				command: 'update-track-batch',
				run: () =>
					repository.tracks.updateBatch(context, [
						{
							id: 'track-a',
							expectedUpdatedAt: NOW,
							updates: { bpm: 125 }
						}
					])
			},
			{
				command: 'delete-track',
				run: () => repository.tracks.delete(context, { id: 'track-a' })
			},
			{
				command: 'create-crate',
				run: () =>
					repository.crates.create(context, {
						name: 'Aborted crate',
						description: null,
						color: null
					})
			},
			{
				command: 'update-crate-metadata',
				run: () =>
					repository.crates.updateMetadata(context, {
						id: 'crate-a',
						updates: { name: 'Aborted crate update' }
					})
			},
			{
				command: 'delete-crate',
				run: () => repository.crates.delete(context, { id: 'crate-a' })
			},
			{
				command: 'remove-record-from-crate',
				run: () =>
					repository.crates.removeRecord(context, {
						crateId: 'crate-a',
						recordId: 'record-a'
					})
			},
			{
				command: 'save-set',
				run: () =>
					repository.savedSets.save(context, {
						setId: 'set-a',
						kind: 'manual',
						name: 'Aborted set update',
						playedTracks: []
					})
			},
			{
				command: 'delete-set',
				run: () => repository.savedSets.delete(context, { id: 'set-a' })
			},
			{
				command: 'update-preferences',
				run: () => repository.preferences.update(context, { ui_theme: 'light' })
			}
		]

		for (const testCase of cases) {
			const before = await repository.readLibrarySnapshot(context)
			const beforeRevisions = await manifestRevisions(repository)
			abortCommand = testCase.command
			expect(await testCase.run()).toMatchObject({
				status: 'unavailable',
				reason: 'read-only'
			})
			abortCommand = null
			const after = await repository.readLibrarySnapshot(context)
			expect(after).toEqual(before)
			expect(await manifestRevisions(repository)).toEqual(beforeRevisions)
			await expect(repository.recoverStorage()).resolves.toMatchObject({
				status: 'recovered',
				health: { code: 'healthy' }
			})
		}
	})

	it('rolls back every snapshot write and requires explicit recovery', async () => {
		const countedSteps: number[] = []
		let enabled = false
		const counted = await createRepositoryHarness('abort-count', {
			onTransactionStep: ({ command, ordinal }) => {
				if (enabled && command === 'replace-library-snapshot') {
					countedSteps.push(ordinal)
				}
			}
		})
		await counted.repository.replaceSnapshot(counted.context, {
			snapshot: smallDataset(),
			covers: { 'record-a/cover.webp': smallCover() }
		})
		enabled = true
		await counted.repository.replaceSnapshot(counted.context, {
			snapshot: smallDataset('Count changed'),
			covers: { 'record-a/cover.webp': smallCover() }
		})
		expect(countedSteps.length).toBeGreaterThan(10)

		for (const abortOrdinal of countedSteps) {
			let inject = false
			const harness = await createRepositoryHarness(`abort-${abortOrdinal}`, {
				onTransactionStep: ({ command, ordinal }) => {
					if (
						inject &&
						command === 'replace-library-snapshot' &&
						ordinal === abortOrdinal
					) {
						throw new Error(`Abort snapshot step ${ordinal}`)
					}
				}
			})
			await harness.repository.replaceSnapshot(harness.context, {
				snapshot: smallDataset(),
				covers: { 'record-a/cover.webp': smallCover() }
			})
			inject = true
			expect(
				await harness.repository.replaceSnapshot(harness.context, {
					snapshot: smallDataset('Must roll back'),
					covers: { 'record-a/cover.webp': smallCover() }
				})
			).toMatchObject({ status: 'unavailable', reason: 'read-only' })

			const persisted = await harness.repository.readLibrarySnapshot(
				harness.context
			)
			expect(persisted).toMatchObject({
				status: 'success',
				value: {
					dataset: { records: [{ title: 'Release' }] },
					contentRevision: 1,
					repositoryRevision: 1
				}
			})
			expect(
				await harness.repository.preferences.update(harness.context, {
					ui_theme: 'light'
				})
			).toMatchObject({ status: 'unavailable', reason: 'read-only' })

			inject = false
			await expect(harness.repository.recoverStorage()).resolves.toMatchObject({
				status: 'recovered',
				health: { code: 'healthy' }
			})
			expect(
				await harness.repository.preferences.update(harness.context, {
					ui_theme: 'light'
				})
			).toMatchObject({ status: 'success' })
		}
	})
})
