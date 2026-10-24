<script setup lang="ts">
const recordDetails = useWorkbenchRecordDetailsStore()
const hasOpenedRecord = ref(false)

// Keep the loaded dialog mounted so closing animations and in-flight saves
// retain their lifecycle guards, while deferring its editors until first use.
watch(
	() => recordDetails.selectedRecordId,
	(recordId) => {
		if (recordId) hasOpenedRecord.value = true
	},
	{ immediate: true }
)
</script>

<template>
	<DialogCollectionImport />
	<DialogReleaseImportFilter />
	<DialogDiscogsImport />
	<DialogRecordCreateManual />
	<LazyDialogRecordDetails v-if="hasOpenedRecord" />
</template>
