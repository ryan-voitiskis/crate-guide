import { describe, expect, it, vi } from 'vitest'
import type { WorkspaceOperationContext } from '../contracts'
import {
	createCloudInternalCoherentSnapshotCapability,
	decodeCloudInternalCoherentSnapshot
} from './cloudInternalCoherentSnapshot'
import { createCloudLibraryRepository } from './cloudLibraryRepository'
import { createCloudRepositoryState } from './cloudRepositoryState'

const context: WorkspaceOperationContext = {
	workspaceId: 'cloud:account:user-a',
	repositoryId: 'cloud-repository',
	activationGeneration: 0
}

const timestamp = '2026-07-23T10:00:00.000Z'

function createSnapshot() {
	return {
		contractVersion: 1,
		preferences: {
			ui_theme: 'dark',
			key_format: 'camelot',
			list_layout: 'cover',
			selected_crate: 'crate-1',
			turntable_pitch_range: 16,
			turntable_theme: 'black'
		},
		records: [
			{
				id: 'record-1',
				discogs_id: 101,
				discogs_release_url: 'https://www.discogs.com/release/101',
				title: 'Internal record',
				artists: [{ discogs_id: 201, name: 'Artist', role: null }],
				labels: [
					{
						discogs_id: 301,
						name: 'Label',
						catno: 'CG-001',
						entity_type: '1',
						thumbnail_url: 'https://images.example.test/label.jpg'
					}
				],
				year: 2026,
				cover: 'https://images.example.test/fallback.jpg',
				cover_storage_path: 'user-a/record-1/cover.webp',
				created_at: timestamp,
				updated_at: timestamp
			}
		],
		tracks: [
			{
				id: 'track-1',
				record_id: 'record-1',
				title: 'Internal track',
				artists: [{ discogs_id: 201, name: 'Artist', role: null }],
				extraartists: [],
				position: 'A1',
				duration: 360_000,
				bpm: 128,
				rpm: 45,
				key: 1,
				mode: 0,
				genres: ['Techno'],
				time_signature_upper: 4,
				time_signature_lower: 4,
				playable: true,
				beatport_data: {
					accessed: 1_753_267_200_000,
					url: 'https://www.beatport.com/track/internal/1',
					genre: 'Techno',
					bpm: 128,
					key: 'A Minor',
					img: 'https://images.example.test/track.jpg'
				},
				audio_features: null,
				created_at: timestamp,
				updated_at: timestamp
			}
		],
		crates: [
			{
				id: 'crate-1',
				name: 'Peak time',
				description: 'Internal relationship fixture',
				color: '#ff0000',
				records: ['record-1'],
				created_at: timestamp,
				updated_at: timestamp
			}
		],
		sets: [
			{
				id: 'set-1',
				name: 'Warehouse',
				played_tracks: [
					{
						track_id: 'track-1',
						time_added: 1_753_267_200_000,
						adjusted_bpm: 129,
						transition_rating: 5,
						track_title: 'Historical track title',
						artist_display: 'Historical artist'
					}
				],
				created_at: timestamp,
				updated_at: timestamp
			}
		]
	}
}

function createDeferred<T>() {
	let resolve!: (value: T) => void
	const promise = new Promise<T>((resolvePromise) => {
		resolve = resolvePromise
	})
	return { promise, resolve }
}

function createHarness(snapshot: unknown = createSnapshot()) {
	let current = true
	let userId = 'user-a'
	const rpc = vi.fn().mockResolvedValue({ data: snapshot, error: null })
	const repository = createCloudLibraryRepository({
		repositoryId: context.repositoryId,
		supabase: { rpc } as never,
		identity: {
			getUserId: () => userId,
			resolveAuthenticatedUserId: async () => userId
		},
		isCurrentContext: () => current,
		getSupabaseConfig: () => ({
			key: 'test-key',
			url: 'https://test.invalid'
		})
	})

	return {
		repository,
		rpc,
		setCurrent(value: boolean) {
			current = value
		},
		setUserId(value: string) {
			userId = value
		}
	}
}

