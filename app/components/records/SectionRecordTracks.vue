<script setup lang="ts">
import { ListChecks, Pencil, Plus, Trash, X } from '@lucide/vue'
import type { LibraryTrack } from '~~/shared/types/library'

const recordDetails = useWorkbenchRecordDetailsStore()
const trackEdit = useTrackEditStore()
const preferences = useWorkbenchPreferencesStore()
const capabilities = useWorkbenchCapabilities()

const annotating = ref(false)
const focusedTrackId = ref<string | null>(null)
const focusedRow = ref<HTMLElement | null>(null)

const canAnnotate = computed(
	() => capabilities.canMutateLibrary && recordDetails.recordTracks.length > 0
)

const focusedIndex = computed(() =>
	recordDetails.recordTracks.findIndex(
		(track) => track.id === focusedTrackId.value
	)
)

const annotatedCount = computed(
	() =>
		recordDetails.recordTracks.filter(
			(track) => track.bpm !== null && track.key !== null
		).length
)

const progressLabel = computed(() => {
	const total = recordDetails.recordTracks.length
	if (total === 0) return null
	return `${annotatedCount.value} of ${total} ${
		total === 1 ? 'track has' : 'tracks have'
	} BPM and key`
})

function formatBpm(track: LibraryTrack): string {
	return track.bpm === null ? '–' : track.bpm.toFixed(1)
}

function formatKey(track: LibraryTrack): string {
	if (track.key === null || track.mode === null) return '–'
	return getFormattedKeyString(
		track.key,
		track.mode,
		preferences.currentKeyFormat,
		'short'
	)
}

function keyColour(track: LibraryTrack): string | undefined {
	if (track.key === null || track.mode === null) return undefined
	return getKeyColour(track.key, track.mode)
}

async function focusTapButton() {
	await nextTick()
	focusedRow.value
		?.querySelector<HTMLButtonElement>('[data-testid="tap-tempo-tap"]')
		?.focus?.()
}

function focusTrack(trackId: string) {
	if (!annotating.value) return
	focusedTrackId.value = trackId
	void focusTapButton()
}

function moveFocus(step: 1 | -1) {
	const tracks = recordDetails.recordTracks
	if (tracks.length === 0) return
	const current = focusedIndex.value
	const next =
		current === -1
			? step === 1
				? 0
				: tracks.length - 1
			: (current + step + tracks.length) % tracks.length
	focusTrack(tracks[next]!.id)
}

function startAnnotating() {
	if (!canAnnotate.value) return
	annotating.value = true
	focusTrack(
		focusedTrackId.value &&
			recordDetails.recordTracks.some(
				(track) => track.id === focusedTrackId.value
			)
			? focusedTrackId.value
			: recordDetails.recordTracks[0]!.id
	)
}

function stopAnnotating() {
	annotating.value = false
	focusedTrackId.value = null
}

function toggleAnnotating() {
	if (annotating.value) stopAnnotating()
	else startAnnotating()
}

