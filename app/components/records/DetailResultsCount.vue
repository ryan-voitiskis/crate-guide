<script setup lang="ts">
const recordsStore = useRecordsStore()
</script>

<template>
	<div v-if="recordsStore.hasRecords" class="text-muted-foreground text-sm">
		{{ recordsStore.resultsCount }} of {{ recordsStore.recordsCount }} records
		<span v-if="recordsStore.hasSearchQuery">(filtered)</span>
	</div>
</template>
