<script setup lang="ts">
import type { HTMLAttributes } from 'vue'

const props = defineProps<{
	class?: HTMLAttributes['class']
}>()
</script>

<template>
	<h3 :class="cn('text-2xl leading-none font-semibold', props.class)">
		<slot />
	</h3>
</template>
