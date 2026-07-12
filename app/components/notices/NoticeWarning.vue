<script setup lang="ts">
import { CircleAlert } from 'lucide-vue-next'
</script>

<template>
	<div
		class="flex rounded-md border border-amber-600/30 bg-amber-600/10 p-2 text-sm text-amber-700"
	>
		<CircleAlert class="mr-2 size-5" />
		<slot />
	</div>
</template>
