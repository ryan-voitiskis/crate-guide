import { toRaw } from 'vue'
import { toast } from 'vue-sonner'
import { getActivePinia } from 'pinia'
import { sortCreatedAtDescIdDesc } from '~/utils/supabaseOrdering'
import { fetchAllSupabasePages } from '~/utils/supabasePagination'
import {
	type DecodeIssue,
	decodeTrackRow,
	reportDecodeIssues
} from '~/utils/supabaseRows'
import { isDemoWorkbenchPinia } from '~/utils/workbenchPinia'
import type { TrackAudioFeatures } from '~~/shared/types/audioFeatures'
import type { BeatportTrackData } from '~~/shared/types/beatport'
import type { Json } from '~~/shared/types/database'
import type {
	TrackBatchUpdate,
	TrackBatchUpdateOutcome,
	TrackBatchUpdateResult,
	TrackUpdateInput
} from '~~/shared/types/trackUpdates'

type TrackCreateInput = Omit<
	Track,
	'id' | 'created_at' | 'updated_at' | 'audio_features'
> & {
	audio_features?: TrackAudioFeatures | null
}

type FetchContext = {
	generation: number
	userId: string
}

type MutationActivity = 'create' | 'update'

type MutationActivityToken = {
	context: FetchContext
	activity: MutationActivity
}

type TrackCreateProvenance = FetchContext & {
	revision: number
}

type ApplyTrackUpdateResult = {
	track: Track | null
	error: string | null
	issues: DecodeIssue[]
	stale: boolean
}

