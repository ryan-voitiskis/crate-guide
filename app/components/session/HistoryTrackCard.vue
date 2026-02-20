<script setup lang="ts">
const props = defineProps<{
	entry: PlayedTrackEntry
	index: number
	isFirst: boolean
}>()

const session = useSessionStore()
const tracks = useTracksStore()
const user = useUserStore()

const track = computed(() => tracks.getTrackById(props.entry.track_id))

const timeFormatted = computed(() => {
	const date = new Date(props.entry.time_added)
	return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
})

const artistNames = computed(() => {
	if (!track.value) return ''
	return track.value.artists.map((a) => a.name).join(', ')
})

const keyDisplay = computed(() => {
	if (!track.value || track.value.key === null || track.value.mode === null)
		return null
	return getFormattedKeyString(
		track.value.key,
		track.value.mode,
		user.currentKeyFormat,
		'short'
	)
})

const keyColor = computed(() => {
	if (!track.value || track.value.key === null || track.value.mode === null)
		return null
	return getKeyColour(track.value.key, track.value.mode)
})

function handleRatingUpdate(rating: number | null) {
	session.rateTransition(props.index, rating)
}
</script>

<template>
	<div class="border-border border-b py-2 last:border-b-0">
		<!-- Transition rating (not shown for first track) -->
		<div v-if="!isFirst" class="mb-1.5 flex items-center gap-1">
			<span class="text-muted-foreground text-xs">Transition:</span>
			<HistoryRating
				:rating="entry.transition_rating"
				@update="handleRatingUpdate"
			/>
		</div>

		<!-- Track info -->
		<div v-if="track" class="space-y-0.5">
			<div class="flex items-start justify-between gap-2">
				<div class="min-w-0 flex-1">
					<div class="truncate text-sm leading-tight font-medium">
						{{ track.title }}
					</div>
					<div class="text-muted-foreground truncate text-xs">
						{{ artistNames }}
					</div>
				</div>
				<span class="text-muted-foreground shrink-0 text-xs">
					{{ timeFormatted }}
				</span>
			</div>

			<!-- Metadata row -->
			<div class="flex items-center gap-2 text-xs">
				<!-- Adjusted BPM -->
				<span v-if="entry.adjusted_bpm" class="text-muted-foreground">
					{{ entry.adjusted_bpm.toFixed(1) }} BPM
				</span>
				<span v-else-if="track.bpm" class="text-muted-foreground">
					{{ track.bpm.toFixed(1) }} BPM
				</span>

				<!-- Key -->
				<span
					v-if="keyDisplay"
					class="font-medium"
					:style="{ color: keyColor ?? undefined }"
				>
					{{ keyDisplay }}
				</span>
			</div>
		</div>

		<!-- Fallback if track not found -->
		<div v-else class="text-muted-foreground text-sm italic">
			Track not found
		</div>
	</div>
</template>
