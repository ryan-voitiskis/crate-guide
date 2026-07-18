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
const catalogReference = computed(() => {
	const label = record.value?.labels?.[0]
	return [label?.name, label?.catno].filter(Boolean).join(' · ')
})

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

const scorePercent = computed(() =>
	props.track.score === null ? null : Math.round(props.track.score * 100)
)
const scoreLabel = computed(() => {
	if (scorePercent.value === null) {
		return 'Mix compatibility unavailable because BPM and key data are incomplete.'
	}
	if (props.track.scoreBasis === 'tempo') {
		return `Tempo match ${scorePercent.value} out of 100; harmony data unavailable.`
	}
	if (props.track.scoreBasis === 'harmony') {
		return `Harmonic match ${scorePercent.value} out of 100; tempo data unavailable.`
	}
	return `Mix compatibility ${scorePercent.value} out of 100, based on tempo and harmony.`
})
const scoreBadgeStyle = computed(() => {
	if (props.track.score === null) return undefined
	const scoreColour = getSuggestionScoreColour(props.track.score)
	return {
		backgroundColor: hexToRgba(scoreColour, 0.12),
		borderColor: hexToRgba(scoreColour, 0.34),
		boxShadow: `inset 0 0 0 1px ${hexToRgba(scoreColour, 0.1)}`,
		color: scoreColour
	}
})

const pitchAdjustmentDisplay = computed(() => {
	if (props.track.pitchAdjustment === null) return null
	const adjustment = props.track.pitchAdjustment * 100
	return (adjustment > 0 ? '+' : '') + adjustment.toFixed(1) + '%'
})
const pitchAdjustmentColour = computed(() => {
	if (props.track.pitchAdjustment === null) return undefined
	return getPitchDeltaColour(props.track.pitchAdjustment)
})
const hasMetadataRow = computed(
	() =>
		Boolean(props.track.bpm) ||
		Boolean(keyDisplay.value) ||
		Boolean(keyCombinationLabel.value) ||
		pitchAdjustmentDisplay.value !== null
)

function handleClick() {
	session.handleSuggestionClick(props.track.id, props.deckIndex)
}
</script>

<template>
	<button
		class="bg-card hover:bg-muted/50 focus-visible:ring-signal w-full overflow-hidden rounded-none border text-left transition-colors focus-visible:ring-2 focus-visible:outline-none"
		:aria-label="`Load ${track.title} to deck ${deckIndex + 1}. ${scoreLabel}`"
		@click="handleClick"
	>
		<div class="flex h-16 items-center">
			<!-- Cover art -->
			<div class="border-border aspect-square h-full shrink-0 border-r">
				<ImageRecordCover
					v-if="record"
					:record="record"
					:alt="track.title"
					class="size-full"
				/>
				<div
					v-if="!record"
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
				<div
					v-if="catalogReference"
					class="text-muted-foreground/75 truncate font-mono text-[9px] tracking-wide uppercase"
				>
					{{ catalogReference }}
				</div>

				<!-- Metadata row -->
				<div
					v-if="hasMetadataRow"
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
						v-if="pitchAdjustmentDisplay !== null"
						class="font-medium tabular-nums"
						:style="{ color: pitchAdjustmentColour }"
					>
						{{ pitchAdjustmentDisplay }}
					</span>
				</div>
			</div>

			<!-- Score indicator -->
			<div
				class="mr-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-[2px] border font-mono text-[10px] font-semibold tabular-nums transition-colors"
				:class="
					track.score === null
						? 'border-border/70 bg-muted/30 text-muted-foreground/55 border-dashed'
						: undefined
				"
				:style="scoreBadgeStyle"
				:title="scoreLabel"
			>
				{{ scorePercent ?? '—' }}
			</div>
		</div>
	</button>
</template>
