export const useTrackFiltersStore = defineStore('trackFilters', () => {
	const tracks = useTracksStore()

	const keyOptions = computed(() => {
		const options = []
		for (let mode = 0; mode <= 1; mode++) {
			for (let key = 0; key < 12; key++) {
				options.push({
					value: key,
					label: getKeyString(key, mode),
					color: getKeyColour(key, mode)
				})
			}
		}
		return options
	})

	const searchQuery = ref('')
	const showOnlyPlayable = ref(false)
	const bpmMin = ref<number | null>(null)
	const bpmMax = ref<number | null>(null)
	const selectedKey = ref<number | null>(null)
	const selectedGenres = ref<string[]>([])

	const filteredTracks = computed(() => {
		let result = tracks.tracks

		if (searchQuery.value.trim()) {
			const query = searchQuery.value.toLowerCase()
			result = result.filter(
				(track) =>
					track.title.toLowerCase().includes(query) ||
					track.artists.some((artist) =>
						artist.name.toLowerCase().includes(query)
					) ||
					track.extraartists.some((artist) =>
						artist.name.toLowerCase().includes(query)
					) ||
					track.genres.some((genre) => genre.toLowerCase().includes(query)) ||
					(track.position && track.position.toLowerCase().includes(query))
			)
		}

		if (showOnlyPlayable.value)
			result = result.filter((track) => track.playable)

		if (bpmMin.value !== null || bpmMax.value !== null) {
			result = result.filter((track) => {
				if (!track.bpm) return false
				if (bpmMin.value !== null && track.bpm < bpmMin.value) return false
				if (bpmMax.value !== null && track.bpm > bpmMax.value) return false
				return true
			})
		}

		if (selectedKey.value !== null)
			result = result.filter((track) => track.key === selectedKey.value)

		if (selectedGenres.value.length > 0)
			result = result.filter((track) =>
				track.genres.some((genre) =>
					selectedGenres.value.includes(genre.toLowerCase())
				)
			)

		return result
	})

	const availableGenres = computed(() => {
		const genreSet = new Set<string>()
		tracks.tracks.forEach((track) => {
			track.genres.forEach((genre) => genreSet.add(genre.toLowerCase()))
		})
		return Array.from(genreSet).sort()
	})

	const activeFiltersCount = computed(() => {
		let count = 0
		if (searchQuery.value.trim()) count++
		if (showOnlyPlayable.value) count++
		if (bpmMin.value !== null || bpmMax.value !== null) count++
		if (selectedKey.value !== null) count++
		if (selectedGenres.value.length > 0) count++
		return count
	})

	const hasActiveFilters = computed(() => activeFiltersCount.value > 0)

	function clearSearchQuery() {
		searchQuery.value = ''
	}

	function setBpmRange(min: number | null, max: number | null) {
		bpmMin.value = min
		bpmMax.value = max
	}

	function setSelectedKey(key: number | null) {
		selectedKey.value = key
	}

	function toggleGenre(genre: string) {
		const normalizedGenre = genre.toLowerCase()
		const index = selectedGenres.value.indexOf(normalizedGenre)
		if (index > -1) selectedGenres.value.splice(index, 1)
		else selectedGenres.value.push(normalizedGenre)
	}

	function clearGenres() {
		selectedGenres.value = []
	}

	function resetAllFilters() {
		searchQuery.value = ''
		showOnlyPlayable.value = false
		bpmMin.value = null
		bpmMax.value = null
		selectedKey.value = null
		selectedGenres.value = []
	}

	return {
		searchQuery,
		showOnlyPlayable,
		bpmMin,
		bpmMax,
		selectedKey,
		selectedGenres,
		filteredTracks,
		availableGenres,
		activeFiltersCount,
		keyOptions,
		hasActiveFilters,
		clearSearchQuery,
		setBpmRange,
		setSelectedKey,
		toggleGenre,
		clearGenres,
		resetAllFilters
	}
})
