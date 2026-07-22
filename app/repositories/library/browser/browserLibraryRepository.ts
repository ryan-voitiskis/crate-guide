import { processRecordCoverFile } from '~/utils/recordCover'
import { sortCreatedAtDescIdDesc } from '~/utils/supabaseOrdering'
import type { DiscogsArtistDb, DiscogsLabelDb } from '~~/shared/types/discogs'
import type {
	CoverReference,
	LibraryDataset,
	LibraryTrack,
	ManualRecordTrackInput,
	ManualRecordWithTracksInput
} from '~~/shared/types/library'
import type {
	TrackBatchIssueCode,
	TrackBatchUpdateOutcome,
	TrackBatchUpdateResult
} from '~~/shared/types/trackUpdates'
import type {
	CoverResolver,
	CratesRepository,
	PreferencesRepository,
	RecordsRepository,
	RepositoryOutcome,
	SavedSetsRepository,
	TracksRepository,
	WorkspaceOperationContext
} from '../contracts'
import {
	decodeBrowserCrateRow,
	decodeBrowserPreferencesRow,
	decodeBrowserRecordRow,
	decodeBrowserSavedSetRow,
	decodeBrowserTrackRow,
	decodeLibraryCrate,
	decodeLibraryPreferences,
	decodeLibraryRecord,
	decodeLibrarySavedSet,
	decodeLibraryTrack,
	encodeBrowserCrateRow,
	encodeBrowserManagedCover,
	encodeBrowserPreferencesRow,
	encodeBrowserRecordRow,
	encodeBrowserSavedSetRow,
	encodeBrowserTrackRow
} from './browserLibraryCodecs'
import {
	BrowserRepositoryDomainConflictError,
	BrowserRepositoryNotFoundError,
	BrowserStorageCodecError,
	BrowserStorageError,
	normalizeBrowserRepositoryError
} from './browserLibraryErrors'
import { BrowserLibraryRepositoryState } from './browserLibraryRepositoryState'
import {
	browserLibraryRandomUUID,
	browserLibraryTimestamp,
	nextBrowserEntityTimestamp
} from './browserLibraryRuntime'
import {
	BROWSER_LIBRARY_STORES,
	BROWSER_LIBRARY_TRACK_RECORD_INDEX,
	BROWSER_LIBRARY_WORKSPACE_INDEX,
	type BrowserLibraryStoreName,
	openBrowserLibraryDatabase,
	probeBrowserLibraryStorage,
	requestResult
} from './browserLibrarySchema'
import {
	buildReplacementManagedCovers,
	readBrowserLibrarySnapshot
} from './browserLibrarySnapshot'
import type {
	BrowserLibraryDependencies,
	BrowserLibraryRepository,
	BrowserRepositoryInvalidation,
	OpenBrowserLibraryRepositoryOptions,
	ReplaceBrowserSnapshotInput
} from './browserLibraryTypes'

function domainValue<T>(callback: () => T): T {
	try {
		return callback()
	} catch (error) {
		throw new BrowserRepositoryDomainConflictError('integrity', undefined, {
			cause: error
		})
	}
}

function domainConflict<T>(error: unknown): RepositoryOutcome<T> {
	return {
		status: 'conflict',
		reason: 'integrity',
		current: error
	}
}

function transportFailure<T>(error: unknown): RepositoryOutcome<T> {
	return { status: 'unavailable', reason: 'transport', error }
}

function withoutWorkspaceId<T extends { workspaceId: string }>(value: T) {
	const { workspaceId: _workspaceId, ...domain } = value
	return domain
}

function valuesEqual(left: unknown, right: unknown): boolean {
	if (Object.is(left, right)) return true
	if (Array.isArray(left) || Array.isArray(right)) {
		return (
			Array.isArray(left) &&
			Array.isArray(right) &&
			left.length === right.length &&
			left.every((value, index) => valuesEqual(value, right[index]))
		)
	}
	if (
		left === null ||
		right === null ||
		typeof left !== 'object' ||
		typeof right !== 'object'
	) {
		return false
	}
	const leftObject = left as Record<string, unknown>
	const rightObject = right as Record<string, unknown>
	const leftKeys = Object.keys(leftObject)
	const rightKeys = Object.keys(rightObject)
	return (
		leftKeys.length === rightKeys.length &&
		leftKeys.every(
			(key) =>
				Object.hasOwn(rightObject, key) &&
				valuesEqual(leftObject[key], rightObject[key])
		)
	)
}

function portableEntityEqual<T extends { updated_at: string | null }>(
	left: T,
	right: T
): boolean {
	const { updated_at: _leftUpdatedAt, ...leftPortable } = left
	const { updated_at: _rightUpdatedAt, ...rightPortable } = right
	return valuesEqual(leftPortable, rightPortable)
}

function recordArtists(name?: string | null): DiscogsArtistDb[] {
	const trimmed = name?.trim()
	return trimmed ? [{ name: trimmed, role: null }] : []
}

function recordLabels(
	name?: string | null,
	catno?: string | null
): DiscogsLabelDb[] {
	const trimmedName = name?.trim()
	if (!trimmedName) return []
	const trimmedCatno = catno?.trim()
	return [{ name: trimmedName, catno: trimmedCatno || undefined }]
}

function createManualTrack(
	input: ManualRecordTrackInput,
	recordId: string,
	id: string,
	recordArtistList: DiscogsArtistDb[],
	defaults: Pick<ManualRecordWithTracksInput, 'defaultGenres' | 'defaultRpm'>,
	timestamp: string
): LibraryTrack {
	const ownArtists = recordArtists(input.artistName)
	return decodeLibraryTrack({
		id,
		record_id: recordId,
		title: input.title.trim(),
		artists: ownArtists.length ? ownArtists : recordArtistList,
		extraartists: [],
		position: input.position?.trim() || null,
		duration: input.duration ?? null,
		bpm: input.bpm ?? null,
		rpm: input.rpm ?? defaults.defaultRpm ?? null,
		key: input.key ?? null,
		mode: input.mode ?? null,
		genres: input.genres?.length
			? [...input.genres]
			: [...(defaults.defaultGenres ?? [])],
		time_signature_upper: null,
		time_signature_lower: null,
		playable: input.playable ?? true,
		beatport_data: null,
		audio_features: null,
		created_at: timestamp,
		updated_at: timestamp
	})
}

