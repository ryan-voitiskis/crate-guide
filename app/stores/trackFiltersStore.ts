export const useTrackFiltersStore = defineStore('trackFilters', () => {
	const tracks = useTracksStore()

	// Key options constant using pitchClassMap
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
	const showOnlyPlayable = ref(false)
	const bpmMin = ref<number | null>(null)
	const bpmMax = ref<number | null>(null)
	const selectedKey = ref<number | null>(null)
	const selectedGenres = ref<string[]>([])

	const availableGenres = computed(() => {
		const genreSet = new Set<string>()
		tracks.tracks.forEach((track) => {
			track.genres.forEach((genre) => genreSet.add(genre.toLowerCase()))
		})
		return Array.from(genreSet).sort()
	})

	const activeFiltersCount = computed(() => {
		let count = 0
		if (showOnlyPlayable.value) count++
		if (bpmMin.value !== null || bpmMax.value !== null) count++
		if (selectedKey.value !== null) count++
		if (selectedGenres.value.length > 0) count++
		return count
	})

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
		if (index > -1) {
			selectedGenres.value.splice(index, 1)
		} else {
			selectedGenres.value.push(normalizedGenre)
		}
	}

	function clearGenres() {
		selectedGenres.value = []
	}

	function resetAllFilters() {
		showOnlyPlayable.value = false
		bpmMin.value = null
		bpmMax.value = null
		selectedKey.value = null
		selectedGenres.value = []
	}

	const hasActiveFilters = computed(
		() =>
			showOnlyPlayable.value ||
			bpmMin.value !== null ||
			bpmMax.value !== null ||
			selectedKey.value !== null ||
			selectedGenres.value.length > 0
	)

	return {
		showOnlyPlayable,
		bpmMin,
		bpmMax,
		selectedKey,
		selectedGenres,
		availableGenres,
		activeFiltersCount,
		keyOptions,
		setBpmRange,
		setSelectedKey,
		toggleGenre,
		clearGenres,
		resetAllFilters,
		hasActiveFilters
	}
})
