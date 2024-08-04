<script setup lang="ts">
import type { HTMLAttributes } from 'vue'

const props = defineProps<{
	class?: HTMLAttributes['class']
}>()
</script>

<template>
	<h3 :class="cn('text-2xl font-semibold leading-none', props.class)">
		<slot />
	</h3>
</template>
