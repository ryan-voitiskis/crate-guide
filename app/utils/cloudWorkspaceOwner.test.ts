import { describe, expect, it, vi } from 'vitest'
import type { WorkspaceDescriptor } from '~/repositories/library/contracts'
import { createDemoLibraryRepository } from '~/repositories/library/demoLibraryRepository'
import type { LibraryDataset } from '~~/shared/types/library'
import { applyCloudWorkspaceOwner } from './cloudWorkspaceOwner'
import { createWorkbenchRuntime } from './workbenchPinia'
import { createCloudWorkspaceId } from './workspaceIdentity'

const presentationMocks = vi.hoisted(() => ({
	activateWorkspaceThemeMirror: vi.fn(),
	clearWorkspaceThemeMirror: vi.fn(),
	getSavedAnonymousThemePreference: vi.fn(() => 'light'),
	setTheme: vi.fn()
}))

vi.mock('./setTheme', () => ({
	getSavedAnonymousThemePreference:
		presentationMocks.getSavedAnonymousThemePreference,
	setTheme: presentationMocks.setTheme
}))

vi.mock('./workspaceThemeMirror', () => ({
	activateWorkspaceThemeMirror: presentationMocks.activateWorkspaceThemeMirror,
	clearWorkspaceThemeMirror: presentationMocks.clearWorkspaceThemeMirror
}))

const dataset: LibraryDataset = {
	records: [],
	tracks: [],
	crates: [],
	savedSets: [],
	preferences: {
		ui_theme: 'auto',
		key_format: 'key',
		list_layout: 'cover',
		selected_crate: '',
		turntable_pitch_range: 8,
		turntable_theme: 'silver'
	}
}

function createHarness() {
	const descriptor: WorkspaceDescriptor = {
		id: createCloudWorkspaceId(null),
		repositoryId: 'cloud-repository',
		location: 'cloud',
		displayLabel: 'Cloud library',
		readOnly: false,
		repositoryRevision: 4,
		capabilities: {
			location: 'cloud',
			canPersistSessions: true,
			canMutateLibrary: true,
			canManageCrates: true,
			canConnectDiscogs: true,
			canEnrichTracks: true,
			canManageAccount: true
		}
	}
	const repository = createDemoLibraryRepository({
		id: descriptor.repositoryId,
		dataset,
		isCurrentContext: () => true
	})
	const reset = vi.spyOn(repository.covers, 'reset')
	return {
		descriptor,
		repository,
		reset,
		runtime: createWorkbenchRuntime(descriptor, repository)
	}
}

describe('cloud workspace owner activation', () => {
	it('owner-scopes A to B and clears the mirror when the account becomes null', () => {
		vi.clearAllMocks()
		presentationMocks.activateWorkspaceThemeMirror
			.mockReturnValueOnce('dark')
			.mockReturnValueOnce(null)
		const { repository, reset, runtime } = createHarness()

		expect(applyCloudWorkspaceOwner(runtime, repository, 'account-a')).toBe(
			true
		)
		expect(runtime.descriptor.value).toMatchObject({
			id: createCloudWorkspaceId('account-a'),
			repositoryRevision: 0
		})
		expect(presentationMocks.setTheme).toHaveBeenLastCalledWith('dark')

		expect(applyCloudWorkspaceOwner(runtime, repository, 'account-b')).toBe(
			true
		)
		expect(runtime.descriptor.value.id).toBe(
			createCloudWorkspaceId('account-b')
		)
		expect(presentationMocks.setTheme).toHaveBeenLastCalledWith('light')

		expect(applyCloudWorkspaceOwner(runtime, repository, null)).toBe(true)
		expect(runtime.descriptor.value.id).toBe(createCloudWorkspaceId(null))
		expect(presentationMocks.clearWorkspaceThemeMirror).toHaveBeenCalledOnce()
		expect(presentationMocks.setTheme).toHaveBeenLastCalledWith('light')
		expect(reset).toHaveBeenCalledTimes(3)
	})

	it('activates a verified B owner after a signed-out bootstrap', () => {
		vi.clearAllMocks()
		presentationMocks.activateWorkspaceThemeMirror.mockReturnValueOnce('auto')
		const { repository, runtime } = createHarness()

		applyCloudWorkspaceOwner(runtime, repository, 'account-b')

		expect(presentationMocks.activateWorkspaceThemeMirror).toHaveBeenCalledWith(
			createCloudWorkspaceId('account-b')
		)
		expect(presentationMocks.setTheme).toHaveBeenCalledWith('auto')
	})
})
