<script setup lang="ts">
defineProps<{
	isPlaying: boolean
}>()
</script>

<template>
	<div class="absolute top-2 right-2 origin-top-right">
		<div
			class="h-16 w-1 rounded-full bg-zinc-400"
			:style="{
				transform: isPlaying ? 'rotate(-25deg)' : 'rotate(-45deg)',
				transition: 'transform 0.3s ease'
			}"
		/>
	</div>
</template>
