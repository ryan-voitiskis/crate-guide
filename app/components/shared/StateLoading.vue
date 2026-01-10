<script setup lang="ts">
defineProps<{
	message?: string
}>()
</script>

<template>
	<div class="flex items-center justify-center py-8">
		<div class="flex items-center gap-4">
			<div
				class="border-primary h-6 w-6 animate-spin rounded-full border-2 border-t-transparent"
			/>
			<span>{{ message || 'Loading...' }}</span>
		</div>
	</div>
</template>