function entityInvalidation(
	entity: BrowserRepositoryInvalidation['entity'],
	ids: readonly string[]
): BrowserRepositoryInvalidation {
	return { entity, ids }
}

async function workspaceRows(
	transaction: IDBTransaction,
	storeName: BrowserLibraryStoreName,
	workspaceId: string
) {
	return requestResult(
		transaction
			.objectStore(storeName)
			.index(BROWSER_LIBRARY_WORKSPACE_INDEX)
			.getAll(workspaceId)
	)
}

function createRecordsRepository(
	state: BrowserLibraryRepositoryState
): RecordsRepository {
	const { workspaceId, dependencies } = state

	return {
		list(context) {
			return state.read(
				context,
				[BROWSER_LIBRARY_STORES.records],
				async (transaction) =>
					sortCreatedAtDescIdDesc(
						(
							await workspaceRows(
								transaction,
								BROWSER_LIBRARY_STORES.records,
								workspaceId
							)
						).map((row) =>
							withoutWorkspaceId(decodeBrowserRecordRow(row, workspaceId))
						)
					)
			)
		},

		async createWithTracks(context, input) {
			if (!state.isCurrentContext(context)) return { status: 'stale' }
			let recordId: string
			let trackIds: string[]
			try {
				recordId = browserLibraryRandomUUID(dependencies)
				trackIds = input.tracks.map(() =>
					browserLibraryRandomUUID(dependencies)
				)
				const validationTimestamp = browserLibraryTimestamp(dependencies)
				const artists = recordArtists(input.artistName)
				domainValue(() =>
					decodeLibraryRecord({
						id: recordId,
						title: input.title.trim(),
						artists,
						labels: recordLabels(input.labelName, input.catno),
						year: input.year ?? null,
						cover: input.cover?.trim()
							? { kind: 'external', url: input.cover.trim() }
							: { kind: 'none' },
						discogs_id: null,
						discogs_release_url: null,
						created_at: validationTimestamp,
						updated_at: validationTimestamp
					})
				)
				input.tracks.forEach((track, index) =>
					domainValue(() =>
						createManualTrack(
							track,
							recordId,
							trackIds[index]!,
							artists,
							input,
							validationTimestamp
						)
					)
				)
			} catch (error) {
				if (!state.isCurrentContext(context)) return { status: 'stale' }
				return error instanceof BrowserRepositoryDomainConflictError
					? domainConflict(error)
					: transportFailure(error)
			}

			return state.command(
				context,
				{
					name: 'create-record-with-tracks',
					stores: [
						BROWSER_LIBRARY_STORES.records,
						BROWSER_LIBRARY_STORES.tracks
					]
				},
				async (transaction, writer, _manifest, timestamp) => {
					const artists = recordArtists(input.artistName)
					const record = domainValue(() =>
						decodeLibraryRecord({
							id: recordId,
							title: input.title.trim(),
							artists,
							labels: recordLabels(input.labelName, input.catno),
							year: input.year ?? null,
							cover: input.cover?.trim()
								? { kind: 'external', url: input.cover.trim() }
								: { kind: 'none' },
							discogs_id: null,
							discogs_release_url: null,
							created_at: timestamp,
							updated_at: timestamp
						})
					)
					const tracks = input.tracks.map((track, index) =>
						domainValue(() =>
							createManualTrack(
								track,
								recordId,
								trackIds[index]!,
								artists,
								input,
								timestamp
							)
						)
					)
					writer.add(
						transaction.objectStore(BROWSER_LIBRARY_STORES.records),
						encodeBrowserRecordRow(workspaceId, record)
					)
					const trackStore = transaction.objectStore(
						BROWSER_LIBRARY_STORES.tracks
					)
					for (const track of tracks) {
						writer.add(trackStore, encodeBrowserTrackRow(workspaceId, track))
					}
					return {
						value: record,
						invalidations: [
							entityInvalidation('records', [record.id]),
							entityInvalidation(
								'tracks',
								tracks.map((track) => track.id)
							)
						]
					}
				}
			)
		},

		update(context, { id, updates }) {
			return state.command(
				context,
				{
					name: 'update-record',
					stores: [
						BROWSER_LIBRARY_STORES.records,
						BROWSER_LIBRARY_STORES.covers
					]
				},
				async (transaction, writer, _manifest, timestamp) => {
					const recordStore = transaction.objectStore(
						BROWSER_LIBRARY_STORES.records
					)
					const stored = await requestResult(recordStore.get([workspaceId, id]))
					if (stored === undefined) {
						throw new BrowserRepositoryNotFoundError('record')
					}
					const existing = withoutWorkspaceId(
						decodeBrowserRecordRow(stored, workspaceId)
					)
					if (
						updates.cover?.kind === 'browser' &&
						(existing.cover.kind !== 'browser' ||
							existing.cover.assetId !== updates.cover.assetId)
					) {
						throw new BrowserRepositoryDomainConflictError('integrity')
					}
					const candidate = domainValue(() =>
						decodeLibraryRecord({
							...existing,
							...updates,
							id: existing.id,
							created_at: existing.created_at,
							updated_at: existing.updated_at
						})
					)
					if (portableEntityEqual(existing, candidate)) {
						return { value: existing, mutated: false }
					}
					const record = decodeLibraryRecord({
						...candidate,
						updated_at: nextBrowserEntityTimestamp(
							existing.updated_at,
							timestamp
						)
					})
					const invalidations = [entityInvalidation('records', [id])]
					if (
						existing.cover.kind === 'browser' &&
						(record.cover.kind !== 'browser' ||
							record.cover.assetId !== existing.cover.assetId)
					) {
						writer.delete(
							transaction.objectStore(BROWSER_LIBRARY_STORES.covers),
							[workspaceId, existing.cover.assetId]
						)
						invalidations.push(
							entityInvalidation('covers', [existing.cover.assetId])
						)
					}
					writer.put(recordStore, encodeBrowserRecordRow(workspaceId, record))
					return { value: record, invalidations }
				}
			)
		},

		async updateWithCover(context, { id, updates, change }) {
			if (!state.isCurrentContext(context)) return { status: 'stale' }
			if (change.type === 'keep') {
				return this.update(context, { id, updates })
			}

			let processedCover: Blob | null = null
			let assetId: string | null = null
			if (change.type === 'upload') {
				try {
					processedCover = await (
						dependencies.processCoverFile ?? processRecordCoverFile
					)(change.file, change.crop)
					assetId = `${id}/${browserLibraryRandomUUID(dependencies)}.webp`
					encodeBrowserManagedCover({
						workspaceId,
						assetId,
						recordId: id,
						blob: processedCover,
						createdAt: browserLibraryTimestamp(dependencies),
						updatedAt: browserLibraryTimestamp(dependencies)
					})
				} catch (error) {
					if (!state.isCurrentContext(context)) return { status: 'stale' }
					return transportFailure(error)
				}
			}

			return state.command(
				context,
				{
					name: 'update-record-cover',
					stores: [
						BROWSER_LIBRARY_STORES.records,
						BROWSER_LIBRARY_STORES.covers
					]
				},
				async (transaction, writer, _manifest, timestamp) => {
					const recordStore = transaction.objectStore(
						BROWSER_LIBRARY_STORES.records
					)
					const coverStore = transaction.objectStore(
						BROWSER_LIBRARY_STORES.covers
					)
					const stored = await requestResult(recordStore.get([workspaceId, id]))
					if (stored === undefined) {
						throw new BrowserRepositoryNotFoundError('record')
					}
					const existing = withoutWorkspaceId(
						decodeBrowserRecordRow(stored, workspaceId)
					)
					const { cover: _ignoredCover, ...metadataUpdates } = updates
					const cover: CoverReference =
						change.type === 'remove'
							? { kind: 'none' }
							: {
									kind: 'browser',
									assetId: assetId!,
									fallbackUrl: null
								}
					const candidate = domainValue(() =>
						decodeLibraryRecord({
							...existing,
							...metadataUpdates,
							cover,
							id: existing.id,
							created_at: existing.created_at,
							updated_at: existing.updated_at
						})
					)
					if (
						change.type !== 'upload' &&
						portableEntityEqual(existing, candidate)
					) {
						return { value: existing, mutated: false }
					}
					const record = decodeLibraryRecord({
						...candidate,
						updated_at: nextBrowserEntityTimestamp(
							existing.updated_at,
							timestamp
						)
					})
					const changedCoverIds: string[] = []
					if (existing.cover.kind === 'browser') {
						writer.delete(coverStore, [workspaceId, existing.cover.assetId])
						changedCoverIds.push(existing.cover.assetId)
					}
					if (change.type === 'upload') {
						const managedCover = domainValue(() =>
							encodeBrowserManagedCover({
								workspaceId,
								assetId: assetId!,
								recordId: id,
								blob: processedCover!,
								createdAt: timestamp,
								updatedAt: timestamp
							})
						)
						writer.put(coverStore, managedCover)
						changedCoverIds.push(assetId!)
					}
					writer.put(recordStore, encodeBrowserRecordRow(workspaceId, record))
					return {
						value: record,
						invalidations: [
							entityInvalidation('records', [id]),
							entityInvalidation('covers', changedCoverIds)
						]
					}
				}
			)
		},

		removeFromCollection(context, { id }) {
			return state.command(
				context,
				{
					name: 'remove-record-from-collection',
					stores: [
						BROWSER_LIBRARY_STORES.records,
						BROWSER_LIBRARY_STORES.tracks,
						BROWSER_LIBRARY_STORES.crates,
						BROWSER_LIBRARY_STORES.covers
					]
				},
				async (transaction, writer, _manifest, timestamp) => {
					const recordStore = transaction.objectStore(
						BROWSER_LIBRARY_STORES.records
					)
					const storedRecord = await requestResult(
						recordStore.get([workspaceId, id])
					)
					if (storedRecord === undefined) {
						throw new BrowserRepositoryNotFoundError('record')
					}
					const record = withoutWorkspaceId(
						decodeBrowserRecordRow(storedRecord, workspaceId)
					)
					const trackStore = transaction.objectStore(
						BROWSER_LIBRARY_STORES.tracks
					)
					const [trackKeys, storedCrates] = await Promise.all([
						requestResult(
							trackStore
								.index(BROWSER_LIBRARY_TRACK_RECORD_INDEX)
								.getAllKeys([workspaceId, id])
						),
						workspaceRows(
							transaction,
							BROWSER_LIBRARY_STORES.crates,
							workspaceId
						)
					])
					const crateStore = transaction.objectStore(
						BROWSER_LIBRARY_STORES.crates
					)
					const changedCrateIds: string[] = []
					for (const storedCrate of storedCrates) {
						const crate = withoutWorkspaceId(
							decodeBrowserCrateRow(storedCrate, workspaceId)
						)
						if (!crate.records.includes(id)) continue
						const updated = decodeLibraryCrate({
							...crate,
							records: crate.records.filter((recordId) => recordId !== id),
							updated_at: nextBrowserEntityTimestamp(
								crate.updated_at,
								timestamp
							)
						})
						writer.put(crateStore, encodeBrowserCrateRow(workspaceId, updated))
						changedCrateIds.push(crate.id)
					}
					for (const key of trackKeys) writer.delete(trackStore, key)
					writer.delete(recordStore, [workspaceId, id])
					const changedCoverIds: string[] = []
					if (record.cover.kind === 'browser') {
						writer.delete(
							transaction.objectStore(BROWSER_LIBRARY_STORES.covers),
							[workspaceId, record.cover.assetId]
						)
						changedCoverIds.push(record.cover.assetId)
					}
					return {
						value: { id },
						invalidations: [
							entityInvalidation('records', [id]),
							entityInvalidation(
								'tracks',
								trackKeys.map((key) => String((key as IDBValidKey[])[1]))
							),
							entityInvalidation('crates', changedCrateIds),
							entityInvalidation('covers', changedCoverIds)
						]
					}
				}
			)
		},

		drainCoverCleanup(context) {
			return state.read(context, [], async () => undefined)
		}
	}
}

