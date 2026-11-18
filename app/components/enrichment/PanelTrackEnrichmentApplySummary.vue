<script setup lang="ts">
import {
	AlertTriangle,
	ArrowLeft,
	CheckCircle2,
	Database,
	FileUp
} from '@lucide/vue'
import type { ApplySummary } from '~/composables/useTrackEnrichmentWorkflow'

defineProps<{
	summary: ApplySummary
	isComplete: boolean
	isTransitioning: boolean
	saveStatusLabel: string | null
	savedAtAccessibleLabel: string | null
}>()

const emit = defineEmits<{
	'review-results': []
	'use-another-source': []
	'keep-for-later': []
}>()
</script>

<template>
	<div class="py-8 sm:py-12">
		<div class="mx-auto flex max-w-2xl flex-col items-center text-center">
			<CheckCircle2 v-if="isComplete" class="text-primary size-10" />
			<AlertTriangle v-else class="size-10 text-amber-500" />
			<h2 class="mt-4 text-lg font-semibold">
				{{ isComplete ? 'Enrichment complete' : 'Enrichment needs attention' }}
			</h2>
			<p class="text-muted-foreground mt-1 text-sm">
				{{ summary.succeeded }} of {{ summary.total }}
				staged tracks saved.
			</p>

			<div
				class="border-border mt-6 grid w-full grid-cols-2 divide-x divide-y rounded-md border sm:grid-cols-4 sm:divide-y-0"
			>
				<div class="px-3 py-3">
					<div class="text-muted-foreground text-xs">Tracks updated</div>
					<div class="mt-1 text-xl font-semibold tabular-nums">
						{{ summary.succeeded }}
					</div>
				</div>
				<div class="px-3 py-3">
					<div class="text-muted-foreground text-xs">Evidence saved</div>
					<div class="mt-1 text-xl font-semibold tabular-nums">
						{{ summary.evidence }}
					</div>
					<div
						v-if="summary.evidenceOnly"
						class="text-muted-foreground mt-0.5 text-[10px]"
					>
						{{ summary.evidenceOnly }} Evidence only
					</div>
				</div>
				<div class="px-3 py-3">
					<div class="text-muted-foreground text-xs">BPM filled</div>
					<div class="mt-1 text-xl font-semibold tabular-nums">
						{{ summary.bpm }}
					</div>
				</div>
				<div class="px-3 py-3">
					<div class="text-muted-foreground text-xs">Keys filled</div>
					<div class="mt-1 text-xl font-semibold tabular-nums">
						{{ summary.keyMode }}
					</div>
				</div>
			</div>

			<NoticeError v-if="summary.failed" class="mt-4 w-full">
				{{ summary.failed }} updates failed. Review the result rows for details.
			</NoticeError>
			<NoticeWarning v-if="summary.remaining" class="mt-4 w-full">
				{{ summary.remaining }} staged
				{{ summary.remaining === 1 ? 'update was' : 'updates were' }}
				not attempted and
				{{ summary.remaining === 1 ? 'remains' : 'remain' }}
				ready to retry.
			</NoticeWarning>

			<div class="mt-6 flex flex-wrap justify-center gap-2">
				<Button
					variant="outline"
					:disabled="isTransitioning"
					@click="emit('review-results')"
				>
					<ArrowLeft class="mr-2 size-4" />
					Review results
				</Button>
				<Button
					v-if="isComplete"
					:disabled="isTransitioning"
					@click="emit('use-another-source')"
				>
					<FileUp class="mr-2 size-4" />
					Use another source
				</Button>
				<Button
					variant="outline"
					:disabled="isTransitioning"
					@click="emit('keep-for-later')"
				>
					<Database class="mr-2 size-4" />
					Keep for later
				</Button>
			</div>
			<p
				v-if="saveStatusLabel"
				class="text-muted-foreground mt-3 text-xs"
				role="status"
				aria-live="polite"
				:title="savedAtAccessibleLabel ?? undefined"
			>
				{{ saveStatusLabel }}
			</p>
		</div>
	</div>
</template>
