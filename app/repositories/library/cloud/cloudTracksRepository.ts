import { sortCreatedAtDescIdDesc } from '~/utils/supabaseOrdering'
import { fetchAllSupabasePages } from '~/utils/supabasePagination'
import type { DecodeIssue } from '~/utils/supabaseRows'
import {
	TRACK_ENRICHMENT_BATCH_SIZE,
	createTrackEnrichmentBatchRequest,
	decodeTrackEnrichmentBatchResponse
} from '~/utils/trackEnrichmentBatch'
import type { TrackAudioFeatures } from '~~/shared/types/audioFeatures'
import type { BeatportTrackData } from '~~/shared/types/beatport'
import type { Database, Json } from '~~/shared/types/database'
import type { DiscogsArtistDb } from '~~/shared/types/discogs'
import type {
	LibraryTrack,
	LibraryTrackUpdateInput,
	TrackCreateInput
} from '~~/shared/types/library'
import type {
	TrackBatchIssue,
	TrackBatchIssueCode,
	TrackBatchUpdate,
	TrackBatchUpdateOutcome,
	TrackBatchUpdateResult
} from '~~/shared/types/trackUpdates'
import { decodeLibraryTrackRow } from '../codecs/supabaseLibraryCodecs'
import type { TracksRepository } from '../contracts'
import type { CloudRepositoryState } from './cloudRepositoryState'

const TRACK_BATCH_ISSUE_MESSAGES: Record<TrackBatchIssueCode, string> = {
	account_replaced: 'Not attempted because the signed-in account changed.',
	duplicate_track_id: 'The same track appeared more than once in this batch.',
	invalid_audio_features: 'The enrichment evidence was rejected as invalid.',
	invalid_item: 'The enrichment update was rejected as invalid.',
	invalid_response: 'The saved track response could not be verified.',
	not_found: 'The track is no longer in your collection.',
	prior_chunk_unknown:
		'Not attempted because an earlier batch could not be confirmed.',
	receipt_capacity:
		'Batch retry capacity is temporarily full. Review again after the 24-hour receipt window.',
	request_unknown:
		'The update could not be confirmed. Review the refreshed track before trying again.',
	stale_revision:
		'The track changed after review. Review it again before applying.',
	update_rejected: 'The enrichment update was rejected.'
}

function serializeTrackArtists(
	artists: DiscogsArtistDb[]
): Database['public']['Tables']['tracks']['Insert']['artists'] {
	return artists.map((artist) => ({
		discogs_id: artist.discogs_id,
		name: artist.name,
		role: artist.role
	}))
}

function serializeBeatportData(
	beatportData: LibraryTrack['beatport_data']
): Database['public']['Tables']['tracks']['Insert']['beatport_data'] {
	if (!beatportData) return null
	if ('notFound' in beatportData && beatportData.notFound) {
		return {
			searched: beatportData.searched,
			notFound: beatportData.notFound,
			searchedAt: beatportData.searchedAt
		}
	}
	const trackData = beatportData as BeatportTrackData
	return {
		accessed: trackData.accessed,
		url: trackData.url,
		genre: trackData.genre,
		bpm: trackData.bpm,
		key: trackData.key,
		img: trackData.img
	}
}

function serializeAudioFeatures(
	audioFeatures: TrackAudioFeatures | null | undefined
): Json | null | undefined {
	return audioFeatures === undefined
		? undefined
		: (audioFeatures as unknown as Json | null)
}

function toTrackInsertPayload(
	track: TrackCreateInput,
	userId: string
): Database['public']['Tables']['tracks']['Insert'] {
	return {
		...track,
		user_id: userId,
		artists: serializeTrackArtists(track.artists),
		extraartists: serializeTrackArtists(track.extraartists),
		genres: [...track.genres],
		beatport_data: serializeBeatportData(track.beatport_data),
		audio_features: serializeAudioFeatures(track.audio_features)
	}
}

function toTrackUpdatePayload(
	updates: LibraryTrackUpdateInput
): Database['public']['Tables']['tracks']['Update'] {
	return {
		...updates,
		artists: updates.artists
			? serializeTrackArtists(updates.artists)
			: undefined,
		extraartists: updates.extraartists
			? serializeTrackArtists(updates.extraartists)
			: undefined,
		genres: updates.genres ? [...updates.genres] : undefined,
		beatport_data:
			updates.beatport_data === undefined
				? undefined
				: serializeBeatportData(updates.beatport_data),
		audio_features: serializeAudioFeatures(updates.audio_features)
	}
}

function createTrackBatchIssue(code: TrackBatchIssueCode): TrackBatchIssue {
	return { code, message: TRACK_BATCH_ISSUE_MESSAGES[code] }
}

function createFailedTrackBatchResult(
	id: string,
	status: 'stale' | 'not_found' | 'invalid' | 'unknown' | 'unattempted',
	code: TrackBatchIssueCode,
	operation: TrackBatchUpdateResult['operation']
): TrackBatchUpdateResult {
	const issue = createTrackBatchIssue(code)
	return {
		id,
		status,
		success: false,
		track: null,
		issue,
		error: issue.message,
		operation
	}
}

