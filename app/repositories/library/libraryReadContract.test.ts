import { createMockTrack } from 'test/mocks/fixtures/tracks'
import { describe, expect, it, vi } from 'vitest'
import type { Database } from '~~/shared/types/database'
import type { LibraryDataset } from '~~/shared/types/library'
import { createCloudLibraryRepository } from './cloud/cloudLibraryRepository'
import type {
	LibraryRepositoryBundle,
	WorkspaceOperationContext
} from './contracts'
import { createDemoLibraryRepository } from './demoLibraryRepository'

const preferences = {
	ui_theme: 'dark' as const,
	key_format: 'camelot' as const,
	list_layout: 'grid',
	selected_crate: 'crate-1',
	turntable_pitch_range: 16,
	turntable_theme: 'black' as const
}

const emptyDataset: LibraryDataset = {
	records: [],
	tracks: [],
	crates: [],
	savedSets: [],
	preferences
}

type ReadContractHarness = {
	repository: LibraryRepositoryBundle
	context: WorkspaceOperationContext
	makeStale(): void
}

function createDemoHarness(): ReadContractHarness {
	let current = true
	const context: WorkspaceOperationContext = {
		workspaceId: 'demo',
		repositoryId: 'demo-repository',
		activationGeneration: 0
	}
	return {
		context,
		repository: createDemoLibraryRepository({
			id: context.repositoryId,
			dataset: emptyDataset,
			isCurrentContext: () => current
		}),
		makeStale() {
			current = false
		}
	}
}

function createCloudHarness(options?: {
	rows?: Partial<Record<'records' | 'tracks' | 'crates' | 'sets', unknown[]>>
}): ReadContractHarness {
	let current = true
	const userId = 'cloud-user'
	const profile: Database['public']['Tables']['profiles']['Row'] = {
		id: userId,
		name: null,
		discogs_avatar_url: null,
		discogs_uid: null,
		discogs_username: null,
		just_completed_discogs_oauth: false,
		...preferences
	}
	const from = vi.fn((table: string) => {
		const query = {
			select: vi.fn(),
			eq: vi.fn(),
			order: vi.fn(),
			lt: vi.fn(),
			limit: vi.fn(),
			single: vi.fn()
		}
		query.select.mockReturnValue(query)
		query.eq.mockReturnValue(query)
		query.order.mockReturnValue(query)
		query.lt.mockReturnValue(query)
		query.limit.mockResolvedValue({
			data:
				table === 'records' ||
				table === 'tracks' ||
				table === 'crates' ||
				table === 'sets'
					? (options?.rows?.[table] ?? [])
					: [],
			error: null
		})
		query.single.mockResolvedValue({
			data: table === 'profiles' ? profile : null,
			error: null
		})
		return query
	})
	const context: WorkspaceOperationContext = {
		workspaceId: 'cloud-library',
		repositoryId: 'cloud-repository',
		activationGeneration: 0
	}
	return {
		context,
		repository: createCloudLibraryRepository({
			repositoryId: context.repositoryId,
			supabase: { from } as never,
			identity: {
				getUserId: () => userId,
				resolveAuthenticatedUserId: async () => userId
			},
			isCurrentContext: () => current,
			getSupabaseConfig: () => ({
				key: 'test-key',
				url: 'https://test.invalid'
			})
		}),
		makeStale() {
			current = false
		}
	}
}

function runReadContract(
	name: string,
	createHarness: () => ReadContractHarness
): void {
	describe(`${name} read contract`, () => {
		it('returns an isolated domain observation with an explicit non-atomic marker', async () => {
			const { repository, context } = createHarness()
			const first = await repository.readObservedLibraryView(context)
			expect(first).toEqual({
				status: 'success',
				value: {
					...emptyDataset,
					consistency: 'non-atomic-observation'
				},
				repositoryRevision: 0,
				issues: []
			})
			if (first.status !== 'success') return
			first.value.preferences.key_format = 'key'

			const second = await repository.readObservedLibraryView(context)
			expect(second).toMatchObject({
				status: 'success',
				value: { preferences: { key_format: 'camelot' } }
			})
		})

		it('rejects work captured from an obsolete workspace activation', async () => {
			const { repository, context, makeStale } = createHarness()
			makeStale()

			await expect(
				repository.readObservedLibraryView(context)
			).resolves.toEqual({ status: 'stale' })
		})
	})
}

runReadContract('cloud', createCloudHarness)
runReadContract('demo', createDemoHarness)

describe('cloud observed library view', () => {
	it('labels an externally raced multi-query result instead of claiming snapshot coherence', async () => {
		const orphanedTrack = {
			...createMockTrack({
				id: 'track-raced',
				record_id: 'record-raced'
			}),
			user_id: 'cloud-user'
		}
		const { repository, context } = createCloudHarness({
			// No single committed database snapshot can contain an orphan protected
			// by the record FK. Separate queries can observe it across a cascade.
			rows: { records: [], tracks: [orphanedTrack] }
		})

		const outcome = await repository.readObservedLibraryView(context)

		expect(outcome).toMatchObject({
			status: 'success',
			value: {
				consistency: 'non-atomic-observation',
				records: [],
				tracks: [{ id: 'track-raced', record_id: 'record-raced' }]
			}
		})
	})
})
