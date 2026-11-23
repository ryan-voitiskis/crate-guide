<script setup lang="ts">
import { Gauge, KeyRound } from '@lucide/vue'
import type { QuickSetIssueView } from '~/composables/useTrackQuickSet'
import type { QuickSetField } from '~/stores/trackQuickSetStore'
import { getWheelSegment, getWheelSegmentLabel } from '~/utils/camelotWheel'
import type { LibraryKeyFormat } from '~~/shared/types/library'

/**
 * Presentational tap-tempo and key-wheel controls. The parent decides what a
 * confirmed value means: a library write (inspector, annotation mode) or a
 * form field update (track editor dialogs).
 */
const props = withDefaults(
	defineProps<{
		bpm: number | null
		keyComposite: string
		keyFormat: LibraryKeyFormat
		/** Whether the shown values are saved on the track or held by a form. */
		valueSource?: 'saved' | 'form'
		readOnly?: boolean
		pendingBpm?: boolean
		pendingKey?: boolean
		/** Rejected values, at most one per field. */
		issues?: QuickSetIssueView[]
		/** The track must be reloaded before anything can be written. */
		needsRefresh?: boolean
		refreshing?: boolean
	}>(),
	{
		valueSource: 'saved',
		readOnly: false,
		pendingBpm: false,
		pendingKey: false,
		issues: () => [],
		needsRefresh: false,
		refreshing: false
	}
)

const emit = defineEmits<{
	'update:bpm': [bpm: number]
	'update:keyComposite': [composite: string]
	retry: [field: QuickSetField]
	refresh: []
	dismiss: [field: QuickSetField]
}>()

const wheelSelection = ref(props.keyComposite)
watch(
	() => props.keyComposite,
	(value) => {
		wheelSelection.value = value
	}
)

const keyCaption = computed(() => {
	if (props.valueSource === 'saved' && props.pendingKey) return 'Saving…'
	const segment = getWheelSegment(props.keyComposite)
	const label = segment ? getWheelSegmentLabel(segment, props.keyFormat) : null
	if (props.valueSource === 'form')
		return label ? `In this form: ${label}` : 'No key in this form'
	return label ? `Saved ${label}` : 'No key saved'
})

function handleKeyConfirm(composite: string) {
	if (props.readOnly || props.pendingKey) return
	if (composite === props.keyComposite) return
	emit('update:keyComposite', composite)
}

function handleBpmUse(bpm: number) {
	if (props.readOnly || props.pendingBpm) return
	emit('update:bpm', bpm)
}
</script>

<template>
	<div class="space-y-4" data-testid="panel-track-quick-set">
		<div
			v-if="issues.length || needsRefresh"
			role="alert"
			class="space-y-2 rounded-md border border-amber-600/30 bg-amber-600/10 p-2 text-xs"
			data-testid="quick-set-issues"
		>
			<div
				v-for="issue in issues"
				:key="issue.field"
				class="space-y-1.5"
				:data-issue-kind="issue.kind"
				:data-issue-field="issue.field"
				data-testid="quick-set-issue"
			>
				<p data-testid="quick-set-issue-message">{{ issue.message }}</p>
				<div
					v-if="issue.canRetry || issue.canDismiss"
					class="flex flex-wrap gap-1.5"
				>
					<Button
						v-if="issue.canRetry"
						type="button"
						size="sm"
						variant="outline"
						:disabled="readOnly"
						data-testid="quick-set-issue-retry"
						@click="emit('retry', issue.field)"
					>
						Try again
					</Button>
					<Button
						v-if="issue.canDismiss"
						type="button"
						size="sm"
						variant="ghost"
						data-testid="quick-set-issue-dismiss"
						@click="emit('dismiss', issue.field)"
					>
						Dismiss
					</Button>
				</div>
			</div>
			<div v-if="needsRefresh" class="flex flex-wrap items-center gap-2">
				<p class="min-w-0 flex-1">
					Refresh this track before changing it again.
				</p>
				<ButtonLoading
					type="button"
					size="sm"
					variant="outline"
					:loading="refreshing"
					data-testid="quick-set-issue-refresh"
					@click="emit('refresh')"
				>
					Refresh
				</ButtonLoading>
			</div>
		</div>

		<section class="space-y-2" aria-label="Tap tempo">
			<div class="flex items-center gap-2">
				<Gauge class="text-muted-foreground size-3.5" />
				<h3
					class="font-mono text-[10px] font-semibold tracking-[0.14em] uppercase"
				>
					Tap tempo
				</h3>
			</div>
			<ControlTapTempo
				:current-bpm="bpm"
				:value-source="valueSource"
				:disabled="readOnly"
				:pending="pendingBpm"
				@use="handleBpmUse"
			/>
		</section>

		<section class="space-y-2" aria-label="Key">
			<div class="flex items-center justify-between gap-2">
				<div class="flex items-center gap-2">
					<KeyRound class="text-muted-foreground size-3.5" />
					<h3
						class="font-mono text-[10px] font-semibold tracking-[0.14em] uppercase"
					>
						Key
					</h3>
				</div>
				<span
					class="text-muted-foreground font-mono text-[10px]"
					data-testid="quick-set-saved-key"
				>
					{{ keyCaption }}
				</span>
			</div>
			<PickerKeyWheel
				v-model="wheelSelection"
				:key-format="keyFormat"
				:disabled="readOnly || pendingKey"
				:current-composite="keyComposite"
				@confirm="handleKeyConfirm"
			/>
		</section>
	</div>
</template>
