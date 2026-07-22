import { describe, expect, it, vi } from 'vitest'
import type { LibraryRepositoryBundle } from '~/repositories/library/contracts'
import {
	appWorkbenchCapabilities,
	createWorkbenchRuntime
} from '~/utils/workbenchPinia'
import type { ExternalRecordWithTracksInput } from '~~/shared/types/library'
import {
	type DiscogsLibraryDestination,
	captureDiscogsLibraryDestination
} from './discogsLibraryDestination'

function deferred<T>() {
	let resolve!: (value: T) => void
	const promise = new Promise<T>((resolvePromise) => {
		resolve = resolvePromise
	})
	return { promise, resolve }
}

function repository(
	id: string,
	importExternalWithTracks: LibraryRepositoryBundle['records']['importExternalWithTracks']
): LibraryRepositoryBundle {
	return {
		id,
		readObservedLibraryView: vi.fn(),
		records: {
			list: vi.fn(),
			findExistingDiscogsIds: vi.fn(),
			importExternalWithTracks,
			createWithTracks: vi.fn(),
			update: vi.fn(),
			updateWithCover: vi.fn(),
			removeFromCollection: vi.fn(),
			drainCoverCleanup: vi.fn()
		},
		tracks: {} as never,
		crates: {} as never,
		savedSets: {} as never,
		preferences: {} as never,
		covers: {} as never
	}
}

const input: ExternalRecordWithTracksInput = {
	record: {
		title: 'Release',
		artists: [],
		labels: [],
		year: null,
		cover: { kind: 'none' },
		discogs_id: 42,
		discogs_release_url: 'https://discogs.example.test/release/42'
	},
	tracks: []
}

describe('Discogs library destination', () => {
	it('rejects a late result after the captured workspace is replaced', async () => {
		const pending = deferred<{
			status: 'success'
			value: { recordId: string; inserted: boolean }
			repositoryRevision: number
			issues: []
		}>()
		const importExternalWithTracks = vi.fn<
			LibraryRepositoryBundle['records']['importExternalWithTracks']
		>(() => pending.promise)
		const firstRepository = repository('repository-a', importExternalWithTracks)
		const runtime = createWorkbenchRuntime(
			{
				id: 'workspace-a',
				repositoryId: firstRepository.id,
				location: 'browser',
				displayLabel: 'First',
				readOnly: false,
				repositoryRevision: 0,
				capabilities: appWorkbenchCapabilities
			},
			firstRepository
		)
		const destination = captureDiscogsLibraryDestination(runtime)
		expect(destination).not.toBeNull()

		const result = (destination as DiscogsLibraryDestination).importWithTracks(
			input
		)
		await vi.waitFor(() =>
			expect(importExternalWithTracks).toHaveBeenCalledOnce()
		)
		runtime.replaceWorkspace(
			{
				...runtime.descriptor.value,
				id: 'workspace-b',
				repositoryId: 'repository-b'
			},
			repository('repository-b', vi.fn())
		)
		pending.resolve({
			status: 'success',
			value: { recordId: 'record-a', inserted: true },
			repositoryRevision: 1,
			issues: []
		})

		await expect(result).rejects.toThrow(
			'The active library changed during the Discogs transfer.'
		)
		expect(importExternalWithTracks).toHaveBeenCalledWith(
			{
				workspaceId: 'workspace-a',
				repositoryId: 'repository-a',
				activationGeneration: 0
			},
			input
		)
		expect(
			JSON.stringify(importExternalWithTracks.mock.calls[0]![1])
		).not.toContain('user_id')
	})
})
