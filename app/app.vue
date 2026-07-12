<script setup lang="ts">
import 'vue-sonner/style.css'
import { Toaster } from '~/components/ui/sonner'

useUserData()
</script>

<template>
	<NuxtLayout>
		<NuxtPage />
	</NuxtLayout>

	<DialogCollectionImport />
	<DialogReleaseImportFilter />
	<DialogDiscogsImport />
	<DialogRecordCreateManual />
	<DialogRecordDetails />
	<Toaster position="bottom-center" />
</template>
