<script setup lang="ts">
import 'vue-sonner/style.css'
import { Toaster } from '~/components/ui/sonner'

const route = useRoute()
const isCloudWorkbench = computed(() =>
	requiresCloudWorkbenchRuntime(route.path)
)
</script>

<template>
	<NuxtLayout>
		<NuxtPage />
	</NuxtLayout>

	<BootstrapCloudWorkbench v-if="isCloudWorkbench" />
	<DialogsWorkbench v-if="isCloudWorkbench" />
	<Toaster position="bottom-center" />
</template>
