import type { createMockTrack } from 'test/mocks/fixtures/tracks'
import { vi } from 'vitest'
import type { Database } from '../../../../shared/types/database'

export type SavedSetRow = Database['public']['Tables']['sets']['Row']

export function createSavedSetRow(
	overrides: Partial<SavedSetRow> = {}
): SavedSetRow {
	const row = {
		id: 'set-synthetic',
		name: 'Synthetic set',
		played_tracks: [],
		created_at: '2026-07-12T00:00:00.000Z',
		updated_at: '2026-07-12T00:00:00.000Z',
		...overrides,
		user_id: overrides.user_id ?? 'test-user-id'
	} as SavedSetRow
	// Ownership is transport metadata. Keep it readable by the cloud adapter while
	// excluding it from domain-object equality and spread-based store fixtures.
	Object.defineProperty(row, 'user_id', {
		value: row.user_id,
		enumerable: false,
		writable: true
	})
	return row
}

function createQueryBuilder() {
	const builder = {
		insert: vi.fn().mockReturnThis(),
		update: vi.fn().mockReturnThis(),
		delete: vi.fn().mockReturnThis(),
		select: vi.fn().mockReturnThis(),
		eq: vi.fn().mockReturnThis(),
		order: vi.fn().mockReturnThis(),
		lt: vi.fn().mockReturnThis(),
		limit: vi.fn().mockResolvedValue({ data: [], error: null }),
		single: vi.fn()
	}
	builder.single.mockImplementation(async () => {
		const equalityCalls = builder.eq.mock.calls as Array<[string, unknown]>
		const id = [...equalityCalls]
			.reverse()
			.find(([column]) => column === 'id')?.[1]
		const userId = [...equalityCalls]
			.reverse()
			.find(([column]) => column === 'user_id')?.[1]
		const latestUpdateOrder =
			builder.update.mock.invocationCallOrder.at(-1) ?? -1
		const latestInsertOrder =
			builder.insert.mock.invocationCallOrder.at(-1) ?? -1
		const mutation =
			latestUpdateOrder > latestInsertOrder
				? (builder.update.mock.calls.at(-1)?.[0] as Partial<SavedSetRow>)
				: ((builder.insert.mock.calls.at(-1)?.[0] as Partial<SavedSetRow>) ??
					{})
		return {
			data: createSavedSetRow({
				...mutation,
				id: typeof id === 'string' ? id : 'set-1',
				user_id: typeof userId === 'string' ? userId : 'test-user-id'
			}),
			error: null
		}
	})
	return builder
}

export function createSessionStoreHarness() {
	const tracksStore = {
		playableTracks: [] as ReturnType<typeof createMockTrack>[],
		getTrackById: vi.fn()
	}
	const userStore = {
		profile: { turntable_pitch_range: 8 },
		supaUser: { id: 'test-user-id' } as { id: string } | null,
		get supaUserId() {
			return this.supaUser?.id ?? null
		},
		resolveAuthenticatedUserId: vi.fn(async () => {
			if (!userStore.supaUser?.id) throw new Error('No authenticated user')
			return userStore.supaUser.id
		})
	}
	const preferencesStore = {
		preferences: {
			turntable_pitch_range: 8,
			turntable_theme: 'silver' as const,
			ui_theme: 'auto' as const,
			key_format: 'key' as const,
			list_layout: 'cover',
			selected_crate: ''
		}
	}
	let queryBuilder = createQueryBuilder()
	const supabaseClient = {
		from: vi.fn(() => queryBuilder)
	}

	function reset() {
		queryBuilder = createQueryBuilder()
		supabaseClient.from.mockReturnValue(queryBuilder)
		tracksStore.playableTracks = []
		tracksStore.getTrackById.mockReset()
		userStore.profile = { turntable_pitch_range: 8 }
		preferencesStore.preferences.turntable_pitch_range = 8
		userStore.supaUser = { id: 'test-user-id' }
		userStore.resolveAuthenticatedUserId.mockClear()
		return queryBuilder
	}

	return {
		get queryBuilder() {
			return queryBuilder
		},
		reset,
		supabaseClient,
		tracksStore,
		preferencesStore,
		userStore
	}
}
