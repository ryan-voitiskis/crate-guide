<script setup lang="ts">
const recordsStore = useRecordsStore()

const SEARCH_INPUT_SELECTOR = '[data-records-search-input]'

const showClearButton = computed(() => recordsStore.hasSearchQuery)

function focusInput() {
	nextTick(() => {
		const htmlElement = document.querySelector(
			SEARCH_INPUT_SELECTOR
		) as HTMLInputElement
		if (htmlElement && typeof htmlElement.focus === 'function') {
			htmlElement.focus()
		}
	})
}

function handleKeydown(event: KeyboardEvent) {
	// Focus search input when '/' is pressed (unless already focused)
	const htmlElement = document.querySelector(
		SEARCH_INPUT_SELECTOR
	) as HTMLInputElement
	if (event.key === '/' && document.activeElement !== htmlElement) {
		event.preventDefault()
		focusInput()
	}
}

function handleInput(event: Event) {
	const target = event.target as HTMLInputElement
	recordsStore.performSearch(target.value)
}

onMounted(() => {
	document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
	document.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
	<div class="flex items-center gap-4">
		<div class="relative max-w-md flex-1">
			<Input
				data-records-search-input
				:value="recordsStore.searchQuery"
				@input="handleInput"
				name="search"
				placeholder="Search by title, artist, or label... (Press '/' to focus)"
			/>
		</div>
	</div>

	<div v-if="recordsStore.hasRecords" class="flex items-center justify-between">
		<div class="text-muted-foreground text-sm">
			<span v-if="recordsStore.hasSearchQuery">
				{{ recordsStore.resultsCount }} of
				{{ recordsStore.recordsCount }} records
			</span>
			<span v-else>
				{{ recordsStore.recordsCount }} records in your collection
			</span>
		</div>
	</div>
</template>
