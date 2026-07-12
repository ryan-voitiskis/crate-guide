<script setup lang="ts">
interface Props {
	width?: number | string
	height?: number | string
}

withDefaults(defineProps<Props>(), {
	width: 24,
	height: 24
})
</script>

<template>
	<svg
		:width="width"
		:height="height"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
		class="animate-spin"
		xmlns="http://www.w3.org/2000/svg"
	>
		<path d="M21 12a9 9 0 1 1-6.219-8.56" />
	</svg>
</template>
