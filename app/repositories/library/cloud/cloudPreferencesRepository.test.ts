import { describe, expect, it, vi } from 'vitest'
import type { Database } from '~~/shared/types/database'
import type { WorkspaceOperationContext } from '../contracts'
import { createCloudPreferencesRepository } from './cloudPreferencesRepository'
import { createCloudRepositoryState } from './cloudRepositoryState'

const context: WorkspaceOperationContext = {
	workspaceId: 'cloud:account:user-a',
	repositoryId: 'cloud-repository',
	activationGeneration: 0
}

function createProfile(
	overrides: Partial<Database['public']['Tables']['profiles']['Row']> = {}
): Database['public']['Tables']['profiles']['Row'] {
	return {
		id: 'user-a',
		name: null,
		discogs_avatar_url: null,
		discogs_uid: null,
		discogs_username: null,
		just_completed_discogs_oauth: false,
		key_format: 'key',
		list_layout: 'cover',
		selected_crate: '',
		turntable_pitch_range: 8,
		turntable_theme: 'silver',
		ui_theme: 'light',
		...overrides
	}
}

function createDeferred<T>() {
	let resolve!: (value: T) => void
	const promise = new Promise<T>((resolvePromise) => {
		resolve = resolvePromise
	})
	return { promise, resolve }
}

describe('cloud preferences repository', () => {
	it('rejects a read that started before a preference write committed', async () => {
		const staleRead = createDeferred<{
			data: Database['public']['Tables']['profiles']['Row']
			error: null
		}>()
		const readQuery = {
			select: vi.fn().mockReturnThis(),
			eq: vi.fn().mockReturnThis(),
			single: vi.fn(() => staleRead.promise)
		}
		const updatedProfile = createProfile({ ui_theme: 'dark' })
		const updateQuery = {
			update: vi.fn().mockReturnThis(),
			eq: vi.fn().mockReturnThis(),
			select: vi.fn().mockReturnThis(),
			single: vi.fn().mockResolvedValue({
				data: updatedProfile,
				error: null
			})
		}
		const from = vi
			.fn()
			.mockReturnValueOnce(readQuery)
			.mockReturnValueOnce(updateQuery)
		const state = createCloudRepositoryState({
			repositoryId: context.repositoryId,
			supabase: { from } as never,
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
		const repository = createCloudPreferencesRepository(state)

		const read = repository.read(context)
		await vi.waitFor(() => expect(readQuery.single).toHaveBeenCalledOnce())
		expect(readQuery.select).toHaveBeenCalledWith(
			'id, key_format, list_layout, selected_crate, turntable_pitch_range, turntable_theme, ui_theme'
		)
		await expect(
			repository.update(context, { ui_theme: 'dark' })
		).resolves.toMatchObject({
			status: 'success',
			repositoryRevision: 1,
			value: { ui_theme: 'dark' }
		})

		staleRead.resolve({
			data: createProfile({ ui_theme: 'light' }),
			error: null
		})
		await expect(read).resolves.toEqual({ status: 'stale' })
	})
})
