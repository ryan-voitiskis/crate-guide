export const useTrackFiltersStore = defineStore('trackFilters', () => {
	const showOnlyPlayable = ref(false)
	const bpmMin = ref<number | null>(null)
	const bpmMax = ref<number | null>(null)
	const selectedKey = ref<number | null>(null)
	const selectedGenres = ref<string[]>([])

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
		setBpmRange,
		setSelectedKey,
		toggleGenre,
		clearGenres,
		resetAllFilters,
		hasActiveFilters
	}
})
