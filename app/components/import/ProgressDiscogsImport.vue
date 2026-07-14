<script setup lang="ts">
import { Loader2 } from 'lucide-vue-next'

const discogs = useDiscogsStore()
</script>

<template>
	<div v-if="discogs.importPhase === 'fetching'" class="space-y-4">
		<Progress :model-value="discogs.importProgress" />
		<div
			class="text-muted-foreground flex items-center justify-between font-mono text-[10px] tracking-wide uppercase"
		>
			<span>Fetching release metadata</span>
			<span class="text-foreground tabular-nums">
				{{ discogs.importProgress }}%
			</span>
		</div>
		<div v-if="discogs.releaseBeingImported">
			<CardDiscogsRelease :release="discogs.releaseBeingImported" />
		</div>
	</div>
	<div
		v-else-if="discogs.importPhase === 'saving'"
		class="border-border bg-workbench-inset flex flex-col items-center justify-center gap-3 rounded-sm border py-8"
	>
		<Loader2 class="text-primary size-6 animate-spin" />
		<span
			class="text-muted-foreground font-mono text-[10px] tracking-wide uppercase"
		>
			Writing library index
		</span>
	</div>
</template>
