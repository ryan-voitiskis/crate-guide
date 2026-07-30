import type { Pinia } from 'pinia'
import { createCloudLibraryRepository } from '~/repositories/library/cloud/cloudLibraryRepository'
import type { CloudIdentityProvider } from '~/repositories/library/cloud/cloudRepositoryState'
import { applyCloudWorkspaceOwner } from '~/utils/cloudWorkspaceOwner'
import {
	type WorkbenchRuntime,
	appWorkbenchCapabilities,
	bindWorkbenchRuntime,
	createWorkbenchRuntime,
	getWorkbenchRuntime
} from '~/utils/workbenchPinia'
import { createCloudWorkspaceId } from '~/utils/workspaceIdentity'

export type CloudWorkbenchRuntimeOptions = {
	identity?: CloudIdentityProvider
}

export function ensureCloudWorkbenchRuntime(
	pinia: Pinia,
	options: CloudWorkbenchRuntimeOptions = {}
): WorkbenchRuntime {
	const existing = getWorkbenchRuntime(pinia)
	if (existing) return existing
	const supabase = useSupabaseClient<Database>()
	const identity =
		options.identity ??
		((): CloudIdentityProvider => {
			const authenticatedUser = useSupabaseUser()
			const getUserId = (): string | null => {
				const authUser = authenticatedUser.value as {
					id?: string | null
					sub?: string | null
				} | null
				return authUser?.sub ?? authUser?.id ?? null
			}
			return {
				getUserId,
				async resolveAuthenticatedUserId(): Promise<string> {
					const reactiveUserId = getUserId()
					if (reactiveUserId) return reactiveUserId
					const { data: sessionData, error: sessionError } =
						await supabase.auth.getSession()
					if (sessionError) throw sessionError
					if (sessionData.session?.user?.id) return sessionData.session.user.id
					const { data, error } = await supabase.auth.getUser()
					if (error) throw error
					if (!data.user?.id) throw new Error('User not logged in.')
					return data.user.id
				}
			}
		})()
	const runtimeReference: { current: WorkbenchRuntime | null } = {
		current: null
	}
	const repository = createCloudLibraryRepository({
		repositoryId: 'cloud-supabase',
		supabase,
		identity: {
			getUserId: () => identity.getUserId(),
			resolveAuthenticatedUserId: () => identity.resolveAuthenticatedUserId()
		},
		isCurrentContext: (context) =>
			runtimeReference.current?.isCurrent(context) ?? false,
		getSupabaseConfig() {
			const config = useRuntimeConfig().public.supabase as {
				key?: unknown
				url?: unknown
			}
			if (
				typeof config.key !== 'string' ||
				!config.key ||
				typeof config.url !== 'string' ||
				!config.url
			) {
				throw new Error('Supabase configuration is unavailable.')
			}
			return { key: config.key, url: config.url }
		}
	})
	const runtime = createWorkbenchRuntime(
		{
			id: createCloudWorkspaceId(identity.getUserId()),
			repositoryId: repository.id,
			location: 'cloud',
			displayLabel: 'Cloud library',
			readOnly: false,
			repositoryRevision: 0,
			capabilities: appWorkbenchCapabilities
		},
		repository
	)
	runtimeReference.current = runtime
	bindWorkbenchRuntime(pinia, runtime)
	let ownerResolutionGeneration = 0
	watch(
		() => identity.getUserId(),
		(nextUserId, previousUserId) => {
			if (nextUserId === previousUserId) return
			ownerResolutionGeneration += 1
			applyCloudWorkspaceOwner(runtime, repository, nextUserId)
		},
		{ flush: 'sync' }
	)
	const initialUserId = identity.getUserId()
	if (initialUserId) {
		applyCloudWorkspaceOwner(runtime, repository, initialUserId)
	} else {
		const bootstrapOwnerGeneration = ownerResolutionGeneration
		void identity
			.resolveAuthenticatedUserId()
			.then((userId) => {
				if (bootstrapOwnerGeneration !== ownerResolutionGeneration) return
				applyCloudWorkspaceOwner(runtime, repository, userId)
			})
			.catch(() => {
				if (bootstrapOwnerGeneration !== ownerResolutionGeneration) return
				applyCloudWorkspaceOwner(runtime, repository, null)
			})
	}
	return runtime
}
