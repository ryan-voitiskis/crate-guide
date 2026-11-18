import { describe, expect, it, vi } from 'vitest'
import type { WorkspaceOperationContext } from '../contracts'
import { createCloudCratesRepository } from './cloudCratesRepository'
import { createCloudRepositoryState } from './cloudRepositoryState'

const context: WorkspaceOperationContext = {
	workspaceId: 'cloud:account:user-a',
	repositoryId: 'cloud-repository',
	activationGeneration: 0
}
const crateId = '00000000-0000-4000-8000-000000000001'

function createRepository(result: { data: unknown; error: unknown }) {
	const query = {
		delete: vi.fn().mockReturnThis(),
		eq: vi.fn().mockReturnThis(),
		select: vi.fn().mockReturnThis(),
		single: vi.fn().mockResolvedValue(result)
	}
	const state = createCloudRepositoryState({
		repositoryId: context.repositoryId,
		supabase: { from: vi.fn(() => query), rpc: vi.fn() } as never,
		identity: {
			getUserId: () => 'user-a',
			resolveAuthenticatedUserId: async () => 'user-a'
		},
		isCurrentContext: () => true,
		getSupabaseConfig: () => ({ key: 'test-key', url: 'https://test.invalid' })
	})
	return { query, repository: createCloudCratesRepository(state) }
}

describe('cloud crates delete', () => {
	it('deletes only the lease owner crate and confirms the removed row', async () => {
		const { query, repository } = createRepository({
			data: { id: crateId, user_id: 'user-a' },
			error: null
		})
		await expect(
			repository.delete(context, { id: crateId })
		).resolves.toMatchObject({ status: 'success', value: { id: crateId } })
		expect(query.eq).toHaveBeenCalledWith('id', crateId)
		expect(query.eq).toHaveBeenCalledWith('user_id', 'user-a')
		expect(query.select).toHaveBeenCalledWith('id, user_id')
	})

	it('does not report success when no owned crate was removed', async () => {
		const missing = createRepository({
			data: null,
			error: { code: 'PGRST116', message: 'no rows' }
		})
		await expect(
			missing.repository.delete(context, { id: crateId })
		).resolves.not.toMatchObject({ status: 'success' })

		const foreign = createRepository({
			data: { id: crateId, user_id: 'user-b' },
			error: null
		})
		await expect(
			foreign.repository.delete(context, { id: crateId })
		).resolves.toMatchObject({ status: 'conflict', reason: 'integrity' })
	})
})
