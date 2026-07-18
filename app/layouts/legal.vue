<script setup lang="ts">
const route = useRoute()
const scrollContainer = ref<HTMLElement | null>(null)

watch(
	() => route.path,
	async () => {
		await nextTick()
		if (scrollContainer.value) {
			scrollContainer.value.scrollTop = 0
			scrollContainer.value.scrollLeft = 0
		}
	}
)
</script>

<template>
	<div class="flex h-full min-h-0 flex-col">
		<HeaderPublic section="Legal archive" />
		<div
			ref="scrollContainer"
			data-legal-page-scroll-container
			class="min-h-0 flex-1 overflow-y-auto overscroll-contain"
		>
			<slot />
		</div>
		<StatusPublic />
	</div>
</template>
