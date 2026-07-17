<script setup lang="ts">
import { Loader2 } from 'lucide-vue-next'

const discogs = useDiscogsStore()

const attemptMessage = computed(() => {
	const status = discogs.retryStatus
	if (!status || (status.attempt === 1 && status.waitingMs === null))
		return null
	if (status.waitingMs !== null) {
		return `Waiting ${Math.max(1, Math.ceil(status.waitingMs / 1000))}s · attempt ${status.attempt} of ${status.maxAttempts}`
	}
	return `Attempt ${status.attempt} of ${status.maxAttempts}`
})
</script>

<template>
	<div v-if="discogs.importPhase === 'fetching'" class="space-y-4">
		<Progress :model-value="discogs.importProgress" />
		<div
			class="text-muted-foreground flex items-center justify-between font-mono text-[10px] tracking-wide uppercase"
		>
			<span>
				{{
					discogs.transferMode === 'retry'
						? 'Retrying failed records'
						: 'Fetching release metadata'
				}}
			</span>
			<span class="text-foreground tabular-nums">
				{{ discogs.importProgress }}%
			</span>
		</div>
		<div
			v-if="
				discogs.retryStatus &&
				(discogs.transferMode === 'retry' || attemptMessage)
			"
			class="border-border bg-workbench-inset rounded-sm border px-3 py-2"
			aria-live="polite"
		>
			<div class="flex items-center justify-between gap-3">
				<span class="truncate text-sm">{{ discogs.retryStatus.label }}</span>
				<span
					class="text-muted-foreground shrink-0 font-mono text-[9px] tracking-wide uppercase"
				>
					{{ discogs.retryStatus.current }} / {{ discogs.retryStatus.total }}
				</span>
			</div>
			<div
				v-if="attemptMessage"
				class="text-signal mt-1 font-mono text-[9px] tracking-wide uppercase"
			>
				{{ attemptMessage }}
			</div>
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