const TRACK_BATCH_MESSAGES: Partial<Record<TrackBatchIssueCode, string>> = {
	duplicate_track_id: 'The same track appeared more than once in this batch.',
	invalid_item: 'The enrichment update was rejected as invalid.',
	not_found: 'The track is no longer in your collection.',
	stale_revision:
		'The track changed after review. Review it again before applying.'
}

function failedBatchResult(
	id: string,
	status: 'stale' | 'not_found' | 'invalid',
	code: TrackBatchIssueCode
): TrackBatchUpdateResult {
	const message = TRACK_BATCH_MESSAGES[code] ?? 'The update was not applied.'
	return {
		id,
		status,
		success: false,
		track: null,
		issue: { code, message },
		error: message,
		operation: null
	}
}

function createTracksRepository(
	state: BrowserLibraryRepositoryState
): TracksRepository {
	const { workspaceId, dependencies } = state

	return {
		list(context) {
			return state.read(
				context,
				[BROWSER_LIBRARY_STORES.tracks],
				async (transaction) =>
					sortCreatedAtDescIdDesc(
						(
							await workspaceRows(
								transaction,
								BROWSER_LIBRARY_STORES.tracks,
								workspaceId
							)
						).map((row) =>
							withoutWorkspaceId(decodeBrowserTrackRow(row, workspaceId))
						)
					)
			)
		},

		async create(context, input) {
			if (!state.isCurrentContext(context)) return { status: 'stale' }
			let id: string
			try {
				id = browserLibraryRandomUUID(dependencies)
				domainValue(() =>
					decodeLibraryTrack({
						...input,
						id,
						created_at: browserLibraryTimestamp(dependencies),
						updated_at: browserLibraryTimestamp(dependencies),
						audio_features: input.audio_features ?? null
					})
				)
			} catch (error) {
				if (!state.isCurrentContext(context)) return { status: 'stale' }
				return error instanceof BrowserRepositoryDomainConflictError
					? domainConflict(error)
					: transportFailure(error)
			}
			return state.command(
				context,
				{
					name: 'create-track',
					stores: [
						BROWSER_LIBRARY_STORES.records,
						BROWSER_LIBRARY_STORES.tracks
					]
				},
				async (transaction, writer, _manifest, timestamp) => {
					const record = await requestResult(
						transaction
							.objectStore(BROWSER_LIBRARY_STORES.records)
							.get([workspaceId, input.record_id])
					)
					if (record === undefined) {
						throw new BrowserRepositoryDomainConflictError(
							'precondition-failed'
						)
					}
					decodeBrowserRecordRow(record, workspaceId)
					const track = domainValue(() =>
						decodeLibraryTrack({
							...input,
							id,
							created_at: timestamp,
							updated_at: timestamp,
							audio_features: input.audio_features ?? null
						})
					)
					writer.add(
						transaction.objectStore(BROWSER_LIBRARY_STORES.tracks),
						encodeBrowserTrackRow(workspaceId, track)
					)
					return {
						value: track,
						invalidations: [entityInvalidation('tracks', [track.id])]
					}
				}
			)
		},

		update(context, { id, updates }) {
			return state.command(
				context,
				{
					name: 'update-track',
					stores: [BROWSER_LIBRARY_STORES.tracks]
				},
				async (transaction, writer, _manifest, timestamp) => {
					const store = transaction.objectStore(BROWSER_LIBRARY_STORES.tracks)
					const stored = await requestResult(store.get([workspaceId, id]))
					if (stored === undefined) {
						throw new BrowserRepositoryNotFoundError('track')
					}
					const existing = withoutWorkspaceId(
						decodeBrowserTrackRow(stored, workspaceId)
					)
					const candidate = domainValue(() =>
						decodeLibraryTrack({
							...existing,
							...updates,
							id: existing.id,
							record_id: existing.record_id,
							created_at: existing.created_at,
							updated_at: existing.updated_at
						})
					)
					if (portableEntityEqual(existing, candidate)) {
						return { value: existing, mutated: false }
					}
					const track = decodeLibraryTrack({
						...candidate,
						updated_at: nextBrowserEntityTimestamp(
							existing.updated_at,
							timestamp
						)
					})
					writer.put(store, encodeBrowserTrackRow(workspaceId, track))
					return {
						value: track,
						invalidations: [entityInvalidation('tracks', [id])]
					}
				}
			)
		},

		async updateBatch(context, updates, options) {
			const idCounts = new Map<string, number>()
			for (const update of updates) {
				idCounts.set(update.id, (idCounts.get(update.id) ?? 0) + 1)
			}
			const outcome = await state.command(
				context,
				{
					name: 'update-track-batch',
					stores: [BROWSER_LIBRARY_STORES.tracks]
				},
				async (transaction, writer, _manifest, timestamp) => {
					const store = transaction.objectStore(BROWSER_LIBRARY_STORES.tracks)
					const results: TrackBatchUpdateResult[] = []
					const changedIds: string[] = []
					for (const update of updates) {
						if ((idCounts.get(update.id) ?? 0) > 1) {
							results.push(
								failedBatchResult(update.id, 'invalid', 'duplicate_track_id')
							)
							continue
						}
						const stored = await requestResult(
							store.get([workspaceId, update.id])
						)
						if (stored === undefined) {
							results.push(
								failedBatchResult(update.id, 'not_found', 'not_found')
							)
							continue
						}
						const existing = withoutWorkspaceId(
							decodeBrowserTrackRow(stored, workspaceId)
						)
						const preconditionsPass =
							existing.updated_at === update.expectedUpdatedAt &&
							(!update.preconditions?.bpmMustBeNull || existing.bpm === null) &&
							(!update.preconditions?.keyModeMustBeNull ||
								(existing.key === null && existing.mode === null))
						if (!preconditionsPass) {
							results.push(
								failedBatchResult(update.id, 'stale', 'stale_revision')
							)
							continue
						}
						let track: LibraryTrack
						try {
							const candidate = decodeLibraryTrack({
								...existing,
								...update.updates,
								id: existing.id,
								record_id: existing.record_id,
								created_at: existing.created_at,
								updated_at: existing.updated_at
							})
							track = portableEntityEqual(existing, candidate)
								? existing
								: decodeLibraryTrack({
										...candidate,
										updated_at: nextBrowserEntityTimestamp(
											existing.updated_at,
											timestamp
										)
									})
						} catch {
							results.push(
								failedBatchResult(update.id, 'invalid', 'invalid_item')
							)
							continue
						}
						if (track !== existing) {
							writer.put(store, encodeBrowserTrackRow(workspaceId, track))
							changedIds.push(track.id)
						}
						results.push({
							id: track.id,
							status: 'updated',
							success: true,
							track,
							issue: null,
							error: null,
							operation: null
						})
					}
					const value: TrackBatchUpdateOutcome = {
						results,
						cancelled: false,
						requiresReview: results.some((result) => !result.success)
					}
					return {
						value,
						mutated: changedIds.length > 0,
						invalidations: [entityInvalidation('tracks', changedIds)]
					}
				}
			)
			if (outcome.status === 'success') {
				for (const [index, result] of outcome.value.results.entries()) {
					try {
						options?.onProgress?.(index + 1, updates.length, result)
					} catch {
						// Progress observers cannot change a committed batch result.
					}
				}
			}
			return outcome
		},

		delete(context, { id }) {
			return state.command(
				context,
				{
					name: 'delete-track',
					stores: [BROWSER_LIBRARY_STORES.tracks]
				},
				async (transaction, writer) => {
					const store = transaction.objectStore(BROWSER_LIBRARY_STORES.tracks)
					const stored = await requestResult(store.get([workspaceId, id]))
					if (stored === undefined) {
						throw new BrowserRepositoryNotFoundError('track')
					}
					decodeBrowserTrackRow(stored, workspaceId)
					writer.delete(store, [workspaceId, id])
					return {
						value: { id },
						invalidations: [entityInvalidation('tracks', [id])]
					}
				}
			)
		}
	}
}

