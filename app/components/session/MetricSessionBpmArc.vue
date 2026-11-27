<script setup lang="ts">
import { getSetArc, getSetEntryBpm } from '~/utils/setPlanner'

const session = useWorkbenchSessionStore()
const tracks = useWorkbenchTracksStore()

const WIDTH = 240
const HEIGHT = 36

const values = computed(() =>
	session.currentSession.map((entry) =>
		getSetEntryBpm(entry, tracks.getTrackById(entry.track_id))
	)
)

const arc = computed(() => getSetArc(values.value, WIDTH, HEIGHT, 3))

const polyline = computed(
	() =>
		arc.value?.points
			.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`)
			.join(' ') ?? ''
)

const description = computed(() => {
	if (!arc.value) return ''
	const points = arc.value.points
	const first = Math.round(points[0]!.bpm)
	const last = Math.round(points.at(-1)!.bpm)
	return `BPM arc across ${points.length} tracks: starts at ${first}, ranges ${Math.round(arc.value.min)} to ${Math.round(arc.value.max)}, ends at ${last}.`
})
</script>

<template>
	<div v-if="arc" class="flex items-center gap-2" data-testid="session-bpm-arc">
		<svg
			class="text-primary h-9 min-w-0 flex-1"
			:viewBox="`0 0 ${WIDTH} ${HEIGHT}`"
			preserveAspectRatio="none"
			role="img"
			:aria-label="description"
		>
			<title>{{ description }}</title>
			<line
				x1="0"
				:y1="HEIGHT - 0.5"
				:x2="WIDTH"
				:y2="HEIGHT - 0.5"
				class="stroke-border"
				vector-effect="non-scaling-stroke"
			/>
			<polyline
				:points="polyline"
				fill="none"
				stroke="currentColor"
				stroke-width="1.5"
				stroke-linejoin="round"
				stroke-linecap="round"
				vector-effect="non-scaling-stroke"
			/>
		</svg>
		<div
			class="text-muted-foreground flex shrink-0 flex-col items-end font-mono text-[9px] leading-tight tabular-nums"
			aria-hidden="true"
		>
			<span>{{ Math.round(arc.max) }}</span>
			<span>{{ Math.round(arc.min) }}</span>
		</div>
	</div>
</template>