export const useTracksStore = defineStore('tracks', () => {
	const supabase = useSupabaseClient<Database>()
	const pinia = getActivePinia()
	const isDemoStore = isDemoWorkbenchPinia(pinia)
	const user = useUserStore(pinia)

	const tracks = ref<Track[]>([])
	const isLoadingTracks = ref(false)
	const isCreatingTrack = ref(false)
	const isUpdatingTrack = ref(false)
	let fetchPromise: Promise<boolean> | null = null
	let accountGeneration = 0
	let accountUserId: string | null = null
	let activeFetchUserId: string | null = null
	let mutationRevision = 0
	const trackCreateProvenance = new Map<string, TrackCreateProvenance>()
	const trackOperationRevisions = new Map<string, number>()
	const trackOperationQueues = new Map<string, Promise<void>>()
	const mutationActivityCounts: Record<MutationActivity, number> = {
		create: 0,
		update: 0
	}

	const tracksCount = computed(() => tracks.value.length)
	const hasTracks = computed(() => tracks.value.length > 0)
	const playableTracks = computed(() => tracks.value.filter((t) => t.playable))
	const tracksById = computed(
		() => new Map(tracks.value.map((track) => [track.id, track]))
	)
	const tracksByRecordId = computed(() => {
		const groupedTracks = new Map<string, Track[]>()
		for (const track of tracks.value) {
			const recordTracks = groupedTracks.get(track.record_id) ?? []
			recordTracks.push(track)
			groupedTracks.set(track.record_id, recordTracks)
		}
		return groupedTracks
	})

	function getReactiveUserId(): string | null {
		const userId = user.supaUserId
		return typeof userId === 'string' && userId ? userId : null
	}

	function isCurrentAccountContext(context: FetchContext): boolean {
		return (
			context.generation === accountGeneration &&
			accountUserId === context.userId &&
			getReactiveUserId() === context.userId
		)
	}

	function adoptAccountContext(
		generation: number,
		userId: string
	): FetchContext | null {
		if (generation !== accountGeneration) return null
		if (getReactiveUserId() !== userId) return null
		if (accountUserId !== null && accountUserId !== userId) return null
		accountUserId = userId
		return { generation, userId }
	}

	function isCurrentFetchContext(context: FetchContext): boolean {
		return (
			isCurrentAccountContext(context) && activeFetchUserId === context.userId
		)
	}

	function setMutationActivity(
		activity: MutationActivity,
		isActive: boolean
	): void {
		if (activity === 'create') isCreatingTrack.value = isActive
		else isUpdatingTrack.value = isActive
	}

	function beginMutationActivity(
		context: FetchContext,
		activity: MutationActivity
	): MutationActivityToken {
		mutationActivityCounts[activity] += 1
		setMutationActivity(activity, true)
		return { context, activity }
	}

	function finishMutationActivity(token: MutationActivityToken): void {
		if (!isCurrentAccountContext(token.context)) return
		mutationActivityCounts[token.activity] = Math.max(
			0,
			mutationActivityCounts[token.activity] - 1
		)
		setMutationActivity(
			token.activity,
			mutationActivityCounts[token.activity] > 0
		)
	}

	async function resolveMutationContext(
		generation: number
	): Promise<FetchContext | null> {
		if (isDemoStore || generation !== accountGeneration) return null
		try {
			const userId = await user.resolveAuthenticatedUserId()
			return adoptAccountContext(generation, userId)
		} catch (error) {
			if (generation !== accountGeneration) return null
			console.error('Auth failed in tracksStore mutation:', error)
			toast.error('You must be signed in to update your collection.')
			return null
		}
	}

	async function confirmMutationContext(
		context: FetchContext,
		suppressErrorToast = false
	): Promise<boolean> {
		if (!isCurrentAccountContext(context)) return false
		try {
			const userId = await user.resolveAuthenticatedUserId()
			return isCurrentAccountContext(context) && userId === context.userId
		} catch (error) {
			if (!isCurrentAccountContext(context)) return false
			console.error('Auth failed in tracksStore mutation:', error)
			if (!suppressErrorToast)
				toast.error('You must be signed in to update your collection.')
			return false
		}
	}

	function decodeOwnedTrackResponse(data: unknown, context: FetchContext) {
		if (
			!data ||
			typeof data !== 'object' ||
			Array.isArray(data) ||
			(data as { user_id?: unknown }).user_id !== context.userId
		) {
			throw new Error('Track ownership validation failed')
		}
		return decodeTrackRow(data as Database['public']['Tables']['tracks']['Row'])
	}

	function nextMutationRevision(): number {
		mutationRevision += 1
		return mutationRevision
	}

	async function runSerializedTrackOperation<T>(
		context: FetchContext,
		id: string,
		staleResult: T,
		operation: () => Promise<T>
	): Promise<T> {
		const previous = trackOperationQueues.get(id) ?? Promise.resolve()
		const run = previous
			.catch(() => undefined)
			.then(async () => {
				if (!isCurrentAccountContext(context)) return staleResult
				return await operation()
			})
		const completion = run.then(
			() => undefined,
			() => undefined
		)
		trackOperationQueues.set(id, completion)
		try {
			return await run
		} finally {
			if (trackOperationQueues.get(id) === completion) {
				trackOperationQueues.delete(id)
			}
		}
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

	function serializeTrackGenres(
		genres: string[]
	): Database['public']['Tables']['tracks']['Insert']['genres'] {
		return [...genres]
	}

	function serializeBeatportData(
		beatportData: Track['beatport_data']
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
	): Database['public']['Tables']['tracks']['Insert']['audio_features'] {
		if (audioFeatures === undefined) return undefined
		// Application audio feature types are JSON-compatible by construction.
		return audioFeatures as unknown as Json
	}

	function toTrackInsertPayload(
		trackData: TrackCreateInput,
		userId: string
	): Database['public']['Tables']['tracks']['Insert'] {
		return {
			...trackData,
			user_id: userId,
			artists: serializeTrackArtists(trackData.artists),
			extraartists: serializeTrackArtists(trackData.extraartists),
			genres: serializeTrackGenres(trackData.genres),
			beatport_data: serializeBeatportData(trackData.beatport_data),
			audio_features: serializeAudioFeatures(trackData.audio_features)
		}
	}

	function toTrackUpdatePayload(
		updates: TrackUpdateInput
	): Database['public']['Tables']['tracks']['Update'] {
		return {
			...updates,
			artists: updates.artists
				? serializeTrackArtists(updates.artists)
				: undefined,
			extraartists: updates.extraartists
				? serializeTrackArtists(updates.extraartists)
				: undefined,
			genres: updates.genres ? serializeTrackGenres(updates.genres) : undefined,
			beatport_data:
				updates.beatport_data === undefined
					? undefined
					: serializeBeatportData(updates.beatport_data),
			audio_features: serializeAudioFeatures(updates.audio_features)
		}
	}

	function getErrorMessage(error: unknown): string {
		if (error instanceof Error) return error.message
		if (typeof error === 'string') return error
		return 'Unknown error'
	}

	async function performFetchAllTracks(generation: number): Promise<boolean> {
		isLoadingTracks.value = true
		let context: FetchContext | null = null
		try {
			let userId: string
			try {
				userId = await user.resolveAuthenticatedUserId()
			} catch (error) {
				if (generation !== accountGeneration) return false
				console.error('Auth failed in tracksStore:', error)
				toast.error('Failed to load data')
				return false
			}
			if (generation !== accountGeneration) return false
			context = adoptAccountContext(generation, userId)
			if (!context) return false
			activeFetchUserId = userId
			const startingRevision = mutationRevision

			const rows = await fetchAllSupabasePages(async (cursor, pageSize) => {
				let query = supabase
					.from('tracks')
					.select('*')
					.eq('user_id', userId)
					.order('id', { ascending: false })
				if (cursor !== null) query = query.lt('id', cursor)
				const result = await query.limit(pageSize)
				if (result.data?.some((track) => track.user_id !== userId)) {
					throw new Error('Track ownership validation failed')
				}
				return result
			})
			if (!isCurrentFetchContext(context)) return false
			const completedContext = context

			const decodedRows = rows.map(decodeTrackRow)
			const issues = decodedRows.flatMap((decoded) => decoded.issues)
			reportDecodeIssues(issues, (message) => toast.warning(message))
			const fetchedTracks = decodedRows.map((decoded) => decoded.row)
			const fetchedIds = new Set(fetchedTracks.map((track) => track.id))
			const createdDuringFetch = tracks.value.filter((track) => {
				const provenance = trackCreateProvenance.get(track.id)
				return (
					provenance?.generation === completedContext.generation &&
					provenance.userId === completedContext.userId &&
					provenance.revision > startingRevision &&
					!fetchedIds.has(track.id)
				)
			})
			const preservedIds = new Set(createdDuringFetch.map((track) => track.id))
			tracks.value = sortCreatedAtDescIdDesc([
				...fetchedTracks,
				...createdDuringFetch
			])
			for (const [id, provenance] of trackCreateProvenance) {
				if (
					provenance.generation === completedContext.generation &&
					provenance.userId === completedContext.userId &&
					!preservedIds.has(id)
				) {
					trackCreateProvenance.delete(id)
				}
			}
			return true
		} catch (error) {
			if (!context || !isCurrentFetchContext(context)) return false
			console.error('Failed to fetch tracks:', error)
			toast.error('Error fetching tracks.')
			return false
		} finally {
			const isCurrentOperation = context
				? isCurrentFetchContext(context)
				: generation === accountGeneration
			if (isCurrentOperation) isLoadingTracks.value = false
		}
	}

	function fetchAllTracks(): Promise<boolean> {
		if (isDemoStore) return Promise.resolve(true)
		if (fetchPromise) return fetchPromise

		const createdPromise = performFetchAllTracks(accountGeneration).finally(
			() => {
				if (fetchPromise === createdPromise) fetchPromise = null
			}
		)
		fetchPromise = createdPromise
		return createdPromise
	}

	async function createTrack(
		trackData: TrackCreateInput
	): Promise<Track | null> {
		if (isDemoStore) return null
		const context = await resolveMutationContext(accountGeneration)
		if (!context) return null
		const activity = beginMutationActivity(context, 'create')
		try {
			if (!(await confirmMutationContext(context))) return null
			const insertPayload = toTrackInsertPayload(trackData, context.userId)
			const { data, error } = await supabase
				.from('tracks')
				.insert(insertPayload)
				.select()
				.single()

			if (!isCurrentAccountContext(context)) return null
			if (error) throw error

			const decoded = decodeOwnedTrackResponse(data, context)
			reportDecodeIssues(decoded.issues, (message) => toast.warning(message))
			tracks.value.unshift(decoded.row)
			trackCreateProvenance.set(decoded.row.id, {
				...context,
				revision: nextMutationRevision()
			})
			toast.success('Track created successfully.')
			return decoded.row
		} catch (error) {
			if (!isCurrentAccountContext(context)) return null
			console.error('Failed to create track:', error)
			toast.error('Error creating track.')
			return null
		} finally {
			finishMutationActivity(activity)
		}
	}

	async function applyTrackUpdate(
		context: FetchContext,
		id: string,
		updates: TrackUpdateInput,
		options?: {
			suppressSuccessToast?: boolean
			suppressErrorToast?: boolean
			preconditions?: TrackBatchUpdate['preconditions']
		}
	): Promise<ApplyTrackUpdateResult> {
		if (isDemoStore)
			return {
				track: null,
				error: 'Disabled in demo mode.',
				issues: [],
				stale: false
			}
		const staleResult: ApplyTrackUpdateResult = {
			track: null,
			error: null,
			issues: [],
			stale: true
		}
		return await runSerializedTrackOperation(
			context,
			id,
			staleResult,
			async () => {
				if (
					!(await confirmMutationContext(context, options?.suppressErrorToast))
				) {
					return { track: null, error: null, issues: [], stale: true }
				}
				const trackIndex = tracks.value.findIndex(
					(track: Track) => track.id === id
				)
				if (trackIndex === -1) {
					if (!options?.suppressErrorToast) toast.error('Track not found.')
					return {
						track: null,
						error: 'Track not found.',
						issues: [],
						stale: false
					}
				}

				const originalTrack = tracks.value[trackIndex]!
				const optimisticTrack = { ...originalTrack, ...updates } as Track
				const operationRevision = nextMutationRevision()
				trackOperationRevisions.set(id, operationRevision)
				tracks.value[trackIndex] = optimisticTrack

				try {
					const updatePayload = toTrackUpdatePayload(updates)
					let query = supabase
						.from('tracks')
						.update(updatePayload)
						.eq('id', id)
						.eq('user_id', context.userId)

					if (options?.preconditions?.bpmMustBeNull) {
						query = query.is('bpm', null)
					}
					if (options?.preconditions?.keyModeMustBeNull) {
						query = query.is('key', null).is('mode', null)
					}

					const { data, error } = await query.select().single()

					if (!isCurrentAccountContext(context)) {
						return { track: null, error: null, issues: [], stale: true }
					}
					if (error) throw error

					const decoded = decodeOwnedTrackResponse(data, context)
					const currentIndex = tracks.value.findIndex(
						(track) => track.id === id
					)
					const ownsOperation =
						trackOperationRevisions.get(id) === operationRevision
					if (!ownsOperation || currentIndex === -1) {
						return { track: null, error: null, issues: [], stale: true }
					}
					tracks.value[currentIndex] = decoded.row
					if (!options?.suppressSuccessToast)
						toast.success('Track updated successfully.')
					return {
						track: decoded.row,
						error: null,
						issues: decoded.issues,
						stale: false
					}
				} catch (error) {
					if (!isCurrentAccountContext(context)) {
						return { track: null, error: null, issues: [], stale: true }
					}
					const currentIndex = tracks.value.findIndex(
						(track) => track.id === id
					)
					const ownsOperation =
						trackOperationRevisions.get(id) === operationRevision
					if (!ownsOperation) {
						return { track: null, error: null, issues: [], stale: true }
					}
					console.error('Failed to update track:', error)
					if (
						currentIndex !== -1 &&
						toRaw(tracks.value[currentIndex]) === optimisticTrack
					) {
						tracks.value[currentIndex] = originalTrack
					}
					if (!options?.suppressErrorToast) toast.error('Error updating track.')
					return {
						track: null,
						error: getErrorMessage(error),
						issues: [],
						stale: false
					}
				} finally {
					if (trackOperationRevisions.get(id) === operationRevision) {
						trackOperationRevisions.delete(id)
					}
				}
			}
		)
	}

	async function updateTrack(
		id: string,
		updates: TrackUpdateInput,
		options?: { silent?: boolean }
	): Promise<Track | null> {
		const context = await resolveMutationContext(accountGeneration)
		if (!context) return null
		const activity = beginMutationActivity(context, 'update')

		try {
			const result = await applyTrackUpdate(context, id, updates, {
				suppressSuccessToast: options?.silent,
				suppressErrorToast: false
			})
			if (result.stale || !isCurrentAccountContext(context)) return null
			reportDecodeIssues(result.issues, (message) => toast.warning(message))
			return result.track
		} finally {
			finishMutationActivity(activity)
		}
	}

	async function updateTracksBatch(
		batchUpdates: TrackBatchUpdate[],
		options?: {
			onProgress?: (
				completed: number,
				total: number,
				result: TrackBatchUpdateResult
			) => void
		}
	): Promise<TrackBatchUpdateOutcome> {
		const context = await resolveMutationContext(accountGeneration)
		if (!context) return { results: [], cancelled: true }
		const activity = beginMutationActivity(context, 'update')
		const results: TrackBatchUpdateResult[] = []
		const decodeIssues: DecodeIssue[] = []
		let cancelled = false

		try {
			for (const batchUpdate of batchUpdates) {
				if (!isCurrentAccountContext(context)) {
					cancelled = true
					break
				}
				const result = await applyTrackUpdate(
					context,
					batchUpdate.id,
					batchUpdate.updates,
					{
						suppressSuccessToast: true,
						suppressErrorToast: true,
						preconditions: batchUpdate.preconditions
					}
				)
				if (result.stale || !isCurrentAccountContext(context)) {
					cancelled = true
					break
				}
				decodeIssues.push(...result.issues)
				const batchResult = {
					id: batchUpdate.id,
					success: !!result.track,
					track: result.track,
					error: result.error
				}
				results.push(batchResult)
				options?.onProgress?.(results.length, batchUpdates.length, batchResult)
			}
			if (isCurrentAccountContext(context)) {
				reportDecodeIssues(decodeIssues, (message) => toast.warning(message))
			}
			return {
				results,
				cancelled
			}
		} finally {
			finishMutationActivity(activity)
		}
	}

	async function deleteTrack(id: string): Promise<boolean> {
		if (isDemoStore) return false
		const context = await resolveMutationContext(accountGeneration)
		if (!context) return false
		return await runSerializedTrackOperation(context, id, false, async () => {
			if (!(await confirmMutationContext(context))) return false
			const trackIndex = tracks.value.findIndex((t: Track) => t.id === id)
			if (trackIndex === -1) {
				toast.error('Track not found.')
				return false
			}
			const removedTrack = tracks.value[trackIndex]!
			const operationRevision = nextMutationRevision()
			trackOperationRevisions.set(id, operationRevision)
			tracks.value.splice(trackIndex, 1)
			try {
				const { data, error } = await supabase
					.from('tracks')
					.delete()
					.eq('id', id)
					.eq('user_id', context.userId)
					.select('id, user_id')
					.single()
				if (
					!isCurrentAccountContext(context) ||
					trackOperationRevisions.get(id) !== operationRevision
				) {
					return false
				}
				if (error) throw error
				if (!data || data.id !== id || data.user_id !== context.userId) {
					throw new Error('Track deletion ownership validation failed')
				}
				tracks.value = tracks.value.filter((track) => track.id !== id)
				trackCreateProvenance.delete(id)
				toast.success('Track deleted successfully.')
				return true
			} catch (error) {
				if (
					!isCurrentAccountContext(context) ||
					trackOperationRevisions.get(id) !== operationRevision
				) {
					return false
				}
				console.error('Failed to delete track:', error)
				if (!tracks.value.some((track) => track.id === id)) {
					tracks.value = sortCreatedAtDescIdDesc([
						...tracks.value,
						removedTrack
					])
				}
				toast.error('Error deleting track.')
				return false
			} finally {
				if (trackOperationRevisions.get(id) === operationRevision) {
					trackOperationRevisions.delete(id)
				}
			}
		})
	}

	function getTrackById(id: string): Track | undefined {
		return tracksById.value.get(id)
	}

	function getTracksByRecordId(recordId: string): Track[] {
		return [...(tracksByRecordId.value.get(recordId) ?? [])]
	}

	function removeTracksByRecordId(recordId: string) {
		for (const track of tracks.value) {
			if (track.record_id === recordId) trackCreateProvenance.delete(track.id)
		}
		tracks.value = tracks.value.filter((track) => track.record_id !== recordId)
	}

	function searchTracks(query: string): Track[] {
		if (!query.trim()) return tracks.value

		const lowercaseQuery = query.toLowerCase()
		return tracks.value.filter((track: Track) => {
			// Search in title
			if (track.title.toLowerCase().includes(lowercaseQuery)) return true

			// Search in artists
			const artistMatch = track.artists.some((artist: DiscogsArtistDb) =>
				artist.name.toLowerCase().includes(lowercaseQuery)
			)
			if (artistMatch) return true

			// Search in extraartists
			const extraArtistMatch = track.extraartists.some(
				(artist: DiscogsArtistDb) =>
					artist.name.toLowerCase().includes(lowercaseQuery)
			)
			if (extraArtistMatch) return true

			// Search in genres
			const genreMatch = track.genres.some((genre: string) =>
				genre.toLowerCase().includes(lowercaseQuery)
			)
			if (genreMatch) return true

			// Search in position
			if (
				track.position &&
				track.position.toLowerCase().includes(lowercaseQuery)
			)
				return true

			// Search in BPM (convert to string for partial matches)
			if (track.bpm && track.bpm.toString().includes(query)) return true

			return false
		})
	}

	// Clear tracks when user signs out
	function clearTracks() {
		accountGeneration += 1
		fetchPromise = null
		accountUserId = null
		activeFetchUserId = null
		trackCreateProvenance.clear()
		trackOperationRevisions.clear()
		trackOperationQueues.clear()
		mutationActivityCounts.create = 0
		mutationActivityCounts.update = 0
		isLoadingTracks.value = false
		isCreatingTrack.value = false
		isUpdatingTrack.value = false
		tracks.value = []
	}

	return {
		tracks,
		isLoadingTracks,
		isCreatingTrack,
		isUpdatingTrack,
		tracksCount,
		hasTracks,
		playableTracks,
		fetchAllTracks,
		createTrack,
		updateTrack,
		updateTracksBatch,
		deleteTrack,
		getTrackById,
		getTracksByRecordId,
		removeTracksByRecordId,
		searchTracks,
		clearTracks
	}
})
