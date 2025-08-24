<script setup lang="ts">
import type { HTMLAttributes } from 'vue'

const props = defineProps<{
	class?: HTMLAttributes['class']
}>()
</script>

<template>
	<p :class="cn('text-muted-foreground text-sm', props.class)">
		<slot />
	</p>
</template>
