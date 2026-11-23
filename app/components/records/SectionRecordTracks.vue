<script setup lang="ts">
import { ListChecks, Pencil, Plus, Trash, X } from '@lucide/vue'
import { useTrackQuickSetStore } from '~/stores/trackQuickSetStore'
import { parseKeyMode } from '~/utils/keyFunctions'
import type { LibraryTrack } from '~~/shared/types/library'

const recordDetails = useWorkbenchRecordDetailsStore()
const trackEdit = useTrackEditStore()
const preferences = useWorkbenchPreferencesStore()
const capabilities = useWorkbenchCapabilities()
const quickSet = useTrackQuickSetStore(useWorkbenchPinia())

const annotating = ref(false)
const focusedTrackId = ref<string | null>(null)
/** Stable owner of the list; panels are looked up inside it by track ID. */
const root = ref<HTMLElement | null>(null)
let listenerScope: HTMLElement | null = null

type RowStatus = 'saving' | 'not-saved' | null

type TrackRow = {
	track: LibraryTrack
	bpmLabel: string
	keyLabel: string
	keyColour: string | null
	complete: boolean
	status: RowStatus
}

function rowStatus(trackId: string): RowStatus {
	const entry = quickSet.entries[trackId]
	if (!entry) return null
	if (entry.issue) return 'not-saved'
	if (entry.pending.bpm || entry.pending.key) return 'saving'
	return null
}

const rows = computed<TrackRow[]>(() =>
	recordDetails.recordTracks.map((track) => {
		const keyMode = parseKeyMode(track.key, track.mode)
		const hasBpm = track.bpm !== null && Number.isFinite(track.bpm)
		return {
			track,
			bpmLabel: hasBpm ? track.bpm!.toFixed(1) : '–',
			keyLabel: keyMode
				? getFormattedKeyString(
						keyMode.key,
						keyMode.mode,
						preferences.currentKeyFormat,
						'short'
					)
				: '–',
			keyColour: keyMode ? getKeyColour(keyMode.key, keyMode.mode) : null,
			complete: hasBpm && keyMode !== null,
			status: rowStatus(track.id)
		}
	})
)

const unsavedTrackIds = computed(() =>
	rows.value
		.filter((row) => row.status === 'not-saved')
		.map((row) => row.track.id)
)

const canAnnotate = computed(
	() => capabilities.canMutateLibrary && recordDetails.recordTracks.length > 0
)

const focusedIndex = computed(() =>
	recordDetails.recordTracks.findIndex(
		(track) => track.id === focusedTrackId.value
	)
)

const annotatedCount = computed(
	() => rows.value.filter((row) => row.complete).length
)

const progressLabel = computed(() => {
	const total = recordDetails.recordTracks.length
	if (total === 0) return null
	return `${annotatedCount.value} of ${total} ${
		total === 1 ? 'track has' : 'tracks have'
	} BPM and key`
})

const unsavedLabel = computed(() => {
	const count = unsavedTrackIds.value.length
	if (count === 0) return null
	return count === 1
		? '1 change was not saved.'
		: `${count} changes were not saved.`
})

/** The expanded panel for the focused track, resolved after each render. */
function activePanel(): HTMLElement | null {
	const id = focusedTrackId.value
	if (!id || !root.value) return null
	return (
		[
			...root.value.querySelectorAll<HTMLElement>('[data-quick-set-track]')
		].find((element) => element.dataset.quickSetTrack === id) ?? null
	)
}

async function focusTapButton() {
	await nextTick()
	activePanel()
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

function startAnnotating(trackId?: string) {
	if (!canAnnotate.value) return
	annotating.value = true
	const ids = recordDetails.recordTracks.map((track) => track.id)
	focusTrack(
		trackId && ids.includes(trackId)
			? trackId
			: focusedTrackId.value && ids.includes(focusedTrackId.value)
				? focusedTrackId.value
				: ids[0]!
	)
}

function reviewUnsaved() {
	const first = unsavedTrackIds.value[0]
	if (!first) return
	if (annotating.value) focusTrack(first)
	else startAnnotating(first)
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
	activePanel()
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

function detachListener() {
	listenerScope?.removeEventListener('keydown', handleKeydown)
	listenerScope = null
}

/**
 * Shortcuts listen on the enclosing Record Details dialog only. A nested
 * dialog (Add Track, a confirmation) is portalled outside it, so its keys and
 * its Escape never reach annotation mode. Inside the dialog this listener
 * runs before reka-ui's window-level Escape handler, which respects the
 * prevented default and keeps the record open.
 */
function attachListener() {
	detachListener()
	listenerScope =
		root.value?.closest<HTMLElement>('[role="dialog"]') ?? root.value
	listenerScope?.addEventListener('keydown', handleKeydown)
}

watch(annotating, (active) => {
	if (active) attachListener()
	else detachListener()
})

onBeforeUnmount(detachListener)

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
	<div ref="root" class="space-y-4" data-testid="section-record-tracks">
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

		<div
			v-if="unsavedLabel"
			role="status"
			class="flex items-center justify-between gap-2 rounded-md border border-amber-600/30 bg-amber-600/10 px-2 py-1.5 text-xs"
			data-testid="record-tracks-unsaved"
		>
			<span>{{ unsavedLabel }}</span>
			<Button
				v-if="canAnnotate"
				type="button"
				size="sm"
				variant="outline"
				data-testid="record-tracks-review-unsaved"
				@click="reviewUnsaved"
			>
				Review
			</Button>
		</div>

		<!-- Tracks List -->
		<div class="space-y-2">
			<Card
				v-for="{ track, bpmLabel, keyLabel, keyColour, status } in rows"
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
						<div class="flex h-5 items-center gap-1.5">
							<span class="truncate text-sm leading-5 font-medium">
								{{ track.title }}
							</span>
							<span
								v-if="status === 'not-saved'"
								class="shrink-0 rounded-sm border border-amber-600/40 bg-amber-600/10 px-1 font-mono text-[9px] uppercase"
								:data-testid="`record-track-status-${track.id}`"
							>
								Not saved
							</span>
							<span
								v-else-if="status === 'saving'"
								class="text-muted-foreground shrink-0 font-mono text-[9px] uppercase"
								:data-testid="`record-track-status-${track.id}`"
							>
								Saving…
							</span>
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
						{{ bpmLabel }}
					</div>

					<!-- Key -->
					<!-- Key text stays in the foreground colour for contrast; the key
					colour is carried by a swatch instead. -->
					<div
						class="flex w-14 items-center justify-center gap-1 font-mono text-xs font-semibold"
						:class="keyColour ? 'text-foreground' : 'text-muted-foreground'"
					>
						<span
							v-if="keyColour"
							aria-hidden="true"
							class="size-2 shrink-0 rounded-full border border-black/15"
							:style="{ backgroundColor: keyColour }"
							:data-testid="`record-track-key-swatch-${track.id}`"
						/>
						<span :data-testid="`record-track-key-${track.id}`">
							{{ keyLabel }}
						</span>
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
					:data-quick-set-track="track.id"
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

			<div v-if="!rows.length" class="text-muted-foreground py-8 text-center">
				No tracks found. Add some tracks to get started.
			</div>
		</div>
	</div>
</template>
