import { describe, expect, it, vi } from 'vitest'
import { createCloudCratesRepository } from './cloudCratesRepository'
import { createCloudRecordsRepository } from './cloudRecordsRepository'
import { createCloudRepositoryState } from './cloudRepositoryState'

describe('cloud metadata preconditions', () => {
	for (const expectedUpdatedAt of [null, '2026-10-24T00:00:00.000123Z']) {
		it(`filters both entity updates atomically by the full ${expectedUpdatedAt === null ? 'null' : 'precise'} version and owner`, async () => {
			const context = {
				workspaceId: 'cloud:user-a',
				repositoryId: 'cloud',
				activationGeneration: 0
			}
			const query = {
				update: vi.fn().mockReturnThis(),
				select: vi.fn().mockReturnThis(),
				eq: vi.fn().mockReturnThis(),
				is: vi.fn().mockReturnThis(),
				single: vi.fn(),
				maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
			}
			const state = createCloudRepositoryState({
				repositoryId: 'cloud',
				supabase: { from: vi.fn(() => query) } as never,
				identity: {
					getUserId: () => 'user-a',
					resolveAuthenticatedUserId: async () => 'user-a'
				},
				isCurrentContext: () => true,
				getSupabaseConfig: () => ({
					url: 'https://example.invalid',
					key: 'public-key'
				})
			})
			const records = createCloudRecordsRepository(state)
			const crates = createCloudCratesRepository(state)
			for (const update of [
				() =>
					records.update(context, {
						id: 'entity',
						updates: { title: 'Local title' },
						expectedUpdatedAt
					}),
				() =>
					crates.updateMetadata(context, {
						id: 'entity',
						updates: { name: 'Local name' },
						expectedUpdatedAt
					})
			]) {
				await expect(update()).resolves.toEqual({
					status: 'conflict',
					reason: 'precondition-failed'
				})
				expect(query.eq).toHaveBeenCalledWith('id', 'entity')
				expect(query.eq).toHaveBeenCalledWith('user_id', 'user-a')
				expect(
					expectedUpdatedAt === null ? query.is : query.eq
				).toHaveBeenCalledWith('updated_at', expectedUpdatedAt)
			}
			expect(query.single).not.toHaveBeenCalled()
			expect(state.getRevision()).toBe(0)
		})
	}
})
