import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
	LibraryLocation,
	LibraryRepositoryBundle,
	RepositoryOutcome,
	WorkspaceDescriptor,
	WorkspaceOperationContext
} from '~/repositories/library/contracts'
import { createDemoLibraryRepository } from '~/repositories/library/demoLibraryRepository'
import { createCloudWorkspaceId } from '~/utils/workspaceIdentity'
import type {
	LibraryDataset,
	LibraryPreferences
} from '~~/shared/types/library'
import {
	bindWorkbenchRuntime,
	createWorkbenchRuntime
} from '../utils/workbenchPinia'
import {
	DEFAULT_LIBRARY_PREFERENCES,
	useLibraryPreferencesStore
} from './libraryPreferencesStore'

const presentationMocks = vi.hoisted(() => ({
	getSavedAnonymousThemePreference: vi.fn(() => null),
	setTheme: vi.fn(),
	toastError: vi.fn(),
	writeWorkspaceThemeMirror: vi.fn()
}))

vi.mock('vue-sonner', () => ({
	toast: { error: presentationMocks.toastError }
}))

vi.mock('~/utils/setTheme', () => ({
	getSavedAnonymousThemePreference:
		presentationMocks.getSavedAnonymousThemePreference,
	setTheme: presentationMocks.setTheme
}))

vi.mock('~/utils/workspaceThemeMirror', () => ({
	writeWorkspaceThemeMirror: presentationMocks.writeWorkspaceThemeMirror
}))

const dataset: LibraryDataset = {
	records: [],
	tracks: [],
	crates: [],
	savedSets: [],
	preferences: { ...DEFAULT_LIBRARY_PREFERENCES }
}

function createDescriptor(
	id: string,
	repositoryId: string,
	options: {
		location?: LibraryLocation
		readOnly?: boolean
		repositoryRevision?: number
	} = {}
): WorkspaceDescriptor {
	const location = options.location ?? 'cloud'
	return {
		id,
		repositoryId,
		location,
		displayLabel: id,
		readOnly: options.readOnly ?? location === 'demo',
		repositoryRevision: options.repositoryRevision ?? 0,
		capabilities: {
			location,
			canPersistSessions: location === 'cloud',
			canMutateLibrary: location === 'cloud',
			canManageCrates: location === 'cloud',
			canConnectDiscogs: location === 'cloud',
			canEnrichTracks: location === 'cloud',
			canManageAccount: location === 'cloud'
		}
	}
}

function success(
	preferences: LibraryPreferences,
	repositoryRevision: number
): RepositoryOutcome<LibraryPreferences> {
	return {
		status: 'success',
		value: { ...preferences },
		repositoryRevision,
		issues: []
	}
}

function createRepository(
	id: string,
	options: {
		read?: (
			context: WorkspaceOperationContext
		) => Promise<RepositoryOutcome<LibraryPreferences>>
		update?: (
			context: WorkspaceOperationContext,
			patch: Partial<LibraryPreferences>
		) => Promise<RepositoryOutcome<LibraryPreferences>>
	} = {}
): LibraryRepositoryBundle {
	const repository = createDemoLibraryRepository({
		id,
		dataset,
		isCurrentContext: () => true
	})
	return {
		...repository,
		preferences: {
			read:
				options.read ?? (async () => success(DEFAULT_LIBRARY_PREFERENCES, 0)),
			update:
				options.update ??
				(async () => ({ status: 'unavailable', reason: 'transport' }))
		}
	}
}

function createDeferred<T>() {
	let resolve!: (value: T) => void
	const promise = new Promise<T>((resolvePromise) => {
		resolve = resolvePromise
	})
	return { promise, resolve }
}

