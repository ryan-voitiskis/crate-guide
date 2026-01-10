<script setup lang="ts">
const recordsStore = useRecordsStore()
</script>

<template>
	<div class="flex flex-col items-center justify-center py-16 text-center">
		<div class="bg-muted mb-4 rounded-full p-6">
			<div class="text-muted-foreground text-4xl">🔍</div>
		</div>
		<h3 class="text-lg font-semibold">No records found</h3>
		<p class="text-muted-foreground mb-4 max-w-md">
			No records match your search for "{{ recordsStore.searchQuery }}". Try
			adjusting your search terms.
		</p>
		<Button variant="outline" @click="recordsStore.clearSearch()">
			Clear Search
		</Button>
	</div>
</template>