function createCratesRepository(
	state: BrowserLibraryRepositoryState
): CratesRepository {
	const { workspaceId, dependencies } = state

	return {
		list(context) {
			return state.read(
				context,
				[BROWSER_LIBRARY_STORES.crates],
				async (transaction) =>
					sortCreatedAtDescIdDesc(
						(
							await workspaceRows(
								transaction,
								BROWSER_LIBRARY_STORES.crates,
								workspaceId
							)
						).map((row) =>
							withoutWorkspaceId(decodeBrowserCrateRow(row, workspaceId))
						)
					)
			)
		},

		async create(context, input) {
			if (!state.isCurrentContext(context)) return { status: 'stale' }
			let id: string
			try {
				id = browserLibraryRandomUUID(dependencies)
				domainValue(() =>
					decodeLibraryCrate({
						...input,
						id,
						records: [],
						created_at: browserLibraryTimestamp(dependencies),
						updated_at: browserLibraryTimestamp(dependencies)
					})
				)
			} catch (error) {
				if (!state.isCurrentContext(context)) return { status: 'stale' }
				return error instanceof BrowserRepositoryDomainConflictError
					? domainConflict(error)
					: transportFailure(error)
			}
			return state.command(
				context,
				{
					name: 'create-crate',
					stores: [BROWSER_LIBRARY_STORES.crates]
				},
				async (transaction, writer, _manifest, timestamp) => {
					const crate = domainValue(() =>
						decodeLibraryCrate({
							...input,
							id,
							records: [],
							created_at: timestamp,
							updated_at: timestamp
						})
					)
					writer.add(
						transaction.objectStore(BROWSER_LIBRARY_STORES.crates),
						encodeBrowserCrateRow(workspaceId, crate)
					)
					return {
						value: crate,
						invalidations: [entityInvalidation('crates', [id])]
					}
				}
			)
		},

		updateMetadata(context, { id, updates }) {
			return state.command(
				context,
				{
					name: 'update-crate-metadata',
					stores: [BROWSER_LIBRARY_STORES.crates]
				},
				async (transaction, writer, _manifest, timestamp) => {
					const store = transaction.objectStore(BROWSER_LIBRARY_STORES.crates)
					const stored = await requestResult(store.get([workspaceId, id]))
					if (stored === undefined) {
						throw new BrowserRepositoryNotFoundError('crate')
					}
					const existing = withoutWorkspaceId(
						decodeBrowserCrateRow(stored, workspaceId)
					)
					const candidate = domainValue(() =>
						decodeLibraryCrate({
							...existing,
							...updates,
							id: existing.id,
							records: existing.records,
							created_at: existing.created_at,
							updated_at: existing.updated_at
						})
					)
					if (portableEntityEqual(existing, candidate)) {
						return { value: existing, mutated: false }
					}
					const crate = decodeLibraryCrate({
						...candidate,
						updated_at: nextBrowserEntityTimestamp(
							existing.updated_at,
							timestamp
						)
					})
					writer.put(store, encodeBrowserCrateRow(workspaceId, crate))
					return {
						value: crate,
						invalidations: [entityInvalidation('crates', [id])]
					}
				}
			)
		},

		delete(context, { id }) {
			return state.command(
				context,
				{
					name: 'delete-crate',
					stores: [
						BROWSER_LIBRARY_STORES.crates,
						BROWSER_LIBRARY_STORES.preferences
					]
				},
				async (transaction, writer, _manifest, timestamp) => {
					const crateStore = transaction.objectStore(
						BROWSER_LIBRARY_STORES.crates
					)
					const preferencesStore = transaction.objectStore(
						BROWSER_LIBRARY_STORES.preferences
					)
					const [storedCrate, storedPreferences] = await Promise.all([
						requestResult(crateStore.get([workspaceId, id])),
						requestResult(preferencesStore.get(workspaceId))
					])
					if (storedCrate === undefined) {
						throw new BrowserRepositoryNotFoundError('crate')
					}
					decodeBrowserCrateRow(storedCrate, workspaceId)
					if (storedPreferences === undefined) {
						throw new BrowserStorageCodecError('/preferences')
					}
					const preferences = decodeBrowserPreferencesRow(
						storedPreferences,
						workspaceId
					).value
					writer.delete(crateStore, [workspaceId, id])
					const invalidations = [entityInvalidation('crates', [id])]
					if (preferences.selected_crate === id) {
						const updatedPreferences = decodeLibraryPreferences({
							...preferences,
							selected_crate: ''
						})
						writer.put(
							preferencesStore,
							encodeBrowserPreferencesRow(workspaceId, updatedPreferences)
						)
						invalidations.push(entityInvalidation('preferences', [workspaceId]))
					}
					void timestamp
					return { value: { id }, invalidations }
				}
			)
		},

		addRecord(context, { crateId, recordId }) {
			return mutateCrateMembership(state, context, crateId, recordId, 'add')
		},

		removeRecord(context, { crateId, recordId }) {
			return mutateCrateMembership(state, context, crateId, recordId, 'remove')
		}
	}
}

