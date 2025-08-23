<script setup lang="ts">
import type { DiscogsRelease } from '~/types/discogs'

defineProps<{
	release: DiscogsRelease
}>()
</script>

<template>
	<div class="flex">
		<h2>{{ release.basic_information.title }}</h2>
	</div>
</template>
