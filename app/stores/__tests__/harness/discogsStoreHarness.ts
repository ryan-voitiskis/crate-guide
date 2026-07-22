import { vi } from 'vitest'
import type { DiscogsImportFailure } from '../../../../shared/types/discogs'

export type MockDiscogsFolder = {
	id: number
	name: string
	count: number
	resource_url: string
}

export function createMockFolder(
	overrides: Partial<MockDiscogsFolder> = {}
): MockDiscogsFolder {
	return {
		id: 1,
		name: 'House',
		count: 50,
		resource_url: 'https://api.discogs.com/users/testuser/collection/folders/1',
		...overrides
	}
}

export function createFailure(
	overrides: Partial<DiscogsImportFailure> = {}
): DiscogsImportFailure {
	return {
		releaseId: 1,
		label: 'Failed release',
		error: 'Discogs could not fetch this release.',
		code: 'discogs_transport',
		stage: 'fetch',
		retryable: true,
		attempts: 3,
		...overrides
	}
}

export function createDiscogsStoreHarness() {
	const storageValues = new Map<string, string>()
	const sessionStorage = {
		get length() {
			return storageValues.size
		},
		clear: () => storageValues.clear(),
		getItem: (key: string) => storageValues.get(key) ?? null,
		key: (index: number) => [...storageValues.keys()][index] ?? null,
		removeItem: (key: string) => storageValues.delete(key),
		setItem: (key: string, value: string) => storageValues.set(key, value)
	}
	const userStore = {
		supaUser: { id: 'test-user-id' } as { id: string } | null,
		get supaUserId() {
			return this.supaUser?.id ?? null
		},
		profile: { id: 'test-user-id', discogs_username: 'testuser' } as {
			id: string
			discogs_username: string | null
		} | null,
		fetchProfile: vi.fn().mockResolvedValue(true)
	}
	const recordsStore = {
		fetchAllRecords: vi.fn().mockResolvedValue(true)
	}
	const tracksStore = {
		fetchAllTracks: vi.fn().mockResolvedValue(true)
	}
	const discogsApi = {
		getFolders: vi.fn(),
		getFolderReleases: vi.fn(),
		getRelease: vi.fn()
	}

	function createQueryBuilder() {
		const builder = {
			select: vi.fn().mockReturnThis(),
			update: vi.fn().mockReturnThis(),
			eq: vi.fn().mockReturnThis(),
			in: vi.fn().mockReturnThis(),
			single: vi.fn().mockResolvedValue({ data: null, error: null })
		}
		builder.select.mockResolvedValue({
			data: [userStore.profile],
			error: null
		})
		return builder
	}

	let queryBuilder = createQueryBuilder()
	const rpc = vi.fn().mockResolvedValue({ data: null, error: null })
	const supabaseClient = {
		from: vi.fn(() => queryBuilder),
		rpc
	}

	vi.stubGlobal('window', { sessionStorage })
	vi.stubGlobal('useUserStore', () => userStore)
	vi.stubGlobal('useRecordsStore', () => recordsStore)
	vi.stubGlobal('useTracksStore', () => tracksStore)
	vi.stubGlobal('useDiscogsApi', () => discogsApi)
	vi.stubGlobal('useSupabaseClient', () => supabaseClient)
	vi.stubGlobal(
		'isError',
		(error: unknown): error is Error => error instanceof Error
	)

	function reset() {
		sessionStorage.clear()
		queryBuilder = createQueryBuilder()
		supabaseClient.from.mockReturnValue(queryBuilder)
		userStore.supaUser = { id: 'test-user-id' }
		userStore.profile = { id: 'test-user-id', discogs_username: 'testuser' }
		userStore.fetchProfile.mockResolvedValue(true)
		rpc.mockResolvedValue({ data: null, error: null })
		return queryBuilder
	}

	return {
		discogsApi,
		get queryBuilder() {
			return queryBuilder
		},
		recordsStore,
		reset,
		rpc,
		sessionStorage,
		supabaseClient,
		tracksStore,
		userStore
	}
}