function mutateCrateMembership(
	state: BrowserLibraryRepositoryState,
	context: WorkspaceOperationContext,
	crateId: string,
	recordId: string,
	operation: 'add' | 'remove'
) {
	const { workspaceId } = state
	return state.command(
		context,
		{
			name: `${operation}-record-${operation === 'add' ? 'to' : 'from'}-crate`,
			stores: [BROWSER_LIBRARY_STORES.crates, BROWSER_LIBRARY_STORES.records]
		},
		async (transaction, writer, _manifest, timestamp) => {
			const crateStore = transaction.objectStore(BROWSER_LIBRARY_STORES.crates)
			const [storedCrate, storedRecord] = await Promise.all([
				requestResult(crateStore.get([workspaceId, crateId])),
				requestResult(
					transaction
						.objectStore(BROWSER_LIBRARY_STORES.records)
						.get([workspaceId, recordId])
				)
			])
			if (storedCrate === undefined) {
				throw new BrowserRepositoryNotFoundError('crate')
			}
			if (storedRecord === undefined) {
				throw new BrowserRepositoryDomainConflictError('precondition-failed')
			}
			decodeBrowserRecordRow(storedRecord, workspaceId)
			const existing = withoutWorkspaceId(
				decodeBrowserCrateRow(storedCrate, workspaceId)
			)
			const alreadyContains = existing.records.includes(recordId)
			if (
				(operation === 'add' && alreadyContains) ||
				(operation === 'remove' && !alreadyContains)
			) {
				return { value: existing, mutated: false }
			}
			const records =
				operation === 'add'
					? [...existing.records, recordId]
					: existing.records.filter((id) => id !== recordId)
			const crate = decodeLibraryCrate({
				...existing,
				records,
				updated_at: nextBrowserEntityTimestamp(existing.updated_at, timestamp)
			})
			writer.put(crateStore, encodeBrowserCrateRow(workspaceId, crate))
			return {
				value: crate,
				invalidations: [entityInvalidation('crates', [crateId])]
			}
		}
	)
}

