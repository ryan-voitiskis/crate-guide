<script setup lang="ts">
const props = defineProps<{
	track: ScoredTrack
	deckIndex: number
}>()

const session = useSessionStore()

const keyDisplay = computed(() => {
	if (props.track.key === null || props.track.mode === null) return null
	return getCamelotString(props.track.key, props.track.mode)
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

const pitchAdjustmentDisplay = computed(() => {
	const adjustment = props.track.pitchAdjustment * 100
	return (adjustment > 0 ? '+' : '') + adjustment.toFixed(1) + '%'
})

function handleClick() {
	session.handleSuggestionClick(props.track.id, props.deckIndex)
}
</script>

<template>
	<button
		class="hover:bg-muted/50 border-border w-full rounded-lg border p-2 text-left transition-colors"
		@click="handleClick"
	>
		<div class="flex items-start gap-2">
			<!-- Score indicator -->
			<div
				class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-medium"
				:class="{
					'bg-green-500/20 text-green-500': scorePercent >= 70,
					'bg-yellow-500/20 text-yellow-500':
						scorePercent >= 40 && scorePercent < 70,
					'bg-muted text-muted-foreground': scorePercent < 40
				}"
			>
				{{ scorePercent }}
			</div>

			<!-- Track info -->
			<div class="min-w-0 flex-1">
				<div class="truncate text-sm leading-tight font-medium">
					{{ track.title }}
				</div>
				<div class="text-muted-foreground truncate text-xs">
					{{ artistNames }}
				</div>

				<!-- Metadata row -->
				<div class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
					<!-- BPM -->
					<span v-if="track.bpm" class="text-muted-foreground">
						{{ track.bpm.toFixed(0) }}
					</span>

					<!-- Key with color -->
					<span
						v-if="keyDisplay"
						class="font-medium"
						:style="{ color: keyColor }"
					>
						{{ keyDisplay }}
					</span>

					<!-- Key combination type -->
					<span v-if="keyCombinationLabel" class="text-muted-foreground">
						{{ keyCombinationLabel }}
					</span>

					<!-- Pitch adjustment needed -->
					<span class="text-muted-foreground">
						{{ pitchAdjustmentDisplay }}
					</span>
				</div>
			</div>
		</div>
	</button>
</template>
