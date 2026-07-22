import type {
	CoverReference,
	LibraryDataset,
	LibraryObservedView
} from '~~/shared/types/library'
import type {
	LibraryRepositoryBundle,
	RepositoryOutcome,
	WorkspaceOperationContext
} from './contracts'

type DemoRepositoryOptions = {
	id: string
	dataset: LibraryDataset
	repositoryRevision?: number
	isCurrentContext(context: WorkspaceOperationContext): boolean
}

function cloneCover(reference: CoverReference): CoverReference {
	return { ...reference }
}

function cloneDataset(dataset: LibraryDataset): LibraryDataset {
	return {
		records: dataset.records.map((record) => ({
			...record,
			artists: record.artists.map((artist) => ({ ...artist })),
			labels: record.labels.map((label) => ({ ...label })),
			cover: cloneCover(record.cover)
		})),
		tracks: dataset.tracks.map((track) => ({
			...track,
			artists: track.artists.map((artist) => ({ ...artist })),
			extraartists: track.extraartists.map((artist) => ({ ...artist })),
			genres: [...track.genres],
			beatport_data: track.beatport_data ? { ...track.beatport_data } : null,
			audio_features: track.audio_features
				? structuredClone(track.audio_features)
				: null
		})),
		crates: dataset.crates.map((crate) => ({
			...crate,
			records: [...crate.records]
		})),
		savedSets: dataset.savedSets.map((savedSet) => ({
			...savedSet,
			played_tracks: savedSet.played_tracks.map((entry) => ({ ...entry }))
		})),
		preferences: { ...dataset.preferences }
	}
}

function observeDataset(dataset: LibraryDataset): LibraryObservedView {
	return {
		...cloneDataset(dataset),
		consistency: 'non-atomic-observation'
	}
}

function readOnly<T>(): Promise<RepositoryOutcome<T>> {
	return Promise.resolve({ status: 'unavailable', reason: 'read-only' })
}

export function createDemoLibraryRepository({
	id,
	dataset,
	repositoryRevision = 0,
	isCurrentContext
}: DemoRepositoryOptions): LibraryRepositoryBundle {
	return {
		id,
		async readObservedLibraryView(context) {
			if (!isCurrentContext(context)) return { status: 'stale' }
			return {
				status: 'success',
				value: observeDataset(dataset),
				repositoryRevision,
				issues: []
			}
		},
		records: {
			async list(context) {
				if (!isCurrentContext(context)) return { status: 'stale' }
				return {
					status: 'success',
					value: cloneDataset(dataset).records,
					repositoryRevision,
					issues: []
				}
			},
			findExistingDiscogsIds: () => readOnly(),
			importExternalWithTracks: () => readOnly(),
			createWithTracks: () => readOnly(),
			update: () => readOnly(),
			updateWithCover: () => readOnly(),
			removeFromCollection: () => readOnly(),
			drainCoverCleanup: () => readOnly()
		},
		tracks: {
			async list(context) {
				if (!isCurrentContext(context)) return { status: 'stale' }
				return {
					status: 'success',
					value: cloneDataset(dataset).tracks,
					repositoryRevision,
					issues: []
				}
			},
			create: () => readOnly(),
			update: () => readOnly(),
			updateBatch: () => readOnly(),
			delete: () => readOnly()
		},
		crates: {
			async list(context) {
				if (!isCurrentContext(context)) return { status: 'stale' }
				return {
					status: 'success',
					value: cloneDataset(dataset).crates,
					repositoryRevision,
					issues: []
				}
			},
			create: () => readOnly(),
			updateMetadata: () => readOnly(),
			delete: () => readOnly(),
			addRecord: () => readOnly(),
			removeRecord: () => readOnly()
		},
		savedSets: {
			async list(context) {
				if (!isCurrentContext(context)) return { status: 'stale' }
				return {
					status: 'success',
					value: cloneDataset(dataset).savedSets,
					repositoryRevision,
					issues: []
				}
			},
			save: () => readOnly(),
			delete: () => readOnly()
		},
		preferences: {
			async read(context) {
				if (!isCurrentContext(context)) return { status: 'stale' }
				return {
					status: 'success',
					value: { ...dataset.preferences },
					repositoryRevision,
					issues: []
				}
			},
			update: () => readOnly()
		},
		covers: {
			resolve(context, reference) {
				if (!isCurrentContext(context)) return Promise.resolve(null)
				if (reference.kind === 'external') return Promise.resolve(reference.url)
				if (reference.kind === 'cloud' || reference.kind === 'browser') {
					return Promise.resolve(reference.fallbackUrl)
				}
				return Promise.resolve(null)
			},
			reset() {}
		}
	}
}