function createSavedSetsRepository(
	state: BrowserLibraryRepositoryState
): SavedSetsRepository {
	const { workspaceId, dependencies } = state

	return {
		list(context) {
			return state.read(
				context,
				[BROWSER_LIBRARY_STORES.savedSets],
				async (transaction) =>
					sortCreatedAtDescIdDesc(
						(
							await workspaceRows(
								transaction,
								BROWSER_LIBRARY_STORES.savedSets,
								workspaceId
							)
						).map((row) =>
							withoutWorkspaceId(decodeBrowserSavedSetRow(row, workspaceId))
						)
					)
			)
		},

		async save(context, input) {
			if (!state.isCurrentContext(context)) return { status: 'stale' }
			let setId = input.setId
			if (setId === null) {
				try {
					setId = browserLibraryRandomUUID(dependencies)
				} catch (error) {
					if (!state.isCurrentContext(context)) return { status: 'stale' }
					return transportFailure(error)
				}
			}
			return state.command(
				context,
				{
					name: 'save-set',
					stores: [BROWSER_LIBRARY_STORES.savedSets]
				},
				async (transaction, writer, _manifest, timestamp) => {
					const store = transaction.objectStore(
						BROWSER_LIBRARY_STORES.savedSets
					)
					const stored = await requestResult(store.get([workspaceId, setId!]))
					if (input.setId !== null && stored === undefined) {
						throw new BrowserRepositoryNotFoundError('saved-set')
					}
					const existing =
						stored === undefined
							? null
							: withoutWorkspaceId(
									decodeBrowserSavedSetRow(stored, workspaceId)
								)
					const candidate = domainValue(() =>
						decodeLibrarySavedSet({
							id: setId!,
							name:
								input.kind === 'manual' ? input.name : (existing?.name ?? null),
							played_tracks: input.playedTracks.map((entry) => ({
								...entry
							})),
							created_at: existing?.created_at ?? timestamp,
							updated_at: existing?.updated_at ?? timestamp
						})
					)
					if (existing !== null && portableEntityEqual(existing, candidate)) {
						return { value: existing, mutated: false }
					}
					const savedSet = decodeLibrarySavedSet({
						...candidate,
						updated_at:
							existing === null
								? timestamp
								: nextBrowserEntityTimestamp(existing.updated_at, timestamp)
					})
					writer.put(store, encodeBrowserSavedSetRow(workspaceId, savedSet))
					return {
						value: savedSet,
						invalidations: [entityInvalidation('saved-sets', [setId!])]
					}
				}
			)
		},

		delete(context, { id }) {
			return state.command(
				context,
				{
					name: 'delete-set',
					stores: [BROWSER_LIBRARY_STORES.savedSets]
				},
				async (transaction, writer) => {
					const store = transaction.objectStore(
						BROWSER_LIBRARY_STORES.savedSets
					)
					const stored = await requestResult(store.get([workspaceId, id]))
					if (stored === undefined) {
						throw new BrowserRepositoryNotFoundError('saved-set')
					}
					decodeBrowserSavedSetRow(stored, workspaceId)
					writer.delete(store, [workspaceId, id])
					return {
						value: { id },
						invalidations: [entityInvalidation('saved-sets', [id])]
					}
				}
			)
		}
	}
}

