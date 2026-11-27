<script setup lang="ts">
import { ChevronDown, ChevronUp, GripVertical, X } from '@lucide/vue'
import type { HistoryMoveSource } from '~/utils/setPlanner'
import type { LibraryPlayedTrackEntry } from '~~/shared/types/library'

const props = defineProps<{
	entry: LibraryPlayedTrackEntry
	index: number
	isFirst: boolean
	isLast: boolean
}>()

const emit = defineEmits<{
	move: [toIndex: number, source: HistoryMoveSource]
	remove: []
}>()

const session = useWorkbenchSessionStore()
const tracks = useWorkbenchTracksStore()
const preferences = useWorkbenchPreferencesStore()

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
		preferences.currentKeyFormat,
		'short'
	)
})

const keyColor = computed(() => {
	if (!track.value || track.value.key === null || track.value.mode === null)
		return null
	return getKeyColour(track.value.key, track.value.mode)
})

const positionLabel = computed(() => `Track ${props.index + 1}`)

function handleRatingUpdate(rating: number | null) {
	session.rateTransition(props.index, rating)
}

function moveBy(offset: -1 | 1, source: HistoryMoveSource) {
	const target = props.index + offset
	if (offset < 0 ? props.isFirst : props.isLast) return
	emit('move', target, source)
}

/** Alt+ArrowUp / Alt+ArrowDown from anywhere inside the entry. */
function handleKeydown(event: KeyboardEvent) {
	if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
	if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
	event.preventDefault()
	moveBy(event.key === 'ArrowUp' ? -1 : 1, 'keyboard')
}
</script>

<template>
	<li
		class="border-border focus-visible:ring-ring rounded-sm border-b py-2 outline-none last:border-b-0 focus-visible:ring-2"
		tabindex="0"
		:aria-label="`${positionLabel}: ${trackTitle} by ${artistNames}`"
		aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
		:data-history-index="index"
		@keydown="handleKeydown"
	>
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
				<div class="flex shrink-0 flex-col items-end gap-0.5">
					<span
						class="text-muted-foreground font-mono text-[10px] tabular-nums"
					>
						{{ timeFormatted }}
					</span>
					<div class="flex items-center">
						<GripVertical
							class="text-muted-foreground/60 size-3.5 cursor-grab"
							aria-hidden="true"
						/>
						<Button
							variant="ghost"
							size="icon"
							class="size-6"
							data-history-action="move-up"
							:disabled="isFirst"
							:aria-label="`Move ${positionLabel.toLowerCase()} up`"
							title="Move up (Alt+↑)"
							@click="moveBy(-1, 'move-up')"
						>
							<ChevronUp class="size-3.5" />
						</Button>
						<Button
							variant="ghost"
							size="icon"
							class="size-6"
							data-history-action="move-down"
							:disabled="isLast"
							:aria-label="`Move ${positionLabel.toLowerCase()} down`"
							title="Move down (Alt+↓)"
							@click="moveBy(1, 'move-down')"
						>
							<ChevronDown class="size-3.5" />
						</Button>
						<Button
							variant="ghost"
							size="icon"
							class="size-6"
							data-history-action="remove"
							:aria-label="`Remove ${positionLabel.toLowerCase()} from set`"
							title="Remove from set"
							@click="emit('remove')"
						>
							<X class="size-3.5" />
						</Button>
					</div>
				</div>
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
	</li>
</template>
