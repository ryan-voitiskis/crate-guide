<script setup lang="ts">
import { onKeyStroke } from '@vueuse/core'
import { Search } from 'lucide-vue-next'

const recordsStore = useWorkbenchRecordsStore()

const searchInputRef = ref()

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
	<div class="relative flex w-full max-w-md items-center">
		<Search
			class="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
		/>
		<Input
			ref="searchInputRef"
			data-records-search-input
			:value="recordsStore.searchQuery"
			name="search"
			placeholder="Search"
			class="bg-background pr-12 pl-10"
			@input="handleInput"
		/>
		<div class="absolute top-1/2 right-3 hidden -translate-y-1/2 md:block">
			<div
				class="bg-muted text-muted-foreground flex h-6 w-6 items-center justify-center rounded border text-xs font-medium"
			>
				/
			</div>
		</div>
	</div>
</template>
