<script setup lang="ts">
import { CircleAlert } from 'lucide-vue-next'
</script>

<template>
	<div
		class="border-destructive/30 bg-destructive/10 text-destructive flex rounded-md border p-2 text-sm"
	>
		<CircleAlert class="mr-2 size-5" />
		<slot />
	</div>
</template>
