import { validateImportResult } from '~/utils/discogs-validation'
import {
	type RecordCoverAccountContext,
	createRecordCoverCoordinator
} from '~/utils/recordCoverCoordinator'
import { sortCreatedAtDescIdDesc } from '~/utils/supabaseOrdering'
import { fetchAllSupabasePages } from '~/utils/supabasePagination'
import type { Database, Json } from '~~/shared/types/database'
import type { DiscogsArtistDb, DiscogsLabelDb } from '~~/shared/types/discogs'
import type {
	LibraryRecord,
	ManualRecordWithTracksInput,
	RecordUpdateInput
} from '~~/shared/types/library'
import { decodeLibraryRecordRow } from '../codecs/supabaseLibraryCodecs'
import type { RecordsRepository, RepositoryOutcome } from '../contracts'
import type {
	CloudOperationLease,
	CloudRepositoryState
} from './cloudRepositoryState'

type AdapterCoverContext = RecordCoverAccountContext & {
	workspaceContext: CloudOperationLease['context']
}

function buildArtistPayload(name?: string | null): DiscogsArtistDb[] {
	const trimmedName = name?.trim()
	return trimmedName ? [{ name: trimmedName, role: null }] : []
}

function buildLabelPayload(
	name?: string | null,
	catno?: string | null
): DiscogsLabelDb[] {
	const trimmedName = name?.trim()
	if (!trimmedName) return []
	const trimmedCatno = catno?.trim()
	return [{ name: trimmedName, catno: trimmedCatno || undefined }]
}

function serializeRecordUpdates(updates: RecordUpdateInput) {
	return {
		...updates,
		...(updates.artists ? { artists: updates.artists as Json } : {}),
		...(updates.labels ? { labels: updates.labels as Json } : {})
	}
}

function isExpectedRecordRemoval(
	value: unknown,
	expectedRecordId: string
): boolean {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false
	const result = value as Record<string, unknown>
	return result.success === true && result.record_id === expectedRecordId
}