describe('libraryPreferencesStore', () => {
	beforeEach(() => {
		setActivePinia(createPinia())
		vi.clearAllMocks()
		presentationMocks.getSavedAnonymousThemePreference.mockReturnValue(null)
	})

	it('hydrates through the active repository and mirrors only the authoritative theme', async () => {
		const pinia = createPinia()
		setActivePinia(pinia)
		const preferences: LibraryPreferences = {
			...DEFAULT_LIBRARY_PREFERENCES,
			key_format: 'camelot',
			ui_theme: 'dark'
		}
		const read = vi.fn(async () => success(preferences, 3))
		const runtime = createWorkbenchRuntime(
			createDescriptor('workspace-a', 'repository-a'),
			createRepository('repository-a', { read })
		)
		bindWorkbenchRuntime(pinia, runtime)
		const store = useLibraryPreferencesStore(pinia)

		await expect(store.fetchPreferences()).resolves.toBe(true)

		expect(read).toHaveBeenCalledOnce()
		expect(store.preferences).toEqual(preferences)
		expect(store.hydratedWorkspaceId).toBe('workspace-a')
		expect(runtime.descriptor.value.repositoryRevision).toBe(3)
		expect(presentationMocks.setTheme).toHaveBeenCalledWith('dark')
		expect(presentationMocks.writeWorkspaceThemeMirror).toHaveBeenCalledWith(
			'workspace-a',
			'dark'
		)
	})

	it('retries a same-workspace read rejected by a concurrent preference write', async () => {
		const pinia = createPinia()
		setActivePinia(pinia)
		const authoritative = {
			...DEFAULT_LIBRARY_PREFERENCES,
			ui_theme: 'dark' as const
		}
		const read = vi
			.fn()
			.mockResolvedValueOnce({ status: 'stale' })
			.mockResolvedValueOnce(success(authoritative, 1))
		const runtime = createWorkbenchRuntime(
			createDescriptor('workspace-a', 'repository-a'),
			createRepository('repository-a', { read })
		)
		bindWorkbenchRuntime(pinia, runtime)
		const store = useLibraryPreferencesStore(pinia)

		await expect(store.fetchPreferences()).resolves.toBe(true)

		expect(read).toHaveBeenCalledTimes(2)
		expect(store.preferences.ui_theme).toBe('dark')
		expect(presentationMocks.writeWorkspaceThemeMirror).toHaveBeenCalledOnce()
	})

	it('starts a replacement-workspace read without waiting for an obsolete read', async () => {
		const pinia = createPinia()
		setActivePinia(pinia)
		const firstRead = createDeferred<RepositoryOutcome<LibraryPreferences>>()
		const repositoryA = createRepository('repository-a', {
			read: () => firstRead.promise
		})
		const repositoryBPreferences: LibraryPreferences = {
			...DEFAULT_LIBRARY_PREFERENCES,
			ui_theme: 'light'
		}
		const repositoryB = createRepository('repository-b', {
			read: async () => success(repositoryBPreferences, 1)
		})
		const runtime = createWorkbenchRuntime(
			createDescriptor('workspace-a', 'repository-a'),
			repositoryA
		)
		bindWorkbenchRuntime(pinia, runtime)
		const store = useLibraryPreferencesStore(pinia)
		const obsoleteLoad = store.fetchPreferences()

		runtime.replaceWorkspace(
			createDescriptor('workspace-b', 'repository-b'),
			repositoryB
		)
		await expect(store.fetchPreferences()).resolves.toBe(true)
		expect(store.hydratedWorkspaceId).toBe('workspace-b')

		firstRead.resolve(
			success({ ...DEFAULT_LIBRARY_PREFERENCES, ui_theme: 'dark' }, 5)
		)
		await expect(obsoleteLoad).resolves.toBe(false)
		expect(store.preferences).toEqual(repositoryBPreferences)
		expect(presentationMocks.setTheme).not.toHaveBeenLastCalledWith('dark')
	})

	it('publishes optimistic controls immediately and serializes repository writes', async () => {
		const pinia = createPinia()
		setActivePinia(pinia)
		let repositoryPreferences = { ...DEFAULT_LIBRARY_PREFERENCES }
		let revision = 0
		const firstWrite = createDeferred<RepositoryOutcome<LibraryPreferences>>()
		const update = vi
			.fn()
			.mockImplementationOnce(() => firstWrite.promise)
			.mockImplementation(
				async (
					_context: WorkspaceOperationContext,
					patch: Partial<LibraryPreferences>
				) => {
					repositoryPreferences = { ...repositoryPreferences, ...patch }
					revision += 1
					return success(repositoryPreferences, revision)
				}
			)
		const runtime = createWorkbenchRuntime(
			createDescriptor('workspace-a', 'repository-a'),
			createRepository('repository-a', { update })
		)
		bindWorkbenchRuntime(pinia, runtime)
		const store = useLibraryPreferencesStore(pinia)

		const first = store.updatePreferences({ ui_theme: 'dark' })
		const second = store.updatePreferences({ key_format: 'camelot' })
		expect(store.preferences).toMatchObject({
			ui_theme: 'dark',
			key_format: 'camelot'
		})
		expect(presentationMocks.setTheme).toHaveBeenLastCalledWith('dark')
		expect(presentationMocks.writeWorkspaceThemeMirror).not.toHaveBeenCalled()
		await vi.waitFor(() => expect(update).toHaveBeenCalledOnce())

		repositoryPreferences = {
			...repositoryPreferences,
			ui_theme: 'dark'
		}
		revision = 1
		firstWrite.resolve(success(repositoryPreferences, revision))

		await expect(Promise.all([first, second])).resolves.toEqual([true, true])
		expect(update.mock.calls.map((call) => call[1])).toEqual([
			{ ui_theme: 'dark' },
			{ key_format: 'camelot' }
		])
		expect(store.preferences).toEqual({
			...DEFAULT_LIBRARY_PREFERENCES,
			ui_theme: 'dark',
			key_format: 'camelot'
		})
		expect(runtime.descriptor.value.repositoryRevision).toBe(2)
		expect(store.isUpdatingPreferences).toBe(false)
	})

	it('rolls an optimistic change back to a recovered value and reports failure', async () => {
		const pinia = createPinia()
		setActivePinia(pinia)
		const recovered = {
			...DEFAULT_LIBRARY_PREFERENCES,
			ui_theme: 'light' as const
		}
		const runtime = createWorkbenchRuntime(
			createDescriptor('workspace-a', 'repository-a'),
			createRepository('repository-a', {
				read: async () => success(recovered, 0),
				update: async () => ({
					status: 'conflict',
					reason: 'revision-mismatch'
				})
			})
		)
		bindWorkbenchRuntime(pinia, runtime)
		const store = useLibraryPreferencesStore(pinia)
		store.replacePreferences(recovered)
		presentationMocks.setTheme.mockClear()
		presentationMocks.writeWorkspaceThemeMirror.mockClear()

		const result = store.updatePreferences({ ui_theme: 'dark' })
		expect(store.preferences.ui_theme).toBe('dark')
		expect(presentationMocks.writeWorkspaceThemeMirror).not.toHaveBeenCalled()
		await expect(result).resolves.toBe(false)

		expect(store.preferences.ui_theme).toBe('light')
		expect(
			presentationMocks.setTheme.mock.calls.map(([theme]) => theme)
		).toEqual(['dark', 'light'])
		expect(presentationMocks.writeWorkspaceThemeMirror).toHaveBeenCalledWith(
			'workspace-a',
			'light'
		)
		expect(presentationMocks.toastError).toHaveBeenCalledWith(
			'Your preferences could not be saved. Please try again.'
		)
	})

	it.each([
		[
			'A to B',
			createCloudWorkspaceId('account-a'),
			createCloudWorkspaceId('account-b')
		],
		[
			'A to null',
			createCloudWorkspaceId('account-a'),
			createCloudWorkspaceId(null)
		],
		[
			'null to B',
			createCloudWorkspaceId(null),
			createCloudWorkspaceId('account-b')
		]
	])(
		'discards late preference reads and writes across %s owner activation',
		async (_name, sourceWorkspaceId, targetWorkspaceId) => {
			const pinia = createPinia()
			setActivePinia(pinia)
			const lateRead = createDeferred<RepositoryOutcome<LibraryPreferences>>()
			const lateUpdate = createDeferred<RepositoryOutcome<LibraryPreferences>>()
			const sourceUpdate = vi.fn(() => lateUpdate.promise)
			const sourceRepository = createRepository('repository-cloud', {
				read: () => lateRead.promise,
				update: sourceUpdate
			})
			const runtime = createWorkbenchRuntime(
				createDescriptor(sourceWorkspaceId, sourceRepository.id),
				sourceRepository
			)
			bindWorkbenchRuntime(pinia, runtime)
			const store = useLibraryPreferencesStore(pinia)
			const readResult = store.fetchPreferences()
			const updateResult = store.updatePreferences({ ui_theme: 'dark' })
			await vi.waitFor(() => expect(sourceUpdate).toHaveBeenCalledOnce())

			const targetRepository = createRepository('repository-cloud')
			runtime.replaceWorkspace(
				createDescriptor(targetWorkspaceId, targetRepository.id),
				targetRepository
			)
			store.clearPreferences()
			presentationMocks.setTheme.mockClear()
			presentationMocks.writeWorkspaceThemeMirror.mockClear()
			lateRead.resolve(
				success({ ...DEFAULT_LIBRARY_PREFERENCES, ui_theme: 'dark' }, 1)
			)
			lateUpdate.resolve(
				success({ ...DEFAULT_LIBRARY_PREFERENCES, ui_theme: 'dark' }, 2)
			)

			await expect(Promise.all([readResult, updateResult])).resolves.toEqual([
				false,
				false
			])
			expect(presentationMocks.setTheme).not.toHaveBeenCalled()
			expect(presentationMocks.writeWorkspaceThemeMirror).not.toHaveBeenCalled()
		}
	)

	it('keeps Demo preferences as a shared ephemeral overlay without repository writes or mirrors', async () => {
		const pinia = createPinia()
		setActivePinia(pinia)
		const repository = createDemoLibraryRepository({
			id: 'demo-repository',
			dataset,
			isCurrentContext: () => true
		})
		const update = vi.spyOn(repository.preferences, 'update')
		const runtime = createWorkbenchRuntime(
			createDescriptor('demo', repository.id, {
				location: 'demo',
				readOnly: true
			}),
			repository
		)
		bindWorkbenchRuntime(pinia, runtime)
		const settingsPageStore = useLibraryPreferencesStore(pinia)
		await settingsPageStore.fetchPreferences()
		presentationMocks.writeWorkspaceThemeMirror.mockClear()

		await expect(
			settingsPageStore.updatePreferences({
				key_format: 'camelot',
				ui_theme: 'dark'
			})
		).resolves.toBe(true)
		const recordsPageStore = useLibraryPreferencesStore(pinia)

		expect(recordsPageStore).toBe(settingsPageStore)
		expect(recordsPageStore.preferences).toMatchObject({
			key_format: 'camelot',
			ui_theme: 'dark'
		})
		expect(update).not.toHaveBeenCalled()
		expect(presentationMocks.writeWorkspaceThemeMirror).not.toHaveBeenCalled()
	})
})
