import type { LibraryRepositoryBundle } from '~/repositories/library/contracts'
import type {
	CapturedWorkbench,
	WorkbenchRuntime
} from '~/utils/workbenchPinia'
import type {
	ExternalRecordImportResult,
	ExternalRecordWithTracksInput
} from '~~/shared/types/library'

export type DiscogsLibraryDestination = Readonly<{
	context: CapturedWorkbench['context']
	isCurrent(): boolean
	findExistingDiscogsIds(discogsIds: readonly number[]): Promise<Set<number>>
	importWithTracks(
		input: ExternalRecordWithTracksInput
	): Promise<ExternalRecordImportResult>
}>

function outcomeError(
	outcome: Exclude<
		Awaited<
			ReturnType<LibraryRepositoryBundle['records']['findExistingDiscogsIds']>
		>,
		{ status: 'success' }
	>
): Error {
	if (outcome.status === 'unavailable' && outcome.error instanceof Error) {
		return outcome.error
	}
	return new Error(
		outcome.status === 'stale'
			? 'The active library changed during the Discogs transfer.'
			: `The active library rejected the Discogs transfer: ${outcome.reason}.`
	)
}

/** Captures one immutable workspace destination for a complete transfer. */
export function captureDiscogsLibraryDestination(
	runtime: WorkbenchRuntime
): DiscogsLibraryDestination | null {
	const captured = runtime.capture()
	if (
		captured.descriptor.readOnly ||
		!captured.descriptor.capabilities.canMutateLibrary
	) {
		return null
	}

	async function accept<T>(
		operation: () => ReturnType<
			LibraryRepositoryBundle['records']['findExistingDiscogsIds']
		>
	): Promise<T> {
		const outcome = await operation()
		if (outcome.status !== 'success') throw outcomeError(outcome)
		if (
			!runtime.acceptRepositoryRevision(
				captured.context,
				outcome.repositoryRevision
			)
		) {
			throw new Error('The active library changed during the Discogs transfer.')
		}
		return outcome.value as T
	}

	return {
		context: captured.context,
		isCurrent: () => runtime.isCurrent(captured.context),
		findExistingDiscogsIds: (discogsIds) =>
			accept<Set<number>>(() =>
				captured.repositories.records.findExistingDiscogsIds(
					captured.context,
					discogsIds
				)
			),
		async importWithTracks(input) {
			const outcome =
				await captured.repositories.records.importExternalWithTracks(
					captured.context,
					input
				)
			if (outcome.status !== 'success') throw outcomeError(outcome)
			if (
				!runtime.acceptRepositoryRevision(
					captured.context,
					outcome.repositoryRevision
				)
			) {
				throw new Error(
					'The active library changed during the Discogs transfer.'
				)
			}
			return outcome.value
		}
	}
}
