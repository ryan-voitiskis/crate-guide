<script setup lang="ts">
const discogs = useDiscogsStore()
</script>

<template>
	<div v-if="discogs.isImporting" class="space-y-4">
		<Progress :model-value="discogs.importProgress" />
		<p class="text-muted-foreground text-center text-sm">
			{{ discogs.importProgress }}% complete
		</p>
		<div v-if="discogs.releaseBeingImported">
			<DiscogsReleaseShort :release="discogs.releaseBeingImported" />
		</div>
	</div>
</template>
