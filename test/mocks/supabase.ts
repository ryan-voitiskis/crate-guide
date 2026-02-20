import { vi } from 'vitest'

type MockQueryBuilder = {
	select: ReturnType<typeof vi.fn>
	insert: ReturnType<typeof vi.fn>
	update: ReturnType<typeof vi.fn>
	delete: ReturnType<typeof vi.fn>
	upsert: ReturnType<typeof vi.fn>
	eq: ReturnType<typeof vi.fn>
	neq: ReturnType<typeof vi.fn>
	in: ReturnType<typeof vi.fn>
	single: ReturnType<typeof vi.fn>
	maybeSingle: ReturnType<typeof vi.fn>
	order: ReturnType<typeof vi.fn>
	limit: ReturnType<typeof vi.fn>
	range: ReturnType<typeof vi.fn>
	then: ReturnType<typeof vi.fn>
}

export function createMockQueryBuilder(): MockQueryBuilder {
	const builder: MockQueryBuilder = {
		select: vi.fn().mockReturnThis(),
		insert: vi.fn().mockReturnThis(),
		update: vi.fn().mockReturnThis(),
		delete: vi.fn().mockReturnThis(),
		upsert: vi.fn().mockReturnThis(),
		eq: vi.fn().mockReturnThis(),
		neq: vi.fn().mockReturnThis(),
		in: vi.fn().mockReturnThis(),
		single: vi.fn().mockResolvedValue({ data: null, error: null }),
		maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
		order: vi.fn().mockReturnThis(),
		limit: vi.fn().mockReturnThis(),
		range: vi.fn().mockReturnThis(),
		then: vi.fn()
	}
	return builder
}

export function createMockSupabaseClient() {
	const mockQueryBuilder = createMockQueryBuilder()

	const client = {
		from: vi.fn(() => mockQueryBuilder),
		rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
		auth: {
			signUp: vi.fn().mockResolvedValue({ data: null, error: null }),
			signInWithPassword: vi
				.fn()
				.mockResolvedValue({ data: null, error: null }),
			signInWithOAuth: vi.fn().mockResolvedValue({ data: null, error: null }),
			signOut: vi.fn().mockResolvedValue({ error: null }),
			resetPasswordForEmail: vi
				.fn()
				.mockResolvedValue({ data: null, error: null }),
			updateUser: vi.fn().mockResolvedValue({ data: null, error: null }),
			verifyOtp: vi.fn().mockResolvedValue({ data: null, error: null }),
			getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
			getSession: vi
				.fn()
				.mockResolvedValue({ data: { session: null }, error: null }),
			onAuthStateChange: vi.fn(() => ({
				data: { subscription: { unsubscribe: vi.fn() } }
			}))
		},
		functions: {
			invoke: vi.fn().mockResolvedValue({ data: null, error: null })
		},
		storage: {
			from: vi.fn(() => ({
				upload: vi.fn().mockResolvedValue({ data: null, error: null }),
				download: vi.fn().mockResolvedValue({ data: null, error: null }),
				getPublicUrl: vi.fn(() => ({ data: { publicUrl: '' } })),
				remove: vi.fn().mockResolvedValue({ data: null, error: null })
			}))
		},
		// Test helpers
		__mockQueryBuilder: mockQueryBuilder
	}

	return client
}

// Helper to configure query responses
export function mockQueryResponse<T>(
	builder: MockQueryBuilder,
	data: T,
	error: Error | null = null
) {
	// Make the builder thenable with the response
	builder.then.mockImplementation((resolve: (value: unknown) => void) => {
		resolve({ data, error })
		return Promise.resolve({ data, error })
	})

	// Also mock single/maybeSingle for single-row queries
	builder.single.mockResolvedValue({ data, error })
	builder.maybeSingle.mockResolvedValue({ data, error })

	// Return builder for chaining
	return builder
}

// Type helper for creating typed mock clients
export type MockSupabaseClient = ReturnType<typeof createMockSupabaseClient>
