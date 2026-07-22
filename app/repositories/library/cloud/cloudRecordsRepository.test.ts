import { createMockDiscogsReleaseFull } from 'test/mocks/fixtures/discogs'
import { describe, expect, it, vi } from 'vitest'
import { transformReleaseDomain } from '~/utils/discogs-data'
import type { WorkspaceOperationContext } from '../contracts'
import { createCloudRecordsRepository } from './cloudRecordsRepository'
import { createCloudRepositoryState } from './cloudRepositoryState'

const context: WorkspaceOperationContext = {
	workspaceId: 'cloud:account:user-a',
	repositoryId: 'cloud-repository',
	activationGeneration: 0
}

function createRepository(options: {
	existing?: number[]
	rpcResult?: unknown
}) {
	const query = {
		select: vi.fn().mockReturnThis(),
		eq: vi.fn().mockReturnThis(),
		in: vi.fn().mockResolvedValue({
			data: (options.existing ?? []).map((discogs_id) => ({ discogs_id })),
			error: null
		})
	}
	const rpc = vi.fn().mockResolvedValue({
		data:
			options.rpcResult ??
			({
				success: true,
				record_id: '00000000-0000-4000-8000-000000000001',
				tracks_inserted: 1,
				already_exists: false
			} as const),
		error: null
	})
	const state = createCloudRepositoryState({
		repositoryId: context.repositoryId,
		supabase: { from: vi.fn(() => query), rpc } as never,
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
	return {
		query,
		rpc,
		state,
		repository: createCloudRecordsRepository(state)
	}
}

describe('cloud records Discogs destination', () => {
	it('derives ownership from its captured lease for lookup and import', async () => {
		const { query, rpc, repository } = createRepository({ existing: [42] })
		await expect(
			repository.findExistingDiscogsIds(context, [42, 99])
		).resolves.toMatchObject({ status: 'success', value: new Set([42]) })
		expect(query.eq).toHaveBeenCalledWith('user_id', 'user-a')
		expect(query.in).toHaveBeenCalledWith('discogs_id', [42, 99])

		const input = transformReleaseDomain(
			createMockDiscogsReleaseFull({
				id: 99,
				tracklist: [
					{
						duration: '3:00',
						position: 'A1',
						title: 'Track',
						type_: 'track'
					}
				]
			})
		)
		expect(JSON.stringify(input)).not.toContain('user_id')

		await expect(
			repository.importExternalWithTracks(context, input)
		).resolves.toMatchObject({
			status: 'success',
			value: {
				recordId: '00000000-0000-4000-8000-000000000001',
				inserted: true
			}
		})
		expect(rpc).toHaveBeenCalledOnce()
		const rpcPayload = rpc.mock.calls[0]![1]
		expect(rpcPayload.record).toMatchObject({
			user_id: 'user-a',
			discogs_id: 99,
			cover: expect.any(String)
		})
		expect(rpcPayload.tracks).toHaveLength(1)
	})

	it('deduplicates and chunks provider IDs at the repository boundary', async () => {
		const { query, repository } = createRepository({})
		const ids = [...Array.from({ length: 101 }, (_, index) => index + 1), 1]

		await expect(
			repository.findExistingDiscogsIds(context, ids)
		).resolves.toMatchObject({ status: 'success', value: new Set() })
		expect(query.in).toHaveBeenCalledTimes(2)
		expect(query.in.mock.calls[0]![1]).toHaveLength(100)
		expect(query.in.mock.calls[1]![1]).toEqual([101])
	})

	it('returns the RPC duplicate race as a non-mutating existing record', async () => {
		const { repository, state } = createRepository({
			rpcResult: {
				success: true,
				record_id: '00000000-0000-4000-8000-000000000002',
				tracks_inserted: 0,
				already_exists: true
			}
		})
		const input = transformReleaseDomain(
			createMockDiscogsReleaseFull({ id: 42, tracklist: [] })
		)

		await expect(
			repository.importExternalWithTracks(context, input)
		).resolves.toMatchObject({
			status: 'success',
			repositoryRevision: 0,
			value: {
				recordId: '00000000-0000-4000-8000-000000000002',
				inserted: false
			}
		})
		expect(state.getRevision()).toBe(0)
	})

	it('rejects malformed external metadata before invoking persistence', async () => {
		const { repository, rpc } = createRepository({})
		const malformed = transformReleaseDomain(
			createMockDiscogsReleaseFull({ id: 42, tracklist: [] })
		)
		malformed.record.title = '   '

		await expect(
			repository.importExternalWithTracks(context, malformed)
		).resolves.toMatchObject({ status: 'conflict', reason: 'integrity' })
		expect(rpc).not.toHaveBeenCalled()
	})

	it('rejects a malformed RPC result without advancing repository state', async () => {
		const { repository, state } = createRepository({
			rpcResult: {
				success: true,
				record_id: 'not-a-uuid',
				tracks_inserted: 0,
				already_exists: false
			}
		})
		const input = transformReleaseDomain(
			createMockDiscogsReleaseFull({ id: 42, tracklist: [] })
		)

		await expect(
			repository.importExternalWithTracks(context, input)
		).resolves.toMatchObject({ status: 'unavailable', reason: 'transport' })
		expect(state.getRevision()).toBe(0)
	})
})
