import { vi } from 'vitest'

export type MockCrate = {
	id: string
	name: string
	description: string | null
	color: string | null
	records: string[]
	user_id: string
	created_at: string | null
	updated_at: string | null
}

export function createMockCrate(overrides: Partial<MockCrate> = {}): MockCrate {
	return {
		id: `crate-${Math.random().toString(36).slice(2)}`,
		name: 'Test Crate',
		description: null,
		color: '#3B82F6',
		records: [],
		user_id: 'test-user-id',
		created_at: new Date().toISOString(),
		updated_at: new Date().toISOString(),
		...overrides
	}
}

function createQueryBuilder() {
	return {
		select: vi.fn().mockReturnThis(),
		insert: vi.fn().mockReturnThis(),
		update: vi.fn().mockReturnThis(),
		delete: vi.fn().mockReturnThis(),
		eq: vi.fn().mockReturnThis(),
		order: vi.fn().mockReturnThis(),
		lt: vi.fn().mockReturnThis(),
		limit: vi.fn().mockResolvedValue({ data: [], error: null }),
		single: vi.fn().mockResolvedValue({ data: null, error: null })
	}
}

export function createCratesStoreHarness() {
	const userStore: {
		supaUser: { id: string } | null
		readonly supaUserId: string | null
		resolveAuthenticatedUserId: ReturnType<typeof vi.fn>
	} = {
		supaUser: { id: 'test-user-id' },
		get supaUserId() {
			return this.supaUser?.id ?? null
		},
		resolveAuthenticatedUserId: vi.fn()
	}
	let queryBuilder = createQueryBuilder()
	const supabaseClient = {
		from: vi.fn(() => queryBuilder),
		rpc: vi.fn()
	}

	function reset() {
		queryBuilder = createQueryBuilder()
		supabaseClient.from.mockReturnValue(queryBuilder)
		supabaseClient.rpc.mockReset()
		userStore.supaUser = { id: 'test-user-id' }
		userStore.resolveAuthenticatedUserId.mockImplementation(async () => {
			if (!userStore.supaUser?.id) throw new Error('User not logged in.')
			return userStore.supaUser.id
		})
		return queryBuilder
	}

	return {
		get queryBuilder() {
			return queryBuilder
		},
		reset,
		supabaseClient,
		userStore
	}
}
