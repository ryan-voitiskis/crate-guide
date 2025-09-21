import { toast } from 'vue-sonner'

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

	async function fetchAllTracks() {
		if (!user.supaUser?.id) return

		isLoadingTracks.value = true
		try {
			const { data, error } = await supabase
				.from('tracks')
				.select(`*, records!inner(user_id)`)
				.eq('records.user_id', user.supaUser.id)
				.order('created_at', { ascending: false })

			if (error) throw error
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
					created_at: track.created_at,
					updated_at: track.updated_at
				})) as Track[]) || []
		} catch (error) {
			toast.error('Error fetching tracks.')
		} finally {
			isLoadingTracks.value = false
		}
	}

	async function createTrack(
		trackData: Omit<Track, 'id' | 'created_at' | 'updated_at'>
	): Promise<Track | null> {
		if (!user.supaUser?.id) {
			toast.error('You must be signed in to create tracks.')
			return null
		}

		isCreatingTrack.value = true
		try {
			const { data, error } = await supabase
				.from('tracks')
				.insert(trackData)
				.select()
				.single()

			if (error) throw error

			// Add to local state
			tracks.value.unshift(data as Track)
			toast.success('Track created successfully.')
			return data as Track
		} catch (error) {
			toast.error('Error creating track.')
			return null
		} finally {
			isCreatingTrack.value = false
		}
	}

	async function updateTrack(
		id: string,
		updates: Partial<
			Omit<Track, 'id' | 'record_id' | 'created_at' | 'updated_at'>
		>
	): Promise<Track | null> {
		isUpdatingTrack.value = true

		// Optimistic update
		const trackIndex = tracks.value.findIndex((t: Track) => t.id === id)
		if (trackIndex === -1) {
			toast.error('Track not found.')
			isUpdatingTrack.value = false
			return null
		}

		const originalTrack = tracks.value[trackIndex]
		tracks.value[trackIndex] = { ...originalTrack, ...updates } as Track

		try {
			const { data, error } = await supabase
				.from('tracks')
				.update(updates)
				.eq('id', id)
				.select()
				.single()

			if (error) throw error

			// Update with server response
			tracks.value[trackIndex] = data as Track
			toast.success('Track updated successfully.')
			return data as Track
		} catch (error) {
			// Revert optimistic update
			tracks.value[trackIndex] = originalTrack as Track
			toast.error('Error updating track.')
			return null
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
			// Revert optimistic update
			tracks.value.splice(trackIndex, 0, removedTrack as Track)
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
			const artistMatch = track.artists.some((artist: any) =>
				artist.name.toLowerCase().includes(lowercaseQuery)
			)
			if (artistMatch) return true

			// Search in extraartists
			const extraArtistMatch = track.extraartists.some((artist: any) =>
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
		if (!currentTrack.bpm || !currentTrack.key) return []

		return tracks.value.filter((track: Track) => {
			if (track.id === currentTrack.id || !track.playable) return false
			if (!track.bpm || !track.key || !currentTrack.bpm || !currentTrack.key)
				return false

			// BPM compatibility
			const bpmDiff = Math.abs(track.bpm - currentTrack.bpm)
			const bpmCompatible =
				bpmDiff <= bpmTolerance ||
				Math.abs(track.bpm - currentTrack.bpm * 2) <= bpmTolerance ||
				Math.abs(track.bpm * 2 - currentTrack.bpm) <= bpmTolerance

			// Key compatibility (simplified harmonic mixing)
			const keyDiff = Math.abs(track.key - currentTrack.key)
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
