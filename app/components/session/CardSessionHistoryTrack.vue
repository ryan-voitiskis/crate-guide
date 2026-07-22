<script setup lang="ts">
const props = defineProps<{
	entry: PlayedTrackEntry
	index: number
	isFirst: boolean
}>()

const session = useWorkbenchSessionStore()
const tracks = useWorkbenchTracksStore()
const user = useWorkbenchUserStore()

const track = computed(() => tracks.getTrackById(props.entry.track_id))

const trackTitle = computed(
	() => props.entry.track_title ?? track.value?.title ?? 'Unknown track'
)

const timeFormatted = computed(() => {
	const date = new Date(props.entry.time_added)
	return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
})

const artistNames = computed(() => {
	return (
		props.entry.artist_display ??
		track.value?.artists.map((artist) => artist.name).join(', ') ??
		'Artist unavailable'
	)
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
			<RatingSessionHistory
				:rating="entry.transition_rating"
				@update="handleRatingUpdate"
			/>
		</div>

		<!-- Track info -->
		<div class="space-y-0.5">
			<div class="flex items-start justify-between gap-2">
				<span
					class="text-muted-foreground/70 mt-0.5 w-5 shrink-0 font-mono text-[9px] tabular-nums"
				>
					{{ String(index + 1).padStart(2, '0') }}
				</span>
				<div class="min-w-0 flex-1">
					<div class="truncate text-sm leading-tight font-medium">
						{{ trackTitle }}
					</div>
					<div class="text-muted-foreground truncate text-xs">
						{{ artistNames }}
					</div>
					<div
						v-if="!track"
						class="text-muted-foreground truncate text-xs italic"
					>
						No longer in library
					</div>
				</div>
				<span
					class="text-muted-foreground shrink-0 font-mono text-[10px] tabular-nums"
				>
					{{ timeFormatted }}
				</span>
			</div>

			<!-- Metadata row -->
			<div class="ml-5 flex items-center gap-2 font-mono text-[10px]">
				<!-- Adjusted BPM -->
				<span v-if="entry.adjusted_bpm !== null" class="text-muted-foreground">
					{{ entry.adjusted_bpm.toFixed(1) }} BPM
				</span>
				<span v-else-if="track?.bpm" class="text-muted-foreground">
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
	</div>
</template>
