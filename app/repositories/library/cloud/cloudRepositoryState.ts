import type { SupabaseClient } from '@supabase/supabase-js'
import type { DecodeIssue } from '~/utils/supabaseRows'
import type { Database } from '~~/shared/types/database'
import type { RepositoryOutcome, WorkspaceOperationContext } from '../contracts'

export type CloudIdentityProvider = {
	getUserId(): string | null
	resolveAuthenticatedUserId(): Promise<string>
}

export type CloudLibraryRepositoryDependencies = {
	repositoryId: string
	supabase: SupabaseClient<Database>
	identity: CloudIdentityProvider
	isCurrentContext(context: WorkspaceOperationContext): boolean
	getSupabaseConfig(): { key: string; url: string }
}

export type CloudOperationLease = Readonly<{
	context: WorkspaceOperationContext
	userId: string
	startedRevision: number
}>

export type CloudRepositoryState = ReturnType<typeof createCloudRepositoryState>

export function createCloudRepositoryState(
	dependencies: CloudLibraryRepositoryDependencies
) {
	let repositoryRevision = 0

	function isContextCurrent(context: WorkspaceOperationContext): boolean {
		return (
			context.repositoryId === dependencies.repositoryId &&
			dependencies.isCurrentContext(context)
		)
	}

	async function capture(
		context: WorkspaceOperationContext
	): Promise<CloudOperationLease | RepositoryOutcome<never>> {
		if (!isContextCurrent(context)) return { status: 'stale' }

		let userId = dependencies.identity.getUserId() ?? null
		if (!userId) {
			try {
				userId = await dependencies.identity.resolveAuthenticatedUserId()
			} catch (error) {
				return isContextCurrent(context)
					? { status: 'unavailable', reason: 'unauthenticated', error }
					: { status: 'stale' }
			}
		}

		if (!isContextCurrent(context)) return { status: 'stale' }
		const reactiveUserId = dependencies.identity.getUserId() ?? null
		if (reactiveUserId !== userId) return { status: 'stale' }

		return { context, userId, startedRevision: repositoryRevision }
	}

	function isLease(value: unknown): value is CloudOperationLease {
		return Boolean(
			value &&
			typeof value === 'object' &&
			'userId' in value &&
			'startedRevision' in value
		)
	}

	function isCurrent(lease: CloudOperationLease): boolean {
		return (
			isContextCurrent(lease.context) &&
			(dependencies.identity.getUserId() ?? null) === lease.userId
		)
	}

	function complete<T>(
		lease: CloudOperationLease,
		value: T,
		options: {
			expectedRevision?: number
			issues?: DecodeIssue[]
			mutated?: boolean
		} = {}
	): RepositoryOutcome<T> {
		if (!isCurrent(lease)) return { status: 'stale' }
		if (
			options.expectedRevision !== undefined &&
			options.expectedRevision !== repositoryRevision
		) {
			return { status: 'stale' }
		}
		if (options.mutated) repositoryRevision += 1
		return {
			status: 'success',
			value,
			repositoryRevision,
			issues: options.issues ?? []
		}
	}

	function transportFailure<T>(error: unknown): RepositoryOutcome<T> {
		return { status: 'unavailable', reason: 'transport', error }
	}

	return {
		dependencies,
		capture,
		isLease,
		isCurrent,
		complete,
		transportFailure,
		getRevision: () => repositoryRevision,
		hasRevisionChanged: (lease: CloudOperationLease) =>
			lease.startedRevision !== repositoryRevision
	}
}
