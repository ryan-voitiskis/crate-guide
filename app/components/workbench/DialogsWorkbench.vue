<script setup lang="ts">
const recordDetails = useWorkbenchRecordDetailsStore()
const manualEntry = useWorkbenchManualRecordEntryStore()
const discogs = useWorkbenchDiscogsStore()

// Workbench dialogs load on first open instead of with every route. A resumed
// Discogs transfer opens its progress dialog, which mounts the monitor.
const hasOpenedRecord = useOpenedOnce(() => !!recordDetails.selectedRecordId)
const hasOpenedManualEntry = useOpenedOnce(() => manualEntry.isDialogOpen)
const hasOpenedFolders = useOpenedOnce(() => discogs.showGetFoldersDialog)
const hasOpenedFilter = useOpenedOnce(() => discogs.showFilterDialog)
const hasOpenedImport = useOpenedOnce(() => discogs.showImportProgressDialog)
</script>

<template>
	<LazyDialogCollectionImport v-if="hasOpenedFolders" />
	<LazyDialogReleaseImportFilter v-if="hasOpenedFilter" />
	<LazyDialogDiscogsImport v-if="hasOpenedImport" />
	<LazyDialogRecordCreateManual v-if="hasOpenedManualEntry" />
	<LazyDialogRecordDetails v-if="hasOpenedRecord" />
</template>