function createPreferencesRepository(
	state: BrowserLibraryRepositoryState
): PreferencesRepository {
	const { workspaceId } = state

	return {
		read(context) {
			return state.read(
				context,
				[BROWSER_LIBRARY_STORES.preferences],
				async (transaction) => {
					const stored = await requestResult(
						transaction
							.objectStore(BROWSER_LIBRARY_STORES.preferences)
							.get(workspaceId)
					)
					if (stored === undefined) {
						throw new BrowserStorageCodecError('/preferences')
					}
					return decodeBrowserPreferencesRow(stored, workspaceId).value
				}
			)
		},

		update(context, patch) {
			return state.command(
				context,
				{
					name: 'update-preferences',
					stores: [
						BROWSER_LIBRARY_STORES.preferences,
						BROWSER_LIBRARY_STORES.crates
					]
				},
				async (transaction, writer) => {
					const store = transaction.objectStore(
						BROWSER_LIBRARY_STORES.preferences
					)
					const stored = await requestResult(store.get(workspaceId))
					if (stored === undefined) {
						throw new BrowserStorageCodecError('/preferences')
					}
					const existing = decodeBrowserPreferencesRow(
						stored,
						workspaceId
					).value
					const preferences = domainValue(() =>
						decodeLibraryPreferences({ ...existing, ...patch })
					)
					if (valuesEqual(existing, preferences)) {
						return { value: existing, mutated: false }
					}
					if (preferences.selected_crate !== '') {
						const selectedCrate = await requestResult(
							transaction
								.objectStore(BROWSER_LIBRARY_STORES.crates)
								.get([workspaceId, preferences.selected_crate])
						)
						if (selectedCrate === undefined) {
							throw new BrowserRepositoryDomainConflictError(
								'precondition-failed'
							)
						}
						decodeBrowserCrateRow(selectedCrate, workspaceId)
					}
					writer.put(
						store,
						encodeBrowserPreferencesRow(workspaceId, preferences)
					)
					return {
						value: preferences,
						invalidations: [entityInvalidation('preferences', [workspaceId])]
					}
				}
			)
		}
	}
}

class BrowserCoverResolver implements CoverResolver {
	readonly #urls = new Map<string, string>()
	readonly #pending = new Map<string, Promise<string | null>>()
	#generation = 0
	readonly #unsubscribe: () => void

	constructor(private readonly state: BrowserLibraryRepositoryState) {
		this.#unsubscribe = state.subscribe((change) => {
			if (
				change.workspaceId !== state.workspaceId ||
				change.repositoryId !== state.repositoryId
			) {
				return
			}
			if (
				change.type === 'delete' ||
				change.type === 'reset' ||
				change.invalidations.some(
					(invalidation) =>
						invalidation.entity === 'covers' ||
						invalidation.entity === 'records'
				)
			) {
				this.reset()
			}
		})
	}

	#isCurrent(context: WorkspaceOperationContext) {
		return this.state.isCurrentContext(context)
	}

	async resolve(
		context: WorkspaceOperationContext,
		reference: CoverReference
	): Promise<string | null> {
		if (!this.#isCurrent(context)) return null
		if (reference.kind === 'none') return null
		if (reference.kind === 'external' || reference.kind === 'cloud') {
			return reference.kind === 'external'
				? reference.url
				: reference.fallbackUrl
		}
		const cached = this.#urls.get(reference.assetId)
		if (cached) return cached
		const pendingKey = `${reference.assetId}\u0000${context.activationGeneration}`
		const pending = this.#pending.get(pendingKey)
		if (pending) {
			const url = await pending
			return this.#isCurrent(context) ? (url ?? reference.fallbackUrl) : null
		}

		const load = this.#loadManagedUrl(context, reference.assetId)
		this.#pending.set(pendingKey, load)
		try {
			const url = await load
			return this.#isCurrent(context) ? (url ?? reference.fallbackUrl) : null
		} finally {
			if (this.#pending.get(pendingKey) === load) {
				this.#pending.delete(pendingKey)
			}
		}
	}

	async #loadManagedUrl(
		context: WorkspaceOperationContext,
		assetId: string
	): Promise<string | null> {
		const generation = this.#generation
		let blob: Blob | null
		try {
			blob = await this.state.readManagedCover(assetId)
		} catch (error) {
			if (error instanceof BrowserStorageCodecError) throw error
			return null
		}
		if (!blob || generation !== this.#generation || !this.#isCurrent(context)) {
			return null
		}

		const createObjectURL =
			this.state.dependencies.createObjectURL ??
			globalThis.URL?.createObjectURL?.bind(globalThis.URL)
		if (!createObjectURL) return null
		try {
			const url = createObjectURL(blob)
			if (generation !== this.#generation || !this.#isCurrent(context)) {
				this.#revoke(url)
				return null
			}
			this.#urls.set(assetId, url)
			return url
		} catch {
			return null
		}
	}

	#revoke(url: string) {
		try {
			const revoke =
				this.state.dependencies.revokeObjectURL ??
				globalThis.URL?.revokeObjectURL?.bind(globalThis.URL)
			revoke?.(url)
		} catch {
			// Revocation is best effort; the cache still forgets the URL.
		}
	}

	reset() {
		this.#generation += 1
		this.#pending.clear()
		for (const url of this.#urls.values()) this.#revoke(url)
		this.#urls.clear()
	}

	close() {
		this.#unsubscribe()
		this.reset()
	}
}

async function deleteWorkspaceRows(
	transaction: IDBTransaction,
	writer: Parameters<
		Parameters<BrowserLibraryRepositoryState['command']>[2]
	>[1],
	storeName: BrowserLibraryStoreName,
	workspaceId: string
) {
	const store = transaction.objectStore(storeName)
	const keys = await requestResult(
		store.index(BROWSER_LIBRARY_WORKSPACE_INDEX).getAllKeys(workspaceId)
	)
	for (const key of keys) writer.delete(store, key)
}

class BrowserLibraryRepositoryImpl implements BrowserLibraryRepository {
	readonly id: string
	readonly workspaceId: string
	readonly records: RecordsRepository
	readonly tracks: TracksRepository
	readonly crates: CratesRepository
	readonly savedSets: SavedSetsRepository
	readonly preferences: PreferencesRepository
	readonly covers: BrowserCoverResolver

