import type { LibraryRepositoryBundle } from '~/repositories/library/contracts'
import { getSavedAnonymousThemePreference, setTheme } from './setTheme'
import type { WorkbenchRuntime } from './workbenchPinia'
import { createCloudWorkspaceId } from './workspaceIdentity'
import {
	activateWorkspaceThemeMirror,
	clearWorkspaceThemeMirror
} from './workspaceThemeMirror'

export function applyCloudWorkspaceOwner(
	runtime: WorkbenchRuntime,
	repository: LibraryRepositoryBundle,
	userId: string | null
): boolean {
	const descriptor = runtime.descriptor.value
	if (
		descriptor.location !== 'cloud' ||
		descriptor.repositoryId !== repository.id
	)
		return false

	const workspaceId = createCloudWorkspaceId(userId)
	const didChange = descriptor.id !== workspaceId
	if (didChange) {
		runtime.replaceWorkspace(
			{ ...descriptor, id: workspaceId, repositoryRevision: 0 },
			repository
		)
		repository.covers.reset()
	}

	const mirroredTheme = userId
		? activateWorkspaceThemeMirror(workspaceId)
		: (clearWorkspaceThemeMirror(), null)
	setTheme(mirroredTheme ?? getSavedAnonymousThemePreference() ?? 'auto')
	return didChange
}
