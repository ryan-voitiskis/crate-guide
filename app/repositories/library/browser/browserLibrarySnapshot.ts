import type { LibraryDataset } from '~~/shared/types/library'
import {
	decodeBrowserCrateRow,
	decodeBrowserManagedCover,
	decodeBrowserPreferencesRow,
	decodeBrowserRecordRow,
	decodeBrowserSavedSetRow,
	decodeBrowserTrackRow,
	decodeBrowserWorkspaceManifest,
	decodeLibraryDataset,
	encodeBrowserManagedCover
} from './browserLibraryCodecs'
import {
	BrowserRepositoryNotFoundError,
	BrowserStorageCodecError
} from './browserLibraryErrors'
import { runBrowserLibraryReadTransaction } from './browserLibraryRuntime'
import {
	BROWSER_LIBRARY_STORES,
	BROWSER_LIBRARY_WORKSPACE_INDEX,
	requestResult
} from './browserLibrarySchema'
import type {
	BrowserLibrarySnapshot,
	BrowserManagedCover,
	ReplaceBrowserSnapshotInput
} from './browserLibraryTypes'

const SNAPSHOT_STORES = [
	BROWSER_LIBRARY_STORES.workspaces,
	BROWSER_LIBRARY_STORES.preferences,
	BROWSER_LIBRARY_STORES.records,
	BROWSER_LIBRARY_STORES.tracks,
	BROWSER_LIBRARY_STORES.crates,
	BROWSER_LIBRARY_STORES.savedSets,
	BROWSER_LIBRARY_STORES.covers
] as const

function withoutWorkspaceId<T extends { workspaceId: string }>(value: T) {
	const { workspaceId: _workspaceId, ...domain } = value
	return domain
}

function validateManagedCoverGraph(
	dataset: LibraryDataset,
	managedCovers: readonly BrowserManagedCover[],
	allowMissing: boolean
) {
	const recordByAssetId = new Map(
		dataset.records.flatMap((record) =>
			record.cover.kind === 'browser'
				? [[record.cover.assetId, record] as const]
				: []
		)
	)
	const coverByAssetId = new Map<string, BrowserManagedCover>()

	for (const cover of managedCovers) {
		if (coverByAssetId.has(cover.assetId)) {
			throw new BrowserStorageCodecError('/snapshot/covers/assetId')
		}
		coverByAssetId.set(cover.assetId, cover)
		const record = recordByAssetId.get(cover.assetId)
		if (!record || record.id !== cover.recordId) {
			throw new BrowserStorageCodecError('/snapshot/covers/recordId')
		}
	}

	if (!allowMissing) {
		for (const assetId of recordByAssetId.keys()) {
			if (!coverByAssetId.has(assetId)) {
				throw new BrowserStorageCodecError('/snapshot/covers/missing')
			}
		}
	}
}

export async function readBrowserLibrarySnapshot(
	database: IDBDatabase,
	workspaceId: string,
	repositoryId: string
): Promise<BrowserLibrarySnapshot> {
	return runBrowserLibraryReadTransaction(
		database,
		SNAPSHOT_STORES,
		async (transaction) => {
			const workspaceQuery = (storeName: (typeof SNAPSHOT_STORES)[number]) =>
				requestResult(
					transaction
						.objectStore(storeName)
						.index(BROWSER_LIBRARY_WORKSPACE_INDEX)
						.getAll(workspaceId)
				)
			const [
				storedManifest,
				storedPreferences,
				storedRecords,
				storedTracks,
				storedCrates,
				storedSavedSets,
				storedCovers
			] = await Promise.all([
				requestResult(
					transaction
						.objectStore(BROWSER_LIBRARY_STORES.workspaces)
						.get(workspaceId)
				),
				requestResult(
					transaction
						.objectStore(BROWSER_LIBRARY_STORES.preferences)
						.get(workspaceId)
				),
				workspaceQuery(BROWSER_LIBRARY_STORES.records),
				workspaceQuery(BROWSER_LIBRARY_STORES.tracks),
				workspaceQuery(BROWSER_LIBRARY_STORES.crates),
				workspaceQuery(BROWSER_LIBRARY_STORES.savedSets),
				workspaceQuery(BROWSER_LIBRARY_STORES.covers)
			])

			if (storedManifest === undefined) {
				throw new BrowserRepositoryNotFoundError('workspace')
			}
			if (storedPreferences === undefined) {
				throw new BrowserStorageCodecError('/snapshot/preferences')
			}

			const manifest = decodeBrowserWorkspaceManifest(storedManifest)
			if (manifest.id !== workspaceId) {
				throw new BrowserStorageCodecError('/snapshot/workspaceId')
			}
			if (manifest.repositoryId !== repositoryId) {
				throw new BrowserRepositoryNotFoundError('workspace')
			}
			const dataset = decodeLibraryDataset({
				records: storedRecords.map((row) =>
					withoutWorkspaceId(decodeBrowserRecordRow(row, workspaceId))
				),
				tracks: storedTracks.map((row) =>
					withoutWorkspaceId(decodeBrowserTrackRow(row, workspaceId))
				),
				crates: storedCrates.map((row) =>
					withoutWorkspaceId(decodeBrowserCrateRow(row, workspaceId))
				),
				savedSets: storedSavedSets.map((row) =>
					withoutWorkspaceId(decodeBrowserSavedSetRow(row, workspaceId))
				),
				preferences: decodeBrowserPreferencesRow(storedPreferences, workspaceId)
					.value
			})
			const managedCovers = storedCovers.map((row) =>
				decodeBrowserManagedCover(row, workspaceId)
			)
			validateManagedCoverGraph(
				dataset,
				managedCovers,
				manifest.coverCompleteness === 'missing'
			)

			return {
				dataset,
				managedCovers,
				contentRevision: manifest.contentRevision,
				repositoryRevision: manifest.repositoryRevision,
				coverCompleteness: manifest.coverCompleteness
			}
		}
	)
}

function replacementCoverMap(
	covers: ReplaceBrowserSnapshotInput['covers']
): ReadonlyMap<string, Blob> {
	if (!covers) return new Map()
	return covers instanceof Map ? covers : new Map(Object.entries(covers))
}

export function buildReplacementManagedCovers(
	workspaceId: string,
	input: ReplaceBrowserSnapshotInput,
	timestamp: string
): { dataset: LibraryDataset; covers: BrowserManagedCover[] } {
	const dataset = decodeLibraryDataset(input.snapshot)
	const providedCovers = replacementCoverMap(input.covers)
	const referencedAssetIds = new Set<string>()
	const covers: BrowserManagedCover[] = []

	for (const record of dataset.records) {
		if (record.cover.kind !== 'browser') continue
		referencedAssetIds.add(record.cover.assetId)
		const blob = providedCovers.get(record.cover.assetId)
		if (!blob) throw new BrowserStorageCodecError('/snapshot/covers/missing')
		covers.push(
			encodeBrowserManagedCover({
				workspaceId,
				assetId: record.cover.assetId,
				recordId: record.id,
				blob,
				createdAt: timestamp,
				updatedAt: timestamp
			})
		)
	}

	for (const assetId of providedCovers.keys()) {
		if (!referencedAssetIds.has(assetId)) {
			throw new BrowserStorageCodecError('/snapshot/covers/orphan')
		}
	}

	validateManagedCoverGraph(dataset, covers, false)
	return { dataset, covers }
}
