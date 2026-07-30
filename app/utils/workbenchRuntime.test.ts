import { createPinia } from 'pinia'
import { describe, expect, it } from 'vitest'
import type {
	LibraryRepositoryBundle,
	WorkspaceDescriptor
} from '~/repositories/library/contracts'
import { createDemoLibraryRepository } from '~/repositories/library/demoLibraryRepository'
import type { LibraryDataset } from '~~/shared/types/library'
import {
	bindWorkbenchRuntime,
	createWorkbenchRuntime,
	getWorkbenchRuntime
} from './workbenchPinia'

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

const descriptor: WorkspaceDescriptor = {
	id: 'workspace-a',
	repositoryId: 'repository-a',
	location: 'demo',
	displayLabel: 'Demo',
	readOnly: true,
	repositoryRevision: 0,
	capabilities: {
		location: 'demo',
		canPersistSessions: false,
		canMutateLibrary: false,
		canManageCrates: false,
		canConnectDiscogs: false,
		canEnrichTracks: false,
		canManageAccount: false
	}
}

function createRepository(id: string): LibraryRepositoryBundle {
	return createDemoLibraryRepository({
		id,
		dataset,
		isCurrentContext: () => true
	})
}

describe('WorkbenchRuntime', () => {
	it('binds one runtime to a Pinia without marking its persistence mode', () => {
		const pinia = createPinia()
		const runtime = createWorkbenchRuntime(
			descriptor,
			createRepository('repository-a')
		)

		bindWorkbenchRuntime(pinia, runtime)

		expect(getWorkbenchRuntime(pinia)).toBe(runtime)
		expect(getWorkbenchRuntime(createPinia())).toBeNull()
	})

	it('invalidates captured work across replacement and accepts revisions only for the active workspace', () => {
		const runtime = createWorkbenchRuntime(
			descriptor,
			createRepository('repository-a')
		)
		const first = runtime.capture()

		expect(runtime.acceptRepositoryRevision(first.context, 2)).toBe(true)
		expect(runtime.descriptor.value.repositoryRevision).toBe(2)

		const nextDescriptor = {
			...descriptor,
			id: 'workspace-b',
			repositoryId: 'repository-b',
			repositoryRevision: 0
		}
		runtime.replaceWorkspace(nextDescriptor, createRepository('repository-b'))

		expect(runtime.isCurrent(first.context)).toBe(false)
		expect(runtime.acceptRepositoryRevision(first.context, 3)).toBe(false)
		expect(runtime.capture().context).toMatchObject({
			workspaceId: 'workspace-b',
			repositoryId: 'repository-b',
			activationGeneration: 1
		})
	})
})
