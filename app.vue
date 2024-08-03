<script setup lang="ts">
import { Toaster } from '@/components/ui/sonner'
</script>

<template>
	<NuxtLayout>
		<NuxtPage keepalive />
	</NuxtLayout>

	<Toaster position="bottom-center" />
</template>
