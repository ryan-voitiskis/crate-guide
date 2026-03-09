<script setup lang="ts">
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
		class="bg-card hover:bg-muted/50 w-full overflow-hidden rounded-lg border text-left transition-colors"
		@click="handleClick"
	>
		<div class="flex h-16 items-center">
			<!-- Cover art -->
			<div class="h-full shrink-0 aspect-square overflow-hidden">
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
				<div class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
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
					<span class="text-muted-foreground">
						{{ pitchAdjustmentDisplay }}
					</span>
				</div>
			</div>

			<!-- Score indicator -->
			<div
				class="mr-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-medium"
				:class="{
					'bg-green-500/20 text-green-500': scorePercent >= 70,
					'bg-yellow-500/20 text-yellow-500':
						scorePercent >= 40 && scorePercent < 70,
					'bg-muted text-muted-foreground': scorePercent < 40
				}"
			>
				{{ scorePercent }}
			</div>
		</div>
	</button>
</template>
