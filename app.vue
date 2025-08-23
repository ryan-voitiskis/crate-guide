<script setup lang="ts">
import 'vue-sonner/style.css'
import { Toaster } from '@/components/ui/sonner'
</script>

<template>
	<NuxtLayout>
		<NuxtPage />
	</NuxtLayout>

	<Toaster position="bottom-center" />
</template>