function isCapacityError(error: unknown): boolean {
	return Boolean(
		error &&
		typeof error === 'object' &&
		'code' in error &&
		error.code === '54000'
	)
}

export function createCloudTracksRepository(
	state: CloudRepositoryState
): TracksRepository {
	const { dependencies } = state

	return {
		async list(context) {
			const captured = await state.capture(context)
			if (!state.isLease(captured)) return captured
			try {
				const rows = await fetchAllSupabasePages(async (cursor, pageSize) => {
					let query = dependencies.supabase
						.from('tracks')
						.select('*')
						.eq('user_id', captured.userId)
						.order('id', { ascending: false })
					if (cursor !== null) query = query.lt('id', cursor)
					return await query.limit(pageSize)
				})
				if (!(await state.isCurrent(captured))) return { status: 'stale' }
				if (rows.some((row) => row.user_id !== captured.userId)) {
					return { status: 'conflict', reason: 'integrity' }
				}
				const decoded = rows.map(decodeLibraryTrackRow)
				return state.complete(
					captured,
					sortCreatedAtDescIdDesc(decoded.map((item) => item.row)),
					{ issues: decoded.flatMap((item) => item.issues) }
				)
			} catch (error) {
				return (await state.isCurrent(captured))
					? state.transportFailure(error)
					: { status: 'stale' }
			}
		},
		async create(context, input) {
			const captured = await state.capture(context)
			if (!state.isLease(captured)) return captured
			try {
				const { data, error } = await dependencies.supabase
					.from('tracks')
					.insert(toTrackInsertPayload(input, captured.userId))
					.select()
					.single()
				if (!(await state.isCurrent(captured))) return { status: 'stale' }
				if (error) return state.transportFailure(error)
				if (!data || data.user_id !== captured.userId) {
					return { status: 'conflict', reason: 'integrity' }
				}
				const decoded = decodeLibraryTrackRow(data)
				return state.complete(captured, decoded.row, {
					issues: decoded.issues,
					mutated: true
				})
			} catch (error) {
				return (await state.isCurrent(captured))
					? state.transportFailure(error)
					: { status: 'stale' }
			}
		},

		async update(context, { id, updates }) {
			const captured = await state.capture(context)
			if (!state.isLease(captured)) return captured
			try {
				const { data, error } = await dependencies.supabase
					.from('tracks')
					.update(toTrackUpdatePayload(updates))
					.eq('id', id)
					.eq('user_id', captured.userId)
					.select()
					.single()
				if (!(await state.isCurrent(captured))) return { status: 'stale' }
				if (error) return state.transportFailure(error)
				if (!data || data.id !== id || data.user_id !== captured.userId) {
					return { status: 'conflict', reason: 'integrity' }
				}
				const decoded = decodeLibraryTrackRow(data)
				return state.complete(captured, decoded.row, {
					issues: decoded.issues,
					mutated: true
				})
			} catch (error) {
				return (await state.isCurrent(captured))
					? state.transportFailure(error)
					: { status: 'stale' }
			}
		},

		async updateBatch(context, updates, options) {
			const captured = await state.capture(context)
			if (!state.isLease(captured)) return captured
			const orderedResults = new Array<TrackBatchUpdateResult | undefined>(
				updates.length
			)
			let cancelled = false
			let stoppedByCapacity = false
			let stoppedByUnknown = false
			const decodeIssues: DecodeIssue[] = []
			let progressCount = 0
			let nextProgressOrdinal = 0

			const publishOrderedProgress = () => {
				while (nextProgressOrdinal < orderedResults.length) {
					const result = orderedResults[nextProgressOrdinal]
					if (!result) return
					nextProgressOrdinal += 1
					if (result.status === 'unattempted') continue
					progressCount += 1
					options?.onProgress?.(progressCount, updates.length, result)
				}
			}

			const idCounts = new Map<string, number>()
			for (const update of updates) {
				idCounts.set(update.id, (idCounts.get(update.id) ?? 0) + 1)
			}
			const actionable = updates
				.map((update, ordinal) => ({ update, ordinal }))
				.filter(({ update, ordinal }) => {
					if ((idCounts.get(update.id) ?? 0) === 1) return true
					orderedResults[ordinal] = createFailedTrackBatchResult(
						update.id,
						'invalid',
						'duplicate_track_id',
						null
					)
					return false
				})
			publishOrderedProgress()

			try {
				for (
					let chunkStart = 0;
					chunkStart < actionable.length;
					chunkStart += TRACK_ENRICHMENT_BATCH_SIZE
				) {
					if (!(await state.isCurrent(captured))) {
						cancelled = true
						break
					}
					const entries = actionable.slice(
						chunkStart,
						chunkStart + TRACK_ENRICHMENT_BATCH_SIZE
					)
					const request = await createTrackEnrichmentBatchRequest(entries)
					let response: ReturnType<
						typeof decodeTrackEnrichmentBatchResponse
					> | null = null
					let lastError: unknown = new Error(
						'Track enrichment batch returned no response.'
					)

					for (let attempt = 0; attempt < 2 && !response; attempt += 1) {
						try {
							const result = await dependencies.supabase.rpc(
								'persist_track_enrichment_batch',
								{
									p_operation_id: request.operationId,
									p_operation_hash: request.operationHash,
									p_items: request.items as unknown as Json
								}
							)
							if (!(await state.isCurrent(captured))) {
								cancelled = true
								break
							}
							if (result.error) {
								if (isCapacityError(result.error)) stoppedByCapacity = true
								lastError = result.error
								if (stoppedByCapacity) break
								continue
							}
							response = decodeTrackEnrichmentBatchResponse(
								result.data,
								request
							)
						} catch (error) {
							if (isCapacityError(error)) stoppedByCapacity = true
							lastError = error
							if (stoppedByCapacity) break
						}
					}
					if (cancelled) break

					if (!response) {
						const issueCode = stoppedByCapacity
							? 'receipt_capacity'
							: 'request_unknown'
						const resultStatus = stoppedByCapacity ? 'invalid' : 'unknown'
						for (const [index, entry] of entries.entries()) {
							const requestItem = request.items[index]!
							orderedResults[entry.ordinal] = createFailedTrackBatchResult(
								entry.update.id,
								resultStatus,
								issueCode,
								{
									operationId: request.operationId,
									ordinal: requestItem.ordinal,
									requestHash: requestItem.request_hash
								}
							)
						}
						void lastError
						stoppedByUnknown = !stoppedByCapacity
						publishOrderedProgress()
						break
					}

					for (const [index, serverResult] of response.entries()) {
						const entry = entries[index]!
						if (serverResult.status === 'updated') {
							try {
								const rawTrack =
									serverResult.track as Database['public']['Tables']['tracks']['Row']
								if (
									rawTrack.id !== entry.update.id ||
									rawTrack.user_id !== captured.userId
								) {
									throw new Error('Track batch response identity mismatch')
								}
								const decoded = decodeLibraryTrackRow(rawTrack)
								decodeIssues.push(...decoded.issues)
								orderedResults[entry.ordinal] = {
									id: entry.update.id,
									status: 'updated',
									success: true,
									track: decoded.row,
									issue: null,
									error: null,
									operation: serverResult.identity
								}
							} catch {
								orderedResults[entry.ordinal] = createFailedTrackBatchResult(
									entry.update.id,
									'invalid',
									'invalid_response',
									serverResult.identity
								)
							}
						} else {
							orderedResults[entry.ordinal] = createFailedTrackBatchResult(
								entry.update.id,
								serverResult.status,
								serverResult.issueCode!,
								serverResult.identity
							)
						}
					}
					publishOrderedProgress()
				}

				const unattemptedCode: TrackBatchIssueCode = cancelled
					? 'account_replaced'
					: stoppedByCapacity
						? 'receipt_capacity'
						: 'prior_chunk_unknown'
				for (const [ordinal, result] of orderedResults.entries()) {
					if (result) continue
					orderedResults[ordinal] = createFailedTrackBatchResult(
						updates[ordinal]!.id,
						'unattempted',
						unattemptedCode,
						null
					)
				}
				publishOrderedProgress()

				if (!(await state.isCurrent(captured))) return { status: 'stale' }
				const results = orderedResults as TrackBatchUpdateResult[]
				const outcome: TrackBatchUpdateOutcome = {
					results,
					cancelled,
					requiresReview:
						stoppedByUnknown ||
						results.some((result) =>
							['stale', 'not_found', 'invalid', 'unknown'].includes(
								result.status
							)
						)
				}
				return state.complete(captured, outcome, {
					issues: decodeIssues,
					mutated: results.some((result) => result.status === 'updated')
				})
			} catch (error) {
				return (await state.isCurrent(captured))
					? state.transportFailure(error)
					: { status: 'stale' }
			}
		},

		async delete(context, { id }) {
			const captured = await state.capture(context)
			if (!state.isLease(captured)) return captured
			try {
				const { data, error } = await dependencies.supabase
					.from('tracks')
					.delete()
					.eq('id', id)
					.eq('user_id', captured.userId)
					.select('id, user_id')
					.single()
				if (!(await state.isCurrent(captured))) return { status: 'stale' }
				if (error) return state.transportFailure(error)
				if (!data || data.id !== id || data.user_id !== captured.userId) {
					return { status: 'conflict', reason: 'integrity' }
				}
				return state.complete(captured, { id }, { mutated: true })
			} catch (error) {
				return (await state.isCurrent(captured))
					? state.transportFailure(error)
					: { status: 'stale' }
			}
		}
	}
}
