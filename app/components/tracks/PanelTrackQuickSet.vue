<script setup lang="ts">
import { Gauge, KeyRound } from '@lucide/vue'
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
		readOnly?: boolean
		pendingBpm?: boolean
		pendingKey?: boolean
		conflict?: string | null
	}>(),
	{ readOnly: false, pendingBpm: false, pendingKey: false, conflict: null }
)

const emit = defineEmits<{
	'update:bpm': [bpm: number]
	'update:keyComposite': [composite: string]
}>()

const wheelSelection = ref(props.keyComposite)
watch(
	() => props.keyComposite,
	(value) => {
		wheelSelection.value = value
	}
)

const savedKeyLabel = computed(() => {
	const segment = getWheelSegment(props.keyComposite)
	return segment ? getWheelSegmentLabel(segment, props.keyFormat) : 'No key'
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
		<p
			v-if="conflict"
			role="alert"
			class="rounded-md border border-amber-600/30 bg-amber-600/10 p-2 text-xs"
			data-testid="quick-set-conflict"
		>
			{{ conflict }}
		</p>

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
					{{ pendingKey ? 'Saving…' : `Saved ${savedKeyLabel}` }}
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
