<script setup lang="ts">
import { Database, RefreshCw, Trash2 } from '@lucide/vue'
import type { TrackEnrichmentDraftDiscoveryState } from '~/composables/useTrackEnrichmentDraftSession'

defineProps<{
	hasDraft: boolean
	isMissingConflict: boolean
	details: {
		sourceLabel: string
		observationCount: number
		reviewedCount: number
		stagedCount: number
		doneCount: number
		retryCount: number
	} | null
	discoveryState: TrackEnrichmentDraftDiscoveryState
	isLiveElsewhere: boolean
	saveStatusLabel: string | null
	savedAtAccessibleLabel: string | null
	recoveryMessage: string | null
	isHydrating: boolean
	isTakingOver: boolean
	isTransitioning: boolean
}>()

const emit = defineEmits<{
	resume: []
	'take-over': []
	'start-fresh': []
	delete: []
}>()
</script>

<template>
	<section
		v-if="hasDraft"
		data-testid="enrichment-draft-strip"
		class="border-border bg-card/50 rounded-md border p-3"
	>
		<div class="flex flex-col gap-3 sm:flex-row sm:items-start">
			<div
				class="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-md"
			>
				<Database class="size-4" />
			</div>
			<div class="min-w-0 flex-1">
				<div class="flex flex-wrap items-center gap-x-2 gap-y-1">
					<h2 class="text-sm font-semibold">Saved review on this device</h2>
					<span
						v-if="saveStatusLabel"
						class="text-muted-foreground font-mono text-[10px]"
						role="status"
						aria-live="polite"
						:title="savedAtAccessibleLabel ?? undefined"
					>
						{{ saveStatusLabel }}
					</span>
				</div>
				<p class="text-muted-foreground mt-1 text-xs leading-relaxed">
					This recovery draft stays in this browser. It is not backed up to
					Crate Guide or included in library exports.
				</p>
				<div v-if="details" class="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
					<span class="font-medium">
						{{ details.sourceLabel }}
					</span>
					<span class="text-muted-foreground">
						{{ details.observationCount }} tracks
					</span>
					<span class="text-muted-foreground">
						{{ details.reviewedCount }} reviewed
					</span>
					<span class="text-muted-foreground">
						{{ details.stagedCount }} staged
					</span>
					<span v-if="details.doneCount" class="text-muted-foreground">
						{{ details.doneCount }} successful writes
					</span>
					<span v-if="details.retryCount" class="text-muted-foreground">
						{{ details.retryCount }} to retry
					</span>
				</div>
				<p
					v-if="isLiveElsewhere"
					class="mt-2 text-xs text-amber-700 dark:text-amber-400"
				>
					Another tab is editing this review. Resume opens it read-only until
					you explicitly take over.
				</p>
				<p v-if="recoveryMessage" class="text-destructive mt-2 text-xs">
					{{ recoveryMessage }}
				</p>
				<p
					v-else-if="
						discoveryState === 'invalid' || discoveryState === 'incompatible'
					"
					class="text-destructive mt-2 text-xs"
				>
					This saved review cannot be resumed safely. Start fresh or delete it;
					the current library has not been changed.
				</p>
			</div>
		</div>
		<div class="mt-3 flex flex-wrap gap-2 sm:justify-end">
			<Button
				v-if="discoveryState === 'ready'"
				size="sm"
				:disabled="isHydrating || isTakingOver || isTransitioning"
				@click="emit('resume')"
			>
				<RefreshCw class="mr-1.5 size-3.5" />
				{{ isHydrating ? 'Rematching…' : 'Resume' }}
			</Button>
			<Button
				v-if="isLiveElsewhere"
				variant="outline"
				size="sm"
				:disabled="isTakingOver || isHydrating || isTransitioning"
				@click="emit('take-over')"
			>
				{{ isTakingOver ? 'Taking over…' : 'Take over' }}
			</Button>
			<Button
				variant="outline"
				size="sm"
				:disabled="
					isHydrating || isTakingOver || isTransitioning || isLiveElsewhere
				"
				@click="emit('start-fresh')"
			>
				Start fresh
			</Button>
			<Button
				variant="ghost"
				size="sm"
				:disabled="
					isHydrating || isTakingOver || isTransitioning || isLiveElsewhere
				"
				@click="emit('delete')"
			>
				<Trash2 class="mr-1.5 size-3.5" />
				Delete
			</Button>
		</div>
	</section>

	<section
		v-if="isMissingConflict"
		data-testid="enrichment-draft-missing-conflict"
		class="border-border rounded-md border bg-amber-500/10 p-3"
	>
		<div class="flex flex-wrap items-center justify-between gap-3">
			<div>
				<h2 class="text-sm font-semibold">Saved review deleted</h2>
				<p class="text-muted-foreground mt-1 text-xs leading-relaxed">
					This saved review was deleted in another tab. The in-memory review is
					read-only and was not recreated. Start fresh to continue.
				</p>
			</div>
			<Button
				variant="outline"
				size="sm"
				:disabled="isTransitioning"
				@click="emit('start-fresh')"
			>
				Start fresh
			</Button>
		</div>
	</section>
</template>