export function createCloudRecordsRepository(
	state: CloudRepositoryState
): RecordsRepository & { reset(): void } {
	const { dependencies } = state
	let coverGeneration = 0
	const coverCoordinator = createRecordCoverCoordinator<LibraryRecord>({
		supabase: dependencies.supabase,
		resolveAuthenticatedUserId:
			dependencies.identity.resolveAuthenticatedUserId,
		isCurrentAccountContext(context) {
			const adapterContext = context as AdapterCoverContext
			return (
				adapterContext.generation === coverGeneration &&
				dependencies.isCurrentContext(adapterContext.workspaceContext)
			)
		},
		getSupabaseConfig: dependencies.getSupabaseConfig,
		onCleanupFailure() {}
	})

	async function updateRaw(
		lease: CloudOperationLease,
		id: string,
		updates: RecordUpdateInput & { cover_storage_path?: string | null },
		onResponseFailure?: () => Promise<void>
	): Promise<
		| {
				record: LibraryRecord
				issues: ReturnType<typeof decodeLibraryRecordRow>['issues']
		  }
		| RepositoryOutcome<never>
	> {
		const { cover_storage_path, ...domainUpdates } = updates
		const payload = {
			...serializeRecordUpdates(domainUpdates),
			...(cover_storage_path !== undefined ? { cover_storage_path } : {})
		}
		let response: {
			data: Database['public']['Tables']['records']['Row'] | null
			error: unknown
		}
		try {
			response = await dependencies.supabase
				.from('records')
				.update(payload)
				.eq('id', id)
				.eq('user_id', lease.userId)
				.select()
				.single()
		} catch (error) {
			await onResponseFailure?.()
			throw error
		}
		const { data, error } = response

		if (!(await state.isCurrent(lease))) return { status: 'stale' }
		if (error) {
			await onResponseFailure?.()
			return state.transportFailure(error)
		}
		if (!data || data.user_id !== lease.userId || data.id !== id) {
			return { status: 'conflict', reason: 'integrity' }
		}
		const decoded = decodeLibraryRecordRow(data)
		return { record: decoded.row, issues: decoded.issues }
	}

	const repository: RecordsRepository & { reset(): void } = {
		async list(context) {
			const captured = await state.capture(context)
			if (!state.isLease(captured)) return captured
			try {
				const rows = await fetchAllSupabasePages(async (cursor, pageSize) => {
					let query = dependencies.supabase
						.from('records')
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
				const decoded = rows.map(decodeLibraryRecordRow)
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
		async createWithTracks(context, input: ManualRecordWithTracksInput) {
			const captured = await state.capture(context)
			if (!state.isLease(captured)) return captured

			const recordArtists = buildArtistPayload(input.artistName)
			const defaultGenres = input.defaultGenres ?? []
			const recordPayload = {
				user_id: captured.userId,
				discogs_id: null,
				discogs_release_url: null,
				title: input.title.trim(),
				artists: recordArtists,
				labels: buildLabelPayload(input.labelName, input.catno),
				year: input.year ?? null,
				cover: input.cover?.trim() || null
			}
			const trackPayloads = input.tracks.map((track) => {
				const trackArtists = buildArtistPayload(track.artistName)
				return {
					title: track.title.trim(),
					artists: trackArtists.length ? trackArtists : recordArtists,
					extraartists: [],
					position: track.position?.trim() || null,
					duration: track.duration ?? null,
					bpm: track.bpm ?? null,
					rpm: track.rpm ?? input.defaultRpm ?? null,
					key: track.key ?? null,
					mode: track.mode ?? null,
					genres: track.genres?.length ? track.genres : defaultGenres,
					time_signature_upper: null,
					time_signature_lower: null,
					playable: track.playable ?? true
				}
			})

			const { data, error } = await dependencies.supabase.rpc(
				'import_record_with_tracks',
				{
					record: recordPayload,
					tracks: trackPayloads
				}
			)
			if (!(await state.isCurrent(captured))) return { status: 'stale' }
			if (error) return state.transportFailure(error)

			let recordId: string
			try {
				const result = validateImportResult(data)
				if (!result.record_id) throw new Error('Missing record ID')
				recordId = result.record_id
			} catch (validationError) {
				return {
					status: 'unavailable',
					reason: 'transport',
					error: validationError
				}
			}

			const committedRecord: LibraryRecord = {
				id: recordId,
				title: recordPayload.title,
				artists: recordArtists,
				labels: recordPayload.labels,
				year: recordPayload.year,
				cover: recordPayload.cover
					? { kind: 'external', url: recordPayload.cover }
					: { kind: 'none' },
				discogs_id: null,
				discogs_release_url: null,
				created_at: null,
				updated_at: null
			}
			return state.complete(captured, committedRecord, {
				mutated: true
			})
		},

		async update(context, { id, updates }) {
			const captured = await state.capture(context)
			if (!state.isLease(captured)) return captured
			try {
				const result = await updateRaw(captured, id, updates)
				if ('status' in result) return result
				return state.complete(captured, result.record, {
					issues: result.issues,
					mutated: true
				})
			} catch (error) {
				return (await state.isCurrent(captured))
					? state.transportFailure(error)
					: { status: 'stale' }
			}
		},

		async updateWithCover(context, { id, updates, change }) {
			if (change.type === 'keep') {
				return repository.update(context, { id, updates })
			}
			const captured = await state.capture(context)
			if (!state.isLease(captured)) return captured
			const coverContext: AdapterCoverContext = {
				generation: coverGeneration,
				userId: captured.userId,
				workspaceContext: captured.context
			}
			const outcome = await coverCoordinator.mutate({
				context: coverContext,
				recordId: id,
				change,
				persistCoverPath: async (path, onResponseFailure) => {
					const result = await updateRaw(
						captured,
						id,
						{ ...updates, cover_storage_path: path },
						onResponseFailure
					)
					return 'status' in result ? null : result.record
				}
			})

			if (outcome.status === 'stale') return { status: 'stale' }
			if (outcome.status === 'not-updated') {
				return { status: 'conflict', reason: 'not-found' }
			}
			if (outcome.status === 'failed') {
				return state.transportFailure(outcome.error)
			}
			return state.complete(captured, outcome.record, { mutated: true })
		},

		async removeFromCollection(context, { id }) {
			const captured = await state.capture(context)
			if (!state.isLease(captured)) return captured
			try {
				const { data, error } = await dependencies.supabase.rpc(
					'remove_record_from_collection',
					{ target_record_id: id }
				)
				if (!(await state.isCurrent(captured))) return { status: 'stale' }
				if (error) return state.transportFailure(error)
				if (!isExpectedRecordRemoval(data, id)) {
					return { status: 'conflict', reason: 'integrity' }
				}
				return state.complete(captured, { id }, { mutated: true })
			} catch (error) {
				return (await state.isCurrent(captured))
					? state.transportFailure(error)
					: { status: 'stale' }
			}
		},

		async drainCoverCleanup(context, options) {
			const captured = await state.capture(context)
			if (!state.isLease(captured)) return captured
			const coverContext: AdapterCoverContext = {
				generation: coverGeneration,
				userId: captured.userId,
				workspaceContext: captured.context
			}
			try {
				const didDrain = await coverCoordinator.drain(coverContext, options)
				if (!(await state.isCurrent(captured))) return { status: 'stale' }
				return didDrain
					? state.complete(captured, undefined)
					: state.transportFailure(
							new Error('Cover cleanup could not be completed.')
						)
			} catch (error) {
				return (await state.isCurrent(captured))
					? state.transportFailure(error)
					: { status: 'stale' }
			}
		},

		reset() {
			coverGeneration += 1
			coverCoordinator.reset()
		}
	}

	return repository
}
