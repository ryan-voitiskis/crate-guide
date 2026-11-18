<script setup lang="ts">
import {
	CAMELOT_WHEEL_SEGMENTS,
	DEFAULT_WHEEL_SELECTION,
	type WheelDirection,
	type WheelSegment,
	describeWheelSegmentCentre,
	describeWheelSegmentPath,
	getWheelNeighbours,
	getWheelSegment,
	getWheelSegmentLabel,
	moveSelection
} from '~/utils/camelotWheel'
import type { LibraryKeyFormat } from '~~/shared/types/library'

const props = withDefaults(
	defineProps<{
		keyFormat: LibraryKeyFormat
		disabled?: boolean
		/** The value currently saved on the track, outlined for comparison. */
		currentComposite?: string | null
	}>(),
	{ disabled: false, currentComposite: null }
)

/** Composite key id, or `'none'` when cleared. */
const model = defineModel<string>({ default: 'none' })

const emit = defineEmits<{ confirm: [composite: string] }>()

const GEOMETRY = {
	cx: 100,
	cy: 100,
	innerRadius: 30,
	outerRadius: 96
} as const
const RING_SPLIT = 63

const groupId = useId()
const root = ref<SVGSVGElement | null>(null)

const selected = computed(() => getWheelSegment(model.value))
const neighbours = computed(() => new Set(getWheelNeighbours(model.value)))
const focusTarget = computed(
	() => selected.value?.composite ?? DEFAULT_WHEEL_SELECTION
)

const ARROW_DIRECTIONS: Record<string, WheelDirection> = {
	ArrowLeft: 'left',
	ArrowRight: 'right',
	ArrowUp: 'up',
	ArrowDown: 'down'
}

type SegmentView = {
	segment: WheelSegment
	path: string
	label: string
	labelX: number
	labelY: number
	state: 'selected' | 'neighbour' | 'idle'
	isCurrent: boolean
}

const segmentViews = computed<SegmentView[]>(() =>
	CAMELOT_WHEEL_SEGMENTS.map((segment) => {
		const geometry =
			segment.ring === 'outer'
				? { ...GEOMETRY, innerRadius: RING_SPLIT }
				: { ...GEOMETRY, outerRadius: RING_SPLIT }
		const centre = describeWheelSegmentCentre(segment, geometry)
		return {
			segment,
			path: describeWheelSegmentPath(segment, geometry),
			label: getWheelSegmentLabel(segment, props.keyFormat),
			labelX: centre.x,
			labelY: centre.y,
			state:
				segment.composite === model.value
					? 'selected'
					: neighbours.value.has(segment.composite)
						? 'neighbour'
						: 'idle',
			isCurrent: segment.composite === props.currentComposite
		}
	})
)

const selectionLabel = computed(() =>
	selected.value
		? getWheelSegmentLabel(selected.value, props.keyFormat)
		: 'No key'
)

function select(composite: string) {
	if (props.disabled) return
	model.value = composite
	emit('confirm', composite)
}

function clear() {
	if (props.disabled) return
	model.value = 'none'
	emit('confirm', 'none')
}

async function focusSegment(composite: string) {
	await nextTick()
	const element = root.value?.querySelector<SVGElement>(
		`[data-composite="${composite}"]`
	)
	element?.focus?.()
}

function handleKeydown(event: KeyboardEvent) {
	if (props.disabled) return
	const direction = ARROW_DIRECTIONS[event.key]
	if (direction) {
		event.preventDefault()
		const next = moveSelection(model.value, direction)
		model.value = next
		void focusSegment(next)
		return
	}
	if (event.key === 'Enter' || event.key === ' ') {
		event.preventDefault()
		if (selected.value) emit('confirm', selected.value.composite)
		return
	}
	if (event.key === 'Backspace' || event.key === 'Delete') {
		event.preventDefault()
		clear()
	}
}
</script>

<template>
	<div class="space-y-2" data-testid="picker-key-wheel">
		<div class="relative mx-auto w-full max-w-56 min-w-44">
			<svg
				:id="groupId"
				ref="root"
				viewBox="0 0 200 200"
				class="block aspect-square w-full select-none"
				role="radiogroup"
				aria-label="Key"
				:aria-disabled="disabled || undefined"
				@keydown="handleKeydown"
			>
				<g
					v-for="view in segmentViews"
					:key="view.segment.composite"
					role="radio"
					:aria-checked="view.state === 'selected'"
					:aria-label="view.label"
					:aria-disabled="disabled || undefined"
					:tabindex="
						disabled ? -1 : view.segment.composite === focusTarget ? 0 : -1
					"
					:data-composite="view.segment.composite"
					:data-state="view.state"
					class="focus-visible:outline-none"
					:class="disabled ? 'cursor-not-allowed' : 'cursor-pointer'"
					@click="select(view.segment.composite)"
				>
					<path
						:d="view.path"
						:fill="view.segment.colour"
						class="transition-opacity motion-reduce:transition-none"
						:class="[
							view.state === 'selected'
								? 'opacity-100'
								: view.state === 'neighbour'
									? 'opacity-85'
									: 'opacity-45 hover:opacity-80',
							disabled ? 'hover:opacity-45' : ''
						]"
						:stroke="
							view.state === 'selected'
								? 'var(--foreground)'
								: view.isCurrent
									? 'var(--foreground)'
									: 'var(--background)'
						"
						:stroke-width="view.state === 'selected' ? 2.5 : 1"
						:stroke-dasharray="
							view.isCurrent && view.state !== 'selected' ? '3 2' : undefined
						"
					/>
					<text
						:x="view.labelX"
						:y="view.labelY"
						text-anchor="middle"
						dominant-baseline="central"
						class="pointer-events-none fill-[#111] font-mono text-[9px] font-semibold"
						:class="view.state === 'idle' ? 'opacity-70' : 'opacity-100'"
					>
						{{ view.label }}
					</text>
				</g>
				<circle
					:cx="GEOMETRY.cx"
					:cy="GEOMETRY.cy"
					:r="GEOMETRY.innerRadius - 2"
					class="fill-background"
				/>
				<text
					:x="GEOMETRY.cx"
					:y="GEOMETRY.cy"
					text-anchor="middle"
					dominant-baseline="central"
					class="fill-foreground pointer-events-none font-mono text-[11px] font-semibold"
					data-testid="picker-key-wheel-selection"
				>
					{{ selectionLabel }}
				</text>
			</svg>
		</div>
		<div class="flex items-center justify-between gap-2">
			<span class="text-muted-foreground font-mono text-[10px]">
				Arrows move · Enter confirms · Delete clears
			</span>
			<Button
				type="button"
				variant="ghost"
				size="sm"
				:disabled="disabled || model === 'none'"
				data-testid="picker-key-wheel-clear"
				@click="clear"
			>
				Clear
			</Button>
		</div>
	</div>
</template>