describe('cloud internal coherent snapshot', () => {
	it('reads every durable graph section through the internal RPC', async () => {
		const harness = createHarness()

		const outcome =
			await harness.repository.readInternalCoherentSnapshot(context)

		expect(harness.rpc).toHaveBeenCalledOnce()
		expect(harness.rpc).toHaveBeenCalledWith('read_library_snapshot')
		expect(outcome).toMatchObject({
			status: 'success',
			repositoryRevision: 0,
			issues: [],
			value: {
				preferences: {
					selected_crate: 'crate-1',
					key_format: 'camelot'
				},
				records: [
					{
						id: 'record-1',
						discogs_id: 101,
						cover: {
							kind: 'cloud',
							assetId: 'user-a/record-1/cover.webp',
							fallbackUrl: 'https://images.example.test/fallback.jpg'
						}
					}
				],
				tracks: [
					{
						id: 'track-1',
						record_id: 'record-1',
						beatport_data: { bpm: 128 }
					}
				],
				crates: [{ id: 'crate-1', records: ['record-1'] }],
				savedSets: [
					{
						id: 'set-1',
						played_tracks: [
							{
								track_id: 'track-1',
								track_title: 'Historical track title'
							}
						]
					}
				]
			}
		})
		if (outcome.status !== 'success') return
		expect(outcome.value.records[0]).not.toHaveProperty('user_id')
		expect(outcome.value.records[0]).not.toHaveProperty('cover_storage_path')
		expect(outcome.value.tracks[0]).not.toHaveProperty('user_id')
	})

	it.each([
		['malformed records', { ...createSnapshot(), records: null }],
		['wrong contract version', { ...createSnapshot(), contractVersion: 2 }]
	])('fails closed for %s', async (_label, snapshot) => {
		const { repository } = createHarness(snapshot)

		await expect(
			repository.readInternalCoherentSnapshot(context)
		).resolves.toEqual({
			status: 'conflict',
			reason: 'integrity'
		})
	})

	it('rejects extra owner and credential fields without echoing their values', async () => {
		const ownerSnapshot = createSnapshot() as ReturnType<
			typeof createSnapshot
		> &
			Record<string, unknown>
		ownerSnapshot.owner_id = 'owner-should-not-cross-the-boundary'
		const credentialSnapshot = createSnapshot()
		const credentialRecord = credentialSnapshot.records[0] as Record<
			string,
			unknown
		>
		credentialRecord.access_token = 'credential-should-not-cross-the-boundary'

		for (const snapshot of [ownerSnapshot, credentialSnapshot]) {
			const { repository } = createHarness(snapshot)
			const outcome = await repository.readInternalCoherentSnapshot(context)

			expect(outcome).toEqual({ status: 'conflict', reason: 'integrity' })
			expect(JSON.stringify(outcome)).not.toContain('should-not-cross')
		}
	})

	it('returns a transport failure when the RPC reports an error', async () => {
		const harness = createHarness()
		const error = new Error('RPC unavailable')
		harness.rpc.mockResolvedValueOnce({ data: null, error })

		await expect(
			harness.repository.readInternalCoherentSnapshot(context)
		).resolves.toEqual({
			status: 'unavailable',
			reason: 'transport',
			error
		})
	})

	it('rejects a snapshot completed after the authenticated identity changes', async () => {
		const harness = createHarness()
		const deferred = createDeferred<{
			data: ReturnType<typeof createSnapshot>
			error: null
		}>()
		harness.rpc.mockReturnValueOnce(deferred.promise)

		const pending = harness.repository.readInternalCoherentSnapshot(context)
		await vi.waitFor(() => expect(harness.rpc).toHaveBeenCalledOnce())
		harness.setUserId('user-b')
		deferred.resolve({ data: createSnapshot(), error: null })

		await expect(pending).resolves.toEqual({ status: 'stale' })
	})

	it('rejects a snapshot completed after its workspace activation changes', async () => {
		const harness = createHarness()
		const deferred = createDeferred<{
			data: ReturnType<typeof createSnapshot>
			error: null
		}>()
		harness.rpc.mockReturnValueOnce(deferred.promise)

		const pending = harness.repository.readInternalCoherentSnapshot(context)
		await vi.waitFor(() => expect(harness.rpc).toHaveBeenCalledOnce())
		harness.setCurrent(false)
		deferred.resolve({ data: createSnapshot(), error: null })

		await expect(pending).resolves.toEqual({ status: 'stale' })
	})

	it('rejects a snapshot if the repository revision changes while it is read', async () => {
		const deferred = createDeferred<{
			data: ReturnType<typeof createSnapshot>
			error: null
		}>()
		const rpc = vi.fn(() => deferred.promise)
		const state = createCloudRepositoryState({
			repositoryId: context.repositoryId,
			supabase: { rpc } as never,
			identity: {
				getUserId: () => 'user-a',
				resolveAuthenticatedUserId: async () => 'user-a'
			},
			isCurrentContext: () => true,
			getSupabaseConfig: () => ({
				key: 'test-key',
				url: 'https://test.invalid'
			})
		})
		const reader = createCloudInternalCoherentSnapshotCapability(state)

		const pending = reader.readInternalCoherentSnapshot(context)
		await vi.waitFor(() => expect(rpc).toHaveBeenCalledOnce())
		const mutationLease = await state.capture(context)
		expect(state.isLease(mutationLease)).toBe(true)
		if (!state.isLease(mutationLease)) return
		expect(
			state.complete(mutationLease, undefined, { mutated: true }).status
		).toBe('success')
		deferred.resolve({ data: createSnapshot(), error: null })

		await expect(pending).resolves.toEqual({ status: 'stale' })
	})
})

describe('cloud internal coherent snapshot decoder', () => {
	it('permits historical set references whose live tracks were deleted', () => {
		const snapshot = createSnapshot()
		snapshot.sets[0]!.played_tracks[0]!.track_id = 'deleted-track'

		expect(
			decodeCloudInternalCoherentSnapshot(snapshot).savedSets[0]!
				.played_tracks[0]
		).toMatchObject({
			track_id: 'deleted-track',
			track_title: 'Historical track title'
		})
	})
})
