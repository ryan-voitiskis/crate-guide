<script setup lang="ts">
const recordsStore = useRecordsStore()

const displayedCount = computed(() =>
	recordsStore.hasSearchQuery
		? recordsStore.resultsCount
		: recordsStore.recordsCount
)
</script>

<template>
	<div v-if="recordsStore.hasRecords" class="text-muted-foreground text-sm">
		{{ displayedCount }} of {{ recordsStore.recordsCount }} records
		<span v-if="recordsStore.hasSearchQuery">(filtered)</span>
	</div>
</template>
