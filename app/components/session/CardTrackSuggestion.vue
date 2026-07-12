<script setup lang="ts">
import {
	getPitchDeltaColour,
	getSuggestionScoreColour,
	hexToRgba
} from '~/utils/colourInterpolation'

const props = defineProps<{
	track: ScoredTrack
	deckIndex: number
}>()

const records = useRecordsStore()
const session = useSessionStore()
const user = useUserStore()

const record = computed(() => records.getRecordById(props.track.record_id))
const coverUrl = computed(() => record.value?.cover ?? null)

const keyDisplay = computed(() => {
	if (props.track.key === null || props.track.mode === null) return null
	return getFormattedKeyString(
		props.track.key,
		props.track.mode,
		user.currentKeyFormat,
		'short'
	)
})

const keyColor = computed(() => {
	if (props.track.key === null || props.track.mode === null) return null
	return getKeyColour(props.track.key, props.track.mode)
})

const artistNames = computed(() => {
	return props.track.artists.map((a) => a.name).join(', ')
})

const keyCombinationLabel = computed(() => {
	if (props.track.keyCombination < 0) return null
	return keyCombinations[props.track.keyCombination]
})

const scorePercent = computed(() => Math.round(props.track.score * 100))
const scoreColour = computed(() => getSuggestionScoreColour(props.track.score))
const scoreBadgeStyle = computed(() => ({
	backgroundColor: hexToRgba(scoreColour.value, 0.12),
	borderColor: hexToRgba(scoreColour.value, 0.34),
	boxShadow: `inset 0 0 0 1px ${hexToRgba(scoreColour.value, 0.1)}`,
	color: scoreColour.value
}))

const pitchAdjustmentDisplay = computed(() => {
	const adjustment = props.track.pitchAdjustment * 100
	return (adjustment > 0 ? '+' : '') + adjustment.toFixed(1) + '%'
})
const pitchAdjustmentColour = computed(() =>
	getPitchDeltaColour(props.track.pitchAdjustment)
)

function handleClick() {
	session.handleSuggestionClick(props.track.id, props.deckIndex)
}
</script>

<template>
	<button
		class="bg-card hover:bg-muted/50 w-full overflow-hidden rounded-none border text-left transition-colors"
		@click="handleClick"
	>
		<div class="flex h-16 items-center">
			<!-- Cover art -->
			<div class="aspect-square h-full shrink-0 overflow-hidden">
				<img
					v-if="coverUrl"
					:src="coverUrl"
					:alt="track.title"
					class="h-full w-full object-cover"
				/>
				<div
					v-else
					class="bg-muted flex h-full w-full items-center justify-center"
				>
					<span class="text-muted-foreground text-[8px]">No cover</span>
				</div>
			</div>

			<!-- Track info -->
			<div class="min-w-0 flex-1 px-2">
				<div class="truncate text-sm leading-tight font-medium">
					{{ track.title }}
				</div>
				<div class="text-muted-foreground truncate text-xs">
					{{ artistNames }}
				</div>

				<!-- Metadata row -->
				<div
					class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs"
				>
					<span v-if="track.bpm" class="text-muted-foreground">
						{{ track.bpm.toFixed(0) }}
					</span>
					<span
						v-if="keyDisplay"
						class="font-medium"
						:style="{ color: keyColor ?? undefined }"
					>
						{{ keyDisplay }}
					</span>
					<span v-if="keyCombinationLabel" class="text-muted-foreground">
						{{ keyCombinationLabel }}
					</span>
					<span
						class="font-medium tabular-nums"
						:style="{ color: pitchAdjustmentColour }"
					>
						{{ pitchAdjustmentDisplay }}
					</span>
				</div>
			</div>

			<!-- Score indicator -->
			<div
				class="mr-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-colors"
				:style="scoreBadgeStyle"
			>
				{{ scorePercent }}
			</div>
		</div>
	</button>
</template>
