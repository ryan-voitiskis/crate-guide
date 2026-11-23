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
	getWheelSegmentAccessibleLabel,
	getWheelSegmentLabel,
	getWheelSegmentVisualLabel,
	moveSelection
} from '~/utils/camelotWheel'
import type { LibraryKeyFormat } from '~~/shared/types/library'

const props = withDefaults(
	defineProps<{
		keyFormat: LibraryKeyFormat
		disabled?: boolean
		/**
		 * The committed value (saved on the track, or held by the form). It is
		 * outlined for comparison and restored when a preview is cancelled.
		 */
		currentComposite?: string | null
	}>(),
	{ disabled: false, currentComposite: null }
)

/** Previewed composite key id, or `'none'` when cleared. */
const model = defineModel<string>({ default: 'none' })

const emit = defineEmits<{ confirm: [composite: string] }>()

const GEOMETRY = {
	cx: 100,
	cy: 100,
	innerRadius: 30,
	outerRadius: 96
} as const
const RING_SPLIT = 63

const root = ref<SVGSVGElement | null>(null)
const container = ref<HTMLElement | null>(null)
/** The segment holding keyboard focus, independent of the previewed value. */
const cursor = ref<string | null>(null)
const showFocusRing = ref(false)
let pointerActive = false

const selected = computed(() => getWheelSegment(model.value))
const neighbours = computed(() => new Set(getWheelNeighbours(model.value)))
const tabTarget = computed(
	() => cursor.value ?? selected.value?.composite ?? DEFAULT_WHEEL_SELECTION
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
	accessibleLabel: string
	labelX: number
	labelY: number
	state: 'selected' | 'neighbour' | 'idle'
	isCurrent: boolean
}

function geometryFor(segment: WheelSegment) {
	return segment.ring === 'outer'
		? { ...GEOMETRY, innerRadius: RING_SPLIT }
		: { ...GEOMETRY, outerRadius: RING_SPLIT }
}

