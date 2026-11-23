<script setup lang="ts">
import { Check, RotateCcw } from '@lucide/vue'
import {
	TAP_TEMPO_CLOCK,
	type TapTempoState,
	createTapTempo,
	defaultTapTempoClock,
	doubleBpm,
	halveBpm
} from '~/utils/tapTempo'
import { isBpmInRange } from '~/utils/formatting'

const props = withDefaults(
	defineProps<{
		/** The committed value (saved, or held by a form), shown for comparison. */
		currentBpm: number | null
		/** Whether `currentBpm` is saved on the track or only held by a form. */
		valueSource?: 'saved' | 'form'
		disabled?: boolean
		pending?: boolean
	}>(),
	{ valueSource: 'saved', disabled: false, pending: false }
)

const emit = defineEmits<{
	/** Fired only when the user confirms, never on individual taps. */
	use: [bpm: number]
}>()

const tempo = createTapTempo()
const state = ref<TapTempoState>(tempo.getState())
const readoutId = useId()

const inactive = computed(() => props.disabled || props.pending)
const tapButton = ref<HTMLButtonElement | null>(null)
const hasEstimate = computed(() => state.value.bpm !== null)
const usableBpm = computed(() => {
	const bpm = state.value.bpm
	return bpm !== null && Number.isFinite(bpm) && isBpmInRange(bpm) ? bpm : null
})
const canHalve = computed(() => halveBpm(state.value.bpm) !== null)
const canDouble = computed(() => doubleBpm(state.value.bpm) !== null)

const statusLabel = computed(() => {
	if (state.value.tapCount === 0) return 'Tap along to the beat'
	if (state.value.tapCount === 1) return 'Keep tapping'
	if (state.value.bpm === null) return 'Uneven taps · keep tapping'
	if (state.value.stable) return `${state.value.tapCount} taps · steady`
	return `${state.value.tapCount} taps · settling`
})

const readout = computed(() =>
	state.value.bpm === null ? '—' : state.value.bpm.toFixed(1)
)

const now = inject(TAP_TEMPO_CLOCK, defaultTapTempoClock)

const currentLabel = computed(() => {
	// The store applies a pending value optimistically; don't call it saved yet.
	if (props.valueSource === 'saved' && props.pending) return 'Saving…'
	const bpm = props.currentBpm
	if (props.valueSource === 'form')
		return bpm === null
			? 'No BPM in this form'
			: `In this form: ${bpm.toFixed(1)}`
	return bpm === null ? 'No BPM saved' : `Saved ${bpm.toFixed(1)}`
})

function tap() {
	if (inactive.value) return
	state.value = tempo.tap(now())
}

function reset() {
	state.value = tempo.reset()
}

function use() {
	if (inactive.value || usableBpm.value === null) return
	emit('use', usableBpm.value)
	// Use becomes disabled while the save runs, and a disabled button drops
	// focus to the document body. Keep focus on Tap so keyboard shortcuts
	// keep working inside an enclosing dialog.
	tapButton.value?.focus()
}

function applyScale(scale: (bpm: number | null) => number | null) {
	const scaled = scale(state.value.bpm)
	if (scaled === null) return
	// Scaling replaces the estimate; later taps start a fresh sequence.
	tempo.reset()
	state.value = {
		bpm: scaled,
		rawBpm: scaled,
		tapCount: 0,
		intervalCount: 0,
		stable: true
	}
}

function handleTapKeydown(event: KeyboardEvent) {
	if (event.key === 'Enter') {
		event.preventDefault()
		use()
	}
}

defineExpose({ tap, reset, use })
</script>

<template>
	<div class="space-y-2" data-testid="control-tap-tempo">
		<div class="flex items-stretch gap-2">
			<!-- Only read-only disables Tap natively. While a save is pending it
			stays focusable and ignores taps, so focus is never dropped. -->
			<button
				ref="tapButton"
				type="button"
				class="bg-primary text-primary-foreground hover:bg-primary/85 focus-visible:ring-ring flex h-16 min-w-0 flex-1 flex-col items-center justify-center rounded-md text-sm font-semibold tracking-wide uppercase shadow-sm transition-colors select-none focus-visible:ring-2 focus-visible:outline-none active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 aria-disabled:opacity-60 motion-reduce:transition-none"
				:disabled="disabled"
				:aria-disabled="pending || undefined"
				:aria-describedby="readoutId"
				aria-label="Tap along to the beat. Press Enter to use the estimate."
				data-testid="tap-tempo-tap"
				@click="tap"
				@keydown="handleTapKeydown"
			>
				Tap
			</button>
			<div
				:id="readoutId"
				class="border-border bg-muted/40 flex w-28 shrink-0 flex-col justify-center rounded-md border px-2 py-1 text-right"
				aria-live="polite"
				data-testid="tap-tempo-readout"
			>
				<span
					class="font-mono text-xl leading-none font-semibold tabular-nums"
					:class="hasEstimate ? 'text-foreground' : 'text-muted-foreground'"
				>
					{{ readout }}
				</span>
				<span class="text-muted-foreground mt-1 text-[10px] leading-tight">
					{{ statusLabel }}
				</span>
			</div>
		</div>

		<div class="flex items-center gap-1.5">
			<Button
				type="button"
				variant="ghost"
				size="sm"
				class="px-2"
				:disabled="state.tapCount === 0 && !hasEstimate"
				aria-label="Reset taps"
				data-testid="tap-tempo-reset"
				@click="reset"
			>
				<RotateCcw class="size-3.5" />
			</Button>
			<Button
				type="button"
				variant="outline"
				size="sm"
				class="font-mono"
				:disabled="inactive || !canHalve"
				aria-label="Halve the estimate"
				data-testid="tap-tempo-halve"
				@click="applyScale(halveBpm)"
			>
				÷2
			</Button>
			<Button
				type="button"
				variant="outline"
				size="sm"
				class="font-mono"
				:disabled="inactive || !canDouble"
				aria-label="Double the estimate"
				data-testid="tap-tempo-double"
				@click="applyScale(doubleBpm)"
			>
				×2
			</Button>
			<span
				class="text-muted-foreground ml-auto font-mono text-[10px] tabular-nums"
				data-testid="tap-tempo-current"
			>
				{{ currentLabel }}
			</span>
			<ButtonLoading
				type="button"
				size="sm"
				:loading="pending"
				:disabled="inactive || usableBpm === null"
				aria-label="Use this BPM"
				data-testid="tap-tempo-use"
				@click="use"
			>
				<Check class="mr-1 size-3.5" />
				Use
			</ButtonLoading>
		</div>
	</div>
</template>