	constructor(private readonly state: BrowserLibraryRepositoryState) {
		this.id = state.repositoryId
		this.workspaceId = state.workspaceId
		this.records = createRecordsRepository(state)
		this.tracks = createTracksRepository(state)
		this.crates = createCratesRepository(state)
		this.savedSets = createSavedSetsRepository(state)
		this.preferences = createPreferencesRepository(state)
		this.covers = new BrowserCoverResolver(state)
	}

	async readObservedLibraryView(context: WorkspaceOperationContext) {
		const outcome = await this.state.readSnapshot(context)
		if (outcome.status !== 'success') return outcome
		return {
			...outcome,
			value: {
				...outcome.value.dataset,
				consistency: 'non-atomic-observation' as const
			}
		}
	}

	readManifest() {
		return this.state.readManifest()
	}

	readLibrarySnapshot(context: WorkspaceOperationContext) {
		return this.state.readSnapshot(context)
	}

	async replaceSnapshot(
		context: WorkspaceOperationContext,
		input: ReplaceBrowserSnapshotInput
	): Promise<RepositoryOutcome<LibraryDataset>> {
		if (!this.state.isCurrentContext(context)) return { status: 'stale' }
		let replacement: ReturnType<typeof buildReplacementManagedCovers>
		try {
			replacement = buildReplacementManagedCovers(
				this.workspaceId,
				input,
				browserLibraryTimestamp(this.state.dependencies)
			)
		} catch (error) {
			if (!this.state.isCurrentContext(context)) return { status: 'stale' }
			return domainConflict(error)
		}

		return this.state.command<LibraryDataset>(
			context,
			{
				name: 'replace-library-snapshot',
				stores: [
					BROWSER_LIBRARY_STORES.preferences,
					BROWSER_LIBRARY_STORES.records,
					BROWSER_LIBRARY_STORES.tracks,
					BROWSER_LIBRARY_STORES.crates,
					BROWSER_LIBRARY_STORES.savedSets,
					BROWSER_LIBRARY_STORES.covers
				],
				eventType: 'reset',
				wide: true
			},
			async (transaction, writer, _manifest, timestamp) => {
				await Promise.all(
					[
						BROWSER_LIBRARY_STORES.records,
						BROWSER_LIBRARY_STORES.tracks,
						BROWSER_LIBRARY_STORES.crates,
						BROWSER_LIBRARY_STORES.savedSets,
						BROWSER_LIBRARY_STORES.covers
					].map((storeName) =>
						deleteWorkspaceRows(
							transaction,
							writer,
							storeName,
							this.workspaceId
						)
					)
				)
				const preferencesStore = transaction.objectStore(
					BROWSER_LIBRARY_STORES.preferences
				)
				writer.put(
					preferencesStore,
					encodeBrowserPreferencesRow(
						this.workspaceId,
						replacement.dataset.preferences
					)
				)

				const recordStore = transaction.objectStore(
					BROWSER_LIBRARY_STORES.records
				)
				for (const record of replacement.dataset.records) {
					writer.put(
						recordStore,
						encodeBrowserRecordRow(this.workspaceId, record)
					)
				}
				const trackStore = transaction.objectStore(
					BROWSER_LIBRARY_STORES.tracks
				)
				for (const track of replacement.dataset.tracks) {
					writer.put(trackStore, encodeBrowserTrackRow(this.workspaceId, track))
				}
				const crateStore = transaction.objectStore(
					BROWSER_LIBRARY_STORES.crates
				)
				for (const crate of replacement.dataset.crates) {
					writer.put(crateStore, encodeBrowserCrateRow(this.workspaceId, crate))
				}
				const savedSetStore = transaction.objectStore(
					BROWSER_LIBRARY_STORES.savedSets
				)
				for (const savedSet of replacement.dataset.savedSets) {
					writer.put(
						savedSetStore,
						encodeBrowserSavedSetRow(this.workspaceId, savedSet)
					)
				}
				const coverStore = transaction.objectStore(
					BROWSER_LIBRARY_STORES.covers
				)
				for (const cover of replacement.covers) {
					writer.put(
						coverStore,
						encodeBrowserManagedCover({
							...cover,
							createdAt: timestamp,
							updatedAt: timestamp
						})
					)
				}

				return {
					value: replacement.dataset,
					coverCompleteness: 'complete',
					invalidations: [
						entityInvalidation(
							'records',
							replacement.dataset.records.map((record) => record.id)
						),
						entityInvalidation(
							'tracks',
							replacement.dataset.tracks.map((track) => track.id)
						),
						entityInvalidation(
							'crates',
							replacement.dataset.crates.map((crate) => crate.id)
						),
						entityInvalidation(
							'saved-sets',
							replacement.dataset.savedSets.map((savedSet) => savedSet.id)
						),
						entityInvalidation('preferences', [this.workspaceId]),
						entityInvalidation(
							'covers',
							replacement.covers.map((cover) => cover.assetId)
						)
					]
				}
			}
		)
	}

	async recoverStorage() {
		const outcome = await this.state.recoverStorage()
		if (outcome.status === 'recovered') this.covers.reset()
		return outcome
	}

	subscribe(listener: Parameters<BrowserLibraryRepository['subscribe']>[0]) {
		return this.state.subscribe(listener)
	}

	close() {
		this.covers.close()
		this.state.close()
	}
}

export async function openBrowserLibraryRepository(
	options: OpenBrowserLibraryRepositoryOptions
): Promise<BrowserLibraryRepository> {
	if (!options.workspaceId.trim() || !options.repositoryId.trim()) {
		throw new BrowserStorageError(
			'corrupt',
			'A Local library workspace and repository ID are required.'
		)
	}
	const dependencies: BrowserLibraryDependencies = options.dependencies ?? {}
	const health = await probeBrowserLibraryStorage(dependencies)
	if (health.code !== 'healthy') {
		throw new BrowserStorageError(health.code, health.message)
	}

	const database = await openBrowserLibraryDatabase(dependencies)
	try {
		const initialSnapshot = await readBrowserLibrarySnapshot(
			database,
			options.workspaceId,
			options.repositoryId
		)
		const state = new BrowserLibraryRepositoryState(
			database,
			{ ...options, dependencies },
			initialSnapshot
		)
		return new BrowserLibraryRepositoryImpl(state)
	} catch (error) {
		database.close()
		throw normalizeBrowserRepositoryError(error)
	}
}