function isEditableTarget(target: EventTarget | null) {
	if (!(target instanceof HTMLElement)) return false
	return (
		target.isContentEditable ||
		['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
	)
}

function isInsideKeyWheel(target: EventTarget | null) {
	return (
		target instanceof Element && target.closest('[role="radiogroup"]') !== null
	)
}

function clickInFocusedRow(testId: string) {
	focusedRow.value
		?.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`)
		?.click()
}

function handleKeydown(event: KeyboardEvent) {
	if (!annotating.value || event.defaultPrevented) return
	if (isEditableTarget(event.target)) return

	switch (event.key) {
		case 'Escape':
			event.preventDefault()
			stopAnnotating()
			return
		case 'j':
		case 'J':
			event.preventDefault()
			moveFocus(1)
			return
		case 'k':
		case 'K':
			event.preventDefault()
			moveFocus(-1)
			return
		case 'ArrowDown':
			if (isInsideKeyWheel(event.target)) return
			event.preventDefault()
			moveFocus(1)
			return
		case 'ArrowUp':
			if (isInsideKeyWheel(event.target)) return
			event.preventDefault()
			moveFocus(-1)
			return
	}

	// Space and Enter reach the tap control natively when it has focus; from
	// anywhere else in the dialog they are forwarded to the focused track.
	const target = event.target
	const onButton = target instanceof HTMLElement && target.closest('button, a')
	if (onButton || isInsideKeyWheel(target)) return
	if (event.key === ' ') {
		event.preventDefault()
		clickInFocusedRow('tap-tempo-tap')
	} else if (event.key === 'Enter') {
		event.preventDefault()
		clickInFocusedRow('tap-tempo-use')
	}
}

watch(annotating, (active) => {
	if (active) document.addEventListener('keydown', handleKeydown)
	else document.removeEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
	document.removeEventListener('keydown', handleKeydown)
})

// Leaving or switching records ends annotation; a removed track moves focus.
watch(
	() => recordDetails.dialogGeneration,
	() => stopAnnotating()
)
watch(
	() => recordDetails.recordTracks.map((track) => track.id),
	(ids) => {
		if (!annotating.value) return
		if (ids.length === 0) {
			stopAnnotating()
			return
		}
		if (!focusedTrackId.value || !ids.includes(focusedTrackId.value))
			focusTrack(ids[0]!)
	}
)
</script>

<template>
	<div class="space-y-4" data-testid="section-record-tracks">
		<div class="flex flex-wrap items-center justify-between gap-2">
			<div class="min-w-0">
				<Label>Tracks ({{ recordDetails.recordTracks.length }})</Label>
				<p
					v-if="progressLabel"
					class="text-muted-foreground mt-0.5 font-mono text-[10px] tabular-nums"
					data-testid="record-tracks-progress"
				>
					{{ progressLabel }}
				</p>
			</div>
			<div class="flex items-center gap-2">
				<Button
					v-if="canAnnotate"
					size="sm"
					:variant="annotating ? 'secondary' : 'outline'"
					:aria-pressed="annotating"
					data-testid="record-tracks-annotate"
					@click="toggleAnnotating"
				>
					<X v-if="annotating" class="mr-1 size-4" />
					<ListChecks v-else class="mr-1 size-4" />
					{{ annotating ? 'Done' : 'Annotate' }}
				</Button>
				<Button
					size="sm"
					variant="outline"
					@click="trackEdit.openAddTrackDialog()"
				>
					<Plus class="mr-1 size-4" />
					Add Track
				</Button>
			</div>
		</div>

		<p
			v-if="annotating"
			class="text-muted-foreground font-mono text-[10px] tracking-wide"
			data-testid="record-tracks-shortcuts"
		>
			J / K or ↑ / ↓ move · Space taps · Enter uses BPM · Esc done
		</p>

		<!-- Tracks List -->
		<div class="space-y-2">
			<Card
				v-for="track in recordDetails.recordTracks"
				:key="track.id"
				class="flex flex-col gap-0 p-1.5 transition-colors"
				:class="[
					annotating ? 'cursor-pointer' : 'hover:bg-muted/50',
					annotating && track.id === focusedTrackId
						? 'border-primary ring-primary/30 ring-1'
						: annotating
							? 'opacity-80 hover:opacity-100'
							: ''
				]"
				:data-testid="`record-track-row-${track.id}`"
				:data-focused="
					annotating && track.id === focusedTrackId ? 'true' : undefined
				"
				@click="annotating ? focusTrack(track.id) : undefined"
			>
				<div class="flex flex-row items-center gap-1">
					<!-- Position -->
					<div class="text-muted-foreground w-9 text-center font-mono text-sm">
						{{ track.position || '–' }}
					</div>

					<!-- Title & Artists -->
					<div class="min-w-0 flex-1">
						<div class="h-5 truncate text-sm leading-5 font-medium">
							{{ track.title }}
						</div>
						<div class="text-muted-foreground h-4 truncate text-xs leading-4">
							<span v-if="track.artists.length">
								{{ track.artists.map((a) => a.name).join(', ') }}
							</span>
							<span v-if="track.extraartists.length">
								{{
									' feat. ' + track.extraartists.map((a) => a.name).join(', ')
								}}
							</span>
						</div>
					</div>

					<!-- Duration -->
					<div class="text-muted-foreground w-10 text-right font-mono text-xs">
						{{ msToMMSS(track.duration) || '–' }}
					</div>

					<!-- BPM -->
					<div
						class="text-muted-foreground w-12 text-right font-mono text-xs tabular-nums"
						:data-testid="`record-track-bpm-${track.id}`"
					>
						{{ formatBpm(track) }}
					</div>

					<!-- Key -->
					<div
						class="w-12 text-center font-mono text-xs font-semibold"
						:style="{ color: keyColour(track) }"
						:class="keyColour(track) ? '' : 'text-muted-foreground'"
						:data-testid="`record-track-key-${track.id}`"
					>
						{{ formatKey(track) }}
					</div>

					<!-- Actions -->
					<template v-if="!annotating">
						<Button
							size="icon"
							variant="ghost"
							title="Edit track"
							aria-label="Edit track"
							@click.stop="trackEdit.openEditTrackDialog(track.id)"
						>
							<Pencil />
						</Button>
						<Button
							size="icon"
							variant="destructive-ghost"
							title="Delete track"
							aria-label="Delete track"
							@click.stop="recordDetails.trackToConfirmDelete = track"
						>
							<Trash />
						</Button>
					</template>
				</div>

				<div
					v-if="annotating && track.id === focusedTrackId"
					:ref="(element) => (focusedRow = element as HTMLElement | null)"
					class="border-border mt-2 border-t px-1 pt-3 pb-1"
					@click.stop
				>
					<PanelTrackQuickSetLive
						:key="track.id"
						:track="track"
						:key-format="preferences.currentKeyFormat"
					/>
				</div>
			</Card>

			<div
				v-if="!recordDetails.recordTracks.length"
				class="text-muted-foreground py-8 text-center"
			>
				No tracks found. Add some tracks to get started.
			</div>
		</div>
	</div>
</template>