const segmentViews = computed<SegmentView[]>(() =>
	CAMELOT_WHEEL_SEGMENTS.map((segment) => {
		const geometry = geometryFor(segment)
		const centre = describeWheelSegmentCentre(segment, geometry)
		return {
			segment,
			path: describeWheelSegmentPath(segment, geometry),
			label: getWheelSegmentVisualLabel(segment, props.keyFormat),
			accessibleLabel: getWheelSegmentAccessibleLabel(segment, props.keyFormat),
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

const focusRingPath = computed(() => {
	if (!showFocusRing.value || !cursor.value) return null
	const segment = getWheelSegment(cursor.value)
	return segment
		? describeWheelSegmentPath(segment, geometryFor(segment))
		: null
})

const selectionLabel = computed(() =>
	selected.value
		? getWheelSegmentLabel(selected.value, props.keyFormat)
		: 'No key'
)

function select(composite: string) {
	if (props.disabled) return
	model.value = composite
	cursor.value = composite
	emit('confirm', composite)
}

function clear() {
	if (props.disabled) return
	model.value = 'none'
	emit('confirm', 'none')
}

async function focusSegment(composite: string) {
	await nextTick()
	root.value
		?.querySelector<SVGElement>(`[data-composite="${composite}"]`)
		?.focus?.()
}

function handlePointerDown() {
	pointerActive = true
	showFocusRing.value = false
}

function handleSegmentFocus(composite: string) {
	cursor.value = composite
	showFocusRing.value = !pointerActive
	pointerActive = false
}

function handleFocusOut(event: FocusEvent) {
	const next = event.relatedTarget
	if (next instanceof Node && root.value?.contains(next)) return
	cursor.value = null
	showFocusRing.value = false
}

function cancelPreview() {
	model.value = props.currentComposite ?? 'none'
	cursor.value = null
	showFocusRing.value = false
	// Leave the wheel on a stable element so the next Escape reaches the parent.
	container.value?.focus()
}

function handleKeydown(event: KeyboardEvent) {
	if (props.disabled) return
	if (event.key === 'Escape') {
		// Consume the first Escape so an enclosing dialog stays open.
		event.preventDefault()
		event.stopPropagation()
		cancelPreview()
		return
	}
	pointerActive = false
	showFocusRing.value = true
	const direction = ARROW_DIRECTIONS[event.key]
	if (direction) {
		event.preventDefault()
		const from = cursor.value ?? selected.value?.composite ?? null
		const next = moveSelection(from, direction)
		model.value = next
		cursor.value = next
		void focusSegment(next)
		return
	}
	if (event.key === 'Enter' || event.key === ' ') {
		event.preventDefault()
		const target = cursor.value ?? selected.value?.composite ?? null
		if (target) select(target)
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
		<div
			ref="container"
			tabindex="-1"
			class="relative mx-auto w-full max-w-56 min-w-44 focus:outline-none"
			data-testid="picker-key-wheel-container"
		>
			<svg
				ref="root"
				viewBox="0 0 200 200"
				class="block aspect-square w-full select-none"
				role="radiogroup"
				aria-label="Key"
				:aria-disabled="disabled || undefined"
				@keydown="handleKeydown"
				@pointerdown="handlePointerDown"
				@focusout="handleFocusOut"
			>
				<g
					v-for="view in segmentViews"
					:key="view.segment.composite"
					role="radio"
					:aria-checked="view.state === 'selected'"
					:aria-label="view.accessibleLabel"
					:aria-disabled="disabled || undefined"
					:tabindex="
						disabled ? -1 : view.segment.composite === tabTarget ? 0 : -1
					"
					:data-composite="view.segment.composite"
					:data-state="view.state"
					class="outline-none"
					:class="disabled ? 'cursor-not-allowed' : 'cursor-pointer'"
					@click="select(view.segment.composite)"
					@focus="handleSegmentFocus(view.segment.composite)"
				>
					<!-- Fills stay at or above 80 % so the dark labels keep at least
					4.5:1 contrast over both themes' backgrounds. -->
					<path
						:d="view.path"
						:fill="view.segment.colour"
						class="transition-opacity motion-reduce:transition-none"
						:class="
							view.state === 'idle' && !disabled
								? 'opacity-80 hover:opacity-100'
								: view.state === 'idle'
									? 'opacity-80'
									: 'opacity-100'
						"
						:stroke="
							view.state === 'selected' || view.isCurrent
								? 'var(--foreground)'
								: 'var(--background)'
						"
						:stroke-width="
							view.state === 'selected' ? 2.5 : view.isCurrent ? 1.5 : 1
						"
						:stroke-dasharray="
							view.isCurrent && view.state !== 'selected' ? '3 2' : undefined
						"
					/>
					<text
						:x="view.labelX"
						:y="view.labelY"
						text-anchor="middle"
						dominant-baseline="central"
						aria-hidden="true"
						class="pointer-events-none fill-[#111] font-mono text-[9px]"
						:class="view.state === 'selected' ? 'font-bold' : 'font-semibold'"
					>
						{{ view.label }}
					</text>
				</g>
				<!-- Keyboard focus ring, drawn on top and independent of selection:
				a wide background halo under a ring-coloured stroke stays visible on
				every segment colour. -->
				<g
					v-if="focusRingPath"
					aria-hidden="true"
					class="pointer-events-none"
					data-testid="picker-key-wheel-focus-ring"
				>
					<path
						:d="focusRingPath"
						fill="none"
						stroke="var(--background)"
						stroke-width="6"
						stroke-linejoin="round"
					/>
					<path
						:d="focusRingPath"
						fill="none"
						stroke="var(--ring)"
						stroke-width="3"
						stroke-linejoin="round"
					/>
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
				Arrows move · Enter confirms · Esc cancels · Delete clears
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
