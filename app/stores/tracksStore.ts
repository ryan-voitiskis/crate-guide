import { toast } from 'vue-sonner'
import type { TrackAudioFeatures } from '~~/shared/types/audioFeatures'
import type { BeatportTrackData } from '~~/shared/types/beatport'
import type { Json } from '~~/shared/types/database'
import type {
	TrackBatchUpdate,
	TrackBatchUpdateResult,
	TrackUpdateInput
} from '~~/shared/types/trackUpdates'

type TrackCreateInput = Omit<
	Track,
	'id' | 'created_at' | 'updated_at' | 'audio_features'
> & {
	audio_features?: TrackAudioFeatures | null
}

export const useTracksStore = defineStore('tracks', () => {
	const supabase = useSupabaseClient<Database>()
	const user = useUserStore()

	const tracks = ref<Track[]>([])
	const isLoadingTracks = ref(false)
	const isCreatingTrack = ref(false)
	const isUpdatingTrack = ref(false)

	const tracksCount = computed(() => tracks.value.length)
	const hasTracks = computed(() => tracks.value.length > 0)
	const playableTracks = computed(() => tracks.value.filter((t) => t.playable))

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
		trackData: TrackCreateInput
	): Database['public']['Tables']['tracks']['Insert'] {
		return {
			...trackData,
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

	async function fetchAllTracks() {
		if (isLoadingTracks.value) return
		isLoadingTracks.value = true
		try {
			const userId = await user
				.resolveAuthenticatedUserId()
				.catch((e: unknown) => {
					console.error('Auth failed in tracksStore:', e)
					toast.error('Failed to load data')
					return null as string | null
				})
			if (!userId) return

			const { data, error } = await supabase
				.from('tracks')
				.select(`*, records!inner(user_id)`)
				.eq('records.user_id', userId)
				.order('created_at', { ascending: false })

			if (error) throw error
			// Map to Track type, stripping the joined records data from the query.
			// Safe cast: Json fields (artists, extraartists, genres) are stored by this
			// app in the expected DiscogsArtistDb[] and string[] formats
			tracks.value =
				(data?.map((track) => ({
					id: track.id,
					record_id: track.record_id,
					title: track.title,
					artists: track.artists,
					extraartists: track.extraartists,
					position: track.position,
					duration: track.duration,
					bpm: track.bpm,
					rpm: track.rpm,
					key: track.key,
					mode: track.mode,
					genres: track.genres,
					time_signature_upper: track.time_signature_upper,
					time_signature_lower: track.time_signature_lower,
					playable: track.playable,
					beatport_data: track.beatport_data,
					audio_features: track.audio_features,
					created_at: track.created_at,
					updated_at: track.updated_at
				})) as Track[]) || []
		} catch (error) {
			console.error('Failed to fetch tracks:', error)
			toast.error('Error fetching tracks.')
		} finally {
			isLoadingTracks.value = false
		}
	}

	async function createTrack(
		trackData: TrackCreateInput
	): Promise<Track | null> {
		if (!user.supaUser?.id) {
			toast.error('You must be signed in to create tracks.')
			return null
		}

		isCreatingTrack.value = true
		try {
			const insertPayload = toTrackInsertPayload(trackData)
			const { data, error } = await supabase
				.from('tracks')
				.insert(insertPayload)
				.select()
				.single()

			if (error) throw error

			// Add to local state (safe cast - Supabase returns the inserted row with same shape)
			tracks.value.unshift({
				...(data as Track),
				audio_features: (data as Track).audio_features ?? null
			})
			toast.success('Track created successfully.')
			return tracks.value[0] ?? null
		} catch (error) {
			console.error('Failed to create track:', error)
			toast.error('Error creating track.')
			return null
		} finally {
			isCreatingTrack.value = false
		}
	}

	async function applyTrackUpdate(
		id: string,
		updates: TrackUpdateInput,
		options?: {
			suppressSuccessToast?: boolean
			suppressErrorToast?: boolean
			preconditions?: TrackBatchUpdate['preconditions']
		}
	): Promise<{ track: Track | null; error: string | null }> {
		const trackIndex = tracks.value.findIndex((t: Track) => t.id === id)
		if (trackIndex === -1) {
			if (!options?.suppressErrorToast) toast.error('Track not found.')
			return { track: null, error: 'Track not found.' }
		}

		const originalTrack = tracks.value[trackIndex]
		tracks.value[trackIndex] = { ...originalTrack, ...updates } as Track

		try {
			const updatePayload = toTrackUpdatePayload(updates)
			let query = supabase.from('tracks').update(updatePayload).eq('id', id)

			if (options?.preconditions?.bpmMustBeNull) {
				query = query.is('bpm', null)
			}
			if (options?.preconditions?.keyModeMustBeNull) {
				query = query.is('key', null).is('mode', null)
			}

			const { data, error } = await query.select().single()

			if (error) throw error

			// Update with server response (safe cast - Supabase returns the updated row)
			tracks.value[trackIndex] = {
				...(data as Track),
				audio_features: (data as Track).audio_features ?? null
			}
			if (!options?.suppressSuccessToast)
				toast.success('Track updated successfully.')
			return { track: tracks.value[trackIndex] ?? null, error: null }
		} catch (error) {
			console.error('Failed to update track:', error)
			// Revert optimistic update (index was validated above, originalTrack is defined)
			tracks.value[trackIndex] = originalTrack!
			if (!options?.suppressErrorToast) toast.error('Error updating track.')
			return { track: null, error: getErrorMessage(error) }
		}
	}

	async function updateTrack(
		id: string,
		updates: TrackUpdateInput,
		options?: { silent?: boolean }
	): Promise<Track | null> {
		isUpdatingTrack.value = true

		try {
			const result = await applyTrackUpdate(id, updates, {
				suppressSuccessToast: options?.silent,
				suppressErrorToast: false
			})
			return result.track
		} finally {
			isUpdatingTrack.value = false
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
	): Promise<TrackBatchUpdateResult[]> {
		isUpdatingTrack.value = true
		const results: TrackBatchUpdateResult[] = []

		try {
			for (const batchUpdate of batchUpdates) {
				const result = await applyTrackUpdate(
					batchUpdate.id,
					batchUpdate.updates,
					{
						suppressSuccessToast: true,
						suppressErrorToast: true,
						preconditions: batchUpdate.preconditions
					}
				)
				const batchResult = {
					id: batchUpdate.id,
					success: !!result.track,
					track: result.track,
					error: result.error
				}
				results.push(batchResult)
				options?.onProgress?.(results.length, batchUpdates.length, batchResult)
			}
			return results
		} finally {
			isUpdatingTrack.value = false
		}
	}

	async function deleteTrack(id: string): Promise<boolean> {
		// Optimistic update
		const trackIndex = tracks.value.findIndex((t: Track) => t.id === id)
		if (trackIndex === -1) {
			toast.error('Track not found.')
			return false
		}
		const removedTrack = tracks.value.splice(trackIndex, 1)[0]
		try {
			const { error } = await supabase.from('tracks').delete().eq('id', id)
			if (error) throw error
			toast.success('Track deleted successfully.')
			return true
		} catch (error) {
			console.error('Failed to delete track:', error)
			// Revert optimistic update (removedTrack is already Track type)
			tracks.value.splice(trackIndex, 0, removedTrack!)
			toast.error('Error deleting track.')
			return false
		}
	}

	function getTrackById(id: string): Track | undefined {
		return tracks.value.find((t: Track) => t.id === id)
	}

	function getTracksByRecordId(recordId: string): Track[] {
		return tracks.value.filter((t: Track) => t.record_id === recordId)
	}

	function getTracksByIds(ids: string[]): Track[] {
		return tracks.value.filter((t: Track) => ids.includes(t.id))
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

	function getTracksByBpmRange(minBpm: number, maxBpm: number): Track[] {
		return tracks.value.filter(
			(track: Track) =>
				track.bpm &&
				track.bpm >= minBpm &&
				track.bpm <= maxBpm &&
				track.playable
		)
	}

	function getTracksByKey(key: number): Track[] {
		return tracks.value.filter(
			(track: Track) => track.key === key && track.playable
		)
	}

	function getTracksByGenre(genre: string): Track[] {
		const lowercaseGenre = genre.toLowerCase()
		return tracks.value.filter(
			(track: Track) =>
				track.genres.some((g: string) =>
					g.toLowerCase().includes(lowercaseGenre)
				) && track.playable
		)
	}

	function getCompatibleTracks(
		currentTrack: Track,
		bpmTolerance: number = 5
	): Track[] {
		// Use == null to check for both null and undefined (key=0 is valid for C Major)
		if (currentTrack.bpm == null || currentTrack.key == null) return []

		// Capture narrowed values in local const variables for use in filter closure
		const currentBpm = currentTrack.bpm
		const currentKey = currentTrack.key

		return tracks.value.filter((track: Track) => {
			if (track.id === currentTrack.id || !track.playable) return false
			// Use == null to check for both null and undefined (key=0 is valid for C Major)
			if (track.bpm == null || track.key == null) return false

			// BPM compatibility
			const bpmDiff = Math.abs(track.bpm - currentBpm)
			const bpmCompatible =
				bpmDiff <= bpmTolerance ||
				Math.abs(track.bpm - currentBpm * 2) <= bpmTolerance ||
				Math.abs(track.bpm * 2 - currentBpm) <= bpmTolerance

			// Key compatibility (simplified harmonic mixing)
			const keyDiff = Math.abs(track.key - currentKey)
			const keyCompatible =
				keyDiff === 0 || keyDiff === 1 || keyDiff === 11 || keyDiff === 7

			return bpmCompatible && keyCompatible
		})
	}

	// Clear tracks when user signs out
	function clearTracks() {
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
		getTracksByIds,
		searchTracks,
		getTracksByBpmRange,
		getTracksByKey,
		getTracksByGenre,
		getCompatibleTracks,
		clearTracks
	}
})
