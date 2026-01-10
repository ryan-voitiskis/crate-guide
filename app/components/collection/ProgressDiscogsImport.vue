<script setup lang="ts">
import { Loader2 } from 'lucide-vue-next'

const discogs = useDiscogsStore()
</script>

<template>
	<div v-if="discogs.importPhase === 'fetching'" class="space-y-4">
		<Progress :model-value="discogs.importProgress" />
		<p class="text-muted-foreground text-center text-sm">
			{{ discogs.importProgress }}% complete
		</p>
		<div v-if="discogs.releaseBeingImported">
			<CardDiscogsRelease :release="discogs.releaseBeingImported" />
		</div>
	</div>
	<div
		v-else-if="discogs.importPhase === 'saving'"
		class="flex items-center justify-center py-8"
	>
		<Loader2 class="text-muted-foreground h-8 w-8 animate-spin" />
	</div>
</template>
