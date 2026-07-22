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
	ExternalRecordImportResult,
	ExternalRecordWithTracksInput,
	LibraryRecord,
	ManualRecordWithTracksInput,
	RecordUpdateInput
} from '~~/shared/types/library'
import { decodeLibraryRecordRow } from '../codecs/supabaseLibraryCodecs'
import type { RecordsRepository, RepositoryOutcome } from '../contracts'
import { validateExternalRecordWithTracksInput } from '../externalRecordImportValidation'
import type {
	CloudOperationLease,
	CloudRepositoryState
} from './cloudRepositoryState'

type AdapterCoverContext = RecordCoverAccountContext & {
	workspaceContext: CloudOperationLease['context']
}

const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

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

function normalizeDiscogsIds(discogsIds: readonly number[]): number[] {
	if (
		discogsIds.some(
			(id) => !Number.isSafeInteger(id) || id <= 0 || id > 2_147_483_647
		)
	) {
		throw new Error('Discogs release IDs must be positive 32-bit integers.')
	}
	return [...new Set(discogsIds)]
}

function serializeExternalCover(
	cover: ExternalRecordWithTracksInput['record']['cover']
): string | null {
	if (cover.kind === 'external') return cover.url
	if (cover.kind === 'none') return null
	throw new Error(
		'Managed library covers cannot be imported as provider metadata.'
	)
}

function validateExternalImportResult(
	value: unknown,
	expectedTracks: number
): ExternalRecordImportResult {
	const result = validateImportResult(value)
	if (
		typeof result.record_id !== 'string' ||
		!UUID_PATTERN.test(result.record_id) ||
		typeof result.already_exists !== 'boolean' ||
		!Number.isSafeInteger(result.tracks_inserted) ||
		result.tracks_inserted! < 0 ||
		(result.already_exists
			? result.tracks_inserted !== 0
			: result.tracks_inserted !== expectedTracks)
	) {
		throw new Error('Invalid response from import function')
	}
	return {
		recordId: result.record_id,
		inserted: !result.already_exists
	}
}

function serializeRecordUpdates(updates: RecordUpdateInput) {
	const { cover, ...recordUpdates } = updates
	if (cover?.kind === 'browser') {
		throw new Error(
			'Browser-managed covers cannot be written to cloud storage.'
		)
	}
	return {
		...recordUpdates,
		...(updates.artists ? { artists: updates.artists as Json } : {}),
		...(updates.labels ? { labels: updates.labels as Json } : {}),
		...(cover !== undefined
			? {
					cover:
						cover.kind === 'external'
							? cover.url
							: cover.kind === 'cloud'
								? cover.fallbackUrl
								: null
				}
			: {})
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
		async findExistingDiscogsIds(context, discogsIds) {
			const captured = await state.capture(context)
			if (!state.isLease(captured)) return captured
			let requestedIds: number[]
			try {
				requestedIds = normalizeDiscogsIds(discogsIds)
			} catch (error) {
				return { status: 'conflict', reason: 'integrity', current: error }
			}
			if (requestedIds.length === 0) {
				return state.complete(captured, new Set())
			}

			try {
				const existing = new Set<number>()
				for (let index = 0; index < requestedIds.length; index += 100) {
					const chunk = requestedIds.slice(index, index + 100)
					const { data, error } = await dependencies.supabase
						.from('records')
						.select('discogs_id')
						.eq('user_id', captured.userId)
						.in('discogs_id', chunk)
					if (!(await state.isCurrent(captured))) return { status: 'stale' }
					if (error) return state.transportFailure(error)
					for (const row of data ?? []) {
						if (row.discogs_id === null || !chunk.includes(row.discogs_id)) {
							return { status: 'conflict', reason: 'integrity' }
						}
						existing.add(row.discogs_id)
					}
				}
				return state.complete(captured, existing)
			} catch (error) {
				return (await state.isCurrent(captured))
					? state.transportFailure(error)
					: { status: 'stale' }
			}
		},
		async importExternalWithTracks(context, input) {
			const captured = await state.capture(context)
			if (!state.isLease(captured)) return captured
			let validated: ExternalRecordWithTracksInput
			try {
				validated = validateExternalRecordWithTracksInput(input)
			} catch (error) {
				return { status: 'conflict', reason: 'integrity', current: error }
			}
			try {
				const recordPayload = {
					...validated.record,
					user_id: captured.userId,
					cover: serializeExternalCover(validated.record.cover)
				}
				const { data, error } = await dependencies.supabase.rpc(
					'import_record_with_tracks',
					{
						record: recordPayload as Json,
						tracks: validated.tracks as Json
					}
				)
				if (!(await state.isCurrent(captured))) return { status: 'stale' }
				if (error) return state.transportFailure(error)

				let result: ExternalRecordImportResult
				try {
					result = validateExternalImportResult(data, validated.tracks.length)
				} catch (validationError) {
					return state.transportFailure(validationError)
				}
				return state.complete(captured, result, {
					mutated: result.inserted
				})
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
