<script setup lang="ts">
const discogs = useDiscogsStore()
</script>

<template>
	<div v-if="discogs.isImporting" class="space-y-4">
		<Progress :model-value="discogs.importProgress" />
		<p class="text-muted-foreground text-center text-sm">
			{{ discogs.importProgress }}% complete
		</p>
		<hr />
		<div v-if="discogs.releaseBeingImported">
			<p class="text-muted-foreground mb-4 text-center text-sm">Importing:</p>
			<DiscogsReleaseShort :release="discogs.releaseBeingImported" />
		</div>
	</div>
</template>
