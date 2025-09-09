<script setup lang="ts">
import { onKeyStroke } from '@vueuse/core'
import { Search } from 'lucide-vue-next'

const recordsStore = useRecordsStore()

const searchInputRef = ref()

const showClearButton = computed(() => recordsStore.hasSearchQuery)

function focusInput() {
	nextTick(() => {
		const inputElement = searchInputRef.value?.$el
		if (inputElement && typeof inputElement.focus === 'function')
			inputElement.focus()
	})
}

function handleInput(event: Event) {
	const target = event.target as HTMLInputElement
	recordsStore.performSearch(target.value)
}

// Focus search input when '/' is pressed (unless already focused)
onKeyStroke('/', (event) => {
	if (document.activeElement !== searchInputRef.value?.$el) {
		event.preventDefault()
		focusInput()
	}
})
</script>

<template>
	<div class="flex w-full items-center gap-4">
		<div class="relative max-w-md flex-1">
			<Search
				class="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
			/>
			<Input
				ref="searchInputRef"
				data-records-search-input
				:value="recordsStore.searchQuery"
				@input="handleInput"
				name="search"
				placeholder="Search"
				class="pr-12 pl-10"
			/>
			<div class="absolute top-1/2 right-3 hidden -translate-y-1/2 md:block">
				<div
					class="bg-muted text-muted-foreground flex h-6 w-6 items-center justify-center rounded border text-xs font-medium"
				>
					/
				</div>
			</div>
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
