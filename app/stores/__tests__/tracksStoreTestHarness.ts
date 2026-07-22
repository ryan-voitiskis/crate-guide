import { createPinia, setActivePinia } from 'pinia'
import {
	createMockTrack,
	resetTrackIdCounter
} from 'test/mocks/fixtures/tracks'
import { vi } from 'vitest'
import type { TrackAudioFeatures } from '~~/shared/types/audioFeatures'
import type { TrackBatchUpdate } from '~~/shared/types/trackUpdates'

let tracksStoreFactory:
	| (typeof import('../tracksStore'))['useTracksStore']
	| null = null

const mockToast = vi.hoisted(() => ({
	success: vi.fn(),
	error: vi.fn(),
	info: vi.fn(),
	warning: vi.fn()
}))

vi.mock('vue-sonner', () => ({
	toast: mockToast
}))

export const mockUserStore: {
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

function createMockQueryBuilder() {
	return {
		select: vi.fn().mockReturnThis(),
		insert: vi.fn().mockReturnThis(),
		update: vi.fn().mockReturnThis(),
		delete: vi.fn().mockReturnThis(),
		eq: vi.fn().mockReturnThis(),
		is: vi.fn().mockReturnThis(),
		order: vi.fn().mockReturnThis(),
		lt: vi.fn().mockReturnThis(),
		limit: vi.fn().mockResolvedValue({ data: [], error: null }),
		single: vi.fn().mockResolvedValue({ data: null, error: null })
	}
}

export const mockQueryBuilder = createMockQueryBuilder()

export const mockSupabaseClient = {
	from: vi.fn(() => mockQueryBuilder),
	rpc: vi.fn()
}

export function createDeferred<T>() {
	let resolve!: (value: T | PromiseLike<T>) => void
	const promise = new Promise<T>((resolvePromise) => {
		resolve = resolvePromise
	})
	return { promise, resolve }
}

export function createMockOwnedTrack(
	overrides?: Parameters<typeof createMockTrack>[0],
	userId = 'test-user-id'
) {
	return {
		...createMockTrack(overrides),
		user_id: userId
	}
}

export function createTrackInput(title = 'Synthetic create') {
	return {
		record_id: 'record-1',
		title,
		artists: [],
		extraartists: [],
		position: 'A1',
		duration: 180000,
		bpm: 128,
		rpm: 33 as const,
		key: 0,
		mode: 0,
		genres: [],
		time_signature_upper: null,
		time_signature_lower: null,
		playable: true,
		beatport_data: null
	}
}

export function createAudioFeatures(): TrackAudioFeatures {
	return {
		version: 1,
		updatedAt: '2026-07-22T00:00:00.000Z',
		applied: { bpm: null, keyMode: null },
		match: {
			confidence: 'high',
			score: 100,
			reasons: ['Fixture match'],
			warnings: []
		},
		sources: {}
	}
}

export function createBatchUpdate(
	id: string,
	updates: TrackBatchUpdate['updates'] = {
		audio_features: createAudioFeatures()
	},
	expectedUpdatedAt = '2026-07-22T00:00:00.000Z'
): TrackBatchUpdate {
	return {
		id,
		expectedUpdatedAt,
		updates,
		preconditions: {
			bpmMustBeNull: updates.bpm !== undefined,
			keyModeMustBeNull: updates.key !== undefined
		}
	}
}

export type BatchRpcArgs = {
	p_operation_id: string
	p_operation_hash: string
	p_items: Array<{
		ordinal: number
		track_id: string
		request_hash: string
		updates: Record<string, unknown>
	}>
}

export function createBatchRpcData(
	args: BatchRpcArgs,
	resolve: (
		item: BatchRpcArgs['p_items'][number],
		index: number
	) => {
		status: 'updated' | 'stale' | 'not_found' | 'invalid'
		issueCode?: string | null
		track?: unknown
	}
) {
	return {
		version: 1,
		operation_id: args.p_operation_id,
		operation_hash: args.p_operation_hash,
		results: args.p_items.map((item, index) => {
			const result = resolve(item, index)
			return {
				ordinal: item.ordinal,
				track_id: item.track_id,
				request_hash: item.request_hash,
				status: result.status,
				issue_code:
					result.status === 'updated'
						? null
						: (result.issueCode ?? 'update_rejected'),
				track: result.status === 'updated' ? result.track : null
			}
		})
	}
}

vi.stubGlobal('useUserStore', () => mockUserStore)
vi.stubGlobal('useSupabaseClient', () => mockSupabaseClient)

export async function resetTracksStoreHarness(): Promise<void> {
	if (!tracksStoreFactory) {
		tracksStoreFactory = (await import('../tracksStore')).useTracksStore
	}

	vi.clearAllMocks()
	mockToast.success.mockClear()
	mockToast.error.mockClear()
	resetTrackIdCounter()
	setActivePinia(createPinia())

	Object.assign(mockQueryBuilder, createMockQueryBuilder())
	mockSupabaseClient.from.mockReturnValue(mockQueryBuilder)
	mockSupabaseClient.rpc.mockReset()

	mockUserStore.supaUser = { id: 'test-user-id' }
	mockUserStore.resolveAuthenticatedUserId.mockImplementation(async () => {
		if (!mockUserStore.supaUser?.id) throw new Error('User not logged in.')
		return mockUserStore.supaUser.id
	})
}

export function createTracksStore() {
	if (!tracksStoreFactory) {
		throw new Error('Tracks store harness is not ready.')
	}
	return tracksStoreFactory()
}

export { mockToast }
