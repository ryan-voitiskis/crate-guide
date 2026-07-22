import type { CoverReference, LibrarySnapshot } from '~~/shared/types/library'
import type {
	LibraryRepositoryBundle,
	RepositoryOutcome,
	WorkspaceOperationContext
} from './contracts'

type DemoRepositoryOptions = {
	id: string
	snapshot: LibrarySnapshot
	isCurrentContext(context: WorkspaceOperationContext): boolean
}

function cloneCover(reference: CoverReference): CoverReference {
	return { ...reference }
}

function cloneSnapshot(snapshot: LibrarySnapshot): LibrarySnapshot {
	return {
		records: snapshot.records.map((record) => ({
			...record,
			artists: record.artists.map((artist) => ({ ...artist })),
			labels: record.labels.map((label) => ({ ...label })),
			cover: cloneCover(record.cover)
		})),
		tracks: snapshot.tracks.map((track) => ({
			...track,
			artists: track.artists.map((artist) => ({ ...artist })),
			extraartists: track.extraartists.map((artist) => ({ ...artist })),
			genres: [...track.genres],
			beatport_data: track.beatport_data ? { ...track.beatport_data } : null,
			audio_features: track.audio_features
				? structuredClone(track.audio_features)
				: null
		})),
		crates: snapshot.crates.map((crate) => ({
			...crate,
			records: [...crate.records]
		})),
		savedSets: snapshot.savedSets.map((savedSet) => ({
			...savedSet,
			played_tracks: savedSet.played_tracks.map((entry) => ({ ...entry }))
		})),
		preferences: { ...snapshot.preferences },
		repositoryRevision: snapshot.repositoryRevision
	}
}

function readOnly<T>(): Promise<RepositoryOutcome<T>> {
	return Promise.resolve({ status: 'unavailable', reason: 'read-only' })
}

export function createDemoLibraryRepository({
	id,
	snapshot,
	isCurrentContext
}: DemoRepositoryOptions): LibraryRepositoryBundle {
	return {
		id,
		async readLibrarySnapshot(context) {
			if (!isCurrentContext(context)) return { status: 'stale' }
			return {
				status: 'success',
				value: cloneSnapshot(snapshot),
				repositoryRevision: snapshot.repositoryRevision,
				issues: []
			}
		},
		records: {
			createWithTracks: () => readOnly(),
			update: () => readOnly(),
			updateWithCover: () => readOnly(),
			removeFromCollection: () => readOnly(),
			drainCoverCleanup: () => readOnly()
		},
		tracks: {
			create: () => readOnly(),
			update: () => readOnly(),
			updateBatch: () => readOnly(),
			delete: () => readOnly()
		},
		crates: {
			create: () => readOnly(),
			updateMetadata: () => readOnly(),
			delete: () => readOnly(),
			addRecord: () => readOnly(),
			removeRecord: () => readOnly()
		},
		savedSets: {
			save: () => readOnly(),
			delete: () => readOnly()
		},
		preferences: {
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
